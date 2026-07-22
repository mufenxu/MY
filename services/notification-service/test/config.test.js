const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const serviceRoot = path.resolve(__dirname, '..');

function loadProductionConfig(apiKey, overrides = {}) {
  return spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: serviceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NOTIFY_API_KEY: apiKey,
      WECOM_CORP_ID: 'test-corp',
      WECOM_AGENT_ID: '10001',
      WECOM_SECRET: 'test-wecom-secret',
      NOTIFICATION_MONGODB_URI: 'mongodb://notification.example/notification_app',
      NOTIFY_HISTORY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64url'),
      ...overrides,
    },
  });
}

test('production rejects weak notification API keys', () => {
  const result = loadProductionConfig('short-key');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NOTIFY_API_KEY/);
});

test('production requires notification history persistence and encryption', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], {
    cwd: serviceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NOTIFY_API_KEY: 'a'.repeat(32),
      WECOM_CORP_ID: 'test-corp',
      WECOM_AGENT_ID: '10001',
      WECOM_SECRET: 'test-wecom-secret',
      NOTIFICATION_MONGODB_URI: '',
      NOTIFY_HISTORY_ENCRYPTION_KEY: 'invalid',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NOTIFY_HISTORY_ENCRYPTION_KEY|NOTIFICATION_MONGODB_URI/);
});

test('production accepts a strong notification API key', () => {
  const result = loadProductionConfig('a'.repeat(32));
  assert.equal(result.status, 0, result.stderr);
});

test('orchestration reliability settings enforce bounded production values', () => {
  const invalidConcurrency = loadProductionConfig('a'.repeat(32), { NOTIFY_ORCHESTRATION_CONCURRENCY: '6' });
  assert.notEqual(invalidConcurrency.status, 0);
  assert.match(invalidConcurrency.stderr, /NOTIFY_ORCHESTRATION_CONCURRENCY/);

  const valid = loadProductionConfig('a'.repeat(32), {
    NOTIFY_ORCHESTRATION_CONCURRENCY: '4',
    NOTIFY_ORCHESTRATION_LEASE_MS: '120000',
  });
  assert.equal(valid.status, 0, valid.stderr);
});
