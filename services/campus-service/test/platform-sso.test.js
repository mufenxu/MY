import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyPlatformSso } from '../src/lib/platform-sso.js';
import { platformRoleAllowsRequest } from '../src/lib/platform-role.js';

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
    role: 'viewer',
    csrf: 'csrf-token',
    m: 'GET',
    p: '/api/app-auth/status',
    session_exp: Math.floor(now / 1000) + 3600,
    reauth_exp: 0,
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

test('campus central roles enforce read-only viewer and reserve account administration', () => {
  assert.equal(platformRoleAllowsRequest('viewer', 'GET', '/api/campus/summary'), true);
  assert.equal(platformRoleAllowsRequest('viewer', 'POST', '/api/campus/water-code/refresh'), false);
  assert.equal(platformRoleAllowsRequest('operator', 'POST', '/api/campus/water-code/refresh'), true);
  assert.equal(platformRoleAllowsRequest('operator', 'POST', '/api/users'), false);
  assert.equal(platformRoleAllowsRequest('operator', 'DELETE', '/api/invites/1'), false);
  assert.equal(platformRoleAllowsRequest('super_admin', 'DELETE', '/api/users/1'), true);
});
