const test = require('node:test');
const assert = require('node:assert/strict');

const { createNotificationOrchestrator, nextAllowedTime, renderTemplate } = require('../src/notification-orchestrator');
const { createMemoryNotificationStore } = require('../src/notification-store');

const encryptionKey = Buffer.alloc(32, 9).toString('base64url');

test('template rendering rejects missing variables', () => {
  assert.equal(renderTemplate('Hello {{name}}', { name: 'Alice' }), 'Hello Alice');
  assert.throws(() => renderTemplate('Hello {{name}}', {}), /name/);
});

test('quiet hours move a notification to the next allowed time', () => {
  const now = new Date('2026-07-21T15:30:00.000Z'); // 23:30 in UTC+8
  const next = nextAllowedTime(now, {
    timezoneOffsetMinutes: 480,
    quietHours: { start: '22:00', end: '07:00' },
  });
  assert.equal(next.toISOString(), '2026-07-21T23:00:00.000Z');
});

test('orchestrator schedules, deduplicates and delivers template jobs', async () => {
  let current = new Date('2026-07-21T00:00:00.000Z');
  const store = createMemoryNotificationStore({ encryptionKey, now: () => new Date(current) });
  const delivered = [];
  const orchestrator = createNotificationOrchestrator({
    store,
    now: () => new Date(current),
    deliver: async (payload) => {
      delivered.push(payload);
      return { delivery: { id: 'delivery-1' } };
    },
  });
  await orchestrator.saveTemplate({ key: 'exam.review', name: '到期复习', msgType: 'text', content: '{{name}} 有 {{count}} 道题待复习' });

  const input = {
    templateKey: 'exam.review',
    variables: { name: 'Alice', count: 3 },
    target: { touser: 'alice' },
    dedupeKey: 'exam-review:alice:2026-07-21',
  };
  const first = await orchestrator.enqueue(input, { caller: 'exam-api' });
  const second = await orchestrator.enqueue(input, { caller: 'exam-api' });
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);

  const results = await orchestrator.runDue();
  assert.equal(results[0].status, 'sent');
  assert.equal(delivered[0].data.content, 'Alice 有 3 道题待复习');
});

test('orchestrator applies recipient preferences and retry backoff', async () => {
  let current = new Date('2026-07-21T14:30:00.000Z');
  const store = createMemoryNotificationStore({ encryptionKey, now: () => new Date(current) });
  let attempts = 0;
  const orchestrator = createNotificationOrchestrator({
    store,
    now: () => new Date(current),
    deliver: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary');
      return { delivery: { id: 'delivery-2' } };
    },
  });
  await orchestrator.savePreference('alice', {
    enabled: true,
    quietHours: { start: '22:00', end: '07:00' },
    timezoneOffsetMinutes: 480,
  });
  const scheduled = await orchestrator.enqueue({ msgType: 'text', content: 'hello', target: { touser: 'alice' } }, { caller: 'campus-service' });
  assert.equal(scheduled.job.scheduledAt, '2026-07-21T23:00:00.000Z');

  current = new Date('2026-07-21T23:00:00.000Z');
  assert.equal((await orchestrator.runDue())[0].status, 'retrying');
  current = new Date('2026-07-21T23:01:00.000Z');
  assert.equal((await orchestrator.runDue())[0].status, 'sent');
});

test('orchestrator limits delivery concurrency and coalesces reentrant runs', async () => {
  const store = createMemoryNotificationStore({ encryptionKey });
  const claimSizes = [];
  const claimDueNotificationJobs = store.claimDueNotificationJobs.bind(store);
  store.claimDueNotificationJobs = async (limit, options) => {
    claimSizes.push(limit);
    return claimDueNotificationJobs(limit, options);
  };
  let active = 0;
  let maximumActive = 0;
  let deliveries = 0;
  const orchestrator = createNotificationOrchestrator({
    store,
    concurrency: 3,
    deliver: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      deliveries += 1;
      active -= 1;
      return { delivery: { id: `delivery-${deliveries}` } };
    },
  });
  for (let index = 0; index < 7; index += 1) {
    await orchestrator.enqueue({
      msgType: 'text',
      content: `message-${index}`,
      target: { touser: `user-${index}` },
    }, { caller: 'core-api' });
  }

  const firstRun = orchestrator.runDue(20);
  const reentrantRun = orchestrator.runDue(20);
  assert.strictEqual(reentrantRun, firstRun);
  const results = await firstRun;
  assert.equal(results.length, 7);
  assert.equal(results.every((result) => result.status === 'sent'), true);
  assert.equal(deliveries, 7);
  assert.equal(maximumActive, 3);
  assert.equal(claimSizes.every((size) => size <= 3), true);
});
