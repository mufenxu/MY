const assert = require('node:assert/strict');
const test = require('node:test');

const { parseTopicsAndDevices } = require('../src/services/mqtt/topicMapper');
const { processIncomingMessage } = require('../src/services/mqtt/messageProcessor');
const { markTimedOutDevicesOffline } = require('../src/services/mqtt/onlineScanner');
const { resolveRelayControl } = require('../src/services/mqtt/relayControl');
const { getRetentionDays, shouldRunRetentionCleanup } = require('../src/services/mqtt/retentionPolicy');
const { parseOnlineStatus, createEmptyTopicStats } = require('../src/services/mqtt/utils');
const { createDevicePresencePayload } = require('../src/services/mqtt/webhookNotifier');

test('parseTopicsAndDevices maps sensor, online, and relay topics', () => {
  const result = parseTopicsAndDevices([
    {
      id: 'device_1',
      topics: {
        online: ' device/online ',
        temp: 'device/temp',
        hum: 'device/hum'
      },
      relays: [
        {
          id: 'relay_1',
          statusTopic: 'device/relay/status'
        }
      ]
    }
  ]);

  assert.deepEqual(result.topics.sort(), [
    'device/hum',
    'device/online',
    'device/relay/status',
    'device/temp'
  ]);
  assert.deepEqual(result.topicMap['device/online'], [{ deviceId: 'device_1', type: 'online' }]);
  assert.deepEqual(result.topicMap['device/relay/status'], [
    { deviceId: 'device_1', type: 'relay', relayId: 'relay_1' }
  ]);
});

test('mqtt utility functions normalize online status and topic stats', () => {
  assert.equal(parseOnlineStatus('YES'), 'online');
  assert.equal(parseOnlineStatus('offline'), 'offline');
  assert.deepEqual(createEmptyTopicStats(['a', '', 'b']), {
    a: { count: 0, lastMessageAt: null, lastPayload: null },
    b: { count: 0, lastMessageAt: null, lastPayload: null }
  });
});

test('createDevicePresencePayload formats device presence notifications', () => {
  const payload = createDevicePresencePayload('offline', {
    id: 'device_1',
    name: 'Device 1'
  }, 60000);

  assert.equal(payload.event, 'device_offline');
  assert.equal(payload.deviceId, 'device_1');
  assert.match(payload.message, /60 秒/);
  assert.equal(typeof payload.timestamp, 'number');
});

test('processIncomingMessage returns side effects for sensor activity', () => {
  const latest = {
    devices: {
      device_1: {
        id: 'device_1',
        name: 'Device 1',
        onlineStatus: 'offline',
        temp: null,
        hum: null,
        relays: {}
      }
    }
  };
  const status = { messagesReceived: 0, topicStats: {} };
  const result = processIncomingMessage({
    topic: 'device/temp',
    message: '23.5',
    now: 1000,
    status,
    topicMap: {
      'device/temp': [{ deviceId: 'device_1', type: 'temp' }]
    },
    latest,
    discoveredTopics: new Map(),
    discoveryTopic: '+/+/+',
    lastControlTriggeredBy: {}
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.deviceStatusUpdates, [{ deviceId: 'device_1', status: 'online' }]);
  assert.deepEqual(result.sensorSnapshots, ['device_1']);
  assert.equal(latest.devices.device_1.onlineStatus, 'online');
  assert.equal(latest.devices.device_1.temp, 23.5);
  assert.equal(status.topicStats['device/temp'].count, 1);
});

test('processIncomingMessage records relay logs and consumes control markers', () => {
  const latest = {
    devices: {
      device_1: {
        id: 'device_1',
        name: 'Device 1',
        onlineStatus: 'online',
        relays: { relay_1: 'OFF' }
      }
    }
  };
  const markers = { 'device_1:relay_1': 'web_ui' };
  const result = processIncomingMessage({
    topic: 'device/relay/status',
    message: 'ON',
    now: 1000,
    status: { messagesReceived: 0, topicStats: {} },
    topicMap: {
      'device/relay/status': [{ deviceId: 'device_1', type: 'relay', relayId: 'relay_1' }]
    },
    latest,
    discoveredTopics: new Map(),
    discoveryTopic: '+/+/+',
    lastControlTriggeredBy: markers
  });

  assert.deepEqual(result.relayLogs, [{
    deviceId: 'device_1',
    relayId: 'relay_1',
    status: 'ON',
    triggeredBy: 'web_ui'
  }]);
  assert.equal(markers['device_1:relay_1'], undefined);
});

test('processIncomingMessage remembers unmatched discovered topics', () => {
  const discoveredTopics = new Map();
  const result = processIncomingMessage({
    topic: 'unknown/topic',
    message: 'payload-value',
    now: 1000,
    status: { messagesReceived: 0, topicStats: {} },
    topicMap: {},
    latest: { devices: {} },
    discoveredTopics,
    discoveryTopic: '+/+/+',
    lastControlTriggeredBy: {}
  });

  assert.equal(result.changed, false);
  assert.equal(result.shouldEmitStatus, true);
  assert.equal(discoveredTopics.get('unknown/topic').count, 1);
  assert.equal(discoveredTopics.get('unknown/topic').lastPayload, 'payload-value');
});

test('resolveRelayControl validates relay commands', () => {
  const control = resolveRelayControl({
    mqtt: { qos: 1 },
    devices: [
      {
        id: 'device_1',
        relays: [
          {
            id: 'relay_1',
            controlTopic: 'device/relay/control'
          }
        ]
      }
    ]
  }, 'device_1', 'relay_1', 'on');

  assert.deepEqual(control, {
    topic: 'device/relay/control',
    value: 'ON',
    qos: 1
  });
  assert.throws(() => resolveRelayControl({ mqtt: {}, devices: [] }, 'missing', 'relay_1', 'ON'), /找不到配置/);
});

test('markTimedOutDevicesOffline marks only stale online devices', () => {
  const devices = {
    stale: { id: 'stale', onlineStatus: 'online', lastActive: 1000 },
    fresh: { id: 'fresh', onlineStatus: 'online', lastActive: 4900 },
    offline: { id: 'offline', onlineStatus: 'offline', lastActive: 1000 }
  };

  const offlineDevices = markTimedOutDevicesOffline(devices, 6000, 5000);

  assert.deepEqual(offlineDevices.map((device) => device.id), ['stale']);
  assert.equal(devices.stale.onlineStatus, 'offline');
  assert.equal(devices.fresh.onlineStatus, 'online');
});

test('retention policy normalizes cleanup settings', () => {
  assert.equal(getRetentionDays({ dashboard: { dataRetentionDays: '7' } }), 7);
  assert.equal(getRetentionDays({ dashboard: { dataRetentionDays: '-1' } }), 0);
  assert.equal(shouldRunRetentionCleanup({ dashboard: { dataRetentionDays: 1 } }), true);
  assert.equal(shouldRunRetentionCleanup({ dashboard: { dataRetentionDays: 0 } }), false);
});
