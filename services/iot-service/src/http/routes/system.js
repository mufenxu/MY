const { MqttService } = require('../../services/mqttClient');
const { createErrorPayload } = require('../middleware/requestContext');

const IOT_SERVICE_VERSION = String(
  process.env.PLATFORM_RELEASE_REVISION || process.env.GIT_SHA || 'unknown'
).slice(0, 64);

function registerSystemRoutes(app, { settingsStore, mqttService, requireSession }) {
  app.get('/api/config', requireSession, (req, res) => {
    res.json(settingsStore.getPublicConfig());
  });

  app.get('/api/config/defaults', requireSession, (req, res) => {
    res.json(settingsStore.getPublicDefaults());
  });

  app.put('/api/config', requireSession, async (req, res, next) => {
    try {
      const previous = settingsStore.getConfig();
      const result = await settingsStore.saveConfig(req.body || {});
      const restartRequired = previous.api.port !== result.config.api.port;
      const publicConfig = settingsStore.getPublicConfig();

      res.json({
        message: restartRequired ? '配置已保存，端口修改会在服务重启后生效。' : '配置已保存。',
        restartRequired,
        ...publicConfig
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/reset', requireSession, async (req, res, next) => {
    try {
      await settingsStore.resetConfig();
      mqttService.restart('config-reset');
      const publicConfig = settingsStore.getPublicConfig();

      res.json({
        message: '已恢复默认配置。',
        ...publicConfig
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/reconnect', requireSession, (req, res) => {
    mqttService.restart('manual');
    res.json({ message: 'MQTT 已重新连接。' });
  });

  app.post('/api/config/test-mqtt', requireSession, async (req, res) => {
    try {
      const { url, username, password } = req.body || {};
      if (!url) {
        return res.status(400).json({ error: '测试连接时，MQTT 地址不能为空。' });
      }

      await MqttService.testConnection(url, { username, password });
      res.json({ message: 'MQTT Broker 连接测试成功！网络可达。' });
    } catch (error) {
      // 原始 message 里常带 broker 地址、端口与认证失败细节，只写日志不外泄。
      console.error(JSON.stringify({
        event: 'mqtt_test_failed',
        requestId: req.id,
        message: error && error.message ? String(error.message).slice(0, 500) : 'unknown',
      }));
      res.status(400).json(createErrorPayload(
        req,
        400,
        'MQTT 连接测试失败，请检查地址、端口与认证信息。',
        'MQTT_TEST_FAILED'
      ));
    }
  });

  app.post('/api/config/clean-data', requireSession, async (req, res, next) => {
    try {
      const retentionDays = Number.parseInt(req.body.retentionDays || '0', 10);
      if (Number.isNaN(retentionDays) || retentionDays < 0) {
        return res.status(400).json({ error: '保留天数必须为正整数或 0。' });
      }

      const deletedCount = await mqttService.db.cleanOldData(retentionDays);
      res.json({ message: '历史数据清理成功，已重新收缩物理文件体积。', deletedCount });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/discovery/topics', requireSession, (req, res, next) => {
    try {
      const list = mqttService.getDiscoveredTopics();
      res.json(list);
    } catch (error) {
      // 交给统一错误中间件：5xx 只回通用文案 + code + requestId，原文进日志。
      next(error);
    }
  });

  app.get('/api/meta', requireSession, (req, res) => {
    const config = settingsStore.getConfig();

    res.json({
      serviceName: 'MQTT 监控面板',
      storage: 'mongodb',
      apiPort: config.api.port,
      auth: {
        enabled: Boolean(config.auth.enabled && config.auth.password)
      },
      dashboard: config.dashboard
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  });

  // 统一健康契约：/livez 不查依赖，/readyz 反映存储与 MQTT 就绪，/version 供发布核对。
  app.get('/livez', (req, res) => {
    res.json({ status: 'ok', service: 'iot-service', version: IOT_SERVICE_VERSION });
  });

  app.get('/readyz', async (req, res) => {
    let storageReady = false;
    try {
      storageReady = Boolean(await mqttService.db.ping());
    } catch {
      storageReady = false;
    }
    const mqttStatus = mqttService.getStatus?.() || mqttService.status || {};
    const ready = Boolean(storageReady && mqttStatus.mqttConnected && mqttStatus.subscribed);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      service: 'iot-service',
      version: IOT_SERVICE_VERSION,
      checks: {
        storage: storageReady ? 'up' : 'down',
        mqtt: mqttStatus.mqttConnected ? 'connected' : 'disconnected',
        subscription: mqttStatus.subscribed ? 'subscribed' : 'unsubscribed'
      }
    });
  });

  app.get('/version', (req, res) => {
    res.json({
      status: 'ok',
      service: 'iot-service',
      version: IOT_SERVICE_VERSION,
      node: process.version
    });
  });

  app.get('/api/ready', async (req, res) => {
    try {
      const storageReady = await mqttService.db.ping();
      const mqttStatus = mqttService.getStatus?.() || mqttService.status || {};
      const mqttConnected = Boolean(mqttStatus.mqttConnected);
      const mqttSubscribed = Boolean(mqttStatus.subscribed);
      const ready = Boolean(storageReady && mqttConnected && mqttSubscribed);
      res.status(ready ? 200 : 503).json({
        ok: ready,
        storage: storageReady ? 'ready' : 'unavailable',
        mqtt: mqttConnected ? 'connected' : 'disconnected',
        subscription: mqttSubscribed ? 'subscribed' : 'unsubscribed'
      });
    } catch {
      res.status(503).json({
        ok: false,
        storage: 'unavailable',
        mqtt: 'unknown',
        subscription: 'unknown'
      });
    }
  });
}

module.exports = {
  registerSystemRoutes
};
