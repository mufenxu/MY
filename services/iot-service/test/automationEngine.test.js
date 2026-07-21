const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { AutomationEngine, matchesCondition } = require('../src/services/automationEngine');
const { MemoryDatabase } = require('../src/storage/db');

function createFixture() {
  const database = new MemoryDatabase();
  const settingsStore = {
    getConfig: () => ({
      devices: [{
        id: 'room',
        name: 'Room',
        topics: { temp: 'room/temp', hum: 'room/hum' },
        relays: [{ id: 'fan', name: 'Fan' }]
      }]
    })
  };
  const mqttService = new EventEmitter();
  mqttService.db = database;
  mqttService.commands = [];
  mqttService.publishControl = async (deviceId, relayId, status, options) => {
    mqttService.commands.push({ deviceId, relayId, status, options });
    return { qos: 1, queuedAt: 1234 };
  };
  return { database, settingsStore, mqttService };
}

test('numeric and state conditions use the current device snapshot', () => {
  const latest = {
    devices: {
      room: { temp: 29, hum: 45, onlineStatus: 'online', relays: { fan: 'OFF' } }
    }
  };
  assert.equal(matchesCondition(latest, {
    deviceId: 'room', metric: 'temperature', operator: 'gt', value: 28
  }), true);
  assert.equal(matchesCondition(latest, {
    deviceId: 'room', metric: 'relay', relayId: 'fan', operator: 'eq', value: 'ON'
  }), false);
});

test('rule fires on a false-to-true edge and respects cooldown after reset', async () => {
  const fixture = createFixture();
  let now = 100000;
  const engine = new AutomationEngine({ ...fixture, now: () => now });
  await engine.createRule({
    name: 'High temperature ventilation',
    cooldownSeconds: 60,
    condition: { deviceId: 'room', metric: 'temperature', operator: 'gt', value: 28 },
    actions: [{ deviceId: 'room', relayId: 'fan', status: 'ON' }]
  });

  const snapshot = (temp) => ({ devices: { room: { temp, relays: { fan: 'OFF' } } } });
  await engine.evaluate(snapshot(29));
  await engine.evaluate(snapshot(30));
  assert.equal(fixture.mqttService.commands.length, 1);

  await engine.evaluate(snapshot(25));
  now += 30000;
  await engine.evaluate(snapshot(29));
  assert.equal(fixture.mqttService.commands.length, 1);

  await engine.evaluate(snapshot(25));
  now += 31000;
  await engine.evaluate(snapshot(29));
  assert.equal(fixture.mqttService.commands.length, 2);
  assert.match(fixture.mqttService.commands[0].options.triggeredBy, /^automation_rule:/);

  const runs = await engine.listRuns();
  assert.equal(runs.length, 2);
  assert.equal(runs[0].state, 'commands_queued');
  assert.equal(runs[0].device_confirmed, false);
});

test('scene execution records partial queue failures without claiming device confirmation', async () => {
  const fixture = createFixture();
  const engine = new AutomationEngine(fixture);
  const scene = await engine.createScene({
    name: 'Leave home',
    actions: [
      { deviceId: 'room', relayId: 'fan', status: 'OFF' },
      { deviceId: 'room', relayId: 'fan', status: 'ON' }
    ]
  });
  fixture.mqttService.publishControl = async (deviceId, relayId, status) => {
    if (status === 'ON') throw Object.assign(new Error('broker unavailable'), { code: 'MQTT_DOWN' });
    return { qos: 0, queuedAt: 5678 };
  };

  const run = await engine.runScene(scene.id, 'operator-1');
  assert.equal(run.state, 'partially_queued');
  assert.equal(run.device_confirmed, false);
  assert.deepEqual(run.results.map((result) => result.state), ['queued', 'failed']);
  assert.equal(run.results[0].broker_acknowledged, false);
});

test('automation definitions reject unknown devices and relays', async () => {
  const fixture = createFixture();
  const engine = new AutomationEngine(fixture);
  await assert.rejects(() => engine.createScene({
    name: 'Invalid',
    actions: [{ deviceId: 'missing', relayId: 'fan', status: 'ON' }]
  }), (error) => error.statusCode === 400 && error.code === 'UNKNOWN_DEVICE');
});
