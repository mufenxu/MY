import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperationalSearch } from '../src/operational-search.js';

function assertNoSensitiveFields(result) {
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    'http://internal-core:22000',
    'https://admin.internal',
    '/workspace/private',
    'credential-value-123',
    'configuration-secret-456',
    'artifact-secret-789',
  ]) assert.equal(serialized.includes(forbidden), false, `response leaked ${forbidden}`);
  for (const key of ['baseUrl', 'adminUrl', 'repositoryPath', 'settings', 'credentials', 'artifacts']) {
    assert.equal(serialized.includes(`"${key}"`), false, `response exposed ${key}`);
  }
}

test('operational search aggregates bounded sources using a sensitive-field allowlist', async () => {
  const search = createOperationalSearch({
    services: [{
      id: 'alpha-core',
      name: 'Alpha Core',
      category: 'service',
      description: 'Alpha API at http://internal-core:22000 password=credential-value-123',
      capabilities: ['alpha-read'],
      baseUrl: 'http://internal-core:22000',
      adminUrl: 'https://admin.internal',
      repositoryPath: '/workspace/private',
    }],
    operationsStore: {
      listIncidents: async () => [{
        id: 'incident-alpha',
        title: 'Alpha outage',
        description: 'credential-value-123',
        status: 'open',
        severity: 'critical',
        serviceId: 'alpha-core',
        openedAt: '2026-07-21T10:00:00.000Z',
        timeline: [{ message: 'credential-value-123' }],
      }],
    },
    taskCenter: {
      list: async () => ({
        tasks: [{ id: 'backup:alpha', sourceId: 'alpha', source: 'backup', title: 'Alpha backup', status: 'running', detail: 'credential-value-123', updatedAt: '2026-07-21T11:00:00.000Z' }],
      }),
    },
    releaseStore: {
      listBuilds: async () => [{ id: 'build-alpha', status: 'succeeded', targets: ['alpha-core'], artifacts: [{ token: 'artifact-secret-789' }], createdAt: '2026-07-21T12:00:00.000Z' }],
      listDeployments: async () => [],
    },
    configurationStore: {
      listChanges: async () => [{ id: 'change-alpha', status: 'pending', summary: 'Alpha threshold', changedKeys: ['alphaLimit'], settings: { token: 'configuration-secret-456' }, createdAt: '2026-07-21T13:00:00.000Z' }],
    },
    now: () => new Date('2026-07-22T00:00:00.000Z'),
  });

  const result = await search.search({ q: 'alpha', limit: '50' });
  assert.deepEqual(new Set(result.results.map((item) => item.type)), new Set(['service', 'incident', 'task', 'release', 'configuration']));
  assert.equal(result.totalMatched, 5);
  assert.equal(result.truncated, false);
  assert.equal(result.sources.every((source) => source.available), true);
  assertNoSensitiveFields(result);
});

test('operational search validates query, type, and result bounds', async () => {
  const search = createOperationalSearch({ services: [] });
  await assert.rejects(search.search({ q: 'x' }), (error) => error.code === 'INVALID_SEARCH_QUERY');
  await assert.rejects(search.search({ q: 'x'.repeat(81) }), (error) => error.code === 'INVALID_SEARCH_QUERY');
  await assert.rejects(search.search({ q: 'valid', type: 'credential' }), (error) => error.code === 'INVALID_SEARCH_TYPE');
  await assert.rejects(search.search({ q: 'valid', limit: 51 }), (error) => error.code === 'INVALID_SEARCH_LIMIT');
});

test('operational search bounds hostile internal identifiers, statuses, timestamps, and views', async () => {
  const secret = 'internal-secret-value';
  const hostileId = `<script>${'x'.repeat(240)}`;
  const search = createOperationalSearch({
    taskCenter: {
      list: async () => ({ tasks: [{
        id: hostileId,
        sourceId: hostileId,
        source: `https://private.internal/${secret}`,
        title: `Needle task token=${secret} ${'t'.repeat(240)}`,
        status: `token=${secret}`,
        updatedAt: `https://private.internal/${secret}`,
        view: 'javascript:alert(1)',
      }] }),
    },
    releaseStore: {
      listBuilds: async () => [{ id: hostileId, status: `credential=${secret}`, targets: ['needle'], createdAt: 'not-a-date' }],
      listDeployments: async () => [],
    },
    configurationStore: {
      listChanges: async () => [{ id: hostileId, status: `secret=${secret}`, summary: 'Needle configuration', changedKeys: ['needle'], createdAt: 'not-a-date' }],
    },
  });

  const result = await search.search({ q: 'needle', type: 'task,release,configuration', limit: 10 });
  assert.equal(result.results.length, 3);
  assert.equal(JSON.stringify(result).includes(secret), false);
  for (const item of result.results) {
    assert.match(item.id, /^[A-Za-z0-9._:-]{1,200}$/);
    assert.match(item.entityId, /^[A-Za-z0-9._:-]{1,160}$/);
    assert.ok(item.status.length <= 40);
    assert.equal(item.occurredAt, null);
  }
  assert.equal(result.results.find((item) => item.type === 'task').view, 'tasks');
});

test('operational search returns partial results when one bounded source is unavailable', async () => {
  const search = createOperationalSearch({
    services: [{ id: 'core', name: 'Core Service', description: '', capabilities: [] }],
    taskCenter: { list: async () => { throw new Error('downstream timeout'); } },
  });
  const result = await search.search({ q: 'core', type: 'service,task' });
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.sources, [
    { id: 'service', available: true },
    { id: 'task', available: false },
  ]);
});

test('operational search bounds slow source latency and reports it unavailable', async () => {
  const search = createOperationalSearch({
    services: [{ id: 'core', name: 'Core Service', description: '', capabilities: [] }],
    taskCenter: { list: async () => new Promise(() => {}) },
    sourceTimeoutMs: 100,
  });
  const startedAt = Date.now();
  const result = await search.search({ q: 'core', type: 'service,task' });
  assert.ok(Date.now() - startedAt < 1000);
  assert.deepEqual(result.sources, [
    { id: 'service', available: true },
    { id: 'task', available: false },
  ]);
});
