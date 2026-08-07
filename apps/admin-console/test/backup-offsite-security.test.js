import test from 'node:test';
import assert from 'node:assert/strict';
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

test('offsite backup configuration requires super admin reauthentication and never enters audit logs', async () => {
  const sessionSecret = 's'.repeat(32);
  const password = 'offsite-storage-admin-password';
  const passwordHash = await createPasswordHash(password, Buffer.alloc(16, 4));
  const sessions = createSessionRegistry({ secret: sessionSecret });
  const tokens = Object.fromEntries(['operator', 'super_admin'].map((role) => [
    role,
    sessions.issue({ username: role, role, ttlHours: 1 }),
  ]));
  const authStore = createMemoryAuthStore({
    encryptionKey: Buffer.alloc(32, 3).toString('base64url'),
    bootstrap: { username: 'super_admin', passwordHash, role: 'super_admin' },
  });
  await authStore.createAccount({ username: 'operator', passwordHash, role: 'operator' });
  const operationsStore = createMemoryOperationsStore();
  const calls = [];
  const backupManager = {
    getStatus: async () => ({ capabilities: {}, backups: [], jobs: [] }),
    getOffsiteConfig: async () => ({ configured: true, provider: 'r2', accessKeyIdMasked: '************y-id' }),
    configureOffsite: async (input) => {
      calls.push({ type: 'configure', input });
      return { configured: true, provider: input.provider, accessKeyIdMasked: '************y-id' };
    },
    testOffsiteConnection: async () => ({ configured: true, healthy: true }),
    listOffsiteBackups: async () => [{ key: 'production/remote.tar.gz', name: 'remote' }],
    importOffsiteBackup: async ({ key }) => ({ backup: { name: key.split('/').at(-1).replace('.tar.gz', ''), restorable: true } }),
    syncOffsiteBackup: async ({ backupName }) => ({ status: 'succeeded', backupName }),
  };
  const config = {
    ...loadConfig({ NODE_ENV: 'development' }),
    authDisabled: false,
    sessionSecret,
    adminPasswordHash: passwordHash,
    adminTotpSecret: '',
    metricsToken: 'm'.repeat(32),
  };
  const app = createApp({
    config,
    sessionRegistry: sessions,
    authStore,
    operationsStore,
    backupManager,
  });

  const request = (origin, role, resource, options = {}) => fetch(`${origin}${resource}`, {
    ...options,
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${tokens[role]}`,
      'Content-Type': 'application/json',
      'X-Platform-Request': 'console',
      ...options.headers,
    },
  });
  const storageInput = {
    enabled: true,
    provider: 'r2',
    accountId: '0123456789abcdef',
    bucket: 'backups',
    accessKeyId: 'r2-access-key-id',
    secretAccessKey: 'r2-secret-access-key',
  };

  await withServer(app, async (origin) => {
    const readableWithoutMutationHeader = await fetch(`${origin}/api/backups/offsite/config`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${tokens.operator}` },
    });
    assert.equal(readableWithoutMutationHeader.status, 200);
    assert.equal((await request(origin, 'operator', '/api/backups/offsite/config')).status, 200);
    assert.equal((await request(origin, 'operator', '/api/backups/offsite/config', {
      method: 'PUT',
      body: JSON.stringify({ ...storageInput, password }),
    })).status, 403);
    assert.equal((await request(origin, 'super_admin', '/api/backups/offsite/config', {
      method: 'PUT',
      body: JSON.stringify({ ...storageInput, password: 'wrong-password' }),
    })).status, 403);

    const configured = await request(origin, 'super_admin', '/api/backups/offsite/config', {
      method: 'PUT',
      body: JSON.stringify({ ...storageInput, password }),
    });
    assert.equal(configured.status, 200);
    assert.doesNotMatch(await configured.text(), /r2-access-key-id|r2-secret-access-key/);
    assert.equal(calls.length, 1);
    assert.equal('password' in calls[0].input, false);

    assert.equal((await request(origin, 'super_admin', '/api/backups/offsite/test', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })).status, 200);
    assert.equal((await request(origin, 'operator', '/api/backups/offsite', { method: 'GET' })).status, 200);
    assert.equal((await request(origin, 'operator', '/api/backups/offsite/import', {
      method: 'POST',
      body: JSON.stringify({ key: 'production/remote.tar.gz' }),
    })).status, 201);
    assert.equal((await request(origin, 'operator', '/api/backups/local/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    })).status, 200);
  });

  const serializedAudit = JSON.stringify(await operationsStore.listAudit({ limit: 100 }));
  assert.doesNotMatch(serializedAudit, /r2-access-key-id|r2-secret-access-key|offsite-storage-admin-password/);
});
