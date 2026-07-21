import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createPasswordHash } from '../src/auth.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { loadConfig } from '../src/config.js';

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

function totp(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

test('production login enforces HTTPS, mandatory MFA enrollment, and host-only secure cookies', async () => {
  const password = 'security-test-password';
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 8));
  const encryptionKey = Buffer.alloc(32, 9).toString('base64url');
  const authStore = createMemoryAuthStore({
    encryptionKey,
    bootstrap: { username: 'admin', passwordHash, role: 'super_admin' },
  });
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    isProduction: true,
    authDisabled: false,
    requireMfa: true,
    trustProxy: 1,
    publicOrigin: 'https://admin.example.com',
    adminUsername: 'admin',
    adminPasswordHash: passwordHash,
    adminRole: 'super_admin',
    authEncryptionKey: encryptionKey,
    sessionSecret: 's'.repeat(32),
    metricsToken: 'm'.repeat(32),
    webauthnRpName: 'MY Platform',
    webauthnRpId: 'admin.example.com',
  };
  const app = createApp({ config, authStore });

  await withServer(app, async (origin) => {
    const insecureApi = await fetch(`${origin}/api/auth/status`);
    assert.equal(insecureApi.status, 400);
    assert.equal((await insecureApi.json()).code, 'HTTPS_REQUIRED');

    const redirect = await fetch(`${origin}/console`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), 'https://admin.example.com/console');

    const headers = {
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      'X-Forwarded-Proto': 'https',
    };
    const first = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'admin', password }),
    });
    assert.equal(first.status, 428);
    const enrollment = (await first.json()).details.enrollment;
    assert.match(enrollment.qrDataUrl, /^data:image\/png;base64,/);

    const confirmed = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'admin', password, enrollmentCode: totp(enrollment.secret) }),
    });
    assert.equal(confirmed.status, 200);
    const session = await confirmed.json();
    assert.equal(session.user.mfaCompliant, true);
    assert.equal(session.recoveryCodes.length, 10);
    const setCookie = confirmed.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-my_platform_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Strict/i);

    const cookie = setCookie.split(';', 1)[0];
    const status = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie, 'X-Forwarded-Proto': 'https' },
    });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    const statusBody = await status.json();
    assert.equal(statusBody.authenticated, true);
    assert.equal(statusBody.mfaRequired, true);

    const changed = await fetch(`${origin}/api/security/password`, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify({
        password,
        totp: totp(enrollment.secret, Date.now() + 30_000),
        newPassword: 'replacement-security-password',
      }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).currentSessionRevoked, true);
    const revokedStatus = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie, 'X-Forwarded-Proto': 'https' },
    });
    assert.equal((await revokedStatus.json()).authenticated, false);
  });
});
