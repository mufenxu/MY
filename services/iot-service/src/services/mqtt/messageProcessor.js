const { parseOnlineStatus } = require('./utils');

function createEffects() {
  return {
    changed: false,
    shouldEmitStatus: false,
    deviceStatusUpdates: [],
    webhookNotifications: [],
    sensorSnapshots: [],
    relayLogs: []
  };
}

function mergeEffects(target, source) {
  target.changed = target.changed || source.changed;
  target.shouldEmitStatus = target.shouldEmitStatus || source.shouldEmitStatus;
  target.deviceStatusUpdates.push(...source.deviceStatusUpdates);
  target.webhookNotifications.push(...source.webhookNotifications);
  target.sensorSnapshots.push(...source.sensorSnapshots);
  target.relayLogs.push(...source.relayLogs);
  return target;
}

function updateTopicStats(status, topic, message, now) {
  status.lastMsgTimestamp = now;
  status.lastMessageTopic = topic;
  status.messagesReceived += 1;

  if (!status.topicStats[topic]) {
    status.topicStats[topic] = { count: 0, lastMessageAt: null, lastPayload: null };
  }

  status.topicStats[topic].count += 1;
  status.topicStats[topic].lastMessageAt = now;
  status.topicStats[topic].lastPayload = message;
}

function rememberDiscoveredTopic(discoveredTopics, topic, message, now) {
  discoveredTopics.set(topic, {
    topic,
    lastPayload: message.slice(0, 128),
    lastMessageAt: now,
    count: (discoveredTopics.get(topic)?.count || 0) + 1
  });
}

function markDeviceOnline(deviceId, device, effects) {
  if (device.onlineStatus !== 'offline') {
    return;
  }

  device.onlineStatus = 'online';
  effects.changed = true;
  effects.deviceStatusUpdates.push({ deviceId, status: 'online' });
  effects.webhookNotifications.push({ type: 'online', device });
}

function applyOnlineMessage(deviceId, device, message) {
  const effects = createEffects();
  const previousStatus = device.onlineStatus;
  const onlineStatus = parseOnlineStatus(message);
  device.onlineStatus = onlineStatus;

  if (previousStatus !== onlineStatus) {
    effects.changed = true;
    effects.deviceStatusUpdates.push({ deviceId, status: onlineStatus });
    effects.webhookNotifications.push({ type: onlineStatus, device });
  }

  return effects;
}

function applySensorMessage(deviceId, device, type, message) {
  const effects = createEffects();
  const value = Number.parseFloat(message);
  if (Number.isNaN(value) || device[type] === value) {
    return effects;
  }

  device[type] = value;
  effects.changed = true;
  effects.sensorSnapshots.push(deviceId);
  return effects;
}

function applyRelayMessage(deviceId, device, relayId, message, lastControlTriggeredBy) {
  const effects = createEffects();
  const previousStatus = device.relays[relayId];
  const status = message.trim().toUpperCase();
  device.relays[relayId] = status;

  if (previousStatus !== status) {
    const key = `${deviceId}:${relayId}`;
    const triggeredBy = lastControlTriggeredBy[key] || 'manual';
    delete lastControlTriggeredBy[key];

    effects.changed = true;
    effects.relayLogs.push({ deviceId, relayId, status, triggeredBy });
  }

  return effects;
}

function processTargetMessage({ latest, target, message, now, lastControlTriggeredBy }) {
  const effects = createEffects();
  const { deviceId, type, relayId } = target;
  const device = latest.devices[deviceId];

  if (!device) {
    return effects;
  }

  device.lastActive = now;

  if (type === 'online') {
    return applyOnlineMessage(deviceId, device, message);
  }

  markDeviceOnline(deviceId, device, effects);

  if (type === 'temp' || type === 'hum') {
    return mergeEffects(effects, applySensorMessage(deviceId, device, type, message));
  }

  if (type === 'relay') {
    return mergeEffects(effects, applyRelayMessage(deviceId, device, relayId, message, lastControlTriggeredBy));
  }

  return effects;
}

function processIncomingMessage({
  topic,
  message,
  now,
  status,
  topicMap,
  latest,
  discoveredTopics,
  discoveryTopic,
  lastControlTriggeredBy
}) {
  const effects = createEffects();
  updateTopicStats(status, topic, message, now);

  const targets = topicMap[topic];
  if (!targets) {
    if (discoveryTopic && topic !== discoveryTopic) {
      rememberDiscoveredTopic(discoveredTopics, topic, message, now);
      effects.shouldEmitStatus = true;
    }
    return effects;
  }

  effects.shouldEmitStatus = true;
  targets.forEach((target) => {
    mergeEffects(effects, processTargetMessage({
      latest,
      target,
      message,
      now,
      lastControlTriggeredBy
    }));
  });

  return effects;
}

module.exports = {
  processIncomingMessage,
  processTargetMessage,
  updateTopicStats
};
