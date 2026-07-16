const mqtt = require('mqtt');
const { EventEmitter } = require('events');
const { getDatabase } = require('../storage/db');
const { testMqttConnection } = require('./mqtt/connectionTest');
const { processIncomingMessage } = require('./mqtt/messageProcessor');
const { markTimedOutDevicesOffline } = require('./mqtt/onlineScanner');
const { resolveRelayControl } = require('./mqtt/relayControl');
const { getRetentionDays, shouldRunRetentionCleanup } = require('./mqtt/retentionPolicy');
const { parseTopicsAndDevices } = require('./mqtt/topicMapper');
const { createEmptyTopicStats, deepClone } = require('./mqtt/utils');
const { sendDevicePresenceWebhook } = require('./mqtt/webhookNotifier');

const DATA_RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

class MqttService extends EventEmitter {
  constructor(settingsStore, database = getDatabase()) {
    super();
    this.settingsStore = settingsStore;
    this.client = null;
    this.connectionVersion = 0;
    this.startedAt = Date.now();
    this.lastControlTriggeredBy = {};
    this.sensorPersistTimers = {};
    this.discoveredTopics = new Map(); // 缓存自动嗅探到的未匹配主题
    this.onlineCheckTimer = null; // 离线超时扫描定时器
    this.retentionCleanupTimer = null;
    this.retentionCleanupInFlight = false;
    
    this.db = database;

    this.latest = {
      devices: {}
    };

    this.status = {
      mqttConnected: false,
      subscribed: false,
      lastMsgTimestamp: null,
      lastMessageTopic: null,
      lastError: null,
      connectionState: 'idle',
      reconnectReason: null,
      activeBroker: null,
      subscribedTopics: [],
      connectedAt: null,
      disconnectedAt: null,
      messagesReceived: 0,
      topicStats: {}
    };

    // 默认根据配置初始化内存中的设备状态
    this.initLatestDevices();

    this.settingsStore.on('updated', ({ previous, current }) => {
      // 如果 mqtt 连接参数有变，或者设备/主题配置有变，重新启动连接
      const mqttChanged = JSON.stringify(previous.mqtt) !== JSON.stringify(current.mqtt);
      const devicesChanged = JSON.stringify(previous.devices) !== JSON.stringify(current.devices);
      const retentionChanged = previous.dashboard?.dataRetentionDays !== current.dashboard?.dataRetentionDays;
      
      if (mqttChanged || devicesChanged) {
        this.initLatestDevices();
        this.restart('settings-updated');
        this.emit('status', this.getStatus());
      }

      if (retentionChanged) {
        this.startDataRetentionCleanup({ runNow: Boolean(current.dashboard?.dataRetentionDays) });
      }
    });
  }

  // 内存状态初始化
  initLatestDevices() {
    const config = this.settingsStore.getConfig();
    const devices = config.devices || [];
    const currentLatestDevices = {};

    devices.forEach((device) => {
      // 尽可能保留已有的最近状态值，防止配置重载导致页面闪烁
      const prevDev = this.latest.devices[device.id] || {};
      
      currentLatestDevices[device.id] = {
        id: device.id,
        name: device.name,
        onlineStatus: prevDev.onlineStatus || 'offline',
        temp: prevDev.temp !== undefined ? prevDev.temp : null,
        hum: prevDev.hum !== undefined ? prevDev.hum : null,
        relays: {},
        lastActive: prevDev.lastActive || null
      };

      if (Array.isArray(device.relays)) {
        device.relays.forEach((relay) => {
          currentLatestDevices[device.id].relays[relay.id] = 
            (prevDev.relays && prevDev.relays[relay.id] !== undefined) 
              ? prevDev.relays[relay.id] 
              : null;
        });
      }
    });

    this.latest.devices = currentLatestDevices;
  }

  async start({ databaseInitialized = false } = {}) {
    // 1. 初始化 MongoDB 数据库
    if (!databaseInitialized) await this.db.initialize();
    
    // 2. 同步当前配置文件中的设备到数据库
    const devices = this.settingsStore.getConfig().devices || [];
    await this.db.syncDevices(devices);
    
    // 3. 从数据库中拉取最新的设备在线状态，填充内存
    const dbDevices = await this.db.getDevices();
    dbDevices.forEach((dbDev) => {
      if (this.latest.devices[dbDev.id]) {
        this.latest.devices[dbDev.id].onlineStatus = dbDev.online_status;
        this.latest.devices[dbDev.id].lastActive = dbDev.last_active;
      }
    });

    // 4. 连接 MQTT Broker
    this.connect();
    
    // 5. 启动设备在线超时守护轮询
    this.startOnlineStatusScanner();

    // 6. 启动历史数据保留策略
    this.startDataRetentionCleanup({ runNow: true });
  }

  stop() {
    if (this.onlineCheckTimer) {
      clearInterval(this.onlineCheckTimer);
      this.onlineCheckTimer = null;
    }

    if (this.retentionCleanupTimer) {
      clearInterval(this.retentionCleanupTimer);
      this.retentionCleanupTimer = null;
    }

    Object.values(this.sensorPersistTimers).forEach((timer) => clearTimeout(timer));
    this.sensorPersistTimers = {};

    if (!this.client) {
      return;
    }

    try {
      this.client.removeAllListeners();
      this.client.end(true);
    } finally {
      this.client = null;
      this.status.mqttConnected = false;
      this.status.subscribed = false;
      this.status.connectionState = 'stopped';
      this.status.disconnectedAt = Date.now();
      this.emit('status', this.getStatus());
    }
  }

  restart(reason = 'manual') {
    this.status.reconnectReason = reason;
    this.stop();
    this.connect();
    this.startOnlineStatusScanner();
    this.startDataRetentionCleanup();
  }

  // 提取需要订阅的主题，并建立映射
  parseTopicsAndDevices() {
    const config = this.settingsStore.getConfig();
    return parseTopicsAndDevices(config.devices || []);
  }

  connect() {
    const mqttConfig = this.settingsStore.getConfig().mqtt;
    const version = ++this.connectionVersion;
    const { topics, topicMap } = this.parseTopicsAndDevices();
    
    const config = this.settingsStore.getConfig();
    const discoveryTopic = config.api?.discoveryTopic?.trim();
    if (discoveryTopic && !topics.includes(discoveryTopic)) {
      topics.push(discoveryTopic);
    }

    this.topicMap = topicMap;
    this.status.mqttConnected = false;
    this.status.subscribed = false;
    this.status.lastError = null;
    this.status.connectionState = 'connecting';
    this.status.activeBroker = mqttConfig.url;
    this.status.subscribedTopics = topics;
    this.status.topicStats = createEmptyTopicStats(topics);
    this.emit('status', this.getStatus());

    if (topics.length === 0) {
      this.status.connectionState = 'idle';
      this.status.lastError = '没有配置任何需要订阅的主题。';
      this.emit('status', this.getStatus());
      return;
    }

    const client = mqtt.connect(mqttConfig.url, {
      clientId: mqttConfig.clientId,
      username: mqttConfig.username,
      password: mqttConfig.password,
      clean: mqttConfig.clean,
      reconnectPeriod: mqttConfig.reconnectPeriod,
      connectTimeout: mqttConfig.connectTimeout
    });

    this.client = client;

    client.on('connect', () => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.status.mqttConnected = true;
      this.status.connectionState = 'connected';
      this.status.connectedAt = Date.now();
      this.status.disconnectedAt = null;
      this.emit('status', this.getStatus());

      client.subscribe(topics, { qos: mqttConfig.qos }, (error) => {
        if (!this.isCurrent(version)) {
          return;
        }

        if (error) {
          this.status.subscribed = false;
          this.status.lastError = error.message;
          return;
        }

        this.status.subscribed = true;
        this.emit('status', this.getStatus());
      });
    });

    client.on('reconnect', () => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.status.mqttConnected = false;
      this.status.subscribed = false;
      this.status.connectionState = 'reconnecting';
      this.emit('status', this.getStatus());
    });

    client.on('close', () => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.status.mqttConnected = false;
      this.status.subscribed = false;
      this.status.connectionState = 'closed';
      this.status.disconnectedAt = Date.now();
      this.emit('status', this.getStatus());
    });

    client.on('offline', () => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.status.mqttConnected = false;
      this.status.subscribed = false;
      this.status.connectionState = 'offline';
      this.status.disconnectedAt = Date.now();
      this.emit('status', this.getStatus());
    });

    client.on('error', (error) => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.status.mqttConnected = false;
      this.status.subscribed = false;
      this.status.lastError = error.message;
      this.status.connectionState = 'error';
      this.status.disconnectedAt = Date.now();
      this.emit('status', this.getStatus());
    });

    client.on('message', (topic, messageBuffer) => {
      if (!this.isCurrent(version)) {
        return;
      }

      this.handleMessage(topic, messageBuffer.toString());
    });
  }

  isCurrent(version) {
    return version === this.connectionVersion;
  }

  scheduleSensorSnapshot(deviceId) {
    if (this.sensorPersistTimers[deviceId]) {
      clearTimeout(this.sensorPersistTimers[deviceId]);
    }

    const timer = setTimeout(() => {
      delete this.sensorPersistTimers[deviceId];

      const device = this.latest.devices[deviceId];
      if (!device) {
        return;
      }

      this.db.saveSensorData(deviceId, device.temp, device.hum).catch((err) =>
        console.error(`DB error saving sensor data for ${deviceId}:`, err.message)
      );
    }, 250);

    timer.unref?.();
    this.sensorPersistTimers[deviceId] = timer;
  }

  async handleMessage(topic, message) {
    const now = Date.now();
    const config = this.settingsStore.getConfig();
    const result = processIncomingMessage({
      topic,
      message,
      now,
      status: this.status,
      topicMap: this.topicMap,
      latest: this.latest,
      discoveredTopics: this.discoveredTopics,
      discoveryTopic: config.api?.discoveryTopic?.trim(),
      lastControlTriggeredBy: this.lastControlTriggeredBy
    });

    result.deviceStatusUpdates.forEach(({ deviceId, status }) => {
      this.db.updateDeviceStatus(deviceId, status).catch((err) =>
        console.error(`DB error updating status for ${deviceId}:`, err.message)
      );
    });

    result.webhookNotifications.forEach(({ type, device }) => {
      this.sendWebhookNotification(type, device);
    });

    result.sensorSnapshots.forEach((deviceId) => {
      this.scheduleSensorSnapshot(deviceId);
    });

    result.relayLogs.forEach(({ deviceId, relayId, status, triggeredBy }) => {
      this.db.saveRelayLog(deviceId, relayId, status, triggeredBy).catch((err) =>
        console.error(`DB error saving relay log for ${deviceId}:${relayId}:`, err.message)
      );
    });

    if (result.changed) {
      this.emit('message', { latest: this.getLatestData(), status: this.getStatus() });
    } else if (result.shouldEmitStatus) {
      this.emit('status', this.getStatus());
    }
  }

  // 继电器远程控制发布
  publishControl(deviceId, relayId, status) {
    if (!this.client || !this.status.mqttConnected) {
      throw new Error('MQTT 客户端未连接，无法发送控制指令。');
    }

    const config = this.settingsStore.getConfig();
    const control = resolveRelayControl(config, deviceId, relayId, status);

    // 记录这是由 Web 控制台触发的
    const key = `${deviceId}:${relayId}`;
    this.lastControlTriggeredBy[key] = 'web_ui';

    this.client.publish(control.topic, control.value, { qos: control.qos }, (error) => {
      if (error) {
        console.error(`Failed to publish relay control [Topic: ${control.topic}]:`, error);
      } else {
        console.log(`Relay control command sent [Topic: ${control.topic}, Payload: ${control.value}]`);
      }
    });
  }

  getLatestData() {
    return deepClone(this.latest);
  }

  getStatus() {
    return deepClone({
      ...this.status,
      serviceStartedAt: this.startedAt
    });
  }

  // 获取所有自动嗅探到的未匹配主题
  getDiscoveredTopics() {
    return Array.from(this.discoveredTopics.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  // 离线超时守护扫描定时任务
  startOnlineStatusScanner() {
    if (this.onlineCheckTimer) {
      clearInterval(this.onlineCheckTimer);
    }

    this.onlineCheckTimer = setInterval(() => {
      const config = this.settingsStore.getConfig();
      const threshold = config.api.deviceOnlineThreshold;
      const now = Date.now();
      const offlineDevices = markTimedOutDevicesOffline(this.latest.devices, now, threshold);

      offlineDevices.forEach((device) => {
        this.db.updateDeviceStatus(device.id, 'offline').catch((err) =>
          console.error(`DB error updating offline status for ${device.id}:`, err.message)
        );
        this.sendWebhookNotification('offline', device);
      });

      if (offlineDevices.length > 0) {
        this.emit('message', { latest: this.getLatestData(), status: this.getStatus() });
      }
    }, 5000);

    this.onlineCheckTimer.unref?.();
  }

  startDataRetentionCleanup(options = {}) {
    if (this.retentionCleanupTimer) {
      clearInterval(this.retentionCleanupTimer);
      this.retentionCleanupTimer = null;
    }

    const config = this.settingsStore.getConfig();
    if (!shouldRunRetentionCleanup(config)) {
      return;
    }

    if (options.runNow) {
      this.runDataRetentionCleanup();
    }

    this.retentionCleanupTimer = setInterval(() => {
      this.runDataRetentionCleanup();
    }, DATA_RETENTION_CLEANUP_INTERVAL_MS);

    this.retentionCleanupTimer.unref?.();
  }

  async runDataRetentionCleanup() {
    if (this.retentionCleanupInFlight) {
      return 0;
    }

    const config = this.settingsStore.getConfig();
    const retentionDays = getRetentionDays(config);
    if (retentionDays <= 0) {
      return 0;
    }

    this.retentionCleanupInFlight = true;
    try {
      const deletedCount = await this.db.cleanOldData(retentionDays);
      if (deletedCount > 0) {
        console.log(`Data retention cleanup removed ${deletedCount} old rows.`);
      }
      return deletedCount;
    } catch (error) {
      console.error('Data retention cleanup failed:', error.message);
      return 0;
    } finally {
      this.retentionCleanupInFlight = false;
    }
  }

  // Webhook 离线与上线告警通知
  async sendWebhookNotification(type, device) {
    const config = this.settingsStore.getConfig();
    await sendDevicePresenceWebhook(config, type, device);
  }

  // 静态方法：MQTT 连接可用性快速短连接试连测试
  static testConnection(url, options = {}) {
    return testMqttConnection(url, options);
  }
}

module.exports = {
  DATA_RETENTION_CLEANUP_INTERVAL_MS,
  MqttService
};
