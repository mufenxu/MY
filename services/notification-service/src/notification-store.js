const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { createPayloadProtector } = require('./history-crypto');

function normalizePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), maximum);
}

function serializeDocument(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDocument);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['_id', 'encryptedPayload', 'expiresAt'].includes(key))
    .map(([key, nested]) => [key, serializeDocument(nested)]));
}

function percentile95(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function summarize(rows, since) {
  const windowRows = rows.filter((row) => new Date(row.startedAt).getTime() >= since.getTime());
  const success = windowRows.filter((row) => row.status === 'success').length;
  const failed = windowRows.filter((row) => row.status === 'failed').length;
  const pending = windowRows.filter((row) => row.status === 'pending').length;
  const completed = success + failed;
  return {
    windowHours: 24,
    total: windowRows.length,
    success,
    failed,
    pending,
    successRate: completed ? Math.round((success / completed) * 1000) / 10 : null,
    p95DurationMs: percentile95(windowRows.map((row) => row.durationMs)),
    lastSuccessAt: rows.find((row) => row.status === 'success')?.completedAt || null,
    lastFailureAt: rows.find((row) => row.status === 'failed')?.completedAt || null,
  };
}

function matchesFilters(row, filters) {
  return (!filters.status || row.status === filters.status)
    && (!filters.caller || row.caller === filters.caller)
    && (!filters.msgType || row.msgType === filters.msgType);
}

function createMemoryNotificationStore({ encryptionKey, retentionDays = 30, now = () => new Date() } = {}) {
  const protector = createPayloadProtector(encryptionKey);
  const rows = [];

  function prune() {
    const cutoff = now().getTime() - retentionDays * 86400000;
    while (rows.at(-1) && new Date(rows.at(-1).startedAt).getTime() < cutoff) rows.pop();
  }

  return {
    async createDelivery(input) {
      prune();
      const startedAt = now();
      const row = {
        id: crypto.randomUUID(),
        status: 'pending',
        durationMs: null,
        completedAt: null,
        errorCode: '',
        errorMessage: '',
        wecomCode: null,
        ...input,
        startedAt,
        encryptedPayload: protector.encrypt(input.payload),
        expiresAt: new Date(startedAt.getTime() + retentionDays * 86400000),
      };
      delete row.payload;
      rows.unshift(row);
      return serializeDocument(row);
    },
    async completeDelivery(id, update) {
      const row = rows.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, update, { completedAt: update.completedAt || now() });
      return serializeDocument(row);
    },
    async listDeliveries(filters = {}) {
      prune();
      const page = normalizePositiveInteger(filters.page, 1, 100000);
      const pageSize = normalizePositiveInteger(filters.pageSize, 20, 100);
      const filtered = rows.filter((row) => matchesFilters(row, filters));
      const offset = (page - 1) * pageSize;
      return { items: filtered.slice(offset, offset + pageSize).map(serializeDocument), page, pageSize, total: filtered.length };
    },
    async getOverview() {
      prune();
      return {
        ...summarize(rows, new Date(now().getTime() - 86400000)),
        lastDelivery: rows[0] ? serializeDocument(rows[0]) : null,
      };
    },
    async getRetryDelivery(id) {
      const row = rows.find((item) => item.id === id);
      if (!row) return null;
      return { delivery: serializeDocument(row), payload: protector.decrypt(row.encryptedPayload) };
    },
    async ping() { return true; },
    async close() {},
  };
}

async function createMongoNotificationStore({
  uri,
  databaseName = 'notification_app',
  encryptionKey,
  retentionDays = 30,
} = {}) {
  if (!uri) throw new Error('NOTIFICATION_MONGODB_URI is required.');
  const protector = createPayloadProtector(encryptionKey);
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const deliveries = db.collection('notification_deliveries');
  await Promise.all([
    deliveries.createIndex({ id: 1 }, { unique: true }),
    deliveries.createIndex({ startedAt: -1 }),
    deliveries.createIndex({ status: 1, startedAt: -1 }),
    deliveries.createIndex({ caller: 1, startedAt: -1 }),
    deliveries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  return {
    async createDelivery(input) {
      const startedAt = new Date();
      const row = {
        id: crypto.randomUUID(),
        status: 'pending',
        durationMs: null,
        completedAt: null,
        errorCode: '',
        errorMessage: '',
        wecomCode: null,
        ...input,
        startedAt,
        encryptedPayload: protector.encrypt(input.payload),
        expiresAt: new Date(startedAt.getTime() + retentionDays * 86400000),
      };
      delete row.payload;
      await deliveries.insertOne(row);
      return serializeDocument(row);
    },
    async completeDelivery(id, update) {
      const normalized = {
        ...update,
        completedAt: update.completedAt ? new Date(update.completedAt) : new Date(),
      };
      return serializeDocument(await deliveries.findOneAndUpdate({ id }, { $set: normalized }, { returnDocument: 'after' }));
    },
    async listDeliveries(filters = {}) {
      const page = normalizePositiveInteger(filters.page, 1, 100000);
      const pageSize = normalizePositiveInteger(filters.pageSize, 20, 100);
      const query = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.caller ? { caller: filters.caller } : {}),
        ...(filters.msgType ? { msgType: filters.msgType } : {}),
      };
      const [items, total] = await Promise.all([
        deliveries.find(query, { projection: { _id: 0, encryptedPayload: 0, expiresAt: 0 } })
          .sort({ startedAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .toArray(),
        deliveries.countDocuments(query),
      ]);
      return { items: items.map(serializeDocument), page, pageSize, total };
    },
    async getOverview() {
      const since = new Date(Date.now() - 86400000);
      const [recent, lastDelivery] = await Promise.all([
        deliveries.find({ startedAt: { $gte: since } }, { projection: { status: 1, durationMs: 1, startedAt: 1, completedAt: 1 } })
          .sort({ startedAt: -1 }).limit(10000).toArray(),
        deliveries.findOne({}, { projection: { _id: 0, encryptedPayload: 0, expiresAt: 0 }, sort: { startedAt: -1 } }),
      ]);
      return { ...summarize(recent, since), lastDelivery: lastDelivery ? serializeDocument(lastDelivery) : null };
    },
    async getRetryDelivery(id) {
      const row = await deliveries.findOne({ id });
      if (!row) return null;
      return { delivery: serializeDocument(row), payload: protector.decrypt(row.encryptedPayload) };
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { await client.close(); },
  };
}

module.exports = {
  createMemoryNotificationStore,
  createMongoNotificationStore,
  percentile95,
};
