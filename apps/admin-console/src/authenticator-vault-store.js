import { MongoClient } from 'mongodb';

const RETENTION_MS = 30 * 86400000;
const MAX_HISTORY = 40;
const ID = /^[a-f0-9-]{36}$/;
function fail(message, statusCode = 400, code = 'VAULT_INVALID') {
  throw Object.assign(new Error(message), { statusCode, code });
}
function sealed(value, max) {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('加密数据格式无效。');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 29 || bytes.toString('base64') !== value) fail('加密数据格式无效。');
  return value;
}
function normalize(body) {
  if (!body || !ID.test(body.vaultId) || !ID.test(body.operationId) || body.version !== 1 ||
      !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 2147483646 ||
      !Number.isSafeInteger(body.keyVersion) || body.keyVersion < 1) fail('保险库版本无效。');
  return { vaultId: body.vaultId, operationId: body.operationId, version: 1,
    revision: body.revision + 1, keyVersion: body.keyVersion,
    wrappedKey: sealed(body.wrappedKey, 80), ciphertext: sealed(body.ciphertext, 96000) };
}
function current(doc) {
  return doc && !doc.deleted ? { ...doc.snapshot, updatedAt: doc.updatedAt,
    devices: doc.devices,
    history: doc.history.filter((item) => item.updatedAt >= Date.now() - RETENTION_MS)
      .map(({ revision, updatedAt }) => ({ revision, updatedAt })) } : null;
}
function replacement(doc, body, device, elevated) {
  const snapshot = normalize(body);
  if (doc?.deleted) {
    if (doc.snapshot.vaultId === snapshot.vaultId) fail('该保险库已删除，不能自动重建。', 409, 'VAULT_DELETED');
    doc = null;
  }
  if (doc?.snapshot.operationId === snapshot.operationId) {
    if (JSON.stringify(doc.snapshot) !== JSON.stringify(snapshot)) fail('操作标识已被使用。', 409, 'VAULT_CONFLICT');
    return doc;
  }
  if ((doc?.snapshot.revision || 0) !== body.revision) fail('另一台设备更新了保险库，请重新同步。', 409, 'VAULT_CONFLICT');
  if (doc && doc.snapshot.vaultId !== snapshot.vaultId) fail('保险库身份不匹配。', 409, 'VAULT_CONFLICT');
  const rotating = doc && snapshot.keyVersion === doc.snapshot.keyVersion + 1;
  if (!doc && snapshot.keyVersion !== 1) fail('初始密钥版本无效。');
  if (doc && !rotating && (snapshot.keyVersion !== doc.snapshot.keyVersion || snapshot.wrappedKey !== doc.snapshot.wrappedKey)) fail('密钥版本不匹配。', 409, 'VAULT_KEY_CHANGED');
  if ((!doc || rotating) && !elevated) fail('请先完成账号二次验证。', 403, 'REAUTHENTICATION_REQUIRED');
  if (doc && !doc.devices.some((item) => item.id === device.id)) fail('当前设备尚未授权或已被撤销，请重新恢复。', 403, 'VAULT_DEVICE_REVOKED');
  const now = Date.now();
  return { snapshot, updatedAt: now,
    // Rotation invalidates every other device and removes history encrypted with the retired key.
    devices: !doc || rotating ? [{ ...device, addedAt: now }] : doc.devices,
    history: doc && !rotating ? [...doc.history, { ...doc.snapshot, updatedAt: doc.updatedAt }]
      .filter((item) => item.updatedAt >= now - RETENTION_MS).slice(-MAX_HISTORY) : [] };
}
function store(adapter) {
  return {
    async get(owner) { return current(await adapter.get(owner)); },
    async history(owner, revision) {
      const doc = await adapter.get(owner);
      return doc?.history.find((item) => item.revision === revision && item.updatedAt >= Date.now() - RETENTION_MS) || null;
    },
    async put(owner, body, device, elevated) {
      const old = await adapter.get(owner);
      const next = replacement(old, body, device, elevated);
      if (next !== old && !await adapter.replace(owner, old, next)) fail('另一台设备更新了保险库，请重新同步。', 409, 'VAULT_CONFLICT');
      return current(next);
    },
    async enroll(owner, device, revision) {
      const old = await adapter.get(owner);
      if (!old || old.deleted || old.snapshot.revision !== revision) fail('保险库已更新，请重新恢复。', 409, 'VAULT_CONFLICT');
      if (old.devices.some((item) => item.id === device.id)) return current(old);
      if (old.devices.length >= 20) fail('授权设备已达上限，请轮换密钥撤销旧设备。');
      const next = { ...old, devices: [...old.devices, { ...device, addedAt: Date.now() }] };
      if (!await adapter.replace(owner, old, next)) fail('保险库已更新，请重新恢复。', 409, 'VAULT_CONFLICT');
      return current(next);
    },
    async remove(owner, revision) {
      const old = await adapter.get(owner);
      if (!old || old.deleted || old.snapshot.revision !== revision) fail('保险库已更新，请刷新后重试。', 409, 'VAULT_CONFLICT');
      const tombstone = { deleted: true, snapshot: { vaultId: old.snapshot.vaultId, revision: old.snapshot.revision + 1 }, history: [], devices: [], updatedAt: Date.now() };
      if (!await adapter.replace(owner, old, tombstone)) fail('保险库已更新，请刷新后重试。', 409, 'VAULT_CONFLICT');
    },
    async close() { await adapter.close?.(); },
    async ping() { return true; },
  };
}
export function createMemoryAuthenticatorVaultStore() {
  const docs = new Map();
  return store({
    async get(owner) { return docs.get(owner) || null; },
    async replace(owner, old, next) {
      if ((docs.get(owner) || null) !== old) return false;
      docs.set(owner, structuredClone(next)); return true;
    },
  });
}
export async function createMongoAuthenticatorVaultStore({ uri, client: sharedClient, databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app' }) {
  const client = sharedClient || new MongoClient(uri, { maxPoolSize: 5 });
  if (!sharedClient) await client.connect();
  const collection = client.db(databaseName).collection('authenticator_vaults');
  return store({
    async get(owner) { return collection.findOne({ _id: owner }); },
    async replace(owner, old, next) {
      if (!old) {
        try { await collection.insertOne({ _id: owner, ...next, generation: 1 }); return true; }
        catch (error) { if (error.code === 11000) return false; throw error; }
      }
      const result = await collection.replaceOne({ _id: owner, generation: old.generation },
        { _id: owner, ...next, generation: old.generation + 1 });
      return result.modifiedCount === 1;
    },
    async close() { if (!sharedClient) await client.close(); },
  });
}
