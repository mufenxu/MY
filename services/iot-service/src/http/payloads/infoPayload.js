function createInfoPayload(settingsStore, mqttService) {
  const config = settingsStore.getConfig();
  const data = mqttService.getLatestData();
  const status = mqttService.getStatus();

  const threshold = config.api.deviceOnlineThreshold;
  const now = Date.now();
  const devices = data.devices || {};
  const anyDeviceOnline = Object.values(devices).some(
    (device) => device.lastActive && now - device.lastActive < threshold
  );

  return {
    devices,
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
    retention: status.retention,
    deviceOnline: anyDeviceOnline
  };
}

module.exports = {
  createInfoPayload
};
