const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  Database,
  MemoryDatabase,
  DEFAULT_API_KEY_SCOPES,
  normalizeLegacyApiKeyRow
} = require('../src/storage/db');

test('api keys are stored hashed and keep their scopes', async () => {
  const db = new MemoryDatabase();

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
  }
});

test('api key usage recovers from legacy null counters', async () => {
  const db = new MemoryDatabase();

  try {
    await db.initialize();

    const created = await db.addApiKey('legacy-counter-test', ['devices:read']);
    db.apiKeys.get(created.keyId).request_count = null;

    await db.recordApiKeyUsage(created.keyId);
    const listedAfterUsage = await db.getApiKeys();

    assert.equal(listedAfterUsage[0].request_count, 1);
    assert.ok(listedAfterUsage[0].last_used_at);
  } finally {
    await db.close();
  }
});

test('api keys fall back to default scopes when none are provided', async () => {
  const db = new MemoryDatabase();

  try {
    await db.initialize();

    const created = await db.addApiKey('default-scope-test', []);
    assert.deepEqual(created.scopes, Array.from(DEFAULT_API_KEY_SCOPES));
  } finally {
    await db.close();
  }
});

test('legacy plaintext API key IDs migrate to hashed scoped records', () => {
  const token = 'sk_mqttapi_legacy_plaintext_token';
  const migrated = normalizeLegacyApiKeyRow({
    id: token,
    name: 'legacy',
    scopes: null,
    request_count: null,
  });

  assert.match(migrated.id, /^key_/);
  assert.equal(migrated.key_id, migrated.id);
  assert.equal(migrated.token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.notEqual(migrated.token_preview, token);
  assert.deepEqual(migrated.scopes, Array.from(DEFAULT_API_KEY_SCOPES));
});

test('Mongo API key usage coalesces legacy null counters atomically', async () => {
  let captured;
  const collection = {
    async updateOne(filter, update) {
      captured = { filter, update };
      return { matchedCount: 1 };
    },
  };
  const db = new Database('mongodb://unused', {
    client: {},
    db: { collection: () => collection },
  });

  await db.recordApiKeyUsage('key_legacy');
  assert.deepEqual(captured.filter, { $or: [{ key_id: 'key_legacy' }, { id: 'key_legacy' }] });
  assert.deepEqual(
    captured.update[0].$set.request_count,
    { $add: [{ $ifNull: ['$request_count', 0] }, 1] }
  );
});
