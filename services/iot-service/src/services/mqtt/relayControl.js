function resolveRelayControl(config, deviceId, relayId, status) {
  const device = (config.devices || []).find((item) => item.id === deviceId);
  if (!device) {
    throw new Error(`找不到配置的设备 ID: ${deviceId}`);
  }

  const relay = device.relays && device.relays.find((item) => item.id === relayId);
  if (!relay) {
    throw new Error(`在设备 ${deviceId} 下找不到继电器 ID: ${relayId}`);
  }

  if (!relay.controlTopic) {
    throw new Error(`继电器 ${relayId} 没有配置控制主题。`);
  }

  const value = String(status).toUpperCase();
  if (value !== 'ON' && value !== 'OFF') {
    throw new Error('继电器状态只能为 ON 或 OFF。');
  }

  return {
    topic: relay.controlTopic,
    value,
    qos: config.mqtt.qos
  };
}

module.exports = {
  resolveRelayControl
};
