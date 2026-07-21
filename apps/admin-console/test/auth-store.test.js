import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryAuthStore } from '../src/auth-store.js';

function totp(secret, now) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

function createStore(now) {
  return createMemoryAuthStore({
    now: () => now.value,
    encryptionKey: Buffer.alloc(32, 5).toString('base64url'),
    bootstrap: {
      username: 'admin',
      passwordHash: 'test-password-hash',
      role: 'super_admin',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    },
  });
}

test('TOTP values and recovery codes are replay protected', async () => {
  const now = { value: Date.UTC(2026, 6, 21, 12, 0, 0) };
  const store = createStore(now);
  const current = totp('JBSWY3DPEHPK3PXP', now.value);
  assert.deepEqual(await store.consumeSecondFactor('admin', { totp: current }), { valid: true, method: 'totp' });
  assert.deepEqual(await store.consumeSecondFactor('admin', { totp: current }), { valid: false, method: 'invalid' });

  const enrollment = await store.beginTotpEnrollment('admin');
  assert.match(enrollment.qrDataUrl, /^data:image\/png;base64,/);
  const result = await store.confirmTotpEnrollment('admin', totp(enrollment.secret, now.value));
  assert.equal(result.recoveryCodes.length, 10);
  const recoveryCode = result.recoveryCodes[0];
  assert.deepEqual(await store.consumeSecondFactor('admin', { recoveryCode }), { valid: true, method: 'recovery_code' });
  assert.deepEqual(await store.consumeSecondFactor('admin', { recoveryCode }), { valid: false, method: 'invalid' });
});

test('account management preserves a final active super administrator', async () => {
  const store = createStore({ value: Date.now() });
  await store.createAccount({ username: 'operator', passwordHash: 'hash', role: 'operator' });
  await assert.rejects(store.updateAccount('admin', { active: false }), /LAST_SUPER_ADMIN/);
  await store.createAccount({ username: 'backup-admin', passwordHash: 'hash', role: 'super_admin' });
  assert.equal((await store.updateAccount('admin', { active: false })).active, false);
});

test('authentication challenges and new-IP detection are one-time and privacy keyed', async () => {
  const store = createStore({ value: Date.now() });
  const challengeId = await store.saveChallenge({ kind: 'passkey_authentication', username: 'admin', challenge: 'abc' });
  assert.equal(await store.consumeChallenge(challengeId, 'passkey_authentication', 'admin'), 'abc');
  assert.equal(await store.consumeChallenge(challengeId, 'passkey_authentication', 'admin'), null);
  assert.equal((await store.rememberLoginIp('admin', '203.0.113.10')).newIp, true);
  assert.equal((await store.rememberLoginIp('admin', '203.0.113.10')).newIp, false);
});
