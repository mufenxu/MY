const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Database, DEFAULT_API_KEY_SCOPES } = require('../src/storage/db');

test('api keys are stored hashed and keep their scopes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttapi-db-'));
  const dbPath = path.join(tempDir, 'mqttapi.sqlite');
  const db = new Database(dbPath);

  try {
    await db.initialize();

    const created = await db.addApiKey('integration-test', ['devices:read']);
    const verified = await db.verifyApiKey(created.token);
    const listedBeforeUsage = await db.getApiKeys();

    assert.equal(created.scopes.length, 1);
    assert.equal(created.scopes[0], 'devices:read');
    assert.equal(verified.keyId, created.keyId);
    assert.deepEqual(verified.scopes, ['devices:read']);
    assert.equal(listedBeforeUsage[0].name, 'integration-test');
    assert.equal(listedBeforeUsage[0].tokenPreview, created.tokenPreview);
    assert.equal(listedBeforeUsage[0].request_count, 0);
    assert.equal(JSON.stringify(listedBeforeUsage).includes(created.token), false);

    await db.recordApiKeyUsage(created.keyId);
    const listedAfterUsage = await db.getApiKeys();
    assert.equal(listedAfterUsage[0].request_count, 1);
    assert.ok(listedAfterUsage[0].last_used_at);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('api key usage recovers from legacy null counters', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttapi-db-'));
  const dbPath = path.join(tempDir, 'mqttapi.sqlite');
  const db = new Database(dbPath);

  try {
    await db.initialize();

    const created = await db.addApiKey('legacy-counter-test', ['devices:read']);
    await db.run('UPDATE api_keys SET request_count = NULL WHERE key_id = ?', [created.keyId]);

    await db.recordApiKeyUsage(created.keyId);
    const listedAfterUsage = await db.getApiKeys();

    assert.equal(listedAfterUsage[0].request_count, 1);
    assert.ok(listedAfterUsage[0].last_used_at);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('api keys fall back to default scopes when none are provided', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttapi-db-'));
  const dbPath = path.join(tempDir, 'mqttapi.sqlite');
  const db = new Database(dbPath);

  try {
    await db.initialize();

    const created = await db.addApiKey('default-scope-test', []);
    assert.deepEqual(created.scopes, Array.from(DEFAULT_API_KEY_SCOPES));
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
