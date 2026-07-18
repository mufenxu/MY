const assert = require('assert');
const { EventEmitter } = require('events');
const test = require('node:test');

const { MqttService } = require('../src/services/mqttClient');

function createSettingsStore(config) {
  const store = new EventEmitter();
  let currentConfig = JSON.parse(JSON.stringify(config));

  store.getConfig = () => JSON.parse(JSON.stringify(currentConfig));
  store.getConfigPath = () => __filename;
  store.updateConfig = (nextConfig) => {
    const previous = store.getConfig();
    currentConfig = JSON.parse(JSON.stringify(nextConfig));
    store.emit('updated', { previous, current: store.getConfig() });
  };

  return store;
}

function createService(config) {
  const settingsStore = createSettingsStore(config);
  const service = new MqttService(settingsStore);
  const updates = [];
  const notifications = [];
  const cleanups = [];

  service.db = {
    updateDeviceStatus: async (deviceId, status) => {
      updates.push({ deviceId, status });
    },
    saveSensorData: async () => {},
    saveRelayLog: async () => {},
    cleanOldData: async (retentionDays) => {
      cleanups.push(retentionDays);
      return 0;
    }
  };
  service.sendWebhookNotification = (type, device) => {
    notifications.push({ type, deviceId: device.id });
  };
  service.topicMap = service.parseTopicsAndDevices().topicMap;

  return { service, settingsStore, updates, notifications, cleanups };
}

const baseConfig = {
  mqtt: {
    url: 'mqtt://localhost:1883',
    username: '',
    password: '',
    clientId: 'test-client',
    clean: true,
    qos: 0,
    reconnectPeriod: 0,
    connectTimeout: 1000
  },
  devices: [
    {
      id: 'device_1',
      name: 'Device 1',
      topics: {
        online: 'device/online',
        temp: 'device/temp',
        hum: 'device/hum'
      },
      relays: [
        {
          id: 'relay_1',
          name: 'Relay 1',
          statusTopic: 'device/relay/status',
          controlTopic: 'device/relay/control'
        }
      ]
    }
  ],
  api: {
    deviceOnlineThreshold: 60000,
    webhookEnabled: false,
    webhookUrl: '',
    discoveryTopic: '+/+/+'
  },
  dashboard: {
    refreshInterval: 5000,
    dataRetentionDays: 0
  }
};

test('explicit offline status does not trigger a false online transition', async () => {
  const { service, updates, notifications } = createService(baseConfig);
  service.latest.devices.device_1.onlineStatus = 'online';

  await service.handleMessage('device/online', 'offline');
  service.stop();

  assert.equal(service.latest.devices.device_1.onlineStatus, 'offline');
  assert.deepEqual(updates, [{ deviceId: 'device_1', status: 'offline' }]);
  assert.deepEqual(notifications, [{ type: 'offline', deviceId: 'device_1' }]);
});

test('non-status device activity marks an offline device online once', async () => {
  const { service, updates, notifications } = createService(baseConfig);
  service.latest.devices.device_1.onlineStatus = 'offline';

  await service.handleMessage('device/temp', '24.5');
  service.stop();

  assert.equal(service.latest.devices.device_1.onlineStatus, 'online');
  assert.equal(service.latest.devices.device_1.temp, 24.5);
  assert.deepEqual(updates, [{ deviceId: 'device_1', status: 'online' }]);
  assert.deepEqual(notifications, [{ type: 'online', deviceId: 'device_1' }]);
});

test('data retention cleanup runs only when retention days are configured', async () => {
  const config = {
    ...baseConfig,
    dashboard: {
      ...baseConfig.dashboard,
      dataRetentionDays: 7
    }
  };
  const { service, cleanups } = createService(config);

  const deletedCount = await service.runDataRetentionCleanup();
  service.startDataRetentionCleanup();
  assert.equal(deletedCount, 0);
  assert.deepEqual(cleanups, [7]);
  assert.ok(service.retentionCleanupTimer);

  service.stop();
  assert.equal(service.retentionCleanupTimer, null);
});

test('data retention timer is reconfigured when settings change', async () => {
  const { service, settingsStore, cleanups } = createService(baseConfig);

  settingsStore.updateConfig({
    ...baseConfig,
    dashboard: {
      ...baseConfig.dashboard,
      dataRetentionDays: 3
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(service.retentionCleanupTimer);
  assert.deepEqual(cleanups, [3]);

  settingsStore.updateConfig(baseConfig);

  assert.equal(service.retentionCleanupTimer, null);
  service.stop();
});

test('restart restores service maintenance timers', () => {
  const config = {
    ...baseConfig,
    dashboard: {
      ...baseConfig.dashboard,
      dataRetentionDays: 5
    }
  };
  const { service } = createService(config);
  let connectCalls = 0;
  service.connect = () => {
    connectCalls += 1;
  };

  service.restart('test');

  assert.equal(connectCalls, 1);
  assert.ok(service.onlineCheckTimer);
  assert.ok(service.retentionCleanupTimer);

  service.stop();
});

test('graceful stop drains the MQTT client before completing', async () => {
  const { service } = createService(baseConfig);
  const calls = [];
  service.client = {
    removeAllListeners() { calls.push('remove-listeners'); },
    end(force, options, callback) {
      calls.push(`end:${force}`);
      setImmediate(callback);
    }
  };
  service.status.mqttConnected = true;

  await service.stop({ force: false });
  assert.deepEqual(calls, ['remove-listeners', 'end:false']);
  assert.equal(service.client, null);
  assert.equal(service.status.connectionState, 'stopped');
});
