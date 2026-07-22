import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryOperationsStore } from '../src/operations-store.js';
import { calculateBudget, createSloService } from '../src/slo-service.js';

test('30-day SLO aggregation remains exact beyond the 100k history read limit', async () => {
  const current = new Date('2026-07-31T00:00:00.000Z');
  const store = createMemoryOperationsStore({ statusRetentionDays: 31, now: () => current });
  const start = Date.parse('2026-07-15T00:00:00.000Z');
  const samples = Array.from({ length: 100_005 }, (_, index) => ({
    id: 'core',
    state: index === 0 || index === 1 ? 'offline' : index === 2 ? 'unmonitored' : 'healthy',
    maintenance: index === 1,
    latencyMs: 10 + (index % 5),
    checkedAt: new Date(start + index * 1000).toISOString(),
  }));
  await store.recordStatusSamples(samples, current);

  const service = createSloService({
    services: [{ id: 'core', name: 'Core', healthPath: '/api/readyz' }],
    operationsStore: store,
    now: () => current,
  });
  const report = await service.getReport({ window: '30d' });
  const [core] = report.services;
  assert.equal(core.samples, 100_003);
  assert.equal(core.healthy, 100_002);
  assert.equal(core.failed, 1);
  assert.deepEqual(core.excluded, { maintenance: 1, unmonitored: 1 });
  assert.equal(core.states.offline, 1);
  assert.equal(core.availabilityPercent, 99.999);
  assert.equal(core.latency.count, 100_003);
  assert.equal(report.overall.samples, 100_003);
  assert.equal(report.overall.failed, 1);
  assert.ok(report.overall.errorBudget.burnRate > 0);
});

test('SLO budget status exposes remaining and burn semantics', () => {
  const healthy = calculateBudget({ samples: 10_000, healthy: 9_995 }, 99.9);
  assert.equal(healthy.status, 'at_risk');
  assert.equal(healthy.errorBudget.burnRate, 0.5);
  assert.equal(healthy.errorBudget.remainingPercent, 50);
  const exhausted = calculateBudget({ samples: 10_000, healthy: 9_980 }, 99.9);
  assert.equal(exhausted.status, 'exhausted');
  assert.equal(exhausted.errorBudget.remainingPercent, 0);
  assert.equal(calculateBudget({ samples: 0, healthy: 0 }, 99.9).status, 'no_data');
});

test('SLO windows and service identifiers are strictly bounded', async () => {
  const service = createSloService({
    services: [{ id: 'core', name: 'Core', healthPath: '/readyz' }],
    operationsStore: { getAvailabilitySummary: async () => [] },
  });
  await assert.rejects(service.getReport({ window: '90d' }), (error) => error.code === 'INVALID_SLO_WINDOW');
  await assert.rejects(service.getReport({ window: '7d', serviceId: 'unknown' }), (error) => error.code === 'INVALID_SERVICE_ID');

  const unavailable = createSloService({
    services: [{ id: 'core', name: 'Core', healthPath: '/readyz' }],
    operationsStore: { getAvailabilitySummary: async () => { throw new Error('database timeout with private details'); } },
  });
  await assert.rejects(unavailable.getReport({ window: '7d' }), (error) => error.code === 'SLO_DATA_UNAVAILABLE' && error.status === 503);
});
