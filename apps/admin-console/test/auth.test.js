import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPasswordHash,
  createSessionRegistry,
  issueSession,
  parseCookies,
  verifyPassword,
  verifySession,
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

test('cookie parser handles encoded values and malformed input', () => {
  assert.deepEqual(parseCookies('a=1; session=hello%20world; broken'), {
    a: '1',
    session: 'hello world',
  });
});
