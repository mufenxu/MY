const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryDatabase } = require('../src/storage/db');

const { defaultConfig } = require('../src/config');
const {
  applySecretDirectives,
  buildPublicConfigPayload,
  normalizeConfig,
  validateProductionSecrets
} = require('../src/settings/settingsStore');
const { AuthManager } = require('../src/security/auth');
const { hashPassword, isPasswordHash, verifyPassword } = require('../src/security/password');

test('telemetry retention defaults to a finite 30 day window', () => {
  assert.equal(defaultConfig.dashboard.dataRetentionDays, 30);
});

test('buildPublicConfigPayload redacts secret values but reports presence', () => {
  const config = normalizeConfig(defaultConfig, defaultConfig);
  const payload = buildPublicConfigPayload(config);

  assert.equal(payload.config.mqtt.password, '');
  assert.equal(payload.config.auth.password, '');
  assert.equal(payload.config.auth.sessionSecret, '');
  assert.equal(payload.secretState.mqttPasswordConfigured, false);
  assert.equal(payload.secretState.authPasswordConfigured, false);
  assert.equal(payload.secretState.authSessionSecretConfigured, true);
});

test('applySecretDirectives preserves existing secrets when fields are blank', () => {
  const current = normalizeConfig({
    ...defaultConfig,
    auth: {
      ...defaultConfig.auth,
      enabled: true,
      password: 'existing-auth-password',
      sessionSecret: 'existing-session-secret'
    },
    mqtt: {
      ...defaultConfig.mqtt,
      password: 'existing-mqtt-password'
    }
  }, defaultConfig);

  const nextInput = applySecretDirectives(current, {
    mqtt: { password: '' },
    auth: {
      password: '',
      sessionSecret: ''
    },
    secretDirectives: {
      mqttPassword: 'preserve',
      authPassword: 'preserve',
      authSessionSecret: 'preserve'
    }
  });

  assert.equal(nextInput.mqtt.password, 'existing-mqtt-password');
  assert.equal(nextInput.auth.password, 'existing-auth-password');
  assert.equal(nextInput.auth.sessionSecret, 'existing-session-secret');
});

test('applySecretDirectives clears and replaces secrets explicitly', () => {
  const current = normalizeConfig({
    ...defaultConfig,
    auth: {
      ...defaultConfig.auth,
      enabled: true,
      password: 'existing-auth-password',
      sessionSecret: 'existing-session-secret'
    },
    mqtt: {
      ...defaultConfig.mqtt,
      password: 'existing-mqtt-password'
    }
  }, defaultConfig);

  const nextInput = applySecretDirectives(current, {
    mqtt: { password: 'next-mqtt-password' },
    auth: {
      password: '',
      sessionSecret: 'next-session-secret'
    },
    secretDirectives: {
      mqttPassword: 'replace',
      authPassword: 'clear',
      authSessionSecret: 'replace'
    }
  });

  assert.equal(nextInput.mqtt.password, 'next-mqtt-password');
  assert.equal(nextInput.auth.password, '');
  assert.equal(nextInput.auth.sessionSecret, 'next-session-secret');
});

test('SettingsStore persists normalized configuration in MongoDB storage', async () => {
  const storage = new MemoryDatabase();
  const { SettingsStore } = require('../src/settings/settingsStore');
  const store = new SettingsStore({ storage });
  const loaded = await store.initialize();
  assert.equal(loaded.mqtt.url, defaultConfig.mqtt.url);

  await store.saveConfig({ dashboard: { refreshInterval: 9000 } });
  const nextStore = new SettingsStore({ storage });
  const restored = await nextStore.initialize();
  assert.equal(restored.dashboard.refreshInterval, 9000);
});

test('SettingsStore persists administrator passwords only as scrypt hashes', async () => {
  const storage = new MemoryDatabase();
  const { SettingsStore } = require('../src/settings/settingsStore');
  const store = new SettingsStore({ storage });
  await store.initialize();

  const password = 'correct horse battery staple';
  await store.saveConfig({
    auth: { enabled: true, password },
    secretDirectives: { authPassword: 'replace' }
  });

  assert.equal(isPasswordHash(storage.settings.auth.password), true);
  assert.notEqual(storage.settings.auth.password, password);
  assert.equal(store.getPublicConfig().config.auth.password, '');

  const authManager = new AuthManager(store, storage);
  assert.equal(authManager.authenticate('admin', password).ok, true);
  assert.equal(authManager.authenticate('admin', 'wrong-password').ok, false);
});

test('SettingsStore recovers invalid persisted production auth from environment defaults', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const storage = new MemoryDatabase();
    const { SettingsStore } = require('../src/settings/settingsStore');
    const store = new SettingsStore({ storage });
    const envPassword = 'correct horse battery staple';
    const envSessionSecret = '0123456789abcdef0123456789abcdef0123456789abcdef';

    store.defaults = normalizeConfig({
      ...defaultConfig,
      auth: {
        ...defaultConfig.auth,
        enabled: true,
        username: 'admin',
        password: hashPassword(envPassword),
        sessionSecret: envSessionSecret
      }
    }, defaultConfig);
    storage.settings = {
      auth: {
        enabled: true,
        username: 'admin',
        password: 'short',
        sessionSecret: 'tiny'
      }
    };

    await store.initialize();

    assert.equal(isPasswordHash(storage.settings.auth.password), true);
    assert.equal(verifyPassword(envPassword, storage.settings.auth.password), true);
    assert.equal(storage.settings.auth.sessionSecret, envSessionSecret);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('production auth rejects weak and template credentials', () => {
  assert.match(
    validateProductionSecrets({
      enabled: true,
      password: 'replace_with_strong_password',
      sessionSecret: 'replace_with_at_least_32_random_characters'
    }, 'production').join(' '),
    /模板默认值/
  );
  assert.match(
    validateProductionSecrets({ enabled: true, password: 'short', sessionSecret: 'also-short' }, 'production').join(' '),
    /16 个字符.*32 个字符/
  );
});

test('scrypt verifier rejects malformed or attacker-controlled parameters', () => {
  assert.equal(isPasswordHash('scrypt$999999999$8$1$c2FsdA$aGFzaA'), false);
  assert.equal(verifyPassword('password', 'scrypt$999999999$8$1$c2FsdA$aGFzaA'), false);
});
