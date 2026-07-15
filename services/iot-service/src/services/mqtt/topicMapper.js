function addTopicMapping(topicsToSubscribe, topicMap, topic, target) {
  const normalizedTopic = String(topic || '').trim();
  if (!normalizedTopic) {
    return;
  }

  topicsToSubscribe.add(normalizedTopic);
  if (!topicMap[normalizedTopic]) {
    topicMap[normalizedTopic] = [];
  }
  topicMap[normalizedTopic].push(target);
}

function parseTopicsAndDevices(devices = []) {
  const topicsToSubscribe = new Set();
  const topicMap = {};

  devices.forEach((device) => {
    if (device.topics && device.topics.online) {
      addTopicMapping(topicsToSubscribe, topicMap, device.topics.online, {
        deviceId: device.id,
        type: 'online'
      });
    }

    if (device.topics && device.topics.temp) {
      addTopicMapping(topicsToSubscribe, topicMap, device.topics.temp, {
        deviceId: device.id,
        type: 'temp'
      });
    }

    if (device.topics && device.topics.hum) {
      addTopicMapping(topicsToSubscribe, topicMap, device.topics.hum, {
        deviceId: device.id,
        type: 'hum'
      });
    }

    if (Array.isArray(device.relays)) {
      device.relays.forEach((relay) => {
        if (relay.statusTopic) {
          addTopicMapping(topicsToSubscribe, topicMap, relay.statusTopic, {
            deviceId: device.id,
            type: 'relay',
            relayId: relay.id
          });
        }
      });
    }
  });

  return {
    topics: Array.from(topicsToSubscribe),
    topicMap
  };
}

module.exports = {
  parseTopicsAndDevices
};
