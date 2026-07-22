import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryOperationsStore } from '../src/operations-store.js';

test('operations store keeps status history, incidents, audit, and settings isolated', async () => {
  let current = new Date('2026-07-18T12:00:00.000Z');
  let id = 0;
  const store = createMemoryOperationsStore({ now: () => current, idFactory: () => `id-${++id}` });
  await store.recordStatusSamples([{ id: 'core', state: 'healthy', latencyMs: 12, httpStatus: 200, checkedAt: current.toISOString() }], current);
  current = new Date('2026-07-18T13:00:00.000Z');
  await store.recordStatusSamples([{ id: 'core', state: 'offline', latencyMs: 8000, httpStatus: null, checkedAt: current.toISOString() }], current);

  const history = await store.getStatusHistory({ serviceId: 'core' });
  assert.deepEqual(history.map((sample) => sample.state), ['healthy', 'offline']);
  const rollups = await store.getStatusRollups({ serviceId: 'core' });
  assert.equal(rollups.length, 2);

  const incident = await store.createIncident({ key: 'service:core', title: 'Core offline' });
  assert.equal((await store.findActiveIncident('service:core')).id, incident.id);
  await store.updateIncident(incident.id, { status: 'resolved', resolvedAt: current.toISOString() });
  assert.equal(await store.findActiveIncident('service:core'), null);

  await store.addAudit({ actor: 'admin', action: 'test.action' });
  assert.equal((await store.listAudit())[0].action, 'test.action');
  const settings = await store.updateSettings({ alertingEnabled: false }, { alertingEnabled: true });
  assert.equal(settings.alertingEnabled, false);
});

test('operations store retains external blackbox samples separately from service history', async () => {
  let current = new Date('2026-07-22T00:00:00.000Z');
  const store = createMemoryOperationsStore({ now: () => current });
  await store.recordBlackboxSamples([
    { probeId: 'outside-a', targetId: 'platform', state: 'healthy', recordedAt: current.toISOString(), expectedIntervalMs: 30000 },
  ]);
  current = new Date(current.getTime() + 30000);
  await store.recordBlackboxSamples([
    { probeId: 'outside-a', targetId: 'platform', state: 'offline', recordedAt: current.toISOString(), expectedIntervalMs: 30000 },
  ]);

  assert.equal((await store.getStatusHistory({ limit: 10 })).length, 0);
  assert.equal((await store.getBlackboxHistory({ probeId: 'outside-a' })).length, 2);
  assert.equal((await store.getLatestBlackboxSamples())[0].state, 'offline');
});
