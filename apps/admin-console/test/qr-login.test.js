import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { createPasswordHash } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createMemoryQrLoginStore } from '../src/qr-login-store.js';

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

test('authenticated Android approval issues a browser-bound central session', async () => {
  const password = 'qr-login-security-password';
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 4));
  const encryptionKey = Buffer.alloc(32, 5).toString('base64url');
  const authStore = createMemoryAuthStore({
    encryptionKey,
    bootstrap: { username: 'operator', passwordHash, role: 'operator' },
  });
  const qrLoginStore = createMemoryQrLoginStore({
    idFactory: (() => {
      const values = ['123e4567-e89b-42d3-a456-426614174000', '123e4567-e89b-42d3-a456-426614174001'];
      return () => values.shift();
    })(),
    secretFactory: (() => {
      const values = [
        'scan-secret-value-that-is-long-enough',
        'browser-secret-value-that-is-long-enough',
        'second-scan-secret-value-that-is-long-enough',
        'second-browser-secret-value-that-is-long-enough',
      ];
      return () => values.shift();
    })(),
    codeFactory: () => 4821,
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
  const app = createApp({ config, authStore, qrLoginStore });

  await withServer(app, async (origin) => {
    const consoleHeaders = { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' };
    const createdResponse = await fetch(`${origin}/api/auth/qr/requests`, {
      method: 'POST',
      headers: consoleHeaders,
      body: '{}',
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.verificationCode, '4821');
    assert.match(created.qrDataUrl, /^data:image\/png;base64,/);
    const browserCookie = createdResponse.headers.get('set-cookie').split(';', 1)[0];

    const loginResponse = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: consoleHeaders,
      body: JSON.stringify({ username: 'operator', password }),
    });
    assert.equal(loginResponse.status, 200);
    const appCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];

    const scanResponse = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/scan`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: appCookie },
      body: JSON.stringify({ scanToken: 'scan-secret-value-that-is-long-enough' }),
    });
    assert.equal(scanResponse.status, 200);
    const scanned = await scanResponse.json();
    assert.equal(scanned.status, 'scanned');
    assert.equal(scanned.confirmationMethod, 'biometric');

    const hijackStatus = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}`);
    assert.equal(hijackStatus.status, 410);

    const approvedResponse = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/approve`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: appCookie },
      body: JSON.stringify({ localConfirmation: true }),
    });
    assert.equal(approvedResponse.status, 200);

    const consumeResponse = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/consume`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: browserCookie },
      body: '{}',
    });
    assert.equal(consumeResponse.status, 200);
    assert.equal((await consumeResponse.json()).user.username, 'operator');
    assert.match(consumeResponse.headers.get('set-cookie'), /my_platform_session=/);

    const reused = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/consume`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: browserCookie },
      body: '{}',
    });
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).code, 'QR_LOGIN_NOT_APPROVED');

    await authStore.updateAccount('operator', { role: 'super_admin' });
    const privilegedCreatedResponse = await fetch(`${origin}/api/auth/qr/requests`, {
      method: 'POST', headers: consoleHeaders, body: '{}',
    });
    const privilegedCreated = await privilegedCreatedResponse.json();
    const privilegedScan = await fetch(`${origin}/api/auth/qr/requests/${privilegedCreated.requestId}/scan`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: appCookie },
      body: JSON.stringify({ scanToken: 'second-scan-secret-value-that-is-long-enough' }),
    });
    assert.equal(privilegedScan.status, 200);
    assert.equal((await privilegedScan.json()).confirmationMethod, 'unavailable');

    const passkeyOptions = await fetch(`${origin}/api/auth/qr/requests/${privilegedCreated.requestId}/passkey/options`, {
      method: 'POST', headers: { ...consoleHeaders, Cookie: appCookie }, body: '{}',
    });
    assert.equal(passkeyOptions.status, 503);
    assert.equal((await passkeyOptions.json()).code, 'QR_ANDROID_PASSKEY_UNAVAILABLE');

    const localBypass = await fetch(`${origin}/api/auth/qr/requests/${privilegedCreated.requestId}/approve`, {
      method: 'POST',
      headers: { ...consoleHeaders, Cookie: appCookie },
      body: JSON.stringify({ localConfirmation: true }),
    });
    assert.equal(localBypass.status, 503);
    assert.equal((await localBypass.json()).code, 'QR_ANDROID_PASSKEY_UNAVAILABLE');
  });
});
