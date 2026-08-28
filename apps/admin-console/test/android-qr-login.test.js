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

test('Android QR login requires Passkey confirmation and a device-bound requester verifier', async () => {
  const password = 'android-qr-login-security-password';
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 6));
  const encryptionKey = Buffer.alloc(32, 7).toString('base64url');
  const authStore = createMemoryAuthStore({
    encryptionKey,
    bootstrap: { username: 'operator', passwordHash, role: 'operator' },
  });
  const qrLoginStore = createMemoryQrLoginStore({
    secretFactory: (() => {
      const values = [
        'android-scan-secret-value-that-is-long-enough',
        'android-requester-secret-value-that-is-long-enough',
      ];
      return () => values.shift();
    })(),
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
    androidAppCertFingerprints: ['test-certificate-fingerprint'],
  };
  const app = createApp({ config, authStore, qrLoginStore });

  await withServer(app, async (origin) => {
    const jsonHeaders = {
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      'User-Agent': 'MY-Control-Android/1.1.0',
      'X-Platform-Device-Id': 'android-device-001',
    };
    const createdResponse = await fetch(`${origin}/api/auth/qr/requests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ clientKind: 'android', confirmationMethod: 'passkey' }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.clientKind, 'android');
    assert.match(created.requesterVerifier, /^android-requester-secret-value/);
    assert.match(created.qrDataUrl, /^data:image\/png;base64,/);

    const statusResponse = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/status`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ requesterVerifier: created.requesterVerifier }),
    });
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).status, 'pending');

    const wrongDevice = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/status`, {
      method: 'POST',
      headers: { ...jsonHeaders, 'X-Platform-Device-Id': 'android-device-002' },
      body: JSON.stringify({ requesterVerifier: created.requesterVerifier }),
    });
    assert.equal(wrongDevice.status, 410);

    const biometric = await fetch(`${origin}/api/auth/qr/requests`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ clientKind: 'android', confirmationMethod: 'biometric' }),
    });
    assert.equal(biometric.status, 400);
    assert.equal((await biometric.json()).code, 'QR_LOGIN_INVALID_CONFIRMATION');

    const loginResponse = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Platform-Request': 'console' },
      body: JSON.stringify({ username: 'operator', password }),
    });
    assert.equal(loginResponse.status, 200);
    const appCookie = loginResponse.headers.get('set-cookie').split(';', 1)[0];

    const scanResponse = await fetch(`${origin}/api/auth/qr/requests/${created.requestId}/scan`, {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: appCookie },
      body: JSON.stringify({ scanToken: 'android-scan-secret-value-that-is-long-enough' }),
    });
    assert.equal(scanResponse.status, 200);
    const scanned = await scanResponse.json();
    assert.equal(scanned.clientKind, 'android');
    assert.equal(scanned.confirmationMethod, 'passkey');
  });
});
