import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import {
  SESSION_COOKIE_NAME,
  createPasswordHash,
  createSessionRegistry,
} from '../src/auth.js';
import { createMemoryAuthStore } from '../src/auth-store.js';
import { loadConfig } from '../src/config.js';
import { createMemoryOperationsStore } from '../src/operations-store.js';
import { withFetchServer as withServer } from '../test-support/fetch-server.js';

test('backup downloads require super_admin reauthentication and record denials', async () => {
  const sessionSecret = 's'.repeat(32);
  const password = 'download-security-password';
  const sessions = createSessionRegistry({ secret: sessionSecret });
  const tokens = Object.fromEntries(['viewer', 'operator', 'super_admin'].map((role) => [
    role,
    sessions.issue({ username: role, role, ttlHours: 1 }),
  ]));
  const operationsStore = createMemoryOperationsStore();
  let downloadCalls = 0;
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 9));
  const authStore = createMemoryAuthStore({
    encryptionKey: Buffer.alloc(32, 7).toString('base64url'),
    bootstrap: { username: 'super_admin', passwordHash, role: 'super_admin' },
  });
  await authStore.createAccount({ username: 'viewer', passwordHash, role: 'viewer' });
  await authStore.createAccount({ username: 'operator', passwordHash, role: 'operator' });
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    authDisabled: false,
    adminPasswordHash: passwordHash,
    adminTotpSecret: '',
    sessionSecret,
    metricsToken: 'm'.repeat(32),
  };
  const app = createApp({
    config,
    sessionRegistry: sessions,
    authStore,
    operationsStore,
    backupManager: {
      async downloadBackup() {
        downloadCalls += 1;
        return {
          filename: 'secure-backup.tar.gz',
          contentType: 'application/gzip',
          stream: Readable.from(Buffer.from('archive')),
        };
      },
    },
  });

  const request = (origin, role, options = {}) => fetch(`${origin}/api/backups/secure-backup/download`, {
    method: 'POST',
    ...options,
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${tokens[role]}`,
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      ...options.headers,
    },
    body: options.body ?? JSON.stringify({ password }),
  });

  await withServer(app, async (origin) => {
    const reauthenticate = (role, submittedPassword) => fetch(`${origin}/api/auth/reauth`, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${tokens[role]}`,
        'Content-Type': 'application/json',
        'X-Platform-Request': 'console',
      },
      body: JSON.stringify({ password: submittedPassword }),
    });
    assert.equal((await reauthenticate('viewer', password)).status, 403);
    assert.equal((await reauthenticate('super_admin', 'wrong-password')).status, 403);
    const reauthenticated = await reauthenticate('super_admin', password);
    assert.equal(reauthenticated.status, 200);
    assert.equal((await reauthenticated.json()).reauthenticated, true);
    assert.ok(sessions.verify(tokens.super_admin).reauthenticatedUntil > Math.floor(Date.now() / 1000));

    assert.equal((await request(origin, 'viewer')).status, 403);
    assert.equal((await request(origin, 'operator')).status, 403);
    assert.equal((await request(origin, 'super_admin', {
      body: JSON.stringify({ password: 'wrong-password' }),
    })).status, 403);
    assert.equal(downloadCalls, 0);

    const legacyGet = await fetch(`${origin}/api/backups/secure-backup/download`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${tokens.super_admin}`,
        'X-Platform-Request': 'console',
      },
    });
    assert.equal(legacyGet.status, 405);
    assert.equal(legacyGet.headers.get('allow'), 'POST');

    const download = await request(origin, 'super_admin');
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'archive');
    assert.match(download.headers.get('content-disposition'), /secure-backup\.tar\.gz/);
    assert.equal(downloadCalls, 1);
  });

  const failures = await operationsStore.listAudit({ action: 'backup.download', outcome: 'failure' });
  assert.deepEqual(new Set(failures.map((entry) => entry.details.reason)), new Set([
    'insufficient_role',
    'reauthentication_failed',
  ]));
  const successes = await operationsStore.listAudit({ action: 'backup.downloaded' });
  assert.equal(successes.length, 1);
  assert.equal(successes[0].actor, 'super_admin');
  assert.equal((await operationsStore.listAudit({ action: 'auth.reauthenticate', outcome: 'success' })).length, 1);
  assert.equal((await operationsStore.listAudit({ action: 'auth.reauthenticate', outcome: 'failure' })).length, 1);
});
