import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { withFetchServer as withServer } from '../test-support/fetch-server.js';
import { AcrOperationError } from '../src/acr-service.js';

function createHarness(acr, audits = []) {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const app = createApp({
    config,
    acrManager: acr,
    operationsManager: {
      recordAudit: async (entry) => {
        audits.push(entry);
        return entry;
      },
    },
  });
  return { app, audits };
}

function createStubAcr(calls) {
  return {
    getImages: async (input) => {
      calls.push(['getImages', input]);
      return { repository: 'crpi-test.cn-beijing.personal.cr.aliyuncs.com/mufenxu/my', tagCount: 3, groups: [] };
    },
    deleteImages: async (input) => {
      calls.push(['deleteImages', input]);
      return { repository: 'crpi-test/mufenxu/my', deleted: input.tags.map((tag) => ({ tag, digest: 'sha256:abc' })), skipped: [], failed: [] };
    },
    pruneImages: async (input) => {
      calls.push(['pruneImages', input]);
      return {
        repository: 'crpi-test/mufenxu/my',
        keep: input.keep ?? 5,
        planned: 2,
        remaining: 0,
        plan: [{ tag: 'platform-api-a1b2c3d4e5f6', prefix: 'platform-api-', createdAt: null }],
        ...(input.dryRun ? {} : { deleted: [{ tag: 'platform-api-a1b2c3d4e5f6', digest: 'sha256:abc' }], skipped: [], failed: [] }),
      };
    },
  };
}

test('ACR image listing stays read-only viewer surface and forwards the refresh flag', async () => {
  const calls = [];
  const { app } = createHarness(createStubAcr(calls));
  await withServer(app, async (origin) => {
    const response = await fetch(`${origin}/api/acr/images`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).tagCount, 3);
    assert.equal((await fetch(`${origin}/api/acr/images?refresh=1`)).status, 200);
  });
  assert.deepEqual(calls, [['getImages', { refresh: false }], ['getImages', { refresh: true }]]);
});

test('ACR deletion requires the console header, explicit confirmation and records an audit entry', async () => {
  const calls = [];
  const { app, audits } = createHarness(createStubAcr(calls));
  await withServer(app, async (origin) => {
    const body = JSON.stringify({ confirm: true, tags: ['platform-api-a1b2c3d4e5f6'] });
    const headers = { 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${origin}/api/acr/images/delete`, { method: 'POST', headers, body })).status, 403);
    assert.equal((await fetch(`${origin}/api/acr/images/delete`, {
      method: 'POST',
      headers: { ...headers, 'X-Platform-Request': 'console' },
      body: JSON.stringify({ tags: ['platform-api-a1b2c3d4e5f6'] }),
    })).status, 400);
    assert.equal(calls.length, 0);

    const response = await fetch(`${origin}/api/acr/images/delete`, {
      method: 'POST',
      headers: { ...headers, 'X-Platform-Request': 'console' },
      body,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deleted.length, 1);
  });
  assert.deepEqual(calls, [['deleteImages', { tags: ['platform-api-a1b2c3d4e5f6'] }]]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'acr.images.delete');
  assert.equal(audits[0].targetType, 'acr_repository');
  assert.deepEqual(audits[0].details.deleted, ['platform-api-a1b2c3d4e5f6']);
});

test('ACR prune previews by default and only mutates with confirmation', async () => {
  const calls = [];
  const { app, audits } = createHarness(createStubAcr(calls));
  await withServer(app, async (origin) => {
    const headers = { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' };
    const preview = await fetch(`${origin}/api/acr/images/prune`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ keep: 5, includeUnknown: true }),
    });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).planned, 2);

    assert.equal((await fetch(`${origin}/api/acr/images/prune`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ keep: 5, dryRun: false }),
    })).status, 400);

    const executed = await fetch(`${origin}/api/acr/images/prune`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ keep: 3, dryRun: false, confirm: true }),
    });
    assert.equal(executed.status, 200);
  });
  assert.deepEqual(calls, [
    ['pruneImages', { keep: 5, prefixes: undefined, includeUnknown: true, dryRun: true }],
    ['pruneImages', { keep: 3, prefixes: undefined, includeUnknown: false, dryRun: false }],
  ]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'acr.images.prune');
  assert.equal(audits[0].details.keep, 3);
});

test('ACR operation errors surface their status code instead of a generic failure', async () => {
  const { app } = createHarness({
    getImages: async () => {
      throw new AcrOperationError(503, 'ACR_NOT_CONFIGURED', '未配置 ACR 镜像仓库。');
    },
    deleteImages: async () => {
      throw new AcrOperationError(403, 'ACR_DELETE_NOT_PERMITTED', '当前 ACR 凭据没有删除权限。');
    },
    pruneImages: async () => ({ planned: 0, remaining: 0, plan: [] }),
  });
  await withServer(app, async (origin) => {
    const listing = await fetch(`${origin}/api/acr/images`);
    assert.equal(listing.status, 503);
    assert.equal((await listing.json()).code, 'ACR_NOT_CONFIGURED');

    const deletion = await fetch(`${origin}/api/acr/images/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({ confirm: true, tags: ['platform-api-a1b2c3d4e5f6'] }),
    });
    assert.equal(deletion.status, 403);
    assert.equal((await deletion.json()).code, 'ACR_DELETE_NOT_PERMITTED');
  });
});
