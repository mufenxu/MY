import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closePortalStores,
  createPersistentPortalStores,
  pingPortalStores,
} from '../src/portal-store-lifecycle.mjs';

function testConfig() {
  return {
    mongoUri: 'mongodb://example.invalid/platform',
    authEncryptionKey: 'key',
    webauthnRpName: 'MY Platform',
    adminUsername: 'admin',
    adminPasswordHash: 'hash',
    adminRole: 'super_admin',
    adminTotpSecret: '',
    sessionSecret: 'secret',
    sessionIdleMinutes: 30,
    statusRetentionDays: 30,
    auditRetentionDays: 180,
  };
}

test('persistent portal store lifecycle wires every store and survives app restarts', async () => {
  const backend = new Map();
  const calls = [];
  const closed = [];
  const factory = (name) => async (options) => {
    calls.push([name, options]);
    return {
      async ping() { return true; },
      async close() { closed.push(name); },
      async set(key, value) { backend.set(`${name}:${key}`, value); },
      async get(key) { return backend.get(`${name}:${key}`); },
    };
  };
  const factories = {
    createMongoAuthStore: factory('authStore'),
    createMongoAuthRiskStore: factory('authRiskStore'),
    createMongoSessionRegistry: factory('sessionRegistry'),
    createMongoOperationsStore: factory('operationsStore'),
    createMongoReleaseStore: factory('releaseStore'),
    createMongoConfigurationStore: factory('configurationStore'),
  };

  const first = await createPersistentPortalStores({ config: testConfig(), factories });
  await first.releaseStore.set('release-1', { status: 'succeeded' });
  await first.configurationStore.set('version', 4);
  assert.equal(await pingPortalStores(first), true);
  assert.deepEqual(await closePortalStores(first), []);

  const second = await createPersistentPortalStores({ config: testConfig(), factories });
  assert.deepEqual(await second.releaseStore.get('release-1'), { status: 'succeeded' });
  assert.equal(await second.configurationStore.get('version'), 4);
  assert.deepEqual(calls.slice(0, 6).map(([name]) => name), [
    'authStore',
    'authRiskStore',
    'sessionRegistry',
    'operationsStore',
    'releaseStore',
    'configurationStore',
  ]);
  assert.equal(calls.find(([name]) => name === 'releaseStore')[1].uri, testConfig().mongoUri);
  assert.equal(closed.length, 6);
  await closePortalStores(second);
});

test('partial initialization failure closes stores that were already connected', async () => {
  const closed = [];
  const ok = (name) => async () => ({
    async ping() { return true; },
    async close() { closed.push(name); },
  });
  const factories = {
    createMongoAuthStore: ok('authStore'),
    createMongoAuthRiskStore: ok('authRiskStore'),
    createMongoSessionRegistry: async () => { throw new Error('mongo unavailable'); },
    createMongoOperationsStore: ok('operationsStore'),
    createMongoReleaseStore: ok('releaseStore'),
    createMongoConfigurationStore: ok('configurationStore'),
  };

  await assert.rejects(
    createPersistentPortalStores({ config: testConfig(), factories }),
    /mongo unavailable/,
  );
  assert.deepEqual(closed, ['authStore', 'authRiskStore']);
});
