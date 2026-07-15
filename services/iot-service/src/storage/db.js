const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

function parseStoredScopes(value) {
  if (!value) {
    return Array.from(DEFAULT_API_KEY_SCOPES);
  }

  try {
    return normalizeApiKeyScopes(JSON.parse(value));
  } catch (error) {
    return Array.from(DEFAULT_API_KEY_SCOPES);
  }
}

function hashApiKey(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createApiKeyPreview(token) {
  const value = String(token);
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 14)}...${value.slice(-6)}`;
}

function createApiKeyId(seed = '') {
  const source = String(seed || crypto.randomBytes(12).toString('hex'));
  return `key_${source.slice(0, 24)}`;
}

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.apiKeyCache = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          return reject(err);
        }
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          return reject(err);
        }

        this.db = null;
        resolve();
      });
    });
  }

  async initialize() {
    await this.open();

    // 启用 WAL (Write-Ahead Logging) 模式以支持并发读写，防止高频传感器写入导致表锁冲突
    try {
      await this.run('PRAGMA journal_mode=WAL');
    } catch (e) {
      console.error('Failed to set journal_mode to WAL:', e.message);
    }

    // 1. 创建 devices 表
    await this.run(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        online_status TEXT DEFAULT 'offline',
        last_active INTEGER,
        created_at INTEGER
      )
    `);

    // 2. 创建 sensor_data 表
    await this.run(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        temp REAL,
        hum REAL,
        created_at INTEGER,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      )
    `);
    
    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_sensor_data_device_time 
      ON sensor_data(device_id, created_at)
    `);

    // 3. 创建 relay_logs 表
    await this.run(`
      CREATE TABLE IF NOT EXISTS relay_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        relay_id TEXT NOT NULL,
        status TEXT NOT NULL,
        triggered_by TEXT,
        created_at INTEGER,
        FOREIGN KEY(device_id) REFERENCES devices(id)
      )
    `);

    // 4. 创建 api_keys 授权密钥表
    await this.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        request_count INTEGER DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER
      )
    `);

    // 针对旧表的平滑兼容升级
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN request_count INTEGER DEFAULT 0`);
    } catch (e) {
      // 字段已存在则会抛错，此处安全忽略
    }
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN last_used_at INTEGER`);
    } catch (e) {
      // 安全忽略
    }
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN key_id TEXT`);
    } catch (e) {
      // 安全忽略
    }
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN token_hash TEXT`);
    } catch (e) {
      // 安全忽略
    }
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN token_preview TEXT`);
    } catch (e) {
      // 安全忽略
    }
    try {
      await this.run(`ALTER TABLE api_keys ADD COLUMN scopes TEXT`);
    } catch (e) {
      // 安全忽略
    }

    await this.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_id
      ON api_keys(key_id)
    `);

    await this.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_token_hash
      ON api_keys(token_hash)
    `);

    await this.migrateApiKeys();
  }

  async migrateApiKeys() {
    const rows = await this.all(`
      SELECT id, key_id, token_hash, token_preview, scopes
      FROM api_keys
    `);

    for (const row of rows) {
      const previousId = row.id;
      const tokenHash = row.token_hash || hashApiKey(previousId);
      const keyId = row.key_id || (previousId.startsWith('key_') ? previousId : createApiKeyId(tokenHash));
      const tokenPreview = row.token_preview || createApiKeyPreview(previousId);
      const scopes = JSON.stringify(parseStoredScopes(row.scopes));

      const nextId = previousId.startsWith('key_') ? previousId : keyId;

      await this.run(`
        UPDATE api_keys
        SET id = ?, key_id = ?, token_hash = ?, token_preview = ?, scopes = ?
        WHERE id = ?
      `, [nextId, keyId, tokenHash, tokenPreview, scopes, previousId]);
    }
  }

  // 记录 API Key 审计与活跃状态
  async recordApiKeyUsage(keyId) {
    const now = Date.now();
    return this.run(`
      UPDATE api_keys 
      SET request_count = COALESCE(request_count, 0) + 1, last_used_at = ? 
      WHERE key_id = ? OR id = ?
    `, [now, keyId, keyId]);
  }

  // 同步配置里的设备信息到数据库中
  async syncDevices(configDevices) {
    const now = Date.now();
    for (const device of configDevices) {
      // 确定设备类型
      let type = 'combo';
      if (device.topics.temp && !device.relays) type = 'sensor';
      if (!device.topics.temp && device.relays) type = 'relay';

      await this.run(`
        INSERT INTO devices (id, name, type, online_status, last_active, created_at)
        VALUES (?, ?, ?, 'offline', NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type
      `, [device.id, device.name, type, now]);
    }
  }

  // 记录传感器温湿度
  async saveSensorData(deviceId, temp, hum) {
    const now = Date.now();
    await this.run(`
      INSERT INTO sensor_data (device_id, temp, hum, created_at)
      VALUES (?, ?, ?, ?)
    `, [deviceId, temp, hum, now]);

    await this.run(`
      UPDATE devices 
      SET online_status = 'online', last_active = ?
      WHERE id = ?
    `, [now, deviceId]);
  }

  // 获取传感器温湿度历史数据 (支持可选的 range 时间区间过滤)
  async getSensorHistory(deviceId, limit = 100, range = null) {
    let query = `SELECT temp, hum, created_at FROM sensor_data WHERE device_id = ?`;
    const params = [deviceId];

    if (range) {
      const now = Date.now();
      let duration = 0;
      if (range === '1h') duration = 60 * 60 * 1000;
      else if (range === '24h') duration = 24 * 60 * 60 * 1000;
      else if (range === '7d') duration = 7 * 24 * 60 * 60 * 1000;

      if (duration > 0) {
        query += ` AND created_at >= ?`;
        params.push(now - duration);
      }
      query += ` ORDER BY created_at DESC LIMIT 500`; // 限制最大 500 条防性能雪崩
    } else {
      query += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);
    }

    const rows = await this.all(query, params);
    return rows.reverse();
  }

  // 手动/定时清理历史过期数据并释放整理磁盘文件 (Vacuum)
  async cleanOldData(retentionDays) {
    if (!retentionDays || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    
    const res1 = await this.run(`DELETE FROM sensor_data WHERE created_at < ?`, [cutoff]);
    const res2 = await this.run(`DELETE FROM relay_logs WHERE created_at < ?`, [cutoff]);
    
    // 执行物理体积压缩收缩
    try {
      await this.run(`VACUUM`);
    } catch (e) {
      console.error('SQLite VACUUM failed:', e.message);
    }

    return (res1.changes || 0) + (res2.changes || 0);
  }

  // 记录继电器变动
  async saveRelayLog(deviceId, relayId, status, triggeredBy = 'system') {
    const now = Date.now();
    await this.run(`
      INSERT INTO relay_logs (device_id, relay_id, status, triggered_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [deviceId, relayId, status, triggeredBy, now]);

    await this.run(`
      UPDATE devices 
      SET online_status = 'online', last_active = ?
      WHERE id = ?
    `, [now, deviceId]);
  }

  // 更新设备在线状态
  async updateDeviceStatus(deviceId, status) {
    const now = Date.now();
    await this.run(`
      UPDATE devices 
      SET online_status = ?, last_active = ?
      WHERE id = ?
    `, [status, now, deviceId]);
  }

  // 获取所有设备数据
  async getDevices() {
    return this.all(`SELECT * FROM devices`);
  }

  // 增加 API Key
  async addApiKey(name, scopes = DEFAULT_API_KEY_SCOPES) {
    const normalizedScopes = normalizeApiKeyScopes(scopes);
    const token = 'sk_mqttapi_' + crypto.randomBytes(24).toString('hex');
    const tokenHash = hashApiKey(token);
    const keyId = createApiKeyId(tokenHash);
    const tokenPreview = createApiKeyPreview(token);
    const now = Date.now();
    await this.run(`
      INSERT INTO api_keys (id, key_id, name, token_hash, token_preview, scopes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [keyId, keyId, name, tokenHash, tokenPreview, JSON.stringify(normalizedScopes), now]);
    return {
      keyId,
      token,
      tokenPreview,
      name,
      scopes: normalizedScopes,
      created_at: now
    };
  }

  // 删除 API Key
  async deleteApiKey(keyId) {
    await this.run(`DELETE FROM api_keys WHERE key_id = ? OR id = ?`, [keyId, keyId]);
    // 吊销或删除密钥后，清空内存鉴权缓存以确保安全性与数据实时一致性
    this.apiKeyCache.clear();
  }

  // 验证 API Key 是否合法
  async verifyApiKey(token) {
    const tokenHash = hashApiKey(token);
    const now = Date.now();

    // 优先读取内存中的有效验证缓存 (60秒过期，大幅降低高频并发下的磁盘数据库I/O)
    const cached = this.apiKeyCache.get(tokenHash);
    if (cached && now - cached.timestamp < 60000) {
      return cached.data;
    }

    const row = await this.get(`
      SELECT key_id, name, scopes
      FROM api_keys
      WHERE token_hash = ?
    `, [tokenHash]);

    const data = row ? {
      keyId: row.key_id || null,
      name: row.name,
      scopes: parseStoredScopes(row.scopes)
    } : null;

    // 将验证结果（无论合法还是不合法）写入内存缓存，防止暴力撞库等对数据库进行压力攻击
    this.apiKeyCache.set(tokenHash, {
      data,
      timestamp: now
    });

    return data;
  }

  // 获取所有 API Key 列表
  async getApiKeys() {
    const rows = await this.all(`
      SELECT key_id, name, token_preview, scopes, request_count, last_used_at, created_at
      FROM api_keys
      ORDER BY created_at DESC
    `);

    return rows.map((row) => ({
      keyId: row.key_id,
      name: row.name,
      tokenPreview: row.token_preview,
      scopes: parseStoredScopes(row.scopes),
      request_count: row.request_count,
      last_used_at: row.last_used_at,
      created_at: row.created_at
    }));
  }
}

let dbInstance = null;

function getDatabase(dbPath) {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
  }
  return dbInstance;
}

module.exports = {
  Database,
  DEFAULT_API_KEY_SCOPES,
  getDatabase,
  normalizeApiKeyScopes
};
