import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyPlatformSso } from '../src/lib/platform-sso.js';

function issue(claims, privateKey) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
}

test('campus verifies gateway identities without trusting unsigned headers', () => {
  const previous = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const claims = {
    v: 1,
    iss: 'my-platform-gateway',
    aud: 'campus',
    sub: 'admin',
    role: 'platform_admin',
    csrf: 'csrf-token',
    m: 'GET',
    p: '/api/app-auth/status',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 30,
  };

  try {
    const req = { method: 'GET', url: '/api/app-auth/status', headers: { 'x-my-platform-sso': issue(claims, privateKey) } };
    assert.equal(verifyPlatformSso(req, { now }).sub, 'admin');
    assert.equal(verifyPlatformSso({ ...req, headers: { 'x-my-platform-sso': 'unsigned' } }, { now }), null);
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
    else process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = previous;
  }
});
