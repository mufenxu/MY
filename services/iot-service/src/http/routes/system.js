const { MqttService } = require('../../services/mqttClient');

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
      const result = await settingsStore.resetConfig();
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
      res.status(400).json({ error: `${error.message}` });
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

  app.get('/api/discovery/topics', requireSession, (req, res) => {
    try {
      const list = mqttService.getDiscoveredTopics();
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: error.message });
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
