import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskCenter, normalizeTaskStatus } from '../src/task-center.js';

test('task center merges persistent operational sources and normalizes states', async () => {
  const center = createTaskCenter({
    backups: { getStatus: async () => ({ jobs: [{ id: 'backup-1', type: 'backup', status: 'running', createdAt: '2026-07-21T10:00:00Z' }] }) },
    releases: { getSummary: async () => ({
      builds: [{ id: 'build-1', status: 'succeeded', createdAt: '2026-07-21T09:00:00Z' }],
      deployments: [{ id: 'deploy-1', action: 'deploy', status: 'failed', createdAt: '2026-07-21T08:00:00Z' }],
    }) },
    notificationManagement: { listJobs: async () => ({ jobs: [{ id: 'notify-1', status: 'queued', createdAt: '2026-07-21T11:00:00Z' }] }) },
    operationsStore: { listIncidents: async () => [{ id: 'incident-1', title: 'Core offline', status: 'open', openedAt: '2026-07-21T12:00:00Z' }] },
    configurationManager: { getOverview: async () => ({ changes: [{ id: 'change-1', status: 'pending', summary: 'Tighten monitoring thresholds', createdBy: 'operator', createdAt: '2026-07-21T13:00:00Z' }] }) },
  });
  const result = await center.list();
  assert.equal(result.tasks.length, 6);
  assert.equal(result.tasks[0].source, 'configuration');
  assert.equal(result.tasks[0].view, 'configuration');
  assert.equal(result.counts.action_required, 2);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.sources.every((source) => source.available), true);

  const configurationOnly = await center.list({ source: 'configuration' });
  assert.deepEqual(configurationOnly.tasks.map((task) => task.id), ['configuration:change-1']);
});

test('task status normalization is stable across providers', () => {
  assert.equal(normalizeTaskStatus('in_progress'), 'running');
  assert.equal(normalizeTaskStatus('delivered'), 'succeeded');
  assert.equal(normalizeTaskStatus('acknowledged'), 'action_required');
  assert.equal(normalizeTaskStatus('applied'), 'succeeded');
  assert.equal(normalizeTaskStatus('conflicted'), 'failed');
  assert.equal(normalizeTaskStatus('rejected'), 'cancelled');
});

test('task center keeps existing sources available when configuration aggregation is not injected', async () => {
  const center = createTaskCenter({
    backups: { getStatus: async () => ({ jobs: [] }) },
    releases: { getSummary: async () => ({ builds: [], deployments: [] }) },
    notificationManagement: { listJobs: async () => ({ jobs: [] }) },
    operationsStore: { listIncidents: async () => [] },
  });

  const result = await center.list();
  assert.equal(result.tasks.length, 0);
  assert.deepEqual(result.sources, [
    { id: 'backup', available: true },
    { id: 'release', available: true },
    { id: 'notification', available: true },
    { id: 'incident', available: true },
    { id: 'configuration', available: false },
  ]);
});
