import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { createPasswordHash } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createMemoryWebLoginTicketStore } from '../src/web-login-ticket-store.js';

const ANDROID_UA = 'MY-Control-Android/1.0.0';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createFixture() {
  const password = 'web-login-ticket-password';
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 8));
  const encryptionKey = Buffer.alloc(32, 9).toString('base64url');
  const authStore = createMemoryAuthStore({
    encryptionKey,
    bootstrap: { username: 'operator', passwordHash, role: 'operator' },
  });
  const webLoginTicketStore = createMemoryWebLoginTicketStore({
    secretFactory: () => 'web-login-ticket-secret-that-is-long-enough',
  });
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    authDisabled: false,
    requireMfa: false,
    publicOrigin: 'https://pxyb.cn',
    adminUsername: 'operator',
    adminPasswordHash: passwordHash,
    adminRole: 'operator',
    authEncryptionKey: encryptionKey,
    sessionSecret: 's'.repeat(32),
    metricsToken: 'm'.repeat(32),
    webauthnRpName: 'MY Platform',
    webauthnRpId: 'pxyb.cn',
  };
  return { app: createApp({ config, authStore, webLoginTicketStore }), password };
}

async function androidLogin(origin, password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      'User-Agent': ANDROID_UA,
    },
    body: JSON.stringify({ username: 'operator', password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

function directAppLoginUrl(origin, loginUrl) {
  const url = new URL(loginUrl);
  const path = url.pathname.replace(/^\/console/, '') || '/';
  return `${origin}${path}${url.search}`;
}

test('Android app can exchange its session for a one-time browser login ticket', async () => {
  const { app, password } = await createFixture();

  await withServer(app, async (origin) => {
    const appCookie = await androidLogin(origin, password);
    const createdResponse = await fetch(`${origin}/api/auth/web-login-tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform-Request': 'console',
        'User-Agent': ANDROID_UA,
        Cookie: appCookie,
      },
      body: JSON.stringify({ redirect: 'https://pxyb.cn/apps/core/' }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.redirect, 'https://pxyb.cn/apps/core/');
    assert.match(created.loginUrl, /^https:\/\/pxyb\.cn\/console\/app-login\?/);
    assert.match(created.expiresAt, /^\d{4}-\d{2}-\d{2}T/);

    const consumeResponse = await fetch(directAppLoginUrl(origin, created.loginUrl), {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
    });
    assert.equal(consumeResponse.status, 200);
    assert.equal(consumeResponse.headers.get('location'), 'https://pxyb.cn/apps/core/');
    assert.match(consumeResponse.headers.get('set-cookie'), /my_platform_session=/);
    const html = await consumeResponse.text();
    assert.match(html, /正在进入管理后台/);
    assert.match(html, /身份凭据验证成功/);
    assert.match(html, /https:\/\/pxyb\.cn\/apps\/core\//);

    const reusedResponse = await fetch(directAppLoginUrl(origin, created.loginUrl), {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
    });
    assert.equal(reusedResponse.status, 410);
    const reusedHtml = await reusedResponse.text();
    assert.match(reusedHtml, /登录凭据已过期/);
  });
});

test('web login tickets reject unsafe callers and redirects', async () => {
  const { app, password } = await createFixture();

  await withServer(app, async (origin) => {
    const appCookie = await androidLogin(origin, password);
    const baseHeaders = {
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      Cookie: appCookie,
    };

    const browserCaller = await fetch(`${origin}/api/auth/web-login-tickets`, {
      method: 'POST',
      headers: { ...baseHeaders, 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
      body: JSON.stringify({ redirect: 'https://pxyb.cn/apps/core/' }),
    });
    assert.equal(browserCaller.status, 403);
    assert.equal((await browserCaller.json()).code, 'WEB_LOGIN_ANDROID_REQUIRED');

    const externalRedirect = await fetch(`${origin}/api/auth/web-login-tickets`, {
      method: 'POST',
      headers: { ...baseHeaders, 'User-Agent': ANDROID_UA },
      body: JSON.stringify({ redirect: 'https://example.com/apps/core/' }),
    });
    assert.equal(externalRedirect.status, 400);
    assert.equal((await externalRedirect.json()).code, 'WEB_LOGIN_REDIRECT_INVALID');
  });
});
