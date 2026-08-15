import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  createExternalIdentityService,
  oauthError,
  pkceChallenge,
  verifyPkceChallenge,
} from '../src/external-identity.js';

function fixture() {
  const pair = crypto.generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url');
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  let now = Date.parse('2026-08-15T00:00:00.000Z');
  return {
    identity: createExternalIdentityService({
      issuer: 'https://pxyb.cn',
      privateKey,
      publicKey,
      keyId: 'external-2026-08',
      now: () => now,
      tokenTtlSeconds: 300,
    }),
    advance(ms) { now += ms; },
  };
}

test('PKCE S256 challenges match only the original verifier', () => {
  const verifier = 'a'.repeat(43);
  const challenge = pkceChallenge(verifier);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(verifyPkceChallenge(verifier, challenge), true);
  assert.equal(verifyPkceChallenge(`${verifier}b`, challenge), false);
  assert.equal(verifyPkceChallenge('short', challenge), false);
});

test('identity service publishes discovery and public Ed25519 JWK', () => {
  const { identity } = fixture();
  assert.deepEqual(identity.discovery(), {
    issuer: 'https://pxyb.cn',
    authorization_endpoint: 'https://pxyb.cn/oauth/authorize',
    token_endpoint: 'https://pxyb.cn/oauth/token',
    userinfo_endpoint: 'https://pxyb.cn/oauth/userinfo',
    jwks_uri: 'https://pxyb.cn/oauth/jwks.json',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['EdDSA'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'roles'],
    claims_supported: ['sub', 'preferred_username', 'role'],
  });
  const jwk = identity.jwks().keys[0];
  assert.equal(jwk.kty, 'OKP');
  assert.equal(jwk.crv, 'Ed25519');
  assert.equal(jwk.alg, 'EdDSA');
  assert.equal(jwk.use, 'sig');
  assert.equal(jwk.kid, 'external-2026-08');
  assert.equal('d' in jwk, false);
});

test('issued tokens are audience bound and expire', () => {
  const { identity, advance } = fixture();
  const issued = identity.issueTokens({
    clientId: 'client-a',
    username: 'alice',
    role: 'operator',
    scope: 'openid profile roles',
    nonce: 'nonce-a',
  });
  assert.equal(issued.token_type, 'Bearer');
  assert.equal(issued.expires_in, 300);
  assert.equal(issued.scope, 'openid profile roles');

  const idClaims = identity.verifyToken(issued.id_token, { audience: 'client-a', type: 'id' });
  assert.equal(idClaims.sub, 'alice');
  assert.equal(idClaims.preferred_username, 'alice');
  assert.equal(idClaims.role, 'operator');
  assert.equal(idClaims.nonce, 'nonce-a');
  assert.equal(identity.verifyToken(issued.id_token, { audience: 'client-b', type: 'id' }), null);

  const accessClaims = identity.verifyToken(issued.access_token, { audience: 'client-a', type: 'access' });
  assert.equal(accessClaims.scope, 'openid profile roles');
  advance(301_000);
  assert.equal(identity.verifyToken(issued.access_token, { audience: 'client-a', type: 'access' }), null);
});

test('oauth errors expose only known protocol codes', () => {
  assert.deepEqual(oauthError('invalid_grant', '授权码无效'), {
    error: 'invalid_grant',
    error_description: '授权码无效',
  });
  assert.deepEqual(oauthError('database_stack', 'secret detail'), {
    error: 'server_error',
    error_description: '身份服务暂时不可用。',
  });
});
