import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createPasswordHash,
  createSessionRegistry,
  issueSession,
  parseCookies,
  verifyPassword,
  verifySession,
  verifyTotp,
} from '../src/auth.js';

test('password hashes verify the original password only', async () => {
  const hash = await createPasswordHash('a-strong-password', Buffer.alloc(16, 7));
  assert.equal(await verifyPassword('a-strong-password', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(await verifyPassword('a-strong-password', 'invalid'), false);
});

test('signed sessions expire and reject tampering', () => {
  const secret = 'a'.repeat(32);
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const token = issueSession({ username: 'admin', secret, ttlHours: 1, now });

  assert.equal(verifySession(token, secret, now + 1000).sub, 'admin');
  assert.equal(verifySession(`${token}x`, secret, now + 1000), null);
  assert.equal(verifySession(token, secret, now + 60 * 60 * 1000), null);
});

test('registered sessions can be revoked server-side', () => {
  const secret = 'b'.repeat(32);
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const sessions = createSessionRegistry({ secret });
  const token = sessions.issue({ username: 'admin', ttlHours: 1, now });

  assert.equal(sessions.verify(token, now + 1000).sub, 'admin');
  assert.equal(sessions.revoke(token, now + 1000), true);
  assert.equal(sessions.verify(token, now + 2000), null);

  const unregistered = issueSession({ username: 'admin', secret, ttlHours: 1, now });
  assert.equal(sessions.verify(unregistered, now + 1000), null);
});

test('registered sessions expose safe metadata and support remote revocation', () => {
  const sessions = createSessionRegistry({ secret: 'c'.repeat(32) });
  sessions.issue({
    username: 'operator',
    role: 'operator',
    ttlHours: 2,
    ip: '127.0.0.1',
    userAgent: 'test-browser',
  });
  const [session] = sessions.list();
  assert.equal(session.subject, 'operator');
  assert.equal(session.role, 'operator');
  assert.equal(session.ip, '127.0.0.1');
  assert.equal(session.userAgent, 'test-browser');
  assert.equal(sessions.revokeByNonce(session.nonce), true);
  assert.equal(sessions.list().length, 0);
});

test('TOTP verification accepts the current step and rejects malformed codes', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = Date.UTC(2026, 6, 18, 12, 0, 0);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 0x0f;
  const token = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');

  assert.equal(verifyTotp(token, secret, now), true);
  assert.equal(verifyTotp('12345', secret, now), false);
  assert.equal(verifyTotp(token, 'invalid!', now), false);
});

test('cookie parser handles encoded values and malformed input', () => {
  assert.deepEqual(parseCookies('a=1; session=hello%20world; broken'), {
    a: '1',
    session: 'hello world',
  });
});
