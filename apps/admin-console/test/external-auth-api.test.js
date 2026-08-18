import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { createSessionRegistry } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createMemoryExternalApplicationStore } from '../src/external-application-store.js';
import { pkceChallenge } from '../src/external-identity.js';
import { withFetchServer } from '../test-support/fetch-server.js';

async function createProtectedOidcApp({ requiredRole = 'viewer', tokenRateLimit = 100 } = {}) {
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    authDisabled: false,
    requireMfa: false,
    sessionSecret: 's'.repeat(32),
    metricsToken: 'm'.repeat(32),
    externalAuthTokenRateLimitPerMinute: tokenRateLimit,
  };
  const authStore = createMemoryAuthStore({
    encryptionKey: config.authEncryptionKey,
    bootstrap: { username: 'operator', passwordHash: 'test-password-hash', role: 'operator' },
  });
  const sessionRegistry = createSessionRegistry({ secret: config.sessionSecret });
  const sessionToken = sessionRegistry.issue({ username: 'operator', role: 'operator', ttlHours: 1 });
  const externalApplicationStore = createMemoryExternalApplicationStore();
  const created = await externalApplicationStore.createApplication({
    name: '受保护项目',
    redirectUris: ['https://protected.example.com/callback'],
    launchUrl: 'https://protected.example.com/start',
    requiredRole,
    openMode: 'browser',
    enabled: true,
    actor: 'admin',
  });
  return {
    app: createApp({ config, authStore, sessionRegistry, externalApplicationStore }),
    authStore,
    created,
    sessionRegistry,
    sessionToken,
  };
}

async function authorizeExternalApplication(origin, created, sessionToken) {
  const verifier = 'v'.repeat(64);
  const authorization = new URL(`${origin}/oauth/authorize`);
  authorization.search = new URLSearchParams({
    response_type: 'code',
    client_id: created.application.clientId,
    redirect_uri: 'https://protected.example.com/callback',
    scope: 'openid profile roles',
    state: 'protected-state',
    nonce: 'protected-nonce',
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  const response = await fetch(authorization, {
    redirect: 'manual',
    headers: { Cookie: `my_platform_session=${sessionToken}` },
  });
  assert.equal(response.status, 303);
  return { code: new URL(response.headers.get('location')).searchParams.get('code'), verifier };
}

function exchangeAuthorizationCode(origin, created, { code, verifier }) {
  return fetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: created.application.clientId,
      client_secret: created.clientSecret,
      code,
      redirect_uri: 'https://protected.example.com/callback',
      code_verifier: verifier,
    }),
  });
}

test('external application OIDC flow registers, launches, exchanges, and rejects replay', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const externalApplicationStore = createMemoryExternalApplicationStore();
  const app = createApp({ config, externalApplicationStore });

  await withFetchServer(app, async (origin) => {
    const discoveryResponse = await fetch(`${origin}/.well-known/openid-configuration`);
    assert.equal(discoveryResponse.status, 200);
    assert.equal(discoveryResponse.headers.get('access-control-allow-origin'), '*');
    assert.equal(discoveryResponse.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const discovery = await discoveryResponse.json();
    assert.equal(discovery.issuer, config.publicOrigin);
    assert.equal(discovery.authorization_endpoint, `${config.publicOrigin}/oauth/authorize`);
    assert.equal(discovery.token_endpoint, `${config.publicOrigin}/oauth/token`);
    assert.equal(discovery.jwks_uri, `${config.publicOrigin}/oauth/jwks.json`);
    assert.deepEqual(discovery.code_challenge_methods_supported, ['S256']);

    const jwksResponse = await fetch(`${origin}${new URL(discovery.jwks_uri).pathname}`);
    assert.equal(jwksResponse.status, 200);
    assert.equal(jwksResponse.headers.get('access-control-allow-origin'), '*');
    assert.equal(jwksResponse.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const jwks = await jwksResponse.json();
    assert.equal(jwks.keys.length, 1);
    assert.equal(jwks.keys[0].alg, 'EdDSA');

    const createdResponse = await fetch(`${origin}/api/external-apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({
        name: '项目 A',
        description: '独立项目',
        redirectUris: ['https://a.example.com/auth/my/callback'],
        launchUrl: 'https://a.example.com/auth/my/start',
        healthUrl: null,
        requiredRole: 'viewer',
        openMode: 'webview',
        enabled: true,
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.application.name, '项目 A');
    assert.equal(typeof created.clientSecret, 'string');
    assert.equal('clientSecretHash' in created.application, false);

    const listResponse = await fetch(`${origin}/api/external-apps`);
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.applications.length, 1);
    assert.equal(listed.applications[0].clientId, created.application.clientId);
    assert.equal('clientSecretHash' in listed.applications[0], false);

    const launchResponse = await fetch(`${origin}/api/external-apps/${created.application.id}/launch`, {
      method: 'POST',
      headers: { 'X-Platform-Request': 'console' },
    });
    assert.equal(launchResponse.status, 201);
    const launch = await launchResponse.json();
    assert.equal(launch.loginUrl, `${config.publicOrigin}/oauth/external-launch/${created.application.id}`);
    assert.equal(launch.openMode, 'webview');

    const externalLaunch = await fetch(`${origin}/oauth/external-launch/${created.application.id}`, { redirect: 'manual' });
    assert.equal(externalLaunch.status, 303);
    assert.equal(externalLaunch.headers.get('location'), 'https://a.example.com/auth/my/start');

    const verifier = 'v'.repeat(64);
    const authorizeUrl = new URL(`${origin}/oauth/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: created.application.clientId,
      redirect_uri: 'https://a.example.com/auth/my/callback',
      scope: 'openid profile roles',
      state: 'state-1',
      nonce: 'nonce-1',
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
    }).toString();
    const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' });
    assert.equal(authorizeResponse.status, 303);
    const callback = new URL(authorizeResponse.headers.get('location'));
    assert.equal(callback.origin + callback.pathname, 'https://a.example.com/auth/my/callback');
    assert.equal(callback.searchParams.get('state'), 'state-1');
    const code = callback.searchParams.get('code');
    assert.equal(typeof code, 'string');

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: created.application.clientId,
      client_secret: created.clientSecret,
      code,
      redirect_uri: 'https://a.example.com/auth/my/callback',
      code_verifier: verifier,
    });
    const wrongVerifierBody = new URLSearchParams(tokenBody);
    wrongVerifierBody.set('code_verifier', 'w'.repeat(64));
    const wrongVerifierResponse = await fetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: wrongVerifierBody,
    });
    assert.equal(wrongVerifierResponse.status, 400);
    assert.equal((await wrongVerifierResponse.json()).error, 'invalid_grant');

    const tokenResponse = await fetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    assert.equal(tokenResponse.status, 200);
    const tokens = await tokenResponse.json();
    assert.equal(tokens.token_type, 'Bearer');
    assert.equal(typeof tokens.id_token, 'string');

    const userInfoResponse = await fetch(`${origin}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    assert.equal(userInfoResponse.status, 200);
    assert.deepEqual(await userInfoResponse.json(), {
      sub: 'local-admin',
      preferred_username: 'local-admin',
      role: 'super_admin',
    });

    const replayResponse = await fetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    assert.equal(replayResponse.status, 400);
    assert.equal((await replayResponse.json()).error, 'invalid_grant');
  });
});

test('unauthenticated OAuth authorization starts at the dedicated identity login page', async () => {
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    authDisabled: false,
    metricsToken: 'm'.repeat(32),
  };
  const externalApplicationStore = createMemoryExternalApplicationStore();
  const created = await externalApplicationStore.createApplication({
    name: '独立认证页项目',
    redirectUris: ['https://login.example.com/auth/my/callback'],
    launchUrl: 'https://login.example.com/auth/my/start',
    requiredRole: 'viewer',
    openMode: 'browser',
    enabled: true,
    actor: 'admin',
  });
  const app = createApp({ config, externalApplicationStore });

  await withFetchServer(app, async (origin) => {
    const authorization = new URL(`${origin}/oauth/authorize`);
    authorization.search = new URLSearchParams({
      response_type: 'code',
      client_id: created.application.clientId,
      redirect_uri: 'https://login.example.com/auth/my/callback',
      scope: 'openid profile roles',
      state: 'state-login-page',
      nonce: 'nonce-login-page',
      code_challenge: pkceChallenge('v'.repeat(64)),
      code_challenge_method: 'S256',
    }).toString();

    const response = await fetch(authorization, { redirect: 'manual' });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('location'), origin);
    assert.equal(location.pathname, '/auth/login');
    assert.equal(location.searchParams.get('returnTo'), `${authorization.pathname}?${authorization.searchParams.toString()}`);
  });
});

test('authorize rejects unregistered redirects without redirecting', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const externalApplicationStore = createMemoryExternalApplicationStore();
  const created = await externalApplicationStore.createApplication({
    name: '项目 A',
    redirectUris: ['https://a.example.com/callback'],
    launchUrl: 'https://a.example.com/start',
    requiredRole: 'viewer',
    openMode: 'browser',
    enabled: true,
    actor: 'admin',
  });
  const app = createApp({ config, externalApplicationStore });
  await withFetchServer(app, async (origin) => {
    const response = await fetch(`${origin}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: created.application.clientId,
      redirect_uri: 'https://attacker.example/callback',
      scope: 'openid',
      state: 'state-1',
      code_challenge: pkceChallenge('v'.repeat(64)),
      code_challenge_method: 'S256',
    })}`, { redirect: 'manual' });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
  });
});

test('authorize requires a bounded nonce for OIDC requests', async () => {
  const config = { ...loadConfig({ NODE_ENV: 'development' }), metricsToken: 'm'.repeat(32) };
  const externalApplicationStore = createMemoryExternalApplicationStore();
  const app = createApp({ config, externalApplicationStore });

  await withFetchServer(app, async (origin) => {
    const createdResponse = await fetch(`${origin}/api/external-apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({
        name: '项目 nonce',
        redirectUris: ['https://nonce.example.com/callback'],
        launchUrl: 'https://nonce.example.com/start',
      }),
    });
    const created = await createdResponse.json();
    const authorizeUrl = new URL(`${origin}/oauth/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: created.application.clientId,
      redirect_uri: 'https://nonce.example.com/callback',
      scope: 'openid',
      state: 'state-1',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
    }).toString();
    const response = await fetch(authorizeUrl, { redirect: 'manual' });
    assert.equal(response.status, 303);
    const callback = new URL(response.headers.get('location'));
    assert.equal(callback.searchParams.get('error'), 'invalid_request');
  });
});

test('token exchange rejects a code after its central session is revoked', async () => {
  const context = await createProtectedOidcApp();
  await withFetchServer(context.app, async (origin) => {
    const grant = await authorizeExternalApplication(origin, context.created, context.sessionToken);
    context.sessionRegistry.revoke(context.sessionToken);

    const response = await exchangeAuthorizationCode(origin, context.created, grant);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_grant');
  });
});

test('token exchange rejects a code after the account loses the required role', async () => {
  const context = await createProtectedOidcApp({ requiredRole: 'operator' });
  await withFetchServer(context.app, async (origin) => {
    const grant = await authorizeExternalApplication(origin, context.created, context.sessionToken);
    await context.authStore.updateAccount('operator', { role: 'viewer' });

    const response = await exchangeAuthorizationCode(origin, context.created, grant);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_grant');
  });
});

test('token endpoint rate limits repeated client authentication attempts', async () => {
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    metricsToken: 'm'.repeat(32),
    externalAuthTokenRateLimitPerMinute: 2,
  };
  const app = createApp({ config });
  await withFetchServer(app, async (origin) => {
    const request = () => fetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'unknown-client',
        client_secret: 'invalid-secret',
        code: 'invalid-code',
        redirect_uri: 'https://unknown.example.com/callback',
        code_verifier: 'v'.repeat(64),
      }),
    });

    assert.equal((await request()).status, 401);
    assert.equal((await request()).status, 401);
    const limited = await request();
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get('retry-after') || '', /^\d+$/);
    assert.equal((await limited.json()).error, 'temporarily_unavailable');
  });
});

test('token endpoint audits invalid client authentication without storing secrets', async () => {
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    metricsToken: 'm'.repeat(32),
    externalAuthTokenRateLimitPerMinute: 100,
  };
  const app = createApp({ config });
  await withFetchServer(app, async (origin) => {
    const response = await fetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'unknown-client',
        client_secret: 'invalid-secret',
        code: 'invalid-code',
        redirect_uri: 'https://unknown.example.com/callback',
        code_verifier: 'v'.repeat(64),
      }),
    });
    assert.equal(response.status, 401);

    const events = await app.locals.operationsStore.listAudit({
      action: 'external_auth.token',
      outcome: 'failure',
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].details.reason, 'invalid_client');
    assert.equal(events[0].details.clientId, 'unknown-client');
    assert.equal(JSON.stringify(events).includes('invalid-secret'), false);
  });
});
