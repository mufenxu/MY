const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { BoundedTtlCache } = require('../utils/boundedTtlCache');

const API_KEY_CACHE_TTL_MS = 60000;
const API_KEY_NEGATIVE_CACHE_TTL_MS = 5000;
const API_KEY_CACHE_MAX_ENTRIES = 1024;

const DEFAULT_API_KEY_SCOPES = Object.freeze([
  'devices:read',
  'history:read',
  'relays:write'
]);

const VALID_API_KEY_SCOPES = new Set(DEFAULT_API_KEY_SCOPES);

function normalizeApiKeyScopes(input) {
  const scopes = Array.isArray(input) ? input : [];
  const normalized = scopes
    .map((scope) => String(scope || '').trim())
    .filter((scope) => VALID_API_KEY_SCOPES.has(scope));

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : Array.from(DEFAULT_API_KEY_SCOPES);
}

function hashApiKey(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createApiKeyPreview(token) {
  const value = String(token);
  return value.length <= 16 ? value : `${value.slice(0, 14)}...${value.slice(-6)}`;
}

function createApiKeyId(seed = '') {
  const source = String(seed || crypto.randomBytes(12).toString('hex'));
  return `key_${source.slice(0, 24)}`;
}

function normalizeLegacyApiKeyRow(input) {
  const row = { ...input };
  const previousId = String(row.id || '');
  if (!previousId) throw new Error('Legacy API key row is missing id.');

  let storedScopes = row.scopes;
  if (typeof storedScopes === 'string') {
    try { storedScopes = JSON.parse(storedScopes); } catch { storedScopes = []; }
  }
  const tokenHash = row.token_hash || hashApiKey(previousId);
  const keyId = row.key_id || (previousId.startsWith('key_') ? previousId : createApiKeyId(tokenHash));
  return {
    ...row,
    id: keyId,
    key_id: keyId,
    token_hash: tokenHash,
    token_preview: row.token_preview || createApiKeyPreview(previousId),
    scopes: normalizeApiKeyScopes(storedScopes)
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

class Database {
  constructor(uri = process.env.IOT_MONGODB_URI || process.env.MONGODB_URI, options = {}) {
    this.uri = uri;
    this.dbName = options.dbName || process.env.IOT_MONGODB_DATABASE || 'iot_app';
    this.client = options.client || null;
    this.ownsClient = !options.client;
    this.db = options.db || null;
    this.apiKeyCache = new BoundedTtlCache({
      maxEntries: API_KEY_CACHE_MAX_ENTRIES,
      ttlMs: API_KEY_CACHE_TTL_MS
    });
  }

  async open() {
    if (this.db) return;
    if (!this.uri) throw new Error('IOT_MONGODB_URI is required.');
    if (!this.client) {
      this.client = new MongoClient(this.uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
      });
      await this.client.connect();
    }
    this.db = this.client.db(this.dbName);
  }

  async initialize() {
    await this.open();
    await Promise.all([
      this.db.collection('devices').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('sensor_data').createIndex({ device_id: 1, created_at: -1 }),
      this.db.collection('relay_logs').createIndex({ device_id: 1, created_at: -1 }),
      this.db.collection('api_keys').createIndex({ key_id: 1 }, { unique: true }),
      this.db.collection('api_keys').createIndex({ token_hash: 1 }, { unique: true, sparse: true }),
      this.db.collection('settings').createIndex({ key: 1 }, { unique: true }),
      this.db.collection('automation_rules').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('automation_rules').createIndex({ enabled: 1, updated_at: -1 }),
      this.db.collection('automation_scenes').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('automation_runs').createIndex({ created_at: -1 }),
      this.db.collection('automation_runs').createIndex({ source_id: 1, created_at: -1 })
    ]);
  }

  async ping() {
    if (!this.db) return false;
    const result = await this.db.command({ ping: 1 });
    return result.ok === 1;
  }

  async close() {
    if (this.client && this.ownsClient) await this.client.close();
    this.client = null;
    this.db = null;
    this.apiKeyCache.clear();
  }

  async recordApiKeyUsage(keyId) {
    const now = Date.now();
    return this.db.collection('api_keys').updateOne(
      { $or: [{ key_id: keyId }, { id: keyId }] },
      [{
        $set: {
          request_count: { $add: [{ $ifNull: ['$request_count', 0] }, 1] },
          last_used_at: now
        }
      }]
    );
  }

  async syncDevices(configDevices) {
    const now = Date.now();
    if (!Array.isArray(configDevices) || configDevices.length === 0) return;
    await this.db.collection('devices').bulkWrite(configDevices.map((device) => {
      let type = 'combo';
      if (device.topics?.temp && !device.relays) type = 'sensor';
      if (!device.topics?.temp && device.relays) type = 'relay';
      return {
        updateOne: {
          filter: { id: device.id },
          update: {
            $set: { name: device.name, type },
            $setOnInsert: {
              id: device.id,
              online_status: 'offline',
              last_active: null,
              created_at: now
            }
          },
          upsert: true
        }
      };
    }));
  }

  async saveSensorData(deviceId, temp, hum) {
    const now = Date.now();
    await Promise.all([
      this.db.collection('sensor_data').insertOne({ device_id: deviceId, temp, hum, created_at: now }),
      this.db.collection('devices').updateOne(
        { id: deviceId },
        { $set: { online_status: 'online', last_active: now } }
      )
    ]);
  }

  async getSensorHistory(deviceId, limit = 100, range = null) {
    const query = { device_id: deviceId };
    const durations = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    if (durations[range]) query.created_at = { $gte: Date.now() - durations[range] };
    const max = durations[range]
      ? 500
      : Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
    const rows = await this.db.collection('sensor_data')
      .find(query, { projection: { _id: 0, temp: 1, hum: 1, created_at: 1 } })
      .sort({ created_at: -1 })
      .limit(max)
      .toArray();
    return rows.reverse();
  }

  async cleanOldData(retentionDays) {
    if (!retentionDays || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const [sensor, relays] = await Promise.all([
      this.db.collection('sensor_data').deleteMany({ created_at: { $lt: cutoff } }),
      this.db.collection('relay_logs').deleteMany({ created_at: { $lt: cutoff } })
    ]);
    return sensor.deletedCount + relays.deletedCount;
  }

  async saveRelayLog(deviceId, relayId, status, triggeredBy = 'system') {
    const now = Date.now();
    await Promise.all([
      this.db.collection('relay_logs').insertOne({
        device_id: deviceId,
        relay_id: relayId,
        status,
        triggered_by: triggeredBy,
        created_at: now
      }),
      this.db.collection('devices').updateOne(
        { id: deviceId },
        { $set: { online_status: 'online', last_active: now } }
      )
    ]);
  }

  async updateDeviceStatus(deviceId, status) {
    return this.db.collection('devices').updateOne(
      { id: deviceId },
      { $set: { online_status: status, last_active: Date.now() } }
    );
  }

  async getDevices() {
    return this.db.collection('devices').find({}, { projection: { _id: 0 } }).toArray();
  }

  async addApiKey(name, scopes = DEFAULT_API_KEY_SCOPES) {
    const normalizedScopes = normalizeApiKeyScopes(scopes);
    const token = `sk_mqttapi_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashApiKey(token);
    const keyId = createApiKeyId(tokenHash);
    const tokenPreview = createApiKeyPreview(token);
    const now = Date.now();
    await this.db.collection('api_keys').insertOne({
      id: keyId,
      key_id: keyId,
      name,
      token_hash: tokenHash,
      token_preview: tokenPreview,
      scopes: normalizedScopes,
      request_count: 0,
      last_used_at: null,
      created_at: now
    });
    return { keyId, token, tokenPreview, name, scopes: normalizedScopes, created_at: now };
  }

  async deleteApiKey(keyId) {
    await this.db.collection('api_keys').deleteOne({ $or: [{ key_id: keyId }, { id: keyId }] });
    this.apiKeyCache.clear();
  }

  async verifyApiKey(token) {
    const tokenHash = hashApiKey(token);
    const cached = this.apiKeyCache.get(tokenHash);
    if (cached !== undefined) return clone(cached);

    const row = await this.db.collection('api_keys').findOne(
      { token_hash: tokenHash },
      { projection: { _id: 0, key_id: 1, name: 1, scopes: 1 } }
    );
    const data = row
      ? { keyId: row.key_id || null, name: row.name, scopes: normalizeApiKeyScopes(row.scopes) }
      : null;
    this.apiKeyCache.set(
      tokenHash,
      data,
      data ? API_KEY_CACHE_TTL_MS : API_KEY_NEGATIVE_CACHE_TTL_MS
    );
    return clone(data);
  }

  async getApiKeys() {
    const rows = await this.db.collection('api_keys')
      .find({}, { projection: { _id: 0, token_hash: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    return rows.map((row) => ({
      keyId: row.key_id,
      name: row.name,
      tokenPreview: row.token_preview,
      scopes: normalizeApiKeyScopes(row.scopes),
      request_count: row.request_count || 0,
      last_used_at: row.last_used_at || null,
      created_at: row.created_at
    }));
  }

  async loadSettings() {
    const row = await this.db.collection('settings').findOne({ key: 'runtime' });
    return row?.value ? clone(row.value) : null;
  }

  async saveSettings(value) {
    await this.db.collection('settings').updateOne(
      { key: 'runtime' },
      { $set: { key: 'runtime', value: clone(value), updated_at: Date.now() } },
      { upsert: true }
    );
  }

  async listAutomationRules() {
    return this.db.collection('automation_rules')
      .find({}, { projection: { _id: 0 } })
      .sort({ updated_at: -1 })
      .toArray();
  }

  async getAutomationRule(id) {
    return this.db.collection('automation_rules').findOne({ id }, { projection: { _id: 0 } });
  }

  async saveAutomationRule(rule) {
    await this.db.collection('automation_rules').replaceOne({ id: rule.id }, clone(rule), { upsert: true });
    return clone(rule);
  }

  async deleteAutomationRule(id) {
    const result = await this.db.collection('automation_rules').deleteOne({ id });
    return result.deletedCount > 0;
  }

  async recordAutomationRuleRun(id, timestamp) {
    return this.db.collection('automation_rules').updateOne(
      { id },
      { $set: { last_triggered_at: timestamp } }
    );
  }

  async listAutomationScenes() {
    return this.db.collection('automation_scenes')
      .find({}, { projection: { _id: 0 } })
      .sort({ updated_at: -1 })
      .toArray();
  }

  async getAutomationScene(id) {
    return this.db.collection('automation_scenes').findOne({ id }, { projection: { _id: 0 } });
  }

  async saveAutomationScene(scene) {
    await this.db.collection('automation_scenes').replaceOne({ id: scene.id }, clone(scene), { upsert: true });
    return clone(scene);
  }

  async deleteAutomationScene(id) {
    const result = await this.db.collection('automation_scenes').deleteOne({ id });
    return result.deletedCount > 0;
  }

  async saveAutomationRun(run) {
    await this.db.collection('automation_runs').insertOne(clone(run));
    return clone(run);
  }

  async listAutomationRuns(limit = 50) {
    return this.db.collection('automation_runs')
      .find({}, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
      .toArray();
  }
}

class MemoryDatabase {
  constructor() {
    this.devices = new Map();
    this.sensorData = [];
    this.relayLogs = [];
    this.apiKeys = new Map();
    this.automationRules = new Map();
    this.automationScenes = new Map();
    this.automationRuns = [];
    this.settings = null;
    this.apiKeyCache = new BoundedTtlCache({
      maxEntries: API_KEY_CACHE_MAX_ENTRIES,
      ttlMs: API_KEY_CACHE_TTL_MS
    });
    this.db = { collection: () => null };
  }

  async open() {}
  async initialize() {}
  async ping() { return true; }
  async close() { this.apiKeyCache.clear(); }

  async syncDevices(configDevices) {
    for (const device of configDevices || []) {
      const existing = this.devices.get(device.id) || {
        id: device.id,
        online_status: 'offline',
        last_active: null,
        created_at: Date.now()
      };
      let type = 'combo';
      if (device.topics?.temp && !device.relays) type = 'sensor';
      if (!device.topics?.temp && device.relays) type = 'relay';
      this.devices.set(device.id, { ...existing, name: device.name, type });
    }
  }

  async saveSensorData(deviceId, temp, hum) {
    const now = Date.now();
    this.sensorData.push({ device_id: deviceId, temp, hum, created_at: now });
    const device = this.devices.get(deviceId);
    if (device) this.devices.set(deviceId, { ...device, online_status: 'online', last_active: now });
  }

  async getSensorHistory(deviceId, limit = 100, range = null) {
    const duration = { '1h': 3600000, '24h': 86400000, '7d': 604800000 }[range];
    const cutoff = duration ? Date.now() - duration : 0;
    const max = duration ? 500 : Math.min(500, Math.max(1, Number(limit) || 100));
    return this.sensorData.filter((row) => row.device_id === deviceId && row.created_at >= cutoff).slice(-max).map(clone);
  }

  async cleanOldData(retentionDays) {
    if (!retentionDays || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 86400000;
    const before = this.sensorData.length + this.relayLogs.length;
    this.sensorData = this.sensorData.filter((row) => row.created_at >= cutoff);
    this.relayLogs = this.relayLogs.filter((row) => row.created_at >= cutoff);
    return before - this.sensorData.length - this.relayLogs.length;
  }

  async saveRelayLog(deviceId, relayId, status, triggeredBy = 'system') {
    const now = Date.now();
    this.relayLogs.push({ device_id: deviceId, relay_id: relayId, status, triggered_by: triggeredBy, created_at: now });
    const device = this.devices.get(deviceId);
    if (device) this.devices.set(deviceId, { ...device, online_status: 'online', last_active: now });
  }

  async updateDeviceStatus(deviceId, status) {
    const device = this.devices.get(deviceId);
    if (device) this.devices.set(deviceId, { ...device, online_status: status, last_active: Date.now() });
  }

  async getDevices() { return Array.from(this.devices.values(), clone); }

  async addApiKey(name, scopes = DEFAULT_API_KEY_SCOPES) {
    const token = `sk_mqttapi_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashApiKey(token);
    const keyId = createApiKeyId(tokenHash);
    const row = {
      id: keyId,
      key_id: keyId,
      name,
      token_hash: tokenHash,
      token_preview: createApiKeyPreview(token),
      scopes: normalizeApiKeyScopes(scopes),
      request_count: 0,
      last_used_at: null,
      created_at: Date.now()
    };
    this.apiKeys.set(keyId, row);
    return { keyId, token, tokenPreview: row.token_preview, name, scopes: row.scopes, created_at: row.created_at };
  }

  async deleteApiKey(keyId) { this.apiKeys.delete(keyId); this.apiKeyCache.clear(); }

  async verifyApiKey(token) {
    const tokenHash = hashApiKey(token);
    const row = Array.from(this.apiKeys.values()).find((item) => item.token_hash === tokenHash);
    return row ? { keyId: row.key_id, name: row.name, scopes: clone(row.scopes) } : null;
  }

  async recordApiKeyUsage(keyId) {
    const row = this.apiKeys.get(keyId);
    if (row) {
      row.request_count = (row.request_count || 0) + 1;
      row.last_used_at = Date.now();
    }
  }

  async getApiKeys() {
    return Array.from(this.apiKeys.values())
      .sort((a, b) => b.created_at - a.created_at)
      .map((row) => ({
        keyId: row.key_id,
        name: row.name,
        tokenPreview: row.token_preview,
        scopes: clone(row.scopes),
        request_count: row.request_count || 0,
        last_used_at: row.last_used_at || null,
        created_at: row.created_at
      }));
  }

  async loadSettings() { return clone(this.settings); }
  async saveSettings(value) { this.settings = clone(value); }

  async listAutomationRules() {
    return Array.from(this.automationRules.values())
      .sort((left, right) => right.updated_at - left.updated_at)
      .map(clone);
  }

  async getAutomationRule(id) { return clone(this.automationRules.get(id) || null); }
  async saveAutomationRule(rule) { this.automationRules.set(rule.id, clone(rule)); return clone(rule); }
  async deleteAutomationRule(id) { return this.automationRules.delete(id); }
  async recordAutomationRuleRun(id, timestamp) {
    const rule = this.automationRules.get(id);
    if (rule) rule.last_triggered_at = timestamp;
  }

  async listAutomationScenes() {
    return Array.from(this.automationScenes.values())
      .sort((left, right) => right.updated_at - left.updated_at)
      .map(clone);
  }

  async getAutomationScene(id) { return clone(this.automationScenes.get(id) || null); }
  async saveAutomationScene(scene) { this.automationScenes.set(scene.id, clone(scene)); return clone(scene); }
  async deleteAutomationScene(id) { return this.automationScenes.delete(id); }

  async saveAutomationRun(run) { this.automationRuns.push(clone(run)); return clone(run); }
  async listAutomationRuns(limit = 50) {
    return this.automationRuns
      .slice()
      .sort((left, right) => right.created_at - left.created_at)
      .slice(0, Math.min(200, Math.max(1, Number(limit) || 50)))
      .map(clone);
  }
}

let dbInstance = null;

function getDatabase(uri = process.env.IOT_MONGODB_URI || process.env.MONGODB_URI) {
  if (!dbInstance) {
    dbInstance = process.env.IOT_STORAGE_DRIVER === 'memory'
      ? new MemoryDatabase()
      : new Database(uri);
  }
  return dbInstance;
}

module.exports = {
  Database,
  MemoryDatabase,
  DEFAULT_API_KEY_SCOPES,
  getDatabase,
  normalizeLegacyApiKeyRow,
  normalizeApiKeyScopes
};
