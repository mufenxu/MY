const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryDatabase } = require('../src/storage/db');

const { defaultConfig } = require('../src/config');
const {
  applySecretDirectives,
  buildPublicConfigPayload,
  normalizeConfig
} = require('../src/settings/settingsStore');

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
