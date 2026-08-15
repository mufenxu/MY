import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryExternalApplicationStore } from '../src/external-application-store.js';

function fixture() {
  let timestamp = Date.parse('2026-08-15T00:00:00.000Z');
  let applicationId = 0;
  let clientId = 0;
  let secretId = 0;
  let codeId = 0;
  const store = createMemoryExternalApplicationStore({
    now: () => new Date(timestamp),
    idFactory: () => `app-${++applicationId}`,
    clientIdFactory: () => `client-${++clientId}`,
    secretFactory: () => `secret-${++secretId}-${'x'.repeat(32)}`,
    codeFactory: () => `code-${++codeId}-${'y'.repeat(32)}`,
    codeTtlMs: 60_000,
  });
  return {
    store,
    advance(ms) { timestamp += ms; },
  };
}

test('external application secrets are returned once and verified by hash', async () => {
  const { store } = fixture();
  const created = await store.createApplication({
    name: '项目 A',
    description: '独立 VPS 项目',
    redirectUris: ['https://a.example.com/auth/my/callback'],
    launchUrl: 'https://a.example.com/',
    healthUrl: 'https://a.example.com/healthz',
    requiredRole: 'operator',
    openMode: 'webview',
    enabled: true,
    actor: 'admin',
  });

  assert.equal(created.application.id, 'app-1');
  assert.equal(created.application.clientId, 'client-1');
  assert.equal(created.clientSecret.startsWith('secret-1-'), true);
  assert.equal('clientSecretHash' in created.application, false);
  assert.equal(await store.verifyClientSecret('client-1', created.clientSecret), true);
  assert.equal(await store.verifyClientSecret('client-1', 'wrong-secret'), false);

  const stored = await store.getApplication('app-1');
  assert.equal('clientSecret' in stored, false);
  assert.equal('clientSecretHash' in stored, false);
  assert.deepEqual(stored.redirectUris, ['https://a.example.com/auth/my/callback']);
});

test('updates preserve credentials and rotation invalidates the old secret', async () => {
  const { store } = fixture();
  const created = await store.createApplication({
    name: '项目 A',
    redirectUris: ['https://a.example.com/callback'],
    launchUrl: 'https://a.example.com/',
    requiredRole: 'viewer',
    openMode: 'browser',
    enabled: true,
    actor: 'admin',
  });

  const updated = await store.updateApplication(created.application.id, {
    name: '项目 A 新名称',
    redirectUris: ['https://a.example.com/oidc/callback'],
    actor: 'operator',
  });
  assert.equal(updated.clientId, created.application.clientId);
  assert.equal(await store.verifyClientSecret(updated.clientId, created.clientSecret), true);
  assert.deepEqual(updated.redirectUris, ['https://a.example.com/oidc/callback']);

  const rotated = await store.rotateClientSecret(updated.id, 'admin');
  assert.equal(rotated.clientSecret.startsWith('secret-2-'), true);
  assert.equal(await store.verifyClientSecret(updated.clientId, created.clientSecret), false);
  assert.equal(await store.verifyClientSecret(updated.clientId, rotated.clientSecret), true);
  assert.equal('clientSecretHash' in rotated.application, false);
});

test('authorization codes are short lived, client bound, and single use', async () => {
  const { store, advance } = fixture();
  const created = await store.createApplication({
    name: '项目 A',
    redirectUris: ['https://a.example.com/callback'],
    launchUrl: 'https://a.example.com/',
    requiredRole: 'viewer',
    openMode: 'webview',
    enabled: true,
    actor: 'admin',
  });
  const issued = await store.createAuthorizationCode({
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
    username: 'alice',
    role: 'operator',
    scope: 'openid profile',
    nonce: 'nonce-1',
    codeChallenge: 'challenge-1',
    sessionNonce: 'session-1',
  });

  assert.equal('codeHash' in issued.record, false);
  assert.equal((await store.consumeAuthorizationCode({
    code: issued.code,
    clientId: created.application.clientId,
    redirectUri: 'https://wrong.example.com/callback',
  })), null);
  assert.equal((await store.consumeAuthorizationCode({
    code: issued.code,
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
    codeChallenge: 'wrong-challenge',
  })), null);

  const consumed = await store.consumeAuthorizationCode({
    code: issued.code,
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
    codeChallenge: 'challenge-1',
  });
  assert.equal(consumed.username, 'alice');
  assert.equal(consumed.codeChallenge, 'challenge-1');
  assert.equal((await store.consumeAuthorizationCode({
    code: issued.code,
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
  })), null);

  const expired = await store.createAuthorizationCode({
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
    username: 'alice',
    role: 'operator',
    scope: 'openid',
    nonce: '',
    codeChallenge: 'challenge-2',
    sessionNonce: 'session-1',
  });
  advance(60_001);
  assert.equal((await store.consumeAuthorizationCode({
    code: expired.code,
    clientId: created.application.clientId,
    redirectUri: 'https://a.example.com/callback',
  })), null);
});
