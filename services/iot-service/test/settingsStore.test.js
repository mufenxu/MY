const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

test('SettingsStore can read a UTF-8 BOM config file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttapi-config-'));
  const configPath = path.join(tempDir, 'config.json');
  const originalConfigFile = process.env.CONFIG_FILE;

  try {
    const config = normalizeConfig(defaultConfig, defaultConfig);
    const content = `\uFEFF${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(configPath, content, 'utf8');

    process.env.CONFIG_FILE = configPath;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/settings/settingsStore')];

    const { SettingsStore } = require('../src/settings/settingsStore');
    const store = new SettingsStore();
    const loaded = store.initialize();

    assert.equal(loaded.mqtt.url, config.mqtt.url);
    assert.equal(loaded.api.port, config.api.port);
  } finally {
    if (originalConfigFile == null) {
      delete process.env.CONFIG_FILE;
    } else {
      process.env.CONFIG_FILE = originalConfigFile;
    }

    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/settings/settingsStore')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
