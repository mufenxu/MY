const { createInfoPayload } = require('../payloads/infoPayload');
const crypto = require('crypto');

const MAX_HISTORY_LIMIT = 500;

function clampHistoryLimit(rawValue) {
  const parsed = Number.parseInt(rawValue || '100', 10);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, parsed));
}

function registerDeviceRoutes(app, {
  settingsStore,
  mqttService,
  requireTelemetryAccess,
  requireHistoryAccess,
  requireRelayControl
}) {
  app.get('/api/latest', requireTelemetryAccess, (req, res) => {
    const data = mqttService.getLatestData();
    res.json(data.devices || {});
  });

  app.get('/api/devices', requireTelemetryAccess, (req, res) => {
    const data = mqttService.getLatestData();
    res.json(data.devices || {});
  });

  app.get('/api/devices/:deviceId/history', requireHistoryAccess, async (req, res, next) => {
    try {
      const { deviceId } = req.params;
      const limit = clampHistoryLimit(req.query.limit);
      const range = req.query.range ? String(req.query.range).trim() : null;
      const rows = await mqttService.db.getSensorHistory(deviceId, limit, range);
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/devices/:deviceId/relays/:relayId/control', requireRelayControl, async (req, res, next) => {
    try {
      const { deviceId, relayId } = req.params;
      const { status } = req.body || {};

      if (!status) {
        return res.status(400).json({ error: '必须提供 status 参数 (ON 或 OFF)。' });
      }

      const publishResult = await mqttService.publishControl(deviceId, relayId, status);
      const commandId = crypto.randomUUID();
      const brokerAcknowledged = Number(publishResult?.qos) > 0;
      res.status(202).json({
        commandId,
        state: 'queued',
        brokerAcknowledged,
        deviceConfirmed: false,
        acceptedAt: publishResult?.queuedAt || Date.now(),
        message: brokerAcknowledged
          ? 'Broker 已确认控制指令，正在等待设备遥测确认。'
          : '控制指令已写入 MQTT 发送队列，正在等待设备遥测确认。'
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/status', requireTelemetryAccess, (req, res) => {
    const config = settingsStore.getConfig();
    const status = mqttService.getStatus();
    const data = mqttService.getLatestData();

    const now = Date.now();
    const threshold = config.api.deviceOnlineThreshold;
    const anyDeviceOnline = Object.values(data.devices || {}).some(
      (device) => device.lastActive && now - device.lastActive < threshold
    );

    res.json({
      mqttConnected: status.mqttConnected,
      subscribed: status.subscribed,
      lastMsgTimestamp: status.lastMsgTimestamp,
      lastMessageTopic: status.lastMessageTopic,
      lastError: status.lastError,
      connectionState: status.connectionState,
      activeBroker: status.activeBroker,
      subscribedTopics: status.subscribedTopics,
      connectedAt: status.connectedAt,
      disconnectedAt: status.disconnectedAt,
      messagesReceived: status.messagesReceived,
      topicStats: status.topicStats,
      serviceStartedAt: status.serviceStartedAt,
      deviceOnline: anyDeviceOnline
    });
  });

  app.get('/api/info', requireTelemetryAccess, (req, res) => {
    res.json(createInfoPayload(settingsStore, mqttService));
  });
}

module.exports = {
  registerDeviceRoutes
};
