import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createMemoryExternalApplicationStore } from '../src/external-application-store.js';
import { pkceChallenge } from '../src/external-identity.js';
import { withFetchServer } from '../test-support/fetch-server.js';

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
