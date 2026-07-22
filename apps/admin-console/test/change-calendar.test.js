import assert from 'node:assert/strict';
import test from 'node:test';
import { createChangeCalendar } from '../src/change-calendar.js';

function createCalendar() {
  const now = () => new Date('2026-07-22T12:00:00.000Z');
  return createChangeCalendar({
    services: [{ id: 'core', name: 'Core' }],
    releaseStore: {
      listBuilds: async () => [{
        id: 'build-1', status: 'succeeded', targets: ['core'], repository: 'private/repository',
        createdAt: '2026-07-21T10:00:00.000Z', completedAt: '2026-07-21T10:05:00.000Z',
        timeline: [{ type: 'queued', at: '2026-07-21T10:00:00.000Z', actor: 'admin', message: 'token=release-secret' }],
      }],
      listDeployments: async () => [],
    },
    configurationStore: {
      listChanges: async () => [{
        id: 'change-1', status: 'applied', summary: 'Rotate token=configuration-secret', changedKeys: ['failureThreshold'],
        settings: { notificationApiKey: 'configuration-secret' }, decisionNote: 'password=configuration-secret',
        createdAt: '2026-07-21T11:00:00.000Z', appliedAt: '2026-07-21T11:10:00.000Z',
      }],
    },
    operationsManager: {
      getSettings: async () => ({
        apiKey: 'settings-secret',
        maintenanceWindows: [{
          id: 'maint-1', serviceId: 'core', reason: 'Upgrade https://private.internal token=maintenance-secret',
          createdBy: 'admin', startsAt: '2026-07-23T01:00:00.000Z', endsAt: '2026-07-23T02:00:00.000Z',
        }],
      }),
    },
    operationsStore: {
      listIncidents: async () => [{
        id: 'incident-1', title: 'Core incident', status: 'resolved', severity: 'critical', serviceId: 'core',
        description: 'credential=incident-secret', openedAt: '2026-07-20T09:00:00.000Z', resolvedAt: '2026-07-20T10:00:00.000Z',
        timeline: [{ type: 'resolved', at: '2026-07-20T10:00:00.000Z', actor: 'admin', message: 'password=incident-secret' }],
      }],
    },
    now,
  });
}

test('change calendar aggregates bounded sources and strips sensitive details', async () => {
  const result = await createCalendar().list({
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-07-30T00:00:00.000Z',
    pageSize: 50,
  });
  assert.equal(result.events.length, 4);
  assert.deepEqual(new Set(result.events.map((event) => event.type)), new Set(['release', 'configuration', 'maintenance', 'incident']));
  assert.equal(result.pagination.total, 4);
  assert.equal(result.sources.every((source) => source.available), true);
  const serialized = JSON.stringify(result);
  for (const secret of ['release-secret', 'configuration-secret', 'maintenance-secret', 'incident-secret', 'settings-secret', 'private/repository', 'private.internal']) {
    assert.equal(serialized.includes(secret), false, `calendar leaked ${secret}`);
  }
  for (const key of ['settings', 'repository', 'decisionNote', 'description', 'actor', 'message', 'createdBy']) {
    assert.equal(serialized.includes(`"${key}"`), false, `calendar exposed ${key}`);
  }
  const release = result.events.find((event) => event.type === 'release');
  assert.deepEqual(release.timeline, [{ type: 'queued', at: '2026-07-21T10:00:00.000Z' }]);
});

test('change calendar applies type, service, page, and date-range bounds', async () => {
  const calendar = createCalendar();
  const filtered = await calendar.list({
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-07-30T00:00:00.000Z',
    type: 'maintenance,incident',
    serviceId: 'core',
    page: 1,
    pageSize: 1,
  });
  assert.equal(filtered.events.length, 1);
  assert.equal(filtered.pagination.total, 2);
  assert.equal(filtered.pagination.hasMore, true);
  const scopedRelease = await calendar.list({
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-07-30T00:00:00.000Z',
    type: 'release',
    serviceId: 'core',
  });
  assert.equal(scopedRelease.events.length, 1);
  await assert.rejects(calendar.list({ from: '2026-01-01', to: '2026-07-30' }), (error) => error.code === 'INVALID_CHANGE_CALENDAR_RANGE');
  await assert.rejects(calendar.list({ type: 'backup' }), (error) => error.code === 'INVALID_CHANGE_CALENDAR_TYPE');
  await assert.rejects(calendar.list({ serviceId: 'unknown' }), (error) => error.code === 'INVALID_SERVICE_ID');
  await assert.rejects(calendar.list({ pageSize: 51 }), (error) => error.code === 'INVALID_CHANGE_CALENDAR_PAGE_SIZE');
});
