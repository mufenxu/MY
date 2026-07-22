const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createMemoryNotificationStore, percentile95 } = require('../src/notification-store');

const encryptionKey = Buffer.alloc(32, 4).toString('base64url');

test('memory notification store paginates public metadata and keeps payload encrypted', async () => {
  const store = createMemoryNotificationStore({ encryptionKey });
  const created = await store.createDelivery({
    caller: 'core-api',
    actor: '',
    requestId: 'request-1',
    msgType: 'text',
    targetType: 'user',
    targetValue: 'alice',
    retryable: true,
    payload: { touser: 'alice', msg_type: 'text', data: { content: 'secret content' } },
  });
  await store.completeDelivery(created.id, { status: 'success', durationMs: 125, wecomCode: 0 });

  const page = await store.listDeliveries({ page: 1, pageSize: 10 });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].encryptedPayload, undefined);
  assert.equal(page.items[0].payload, undefined);
  assert.deepEqual((await store.getRetryDelivery(created.id)).payload.data, { content: 'secret content' });
});

test('notification overview calculates success rate and p95 duration', async () => {
  const store = createMemoryNotificationStore({ encryptionKey });
  for (const [status, durationMs] of [['success', 10], ['success', 20], ['failed', 50]]) {
    const created = await store.createDelivery({
      caller: 'core-api', requestId: crypto.randomUUID(), msgType: 'text', targetType: 'user', targetValue: 'alice', retryable: true,
      payload: { touser: 'alice', msg_type: 'text', data: { content: 'content' } },
    });
    await store.completeDelivery(created.id, { status, durationMs });
  }
  const overview = await store.getOverview();
  assert.equal(overview.total, 3);
  assert.equal(overview.successRate, 66.7);
  assert.equal(overview.p95DurationMs, 50);
  assert.equal(percentile95([5, 10, 50]), 50);
});

test('API clients keep tokens hashed and support rotation, audit and revocation', async () => {
  const store = createMemoryNotificationStore({ encryptionKey });
  const created = await store.createApiClient({
    name: 'Campus integration',
    description: 'Course reminders',
    scopes: ['notifications:send', 'notifications:status:read'],
    rateLimitPerMinute: 30,
    expiresAt: null,
    actor: 'admin',
  });

  assert.match(created.token, /^ntf_live_[a-f0-9]{12}\./);
  assert.equal(created.client.keys[0].tokenHash, undefined);
  assert.equal((await store.listApiClients())[0].token, undefined);

  const identity = await store.verifyApiToken(created.token);
  assert.equal(identity.clientId, created.client.id);
  assert.deepEqual(identity.scopes, ['notifications:send', 'notifications:status:read']);

  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  const updated = await store.updateApiClient(created.client.id, {
    name: created.client.name,
    description: created.client.description,
    scopes: created.client.scopes,
    rateLimitPerMinute: 45,
    expiresAt: new Date(expiresAt),
    actor: 'admin',
  });
  assert.equal(updated.rateLimitPerMinute, 45);
  assert.equal(updated.keys[0].expiresAt, expiresAt);

  await store.recordApiRequest({
    clientId: identity.clientId,
    clientName: identity.clientName,
    keyId: identity.keyId,
    endpoint: '/notify',
    method: 'POST',
    httpStatus: 200,
    outcome: 'success',
    durationMs: 25,
    requestId: 'api-request-1',
  });
  assert.equal((await store.getApiAccessOverview()).totalRequests, 1);
  assert.equal((await store.listApiRequests()).items[0].requestId, 'api-request-1');

  const rotated = await store.rotateApiClientKey(created.client.id, { actor: 'admin', overlapMinutes: 0 });
  assert.notEqual(rotated.token, created.token);
  assert.equal(await store.verifyApiToken(created.token), null);
  assert.equal((await store.verifyApiToken(rotated.token)).clientId, created.client.id);

  await store.revokeApiClient(created.client.id, { actor: 'admin' });
  assert.equal(await store.verifyApiToken(rotated.token), null);
  assert.equal((await store.listApiClients())[0].status, 'revoked');
});
