const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyPlatformSso } = require('../src/security/platformSso');
const {
  platformRoleAllowsRequest,
  platformScopesForRole
} = require('../src/security/auth');

function issue(claims, privateKey) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
}

test('iot SSO tokens are signed, short-lived and audience-bound', () => {
  const previous = process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const claims = {
    v: 1,
    iss: 'my-platform-gateway',
    aud: 'iot',
    sub: 'admin',
    role: 'viewer',
    csrf: 'csrf-token',
    m: 'GET',
    p: '/api/auth/status',
    session_exp: Math.floor(now / 1000) + 3600,
    reauth_exp: 0,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 30,
  };

  try {
    const req = { method: 'GET', url: '/api/auth/status', headers: { 'x-my-platform-sso': issue(claims, privateKey) } };
    assert.equal(verifyPlatformSso(req, 'iot', now).sub, 'admin');
    assert.equal(verifyPlatformSso({ ...req, headers: { 'x-my-platform-sso': issue({ ...claims, aud: 'core' }, privateKey) } }, 'iot', now), null);
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY;
    else process.env.PLATFORM_INTERNAL_AUTH_PUBLIC_KEY = previous;
  }
});

test('iot central roles map to least-privilege scopes and mutation policy', () => {
  assert.deepEqual(platformScopesForRole('viewer'), ['devices:read', 'history:read']);
  assert.deepEqual(platformScopesForRole('operator'), ['devices:read', 'history:read', 'relays:write']);
  assert.deepEqual(platformScopesForRole('super_admin'), ['*']);
  assert.equal(platformRoleAllowsRequest('viewer', 'GET', ['devices:read']), true);
  assert.equal(platformRoleAllowsRequest('viewer', 'POST', ['relays:write']), false);
  assert.equal(platformRoleAllowsRequest('operator', 'POST', ['relays:write']), true);
  assert.equal(platformRoleAllowsRequest('operator', 'PUT', []), false);
  assert.equal(platformRoleAllowsRequest('super_admin', 'DELETE', []), true);
});
