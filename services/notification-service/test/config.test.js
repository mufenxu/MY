const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const serviceRoot = path.resolve(__dirname, '..');

function loadProductionConfig(apiKey) {
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
    },
  });
}

test('production rejects weak notification API keys', () => {
  const result = loadProductionConfig('short-key');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NOTIFY_API_KEY/);
});

test('production accepts a strong notification API key', () => {
  const result = loadProductionConfig('a'.repeat(32));
  assert.equal(result.status, 0, result.stderr);
});
