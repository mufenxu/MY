import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { issueInternalIdentity, validateInternalKeyPair, verifyInternalIdentity } from '../src/internal-auth.mjs';

test('internal identities are audience-bound, short-lived and tamper-resistant', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyValue = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
  const publicKeyValue = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const token = issueInternalIdentity({
    audience: 'core',
    session: { sub: 'admin', nonce: 'nonce-1' },
    privateKey: privateKeyValue,
    pathname: '/api/users?limit=1',
    now,
  });

  const claims = verifyInternalIdentity(token, {
    audience: 'core',
    publicKey: publicKeyValue,
    pathname: '/api/users?limit=1',
    now: now + 1_000,
  });
  assert.equal(claims.sub, 'admin');
  assert.equal(claims.role, 'platform_admin');
  assert.ok(claims.csrf);
  assert.equal(validateInternalKeyPair(privateKeyValue, publicKeyValue), true);
  const validPath = { audience: 'core', publicKey: publicKeyValue, pathname: '/api/users?limit=1' };
  assert.equal(verifyInternalIdentity(token, { ...validPath, audience: 'exam', now }), null);
  assert.equal(verifyInternalIdentity(`${token}x`, { ...validPath, now }), null);
  assert.equal(verifyInternalIdentity(token, { ...validPath, pathname: '/api/users?limit=2', now }), null);
  assert.equal(verifyInternalIdentity(token, { ...validPath, method: 'POST', now }), null);
  assert.equal(verifyInternalIdentity(token, { ...validPath, now: now + 25_000 }), null);
});
