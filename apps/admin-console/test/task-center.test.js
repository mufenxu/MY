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
  });
  const result = await center.list();
  assert.equal(result.tasks.length, 5);
  assert.equal(result.tasks[0].source, 'incident');
  assert.equal(result.counts.action_required, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.sources.every((source) => source.available), true);
});

test('task status normalization is stable across providers', () => {
  assert.equal(normalizeTaskStatus('in_progress'), 'running');
  assert.equal(normalizeTaskStatus('delivered'), 'succeeded');
  assert.equal(normalizeTaskStatus('acknowledged'), 'action_required');
});
