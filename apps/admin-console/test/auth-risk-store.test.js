import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAuthRiskStore } from '../src/auth-risk-store.js';

test('login risk applies adaptive challenge and exponential backoff by account and IP', async () => {
  let now = Date.UTC(2026, 6, 21, 12, 0, 0);
  const risk = createMemoryAuthRiskStore({
    encryptionKey: Buffer.alloc(32, 6).toString('base64url'),
    challengeConfigured: true,
    challengeThreshold: 3,
    maxAttempts: 5,
    backoffBaseMs: 1000,
    backoffMaxMs: 10_000,
    now: () => now,
  });
  const input = { username: 'admin', ip: '203.0.113.20' };
  assert.equal((await risk.recordFailure(input)).challengeRequired, false);
  assert.equal((await risk.recordFailure(input)).blocked, false);
  const third = await risk.recordFailure(input);
  assert.equal(third.challengeRequired, true);
  assert.equal(third.blocked, true);
  assert.equal(third.retryAfterSeconds, 1);
  assert.equal((await risk.assess({ username: 'other', ip: input.ip })).blocked, true);

  now += 1001;
  assert.equal((await risk.assess(input)).blocked, false);
  await risk.recordSuccess(input);
  assert.equal((await risk.assess(input)).challengeRequired, false);
});
