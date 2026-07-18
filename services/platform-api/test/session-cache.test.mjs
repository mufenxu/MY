import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionVerifierCache } from '../src/session-cache.mjs';

test('session verifier cache coalesces lookups and expires quickly', async () => {
  let timestamp = 1_000;
  let calls = 0;
  const cache = createSessionVerifierCache({
    maxEntries: 16,
    now: () => timestamp,
    ttlMs: 500,
    verify: async (token) => {
      calls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { sub: token };
    },
  });

  const [first, second] = await Promise.all([cache.verify('token-a'), cache.verify('token-a')]);
  assert.deepEqual(first, { sub: 'token-a' });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);

  timestamp += 501;
  await cache.verify('token-a');
  assert.equal(calls, 2);
});

test('session verifier cache is bounded and does not retain plaintext tokens', async () => {
  const cache = createSessionVerifierCache({
    maxEntries: 16,
    verify: async (token) => ({ sub: token }),
  });

  await Promise.all(Array.from({ length: 40 }, (_, index) => cache.verify(`secret-token-${index}`)));
  assert.equal(cache.size(), 16);
});

test('session verifier cache invalidates revoked tokens immediately', async () => {
  let calls = 0;
  const cache = createSessionVerifierCache({
    verify: async () => {
      calls += 1;
      return { sub: 'admin' };
    },
  });

  await cache.verify('revoked-token');
  assert.equal(cache.invalidate('revoked-token'), true);
  await cache.verify('revoked-token');
  assert.equal(calls, 2);
});

test('session verifier cache never outlives the signed session expiry', async () => {
  let timestamp = 1_000;
  let calls = 0;
  const cache = createSessionVerifierCache({
    now: () => timestamp,
    ttlMs: 5_000,
    verify: async () => {
      calls += 1;
      return { sub: 'admin', exp: 2 };
    },
  });

  await cache.verify('short-session');
  timestamp = 2_001;
  await cache.verify('short-session');
  assert.equal(calls, 2);
});
