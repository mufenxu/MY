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

function paged(items, filters = {}, maximum = 100) {
  const page = normalizePositiveInteger(filters.page, 1, 100000);
  const pageSize = normalizePositiveInteger(filters.pageSize, 20, maximum);
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize).map(serializeDocument), page, pageSize, total: items.length };
}

function activeJobStatus(status) {
  return ['scheduled', 'retrying', 'processing'].includes(status);
}

function createMemoryNotificationStore({ encryptionKey, retentionDays = 30, now = () => new Date() } = {}) {
  const protector = createPayloadProtector(encryptionKey);
  const rows = [];
  const templates = [];
  const jobs = [];
  const preferences = new Map();

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
    async listTemplates() {
      return templates.map(serializeDocument);
    },
    async getTemplate(key) {
      return serializeDocument(templates.find((item) => item.key === key) || null);
    },
    async saveTemplate(input) {
      const timestamp = now();
      const existing = templates.find((item) => item.key === input.key);
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else templates.push({ id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp });
      return serializeDocument(templates.find((item) => item.key === input.key));
    },
    async deleteTemplate(key) {
      const index = templates.findIndex((item) => item.key === key);
      if (index < 0) return false;
      templates.splice(index, 1);
      return true;
    },
    async createNotificationJob(input) {
      const timestamp = now();
      if (input.dedupeKey) {
        const duplicate = jobs.find((item) => item.dedupeKey === input.dedupeKey
          && new Date(item.dedupeUntil || 0) > timestamp
          && (activeJobStatus(item.status) || item.status === 'sent'));
        if (duplicate) return { job: serializeDocument(duplicate), deduplicated: true };
      }
      const row = {
        id: crypto.randomUUID(),
        status: 'scheduled',
        attempts: 0,
        lastError: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        scheduledAt: new Date(input.scheduledAt || timestamp),
        dedupeUntil: new Date(timestamp.getTime() + Number(input.dedupeWindowMs || 300000)),
        ...input,
        encryptedPayload: protector.encrypt(input.payload),
      };
      delete row.payload;
      jobs.unshift(row);
      return { job: serializeDocument(row), deduplicated: false };
    },
    async claimDueNotificationJobs(limit = 20) {
      const timestamp = now();
      return jobs
        .filter((item) => ['scheduled', 'retrying'].includes(item.status) && new Date(item.scheduledAt) <= timestamp)
        .sort((left, right) => new Date(left.scheduledAt) - new Date(right.scheduledAt))
        .slice(0, limit)
        .map((item) => {
          Object.assign(item, { status: 'processing', attempts: item.attempts + 1, updatedAt: timestamp });
          return { ...serializeDocument(item), payload: protector.decrypt(item.encryptedPayload) };
        });
    },
    async updateNotificationJob(id, update) {
      const row = jobs.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, update, { updatedAt: now() });
      return serializeDocument(row);
    },
    async cancelNotificationJob(id) {
      const row = jobs.find((item) => item.id === id);
      if (!row || !['scheduled', 'retrying'].includes(row.status)) return null;
      Object.assign(row, { status: 'cancelled', updatedAt: now() });
      return serializeDocument(row);
    },
    async listNotificationJobs(filters = {}) {
      const filtered = jobs.filter((item) => (!filters.status || item.status === filters.status)
        && (!filters.caller || item.caller === filters.caller));
      return paged(filtered, filters);
    },
    async getRecipientPreference(targetId) {
      return serializeDocument(preferences.get(targetId) || null);
    },
    async saveRecipientPreference(targetId, input) {
      const timestamp = now();
      const row = { targetId, enabled: true, quietHours: null, timezoneOffsetMinutes: 480, ...input, updatedAt: timestamp };
      preferences.set(targetId, row);
      return serializeDocument(row);
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
  const templates = db.collection('notification_templates');
  const jobs = db.collection('notification_jobs');
  const preferences = db.collection('notification_preferences');
  await Promise.all([
    deliveries.createIndex({ id: 1 }, { unique: true }),
    deliveries.createIndex({ startedAt: -1 }),
    deliveries.createIndex({ status: 1, startedAt: -1 }),
    deliveries.createIndex({ caller: 1, startedAt: -1 }),
    deliveries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    templates.createIndex({ key: 1 }, { unique: true }),
    templates.createIndex({ updatedAt: -1 }),
    jobs.createIndex({ id: 1 }, { unique: true }),
    jobs.createIndex({ status: 1, scheduledAt: 1 }),
    jobs.createIndex({ dedupeKey: 1, dedupeUntil: -1 }, { sparse: true }),
    jobs.createIndex({ createdAt: -1 }),
    preferences.createIndex({ targetId: 1 }, { unique: true }),
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
    async listTemplates() {
      return (await templates.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray()).map(serializeDocument);
    },
    async getTemplate(key) {
      return serializeDocument(await templates.findOne({ key }, { projection: { _id: 0 } }));
    },
    async saveTemplate(input) {
      const timestamp = new Date();
      return serializeDocument(await templates.findOneAndUpdate(
        { key: input.key },
        { $set: { ...input, updatedAt: timestamp }, $setOnInsert: { id: crypto.randomUUID(), createdAt: timestamp } },
        { upsert: true, returnDocument: 'after', projection: { _id: 0 } },
      ));
    },
    async deleteTemplate(key) {
      return (await templates.deleteOne({ key })).deletedCount === 1;
    },
    async createNotificationJob(input) {
      const timestamp = new Date();
      if (input.dedupeKey) {
        const duplicate = await jobs.findOne({
          dedupeKey: input.dedupeKey,
          dedupeUntil: { $gt: timestamp },
          status: { $in: ['scheduled', 'retrying', 'processing', 'sent'] },
        }, { projection: { _id: 0, encryptedPayload: 0 } });
        if (duplicate) return { job: serializeDocument(duplicate), deduplicated: true };
      }
      const row = {
        id: crypto.randomUUID(),
        status: 'scheduled',
        attempts: 0,
        lastError: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        scheduledAt: new Date(input.scheduledAt || timestamp),
        dedupeUntil: new Date(timestamp.getTime() + Number(input.dedupeWindowMs || 300000)),
        ...input,
        encryptedPayload: protector.encrypt(input.payload),
      };
      delete row.payload;
      await jobs.insertOne(row);
      return { job: serializeDocument(row), deduplicated: false };
    },
    async claimDueNotificationJobs(limit = 20) {
      const claimed = [];
      const timestamp = new Date();
      for (let index = 0; index < limit; index += 1) {
        const row = await jobs.findOneAndUpdate(
          { status: { $in: ['scheduled', 'retrying'] }, scheduledAt: { $lte: timestamp } },
          { $set: { status: 'processing', updatedAt: timestamp }, $inc: { attempts: 1 } },
          { sort: { scheduledAt: 1 }, returnDocument: 'after' },
        );
        if (!row) break;
        claimed.push({ ...serializeDocument(row), payload: protector.decrypt(row.encryptedPayload) });
      }
      return claimed;
    },
    async updateNotificationJob(id, update) {
      return serializeDocument(await jobs.findOneAndUpdate(
        { id }, { $set: { ...update, updatedAt: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, encryptedPayload: 0 } },
      ));
    },
    async cancelNotificationJob(id) {
      return serializeDocument(await jobs.findOneAndUpdate(
        { id, status: { $in: ['scheduled', 'retrying'] } },
        { $set: { status: 'cancelled', updatedAt: new Date() } },
        { returnDocument: 'after', projection: { _id: 0, encryptedPayload: 0 } },
      ));
    },
    async listNotificationJobs(filters = {}) {
      const page = normalizePositiveInteger(filters.page, 1, 100000);
      const pageSize = normalizePositiveInteger(filters.pageSize, 20, 100);
      const query = {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.caller ? { caller: filters.caller } : {}),
      };
      const [items, total] = await Promise.all([
        jobs.find(query, { projection: { _id: 0, encryptedPayload: 0 } }).sort({ createdAt: -1 })
          .skip((page - 1) * pageSize).limit(pageSize).toArray(),
        jobs.countDocuments(query),
      ]);
      return { items: items.map(serializeDocument), page, pageSize, total };
    },
    async getRecipientPreference(targetId) {
      return serializeDocument(await preferences.findOne({ targetId }, { projection: { _id: 0 } }));
    },
    async saveRecipientPreference(targetId, input) {
      return serializeDocument(await preferences.findOneAndUpdate(
        { targetId },
        { $set: { targetId, enabled: true, quietHours: null, timezoneOffsetMinutes: 480, ...input, updatedAt: new Date() } },
        { upsert: true, returnDocument: 'after', projection: { _id: 0 } },
      ));
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
