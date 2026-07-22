import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { withFetchServer as withServer } from '../test-support/fetch-server.js';

test('readiness reports a failed session registry dependency', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const app = createApp({ config, readinessCheck: async () => false });
  await withServer(app, async (origin) => {
    const response = await fetch(`${origin}/api/readyz`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'not-ready');
  });
});

test('metrics require the configured bearer token', async () => {
  const token = 'm'.repeat(32);
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: token };
  const app = createApp({ config });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/metrics`)).status, 401);
    const response = await fetch(`${origin}/api/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /my_platform_http_requests_total/);
  });
});

test('external blackbox ingest uses its dedicated token and accepts structured samples', async () => {
  const token = 'b'.repeat(32);
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32), blackboxIngestToken: token };
  const app = createApp({ config });
  const payload = JSON.stringify({
    probeId: 'outside-a',
    samples: [{
      targetId: 'platform-edge',
      state: 'healthy',
      httpStatus: 200,
      recordedAt: new Date().toISOString(),
      expectedIntervalMs: 30000,
    }],
  });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/internal/blackbox/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })).status, 401);
    const accepted = await fetch(`${origin}/api/internal/blackbox/samples`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).accepted, 1);
    const status = await fetch(`${origin}/api/operations/blackbox`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).overall, 'healthy');
  });
});

test('backup mutations require the console request header', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  let backupStarted = false;
  let deletedBackup = '';
  let uploadedBackup = null;
  const app = createApp({
    config,
    backupManager: {
      getStatus: async () => ({ capabilities: { canBackup: true, canRestore: true }, backups: [], jobs: [] }),
      startBackup: async () => {
        backupStarted = true;
        return { id: 'job-1', type: 'backup', status: 'running' };
      },
      getJob: async () => ({ id: 'job-1', type: 'backup', status: 'succeeded' }),
      startRestore: async () => ({ id: 'job-2', type: 'restore', status: 'running' }),
      deleteBackup: async ({ backupName }) => {
        deletedBackup = backupName;
        return { backupName };
      },
      uploadBackup: async ({ filename, stream }) => {
        let size = 0;
        for await (const chunk of stream) size += chunk.length;
        uploadedBackup = { filename, size };
        return { backup: { name: 'uploaded-backup', restorable: true } };
      },
    },
  });

  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/backups/status`)).status, 200);
    assert.equal((await fetch(`${origin}/api/backups/run`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${origin}/api/backups/old-backup`, { method: 'DELETE' })).status, 403);
    assert.equal((await fetch(`${origin}/api/backups/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gzip' },
      body: Buffer.from('backup'),
    })).status, 403);

    const response = await fetch(`${origin}/api/backups/run`, {
      method: 'POST',
      headers: { 'X-Platform-Request': 'console' },
    });
    assert.equal(response.status, 202);
    assert.equal(backupStarted, true);

    const jobResponse = await fetch(`${origin}/api/backups/jobs/job-1`);
    assert.equal(jobResponse.status, 200);
    assert.deepEqual((await jobResponse.json()).job, { id: 'job-1', type: 'backup', status: 'succeeded' });

    const deleteResponse = await fetch(`${origin}/api/backups/old-backup`, {
      method: 'DELETE',
      headers: { 'X-Platform-Request': 'console' },
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletedBackup, 'old-backup');

    const uploadResponse = await fetch(`${origin}/api/backups/upload?filename=uploaded-backup.tar.gz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/gzip',
        'X-Platform-Request': 'console',
      },
      body: Buffer.from('backup'),
    });
    assert.equal(uploadResponse.status, 201);
    assert.deepEqual(uploadedBackup, { filename: 'uploaded-backup.tar.gz', size: 6 });
  });
});

test('release callbacks require the dedicated bearer token instead of a console session', async () => {
  const callbackToken = 'c'.repeat(32);
  let callbackPayload = null;
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    metricsToken: 'm'.repeat(32),
    releaseCallbackToken: callbackToken,
  };
  const app = createApp({
    config,
    releaseManager: {
      getSummary: async () => ({ capabilities: {} }),
      acceptCallback: async (payload) => {
        callbackPayload = payload;
        return { id: 'release-1', status: 'succeeded' };
      },
    },
  });
  await withServer(app, async (origin) => {
    const body = JSON.stringify({ type: 'build', releaseId: 'release-1' });
    assert.equal((await fetch(`${origin}/api/releases/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })).status, 401);
    const response = await fetch(`${origin}/api/releases/callback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${callbackToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    assert.equal(response.status, 202);
    assert.equal(callbackPayload.releaseId, 'release-1');
  });
});

test('release deployment route verifies the multi-component confirmation phrase', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  let deploymentRequest = null;
  const app = createApp({
    config,
    releaseManager: {
      getSummary: async () => ({ capabilities: {} }),
      dispatchDeployment: async (input) => {
        deploymentRequest = input;
        return { id: 'deployment-1', ...input };
      },
    },
  });
  await withServer(app, async (origin) => {
    const invalid = await fetch(`${origin}/api/releases/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({ action: 'deploy', components: ['platform', 'core'], confirmText: 'DEPLOY platform' }),
    });
    assert.equal(invalid.status, 400);
    const response = await fetch(`${origin}/api/releases/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({
        action: 'deploy',
        buildId: 'build-1',
        components: ['platform', 'core'],
        confirmText: 'DEPLOY platform,core',
      }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(deploymentRequest.components, ['platform', 'core']);
    assert.equal(deploymentRequest.buildId, 'build-1');
  });
});

test('notification management routes enforce console mutations and preserve the actor', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const calls = [];
  const notificationManager = {
    getOverview: async () => ({ configured: true, history: { total: 1 } }),
    listDeliveries: async (filters) => ({ items: [], page: Number(filters.page) || 1, pageSize: Number(filters.pageSize) || 20, total: 0 }),
    sendTest: async (input, actor) => {
      calls.push({ type: 'test', input, actor });
      return { delivered: true, delivery: { id: 'delivery-test' } };
    },
    retryDelivery: async (id, actor) => {
      calls.push({ type: 'retry', id, actor });
      return { delivered: true, delivery: { id: 'delivery-retry' } };
    },
    getApiAccess: async () => ({ clients: [], requests: { items: [], total: 0 }, supportedScopes: [] }),
    listApiRequests: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
    createApiClient: async (input, actor) => {
      calls.push({ type: 'api-create', input, actor });
      return { client: { id: '57cf6f30-11aa-4f9c-8021-91285ee1df5d', scopes: input.scopes }, token: 'one-time-token' };
    },
  };
  const app = createApp({ config, notificationManager });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/notifications/overview`)).status, 200);
    assert.equal((await fetch(`${origin}/api/notifications/deliveries?page=2&pageSize=10`)).status, 200);
    assert.equal((await fetch(`${origin}/api/notifications/api-access`)).status, 200);

    const body = JSON.stringify({ msgType: 'text', touser: 'alice', content: 'hello' });
    assert.equal((await fetch(`${origin}/api/notifications/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })).status, 403);
    assert.equal((await fetch(`${origin}/api/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body,
    })).status, 201);
    assert.equal((await fetch(`${origin}/api/notifications/deliveries/delivery_123456/retry`, {
      method: 'POST', headers: { 'X-Platform-Request': 'console' },
    })).status, 201);
    const clientBody = JSON.stringify({ name: 'Campus', scopes: ['notifications:send'], rateLimitPerMinute: 30 });
    assert.equal((await fetch(`${origin}/api/notifications/api-clients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: clientBody,
    })).status, 403);
    assert.equal((await fetch(`${origin}/api/notifications/api-clients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' }, body: clientBody,
    })).status, 201);
  });
  assert.deepEqual(calls.map(({ type, actor }) => [type, actor]), [
    ['test', 'local-admin'],
    ['retry', 'local-admin'],
    ['api-create', 'local-admin'],
  ]);
});

test('public status is unauthenticated while operational task data remains protected', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), authDisabled: false, metricsToken: 'm'.repeat(32) };
  const operationsStore = {
    listIncidents: async () => [{ id: 'incident-1', status: 'open', severity: 'warning', serviceId: 'core', openedAt: '2026-07-21T10:00:00Z', lastSeenAt: '2026-07-21T10:01:00Z' }],
  };
  const operationsManager = {
    getStatus: async () => ({ services: [{ id: 'core', name: 'Core', shortName: 'Core', category: 'service', state: 'healthy', checkedAt: new Date().toISOString(), baseUrl: 'http://secret.internal' }] }),
    recordAudit: async () => {},
  };
  const app = createApp({ config, operationsStore, operationsManager });
  await withServer(app, async (origin) => {
    const publicResponse = await fetch(`${origin}/api/public/status`);
    assert.equal(publicResponse.status, 200);
    const status = await publicResponse.json();
    assert.equal(status.overall, 'degraded');
    assert.equal(status.services[0].name, 'Core');
    assert.equal('baseUrl' in status.services[0], false);
    assert.equal((await fetch(`${origin}/api/tasks`)).status, 401);
  });
});

test('configuration, task, and trace routes preserve role and console-request boundaries', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const calls = [];
  const configurationManager = {
    getOverview: async () => ({ currentVersion: 1, settings: {}, changes: [], versions: [] }),
    propose: async (input) => { calls.push(['propose', input.actor]); return { id: 'change-1', changedKeys: ['alertingEnabled'] }; },
    approve: async (id, actor) => { calls.push(['approve', actor]); return { change: { id }, version: 2, settings: {} }; },
    reject: async () => ({}),
    proposeRollback: async () => ({}),
  };
  const taskManager = { list: async () => ({ tasks: [{ id: 'task-1' }], counts: {}, sources: [] }) };
  const requestDiagnostics = { run: async (input) => { calls.push(['trace', input.parentRequestId]); return { summary: { total: 1, healthy: 1, attention: 0 }, traces: [] }; } };
  const app = createApp({ config, configurationManager, taskManager, requestDiagnostics });
  await withServer(app, async (origin) => {
    assert.equal((await fetch(`${origin}/api/configuration`)).status, 200);
    assert.equal((await fetch(`${origin}/api/tasks`)).status, 200);
    assert.equal((await fetch(`${origin}/api/configuration/changes`, { method: 'POST' })).status, 403);
    const proposed = await fetch(`${origin}/api/configuration/changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({ settings: { alertingEnabled: false }, summary: 'test' }),
    });
    assert.equal(proposed.status, 201);
    const traced = await fetch(`${origin}/api/diagnostics/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console', 'X-Request-Id': 'trace-parent' },
      body: JSON.stringify({ serviceId: 'core' }),
    });
    assert.equal(traced.status, 200);
  });
  assert.deepEqual(calls, [['propose', 'local-admin'], ['trace', 'trace-parent']]);
});
