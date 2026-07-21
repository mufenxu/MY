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
