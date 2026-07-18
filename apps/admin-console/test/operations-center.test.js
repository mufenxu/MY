import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationsCenter, normalizeOperationSettings } from '../src/operations-center.js';
import { createMemoryOperationsStore } from '../src/operations-store.js';

const service = {
  id: 'core',
  name: 'Core service',
  shortName: 'Core',
  category: 'miniapp',
  healthPath: '/health',
};

test('operations center opens and resolves incidents using consecutive thresholds', async () => {
  let current = new Date('2026-07-18T12:00:00.000Z');
  const states = ['offline', 'offline', 'healthy', 'healthy'];
  const notifications = [];
  const store = createMemoryOperationsStore({ now: () => current });
  const center = createOperationsCenter({
    services: [service],
    monitor: {
      refresh: async () => {
        const state = states.shift();
        return [{ ...service, state, checkedAt: current.toISOString(), latencyMs: state === 'healthy' ? 10 : 8000, httpStatus: state === 'healthy' ? 200 : null }];
      },
    },
    store,
    notifier: {
      check: async () => ({ configured: true, healthy: true }),
      sendIncident: async (incident, transition) => {
        notifications.push([incident.id, transition]);
        return { delivered: true };
      },
    },
    backups: { getStatus: async () => ({ backups: [{ name: 'backup', createdAt: current.toISOString(), restorable: true }], jobs: [], capabilities: {} }) },
    releaseService: { getSummary: async () => ({ capabilities: {} }) },
    now: () => current,
    config: {
      incidentFailureThreshold: 2,
      incidentRecoveryThreshold: 2,
      incidentNotificationsEnabled: true,
      monitorIntervalMs: 30000,
      backupRpoHours: 26,
    },
  });

  await center.refresh();
  assert.equal((await store.listIncidents()).length, 0);
  current = new Date(current.getTime() + 30000);
  await center.refresh();
  assert.equal((await store.listIncidents({ status: 'open' })).length, 1);
  current = new Date(current.getTime() + 30000);
  await center.refresh();
  assert.equal((await store.listIncidents({ status: 'open' })).length, 1);
  current = new Date(current.getTime() + 30000);
  await center.refresh();

  const [incident] = await store.listIncidents();
  assert.equal(incident.status, 'resolved');
  assert.deepEqual(notifications.map((item) => item[1]), ['opened', 'resolved']);
  const overview = await center.getOverview();
  assert.equal(overview.history.core.samples.length, 4);
});

test('operation settings validate thresholds and maintenance service ids', () => {
  const current = {
    alertingEnabled: true,
    monitorIntervalMs: 30000,
    failureThreshold: 2,
    recoveryThreshold: 2,
    backupRpoHours: 26,
    backupSchedule: { enabled: false, time: '02:30' },
    maintenanceWindows: [],
  };
  const settings = normalizeOperationSettings({
    monitorIntervalMs: 1,
    failureThreshold: 99,
    maintenanceWindows: [{ serviceId: 'unknown', startsAt: '2026-07-18T12:00:00Z', endsAt: '2026-07-18T13:00:00Z' }],
  }, current, ['core']);
  assert.equal(settings.monitorIntervalMs, 10000);
  assert.equal(settings.failureThreshold, 10);
  assert.equal(settings.maintenanceWindows[0].serviceId, 'all');
});

test('gateway error-rate observations create and recover a derived incident', async () => {
  let current = new Date('2026-07-18T12:00:00.000Z');
  const store = createMemoryOperationsStore({ now: () => current });
  const center = createOperationsCenter({
    services: [service],
    monitor: { refresh: async () => [{ ...service, state: 'healthy', latencyMs: 10, checkedAt: current.toISOString() }] },
    store,
    notifier: { check: async () => ({ configured: false }), sendIncident: async () => ({ delivered: false }) },
    backups: { getStatus: async () => ({ backups: [], jobs: [], capabilities: {} }) },
    releaseService: { getSummary: async () => ({ capabilities: {} }) },
    now: () => current,
    config: {
      monitorIntervalMs: 30000,
      incidentFailureThreshold: 2,
      incidentRecoveryThreshold: 2,
      proxyAlertMinimumRequests: 5,
      proxyErrorRatePercent: 1,
      proxyP95ThresholdMs: 2000,
      backupRpoHours: 26,
      workspaceRoot: process.cwd(),
    },
  });

  for (let index = 0; index < 5; index += 1) {
    await center.recordProxyMetric({ service: 'core', outcome: 'error', statusClass: '5xx', durationMs: 100 });
    current = new Date(current.getTime() + 11000);
  }
  assert.equal((await store.listIncidents({ status: 'open' })).some((incident) => incident.key === 'gateway:core:5xx'), true);

  current = new Date(current.getTime() + 6 * 60000);
  await center.recordProxyMetric({ service: 'core', outcome: 'success', statusClass: '2xx', durationMs: 100 });
  assert.equal((await store.listIncidents({ status: 'resolved' })).some((incident) => incident.key === 'gateway:core:5xx'), true);
});
