const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { createPayloadProtector } = require('./history-crypto');
const { createApiCredential, hashApiToken } = require('./api-access');

function normalizePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), maximum);
}

function serializeDocument(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDocument);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => ![
      '_id',
      'dedupeReservationId',
      'dedupeScopeKey',
      'encryptedPayload',
      'expiresAt',
      'leaseId',
      'pendingStatus',
      'tokenHash',
    ].includes(key))
    .map(([key, nested]) => [key, serializeDocument(nested)]));
}

const TERMINAL_JOB_STATUSES = new Set(['sent', 'failed', 'cancelled', 'suppressed']);

function createDedupeScopeKey(input) {
  if (!input.dedupeKey) return '';
  const targetValue = String(input.targetValue || '').split('|').map((item) => item.trim()).filter(Boolean).sort().join('|');
  return crypto.createHash('sha256').update(JSON.stringify([
    String(input.caller || ''),
    String(input.apiClientId || ''),
    String(input.targetType || ''),
    targetValue,
    String(input.dedupeKey),
  ])).digest('hex');
}

function applyMemoryJobUpdate(row, update, timestamp, retentionDays) {
  Object.assign(row, update, { updatedAt: timestamp });
  if (update.status && update.status !== 'processing') {
    delete row.leaseId;
    delete row.lockedUntil;
    delete row.workerId;
  }
  if (TERMINAL_JOB_STATUSES.has(update.status)) {
    row.terminalAt = update.terminalAt ? new Date(update.terminalAt) : timestamp;
    row.expiresAt = update.expiresAt
      ? new Date(update.expiresAt)
      : new Date(row.terminalAt.getTime() + retentionDays * 86400000);
  } else if (update.status) {
    delete row.terminalAt;
    delete row.expiresAt;
  }
}

function mongoJobMutation(update, timestamp, retentionDays) {
  const set = { ...update, updatedAt: timestamp };
  const unset = {};
  if (set.status && set.status !== 'processing') {
    unset.leaseId = '';
    unset.lockedUntil = '';
    unset.workerId = '';
  }
  if (TERMINAL_JOB_STATUSES.has(set.status)) {
    set.terminalAt = set.terminalAt ? new Date(set.terminalAt) : timestamp;
    set.expiresAt = set.expiresAt
      ? new Date(set.expiresAt)
      : new Date(set.terminalAt.getTime() + retentionDays * 86400000);
  } else if (set.status) {
    unset.terminalAt = '';
    unset.expiresAt = '';
  }
  return {
    $set: set,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
}

function serializeApiKey(value) {
  if (!value) return null;
  return {
    id: value.id,
    tokenPrefix: value.tokenPrefix,
    createdAt: serializeDocument(value.createdAt),
    expiresAt: serializeDocument(value.expiresAt),
    revokedAt: serializeDocument(value.revokedAt),
    lastUsedAt: serializeDocument(value.lastUsedAt),
    requestCount: Number(value.requestCount || 0),
    createdBy: value.createdBy || '',
  };
}

function serializeApiClient(value, keys = []) {
  if (!value) return null;
  return {
    id: value.id,
    name: value.name,
    description: value.description || '',
    status: value.status || 'active',
    scopes: [...(value.scopes || [])],
    rateLimitPerMinute: Number(value.rateLimitPerMinute || 60),
    expiresAt: serializeDocument(value.expiresAt),
    createdAt: serializeDocument(value.createdAt),
    updatedAt: serializeDocument(value.updatedAt),
    revokedAt: serializeDocument(value.revokedAt),
    createdBy: value.createdBy || '',
    updatedBy: value.updatedBy || '',
    keys: keys.map(serializeApiKey).filter(Boolean),
  };
}

function apiRequestMatches(row, filters = {}) {
  return (!filters.clientId || row.clientId === filters.clientId)
    && (!filters.outcome || row.outcome === filters.outcome)
    && (!filters.endpoint || row.endpoint === filters.endpoint);
}

function summarizeApiAccess(clients, keys, requests, since) {
  const recent = requests.filter((row) => new Date(row.startedAt) >= since);
  const successful = recent.filter((row) => Number(row.httpStatus) >= 200 && Number(row.httpStatus) < 400).length;
  const referenceTime = new Date(since.getTime() + 86400000);
  return {
    windowHours: 24,
    activeClients: clients.filter((row) => row.status === 'active' && (!row.expiresAt || new Date(row.expiresAt) > referenceTime)).length,
    activeKeys: keys.filter((row) => !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt) > referenceTime)).length,
    totalRequests: recent.length,
    successRate: recent.length ? Math.round((successful / recent.length) * 1000) / 10 : null,
    p95DurationMs: percentile95(recent.map((row) => row.durationMs)),
  };
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
  const apiClients = [];
  const apiKeys = [];
  const apiRequests = [];
  const dedupeReservations = new Map();

  function prune() {
    const cutoff = now().getTime() - retentionDays * 86400000;
    while (rows.at(-1) && new Date(rows.at(-1).startedAt).getTime() < cutoff) rows.pop();
    const timestamp = now();
    for (let index = jobs.length - 1; index >= 0; index -= 1) {
      if (jobs[index].expiresAt && new Date(jobs[index].expiresAt) <= timestamp) jobs.splice(index, 1);
    }
    for (const [scopeKey, reservation] of dedupeReservations) {
      if (new Date(reservation.expiresAt) <= timestamp || !jobs.some((job) => job.id === reservation.jobId)) {
        dedupeReservations.delete(scopeKey);
      }
    }
  }

  function releaseDedupeReservation(row) {
    if (!row?.dedupeScopeKey) return;
    const reservation = dedupeReservations.get(row.dedupeScopeKey);
    if (reservation?.jobId === row.id) dedupeReservations.delete(row.dedupeScopeKey);
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
      prune();
      const dedupeScopeKey = createDedupeScopeKey(input);
      if (dedupeScopeKey) {
        const reservation = dedupeReservations.get(dedupeScopeKey);
        const duplicate = reservation && new Date(reservation.expiresAt) > timestamp
          ? jobs.find((item) => item.id === reservation.jobId && (activeJobStatus(item.status) || item.status === 'sent'))
          : null;
        if (duplicate) return { job: serializeDocument(duplicate), deduplicated: true };
        if (reservation) dedupeReservations.delete(dedupeScopeKey);
      }
      const status = input.status || 'scheduled';
      const dedupeUntil = new Date(timestamp.getTime() + Number(input.dedupeWindowMs || 300000));
      const row = {
        id: crypto.randomUUID(),
        ...input,
        status,
        attempts: 0,
        lastError: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        scheduledAt: new Date(input.scheduledAt || timestamp),
        dedupeUntil,
        dedupeScopeKey,
        encryptedPayload: protector.encrypt(input.payload),
      };
      delete row.payload;
      if (TERMINAL_JOB_STATUSES.has(status)) applyMemoryJobUpdate(row, { status }, timestamp, retentionDays);
      jobs.unshift(row);
      if (dedupeScopeKey && (activeJobStatus(status) || status === 'sent')) {
        dedupeReservations.set(dedupeScopeKey, { jobId: row.id, expiresAt: dedupeUntil });
      }
      return { job: serializeDocument(row), deduplicated: false };
    },
    async claimDueNotificationJobs(limit = 20, { workerId = 'memory-worker', leaseMs = 120000 } = {}) {
      const timestamp = now();
      prune();
      for (const item of jobs) {
        const leaseExpired = item.status === 'processing' && (!item.lockedUntil || new Date(item.lockedUntil) <= timestamp);
        if (leaseExpired && Number(item.attempts || 0) >= Number(item.maxAttempts || 4)) {
          applyMemoryJobUpdate(item, {
            status: 'failed',
            failedAt: timestamp,
            lastError: item.lastError || 'Notification worker lease expired after the final attempt.',
          }, timestamp, retentionDays);
          releaseDedupeReservation(item);
        }
      }
      return jobs
        .filter((item) => {
          if (['scheduled', 'retrying'].includes(item.status)) return new Date(item.scheduledAt) <= timestamp;
          return item.status === 'processing'
            && (!item.lockedUntil || new Date(item.lockedUntil) <= timestamp)
            && Number(item.attempts || 0) < Number(item.maxAttempts || 4);
        })
        .sort((left, right) => new Date(left.scheduledAt || left.createdAt) - new Date(right.scheduledAt || right.createdAt))
        .slice(0, limit)
        .map((item) => {
          Object.assign(item, {
            status: 'processing',
            attempts: Number(item.attempts || 0) + 1,
            leaseId: crypto.randomUUID(),
            lockedUntil: new Date(timestamp.getTime() + Number(leaseMs || 120000)),
            workerId,
            updatedAt: timestamp,
          });
          return { ...serializeDocument(item), leaseId: item.leaseId, payload: protector.decrypt(item.encryptedPayload) };
        });
    },
    async renewNotificationJobLease(id, { leaseId, workerId, leaseMs = 120000 } = {}) {
      const row = jobs.find((item) => item.id === id);
      if (!row || row.status !== 'processing' || row.leaseId !== leaseId || row.workerId !== workerId) return false;
      row.lockedUntil = new Date(now().getTime() + Number(leaseMs || 120000));
      row.updatedAt = now();
      return true;
    },
    async updateNotificationJob(id, update, { leaseId = '' } = {}) {
      const row = jobs.find((item) => item.id === id);
      if (!row) return null;
      if (leaseId && (row.status !== 'processing' || row.leaseId !== leaseId)) return null;
      applyMemoryJobUpdate(row, update, now(), retentionDays);
      if (['failed', 'cancelled', 'suppressed'].includes(row.status)) releaseDedupeReservation(row);
      return serializeDocument(row);
    },
    async cancelNotificationJob(id) {
      const row = jobs.find((item) => item.id === id);
      if (!row || !['scheduled', 'retrying'].includes(row.status)) return null;
      applyMemoryJobUpdate(row, { status: 'cancelled' }, now(), retentionDays);
      releaseDedupeReservation(row);
      return serializeDocument(row);
    },
    async listNotificationJobs(filters = {}) {
      prune();
      const filtered = jobs.filter((item) => (!filters.status || item.status === filters.status)
        && (!filters.caller || item.caller === filters.caller));
      return paged(filtered, filters);
    },
    async getNotificationQueueOverview() {
      prune();
      const timestamp = now();
      const due = jobs.filter((item) => ['scheduled', 'retrying'].includes(item.status) && new Date(item.scheduledAt) <= timestamp);
      const oldestDueAt = due.reduce((oldest, item) => (!oldest || new Date(item.scheduledAt) < oldest ? new Date(item.scheduledAt) : oldest), null);
      return {
        scheduled: jobs.filter((item) => item.status === 'scheduled').length,
        retrying: jobs.filter((item) => item.status === 'retrying').length,
        processing: jobs.filter((item) => item.status === 'processing').length,
        reserving: 0,
        deadLetter: jobs.filter((item) => item.status === 'failed').length,
        due: due.length,
        expiredLeases: jobs.filter((item) => item.status === 'processing' && (!item.lockedUntil || new Date(item.lockedUntil) <= timestamp)).length,
        oldestDueAt: serializeDocument(oldestDueAt),
        lagMs: oldestDueAt ? Math.max(0, timestamp.getTime() - oldestDueAt.getTime()) : 0,
      };
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
    async createApiClient(input) {
      const timestamp = now();
      const credential = createApiCredential();
      const client = {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description || '',
        status: 'active',
        scopes: [...input.scopes],
        rateLimitPerMinute: input.rateLimitPerMinute,
        expiresAt: input.expiresAt || null,
        createdAt: timestamp,
        updatedAt: timestamp,
        revokedAt: null,
        createdBy: input.actor,
        updatedBy: input.actor,
      };
      const key = {
        id: credential.keyId,
        clientId: client.id,
        tokenHash: credential.tokenHash,
        tokenPrefix: credential.tokenPrefix,
        createdAt: timestamp,
        expiresAt: client.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        requestCount: 0,
        createdBy: input.actor,
      };
      apiClients.unshift(client);
      apiKeys.unshift(key);
      return { client: serializeApiClient(client, [key]), token: credential.token };
    },
    async listApiClients() {
      return apiClients.map((client) => serializeApiClient(client, apiKeys.filter((key) => key.clientId === client.id)));
    },
    async updateApiClient(id, input) {
      const client = apiClients.find((row) => row.id === id);
      if (!client || client.status === 'revoked') return null;
      const previousExpiresAt = client.expiresAt ? new Date(client.expiresAt).getTime() : null;
      for (const key of apiKeys.filter((row) => row.clientId === id && !row.revokedAt)) {
        const keyExpiresAt = key.expiresAt ? new Date(key.expiresAt).getTime() : null;
        if (keyExpiresAt === previousExpiresAt) key.expiresAt = input.expiresAt || null;
      }
      Object.assign(client, {
        name: input.name,
        description: input.description || '',
        scopes: [...input.scopes],
        rateLimitPerMinute: input.rateLimitPerMinute,
        expiresAt: input.expiresAt || null,
        updatedAt: now(),
        updatedBy: input.actor,
      });
      return serializeApiClient(client, apiKeys.filter((key) => key.clientId === client.id));
    },
    async rotateApiClientKey(id, { actor, overlapMinutes }) {
      const client = apiClients.find((row) => row.id === id);
      if (!client || client.status !== 'active') return null;
      const timestamp = now();
      const overlapUntil = new Date(timestamp.getTime() + overlapMinutes * 60000);
      for (const key of apiKeys.filter((row) => row.clientId === id && !row.revokedAt)) {
        if (!key.expiresAt || new Date(key.expiresAt) > overlapUntil) key.expiresAt = overlapUntil;
      }
      const credential = createApiCredential();
      const key = {
        id: credential.keyId,
        clientId: id,
        tokenHash: credential.tokenHash,
        tokenPrefix: credential.tokenPrefix,
        createdAt: timestamp,
        expiresAt: client.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        requestCount: 0,
        createdBy: actor,
      };
      apiKeys.unshift(key);
      Object.assign(client, { updatedAt: timestamp, updatedBy: actor });
      return { client: serializeApiClient(client, apiKeys.filter((row) => row.clientId === id)), token: credential.token };
    },
    async revokeApiClient(id, { actor }) {
      const client = apiClients.find((row) => row.id === id);
      if (!client || client.status === 'revoked') return null;
      const timestamp = now();
      Object.assign(client, { status: 'revoked', revokedAt: timestamp, updatedAt: timestamp, updatedBy: actor });
      for (const key of apiKeys.filter((row) => row.clientId === id && !row.revokedAt)) key.revokedAt = timestamp;
      return serializeApiClient(client, apiKeys.filter((key) => key.clientId === id));
    },
    async verifyApiToken(token) {
      const timestamp = now();
      const key = apiKeys.find((row) => row.tokenHash === hashApiToken(token));
      if (!key || key.revokedAt || (key.expiresAt && new Date(key.expiresAt) <= timestamp)) return null;
      const client = apiClients.find((row) => row.id === key.clientId);
      if (!client || client.status !== 'active' || (client.expiresAt && new Date(client.expiresAt) <= timestamp)) return null;
      key.lastUsedAt = timestamp;
      key.requestCount = Number(key.requestCount || 0) + 1;
      return {
        managed: true,
        clientId: client.id,
        clientName: client.name,
        keyId: key.id,
        scopes: [...client.scopes],
        rateLimitPerMinute: client.rateLimitPerMinute,
      };
    },
    async recordApiRequest(input) {
      const timestamp = input.startedAt ? new Date(input.startedAt) : now();
      const row = {
        id: crypto.randomUUID(),
        ...input,
        startedAt: timestamp,
        expiresAt: new Date(timestamp.getTime() + retentionDays * 86400000),
      };
      apiRequests.unshift(row);
      return serializeDocument(row);
    },
    async listApiRequests(filters = {}) {
      const cutoff = now().getTime() - retentionDays * 86400000;
      while (apiRequests.at(-1) && new Date(apiRequests.at(-1).startedAt).getTime() < cutoff) apiRequests.pop();
      return paged(apiRequests.filter((row) => apiRequestMatches(row, filters)), filters);
    },
    async getApiAccessOverview() {
      return summarizeApiAccess(apiClients, apiKeys, apiRequests, new Date(now().getTime() - 86400000));
    },
    async getApiClientDelivery(id, clientId) {
      return serializeDocument(rows.find((row) => row.id === id && row.apiClientId === clientId) || null);
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
  const apiClients = db.collection('notification_api_clients');
  const apiKeys = db.collection('notification_api_keys');
  const apiRequests = db.collection('notification_api_requests');
  const dedupeReservations = db.collection('notification_job_dedupes');
  await Promise.all([
    deliveries.createIndex({ id: 1 }, { unique: true }),
    deliveries.createIndex({ startedAt: -1 }),
    deliveries.createIndex({ status: 1, startedAt: -1 }),
    deliveries.createIndex({ caller: 1, startedAt: -1 }),
    deliveries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    templates.createIndex({ key: 1 }, { unique: true }),
    templates.createIndex({ updatedAt: -1 }),
    jobs.createIndex({ id: 1 }, { unique: true }),
    jobs.createIndex({ status: 1, scheduledAt: 1, lockedUntil: 1 }),
    jobs.createIndex({ dedupeKey: 1, dedupeUntil: -1 }, { sparse: true }),
    jobs.createIndex({ createdAt: -1 }),
    jobs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    dedupeReservations.createIndex({ scopeKey: 1 }, { unique: true }),
    dedupeReservations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    preferences.createIndex({ targetId: 1 }, { unique: true }),
    apiClients.createIndex({ id: 1 }, { unique: true }),
    apiClients.createIndex({ status: 1, createdAt: -1 }),
    apiKeys.createIndex({ id: 1 }, { unique: true }),
    apiKeys.createIndex({ tokenHash: 1 }, { unique: true }),
    apiKeys.createIndex({ clientId: 1, createdAt: -1 }),
    apiRequests.createIndex({ startedAt: -1 }),
    apiRequests.createIndex({ clientId: 1, startedAt: -1 }),
    apiRequests.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const migrationTimestamp = new Date();
  await jobs.updateMany(
    { status: { $in: [...TERMINAL_JOB_STATUSES] }, expiresAt: { $exists: false } },
    [
      { $set: { terminalAt: { $ifNull: ['$terminalAt', { $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', '$$NOW'] }] }] } } },
      { $set: { expiresAt: { $add: ['$terminalAt', retentionDays * 86400000] } } },
    ],
  );

  // Preserve in-window idempotency for jobs created before scoped dedupe reservations existed.
  const legacyDedupeJobs = jobs.find({
    dedupeKey: { $type: 'string', $ne: '' },
    dedupeUntil: { $gt: migrationTimestamp },
    status: { $in: ['scheduled', 'retrying', 'processing', 'sent'] },
  }, {
    projection: {
      id: 1,
      caller: 1,
      apiClientId: 1,
      targetType: 1,
      targetValue: 1,
      dedupeKey: 1,
      dedupeUntil: 1,
    },
  }).sort({ createdAt: 1 });
  for await (const legacyJob of legacyDedupeJobs) {
    const scopeKey = createDedupeScopeKey(legacyJob);
    await jobs.updateOne({ id: legacyJob.id }, { $set: { dedupeScopeKey: scopeKey } });
    try {
      await dedupeReservations.updateOne(
        { scopeKey },
        {
          $setOnInsert: {
            scopeKey,
            jobId: legacyJob.id,
            reservationId: crypto.randomUUID(),
            createdAt: migrationTimestamp,
            updatedAt: migrationTimestamp,
            expiresAt: new Date(legacyJob.dedupeUntil),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
    }
  }

  let pendingApiKeyUsage = new Map();
  let pendingApiKeyUsageCount = 0;
  let apiKeyUsageFlushPromise = null;
  let storeClosing = false;

  async function flushApiKeyUsage() {
    if (apiKeyUsageFlushPromise) {
      await apiKeyUsageFlushPromise;
      if (pendingApiKeyUsage.size) return flushApiKeyUsage();
      return undefined;
    }
    if (!pendingApiKeyUsage.size) return undefined;
    const batch = pendingApiKeyUsage;
    pendingApiKeyUsage = new Map();
    pendingApiKeyUsageCount = 0;
    apiKeyUsageFlushPromise = apiKeys.bulkWrite([...batch.entries()].map(([id, usage]) => ({
      updateOne: {
        filter: { id },
        update: { $max: { lastUsedAt: usage.lastUsedAt }, $inc: { requestCount: usage.count } },
      },
    })), { ordered: false }).catch((error) => {
      for (const [id, usage] of batch) {
        const current = pendingApiKeyUsage.get(id) || { count: 0, lastUsedAt: usage.lastUsedAt };
        current.count += usage.count;
        if (usage.lastUsedAt > current.lastUsedAt) current.lastUsedAt = usage.lastUsedAt;
        pendingApiKeyUsage.set(id, current);
        pendingApiKeyUsageCount += usage.count;
      }
      throw error;
    }).finally(() => {
      apiKeyUsageFlushPromise = null;
    });
    await apiKeyUsageFlushPromise;
    if (pendingApiKeyUsage.size) return flushApiKeyUsage();
    return undefined;
  }

  function recordApiKeyUsage(id, timestamp) {
    const current = pendingApiKeyUsage.get(id) || { count: 0, lastUsedAt: timestamp };
    current.count += 1;
    if (timestamp > current.lastUsedAt) current.lastUsedAt = timestamp;
    pendingApiKeyUsage.set(id, current);
    pendingApiKeyUsageCount += 1;
    if (pendingApiKeyUsageCount >= 100 && !storeClosing) {
      void flushApiKeyUsage().catch((error) => console.error('notification API key usage flush failed', error));
    }
  }

  const apiKeyUsageTimer = setInterval(() => {
    if (!storeClosing) void flushApiKeyUsage().catch((error) => console.error('notification API key usage flush failed', error));
  }, 5000);
  apiKeyUsageTimer.unref?.();

  function isDuplicateKeyError(error) {
    return Number(error?.code) === 11000;
  }

  async function acquireDedupeReservation({ scopeKey, jobId, expiresAt, timestamp }) {
    const reservationId = crypto.randomUUID();
    try {
      const reservation = await dedupeReservations.findOneAndUpdate(
        {
          scopeKey,
          $or: [{ expiresAt: { $lte: timestamp } }, { expiresAt: { $exists: false } }],
        },
        {
          $set: { jobId, reservationId, expiresAt, updatedAt: timestamp },
          $setOnInsert: { createdAt: timestamp },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (reservation?.reservationId === reservationId) return { owned: true, reservationId };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    return { owned: false, reservation: await dedupeReservations.findOne({ scopeKey }) };
  }

  async function finalizeCreatingJob(row, timestamp = new Date()) {
    const status = row.pendingStatus || 'scheduled';
    const mutation = mongoJobMutation({ status }, timestamp, retentionDays);
    mutation.$unset = { ...(mutation.$unset || {}), pendingStatus: '' };
    return jobs.findOneAndUpdate(
      { id: row.id, status: 'creating' },
      mutation,
      { returnDocument: 'after' },
    );
  }

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
      const status = input.status || 'scheduled';
      const dedupeScopeKey = createDedupeScopeKey(input);
      const dedupeUntil = new Date(timestamp.getTime() + Number(input.dedupeWindowMs || 300000));
      const row = {
        id: crypto.randomUUID(),
        ...input,
        status: dedupeScopeKey && status !== 'suppressed' ? 'creating' : status,
        ...(dedupeScopeKey && status !== 'suppressed' ? { pendingStatus: status } : {}),
        attempts: 0,
        lastError: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        scheduledAt: new Date(input.scheduledAt || timestamp),
        dedupeUntil,
        dedupeScopeKey,
        encryptedPayload: protector.encrypt(input.payload),
      };
      delete row.payload;
      if (TERMINAL_JOB_STATUSES.has(status)) {
        row.terminalAt = timestamp;
        row.expiresAt = new Date(timestamp.getTime() + retentionDays * 86400000);
      } else if (row.status === 'creating') {
        row.expiresAt = new Date(timestamp.getTime() + 300000);
      }
      await jobs.insertOne(row);
      if (!dedupeScopeKey || status === 'suppressed') {
        return { job: serializeDocument(row), deduplicated: false };
      }

      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const acquired = await acquireDedupeReservation({
            scopeKey: dedupeScopeKey,
            jobId: row.id,
            expiresAt: dedupeUntil,
            timestamp: new Date(),
          });
          if (acquired.owned) {
            await jobs.updateOne({ id: row.id }, { $set: { dedupeReservationId: acquired.reservationId } });
            const finalized = await finalizeCreatingJob({ ...row, dedupeReservationId: acquired.reservationId })
              || await jobs.findOne({ id: row.id });
            return { job: serializeDocument(finalized), deduplicated: false };
          }

          const reservation = acquired.reservation;
          if (!reservation) continue;
          let duplicate = await jobs.findOne({ id: reservation.jobId });
          if (duplicate?.status === 'creating') {
            duplicate = await finalizeCreatingJob(duplicate) || await jobs.findOne({ id: reservation.jobId });
          }
          if (duplicate && (activeJobStatus(duplicate.status) || duplicate.status === 'sent')) {
            await jobs.deleteOne({ id: row.id, status: 'creating' });
            return { job: serializeDocument(duplicate), deduplicated: true };
          }

          const reservationId = crypto.randomUUID();
          const reclaimed = await dedupeReservations.findOneAndUpdate(
            { scopeKey: dedupeScopeKey, reservationId: reservation.reservationId },
            { $set: {
              jobId: row.id,
              reservationId,
              expiresAt: dedupeUntil,
              updatedAt: new Date(),
            } },
            { returnDocument: 'after' },
          );
          if (reclaimed?.reservationId === reservationId) {
            await jobs.updateOne({ id: row.id }, { $set: { dedupeReservationId: reservationId } });
            const finalized = await finalizeCreatingJob({ ...row, dedupeReservationId: reservationId })
              || await jobs.findOne({ id: row.id });
            return { job: serializeDocument(finalized), deduplicated: false };
          }
        }
        throw Object.assign(new Error('Notification deduplication reservation is busy.'), {
          code: 'DEDUPE_RESERVATION_BUSY',
          status: 503,
        });
      } catch (error) {
        await jobs.deleteOne({ id: row.id, status: 'creating' });
        throw error;
      }
    },
    async claimDueNotificationJobs(limit = 20, { workerId = 'notification-worker', leaseMs = 120000 } = {}) {
      const claimed = [];
      const timestamp = new Date();
      const terminalAt = timestamp;
      await jobs.updateMany({
        status: 'processing',
        $and: [
          { $or: [{ lockedUntil: { $lte: timestamp } }, { lockedUntil: { $exists: false } }] },
          { $expr: { $gte: [{ $ifNull: ['$attempts', 0] }, { $ifNull: ['$maxAttempts', 4] }] } },
        ],
      }, {
        $set: {
          status: 'failed',
          failedAt: timestamp,
          terminalAt,
          expiresAt: new Date(terminalAt.getTime() + retentionDays * 86400000),
          lastError: 'Notification worker lease expired after the final attempt.',
          updatedAt: timestamp,
        },
        $unset: { leaseId: '', lockedUntil: '', workerId: '' },
      });
      for (let index = 0; index < limit; index += 1) {
        const leaseId = crypto.randomUUID();
        const row = await jobs.findOneAndUpdate(
          {
            $or: [
              { status: { $in: ['scheduled', 'retrying'] }, scheduledAt: { $lte: timestamp } },
              {
                status: 'processing',
                $and: [
                  { $or: [{ lockedUntil: { $lte: timestamp } }, { lockedUntil: { $exists: false } }] },
                  { $expr: { $lt: [{ $ifNull: ['$attempts', 0] }, { $ifNull: ['$maxAttempts', 4] }] } },
                ],
              },
            ],
          },
          {
            $set: {
              status: 'processing',
              leaseId,
              lockedUntil: new Date(timestamp.getTime() + Number(leaseMs || 120000)),
              workerId,
              updatedAt: timestamp,
            },
            $inc: { attempts: 1 },
          },
          { sort: { scheduledAt: 1 }, returnDocument: 'after' },
        );
        if (!row) break;
        claimed.push({ ...serializeDocument(row), leaseId: row.leaseId, payload: protector.decrypt(row.encryptedPayload) });
      }
      return claimed;
    },
    async renewNotificationJobLease(id, { leaseId, workerId, leaseMs = 120000 } = {}) {
      return (await jobs.updateOne(
        { id, status: 'processing', leaseId, workerId },
        { $set: { lockedUntil: new Date(Date.now() + Number(leaseMs || 120000)), updatedAt: new Date() } },
      )).modifiedCount === 1;
    },
    async updateNotificationJob(id, update, { leaseId = '' } = {}) {
      const updated = await jobs.findOneAndUpdate(
        { id, ...(leaseId ? { status: 'processing', leaseId } : {}) },
        mongoJobMutation(update, new Date(), retentionDays),
        { returnDocument: 'after', projection: { _id: 0, encryptedPayload: 0 } },
      );
      if (updated && ['failed', 'cancelled', 'suppressed'].includes(updated.status) && updated.dedupeScopeKey) {
        await dedupeReservations.deleteOne({ scopeKey: updated.dedupeScopeKey, jobId: updated.id });
      }
      return serializeDocument(updated);
    },
    async cancelNotificationJob(id) {
      const updated = await jobs.findOneAndUpdate(
        { id, status: { $in: ['scheduled', 'retrying'] } },
        mongoJobMutation({ status: 'cancelled' }, new Date(), retentionDays),
        { returnDocument: 'after', projection: { _id: 0, encryptedPayload: 0 } },
      );
      if (updated?.dedupeScopeKey) {
        await dedupeReservations.deleteOne({ scopeKey: updated.dedupeScopeKey, jobId: updated.id });
      }
      return serializeDocument(updated);
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
    async getNotificationQueueOverview() {
      const timestamp = new Date();
      const dueQuery = { status: { $in: ['scheduled', 'retrying'] }, scheduledAt: { $lte: timestamp } };
      const [scheduled, retrying, processing, reserving, deadLetter, due, expiredLeases, oldestDue] = await Promise.all([
        jobs.countDocuments({ status: 'scheduled' }),
        jobs.countDocuments({ status: 'retrying' }),
        jobs.countDocuments({ status: 'processing' }),
        jobs.countDocuments({ status: 'creating' }),
        jobs.countDocuments({ status: 'failed' }),
        jobs.countDocuments(dueQuery),
        jobs.countDocuments({ status: 'processing', $or: [{ lockedUntil: { $lte: timestamp } }, { lockedUntil: { $exists: false } }] }),
        jobs.findOne(dueQuery, { projection: { scheduledAt: 1 }, sort: { scheduledAt: 1 } }),
      ]);
      return {
        scheduled,
        retrying,
        processing,
        reserving,
        deadLetter,
        due,
        expiredLeases,
        oldestDueAt: serializeDocument(oldestDue?.scheduledAt || null),
        lagMs: oldestDue?.scheduledAt ? Math.max(0, timestamp.getTime() - new Date(oldestDue.scheduledAt).getTime()) : 0,
      };
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
    async createApiClient(input) {
      const timestamp = new Date();
      const credential = createApiCredential();
      const clientRow = {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description || '',
        status: 'active',
        scopes: [...input.scopes],
        rateLimitPerMinute: input.rateLimitPerMinute,
        expiresAt: input.expiresAt || null,
        createdAt: timestamp,
        updatedAt: timestamp,
        revokedAt: null,
        createdBy: input.actor,
        updatedBy: input.actor,
      };
      const keyRow = {
        id: credential.keyId,
        clientId: clientRow.id,
        tokenHash: credential.tokenHash,
        tokenPrefix: credential.tokenPrefix,
        createdAt: timestamp,
        expiresAt: clientRow.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        requestCount: 0,
        createdBy: input.actor,
      };
      await apiClients.insertOne(clientRow);
      try {
        await apiKeys.insertOne(keyRow);
      } catch (error) {
        await apiClients.deleteOne({ id: clientRow.id });
        throw error;
      }
      return { client: serializeApiClient(clientRow, [keyRow]), token: credential.token };
    },
    async listApiClients() {
      const [clientRows, keyRows] = await Promise.all([
        apiClients.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
        apiKeys.find({}, { projection: { _id: 0, tokenHash: 0 } }).sort({ createdAt: -1 }).toArray(),
      ]);
      return clientRows.map((clientRow) => serializeApiClient(clientRow, keyRows.filter((key) => key.clientId === clientRow.id)));
    },
    async updateApiClient(id, input) {
      const current = await apiClients.findOne({ id, status: { $ne: 'revoked' } }, { projection: { _id: 0 } });
      if (!current) return null;
      const updated = await apiClients.findOneAndUpdate(
        { id, status: { $ne: 'revoked' } },
        { $set: {
          name: input.name,
          description: input.description || '',
          scopes: [...input.scopes],
          rateLimitPerMinute: input.rateLimitPerMinute,
          expiresAt: input.expiresAt || null,
          updatedAt: new Date(),
          updatedBy: input.actor,
        } },
        { returnDocument: 'after', projection: { _id: 0 } },
      );
      if (!updated) return null;
      const inheritedExpiryQuery = current.expiresAt
        ? { expiresAt: current.expiresAt }
        : { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }] };
      await apiKeys.updateMany(
        { clientId: id, revokedAt: null, ...inheritedExpiryQuery },
        { $set: { expiresAt: input.expiresAt || null } },
      );
      const keyRows = await apiKeys.find({ clientId: id }, { projection: { _id: 0, tokenHash: 0 } }).sort({ createdAt: -1 }).toArray();
      return serializeApiClient(updated, keyRows);
    },
    async rotateApiClientKey(id, { actor, overlapMinutes }) {
      const clientRow = await apiClients.findOne({ id, status: 'active' }, { projection: { _id: 0 } });
      if (!clientRow) return null;
      const timestamp = new Date();
      const overlapUntil = new Date(timestamp.getTime() + overlapMinutes * 60000);
      await apiKeys.updateMany({
        clientId: id,
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: overlapUntil } }],
      }, { $set: { expiresAt: overlapUntil } });
      const credential = createApiCredential();
      const keyRow = {
        id: credential.keyId,
        clientId: id,
        tokenHash: credential.tokenHash,
        tokenPrefix: credential.tokenPrefix,
        createdAt: timestamp,
        expiresAt: clientRow.expiresAt || null,
        revokedAt: null,
        lastUsedAt: null,
        requestCount: 0,
        createdBy: actor,
      };
      await apiKeys.insertOne(keyRow);
      await apiClients.updateOne({ id }, { $set: { updatedAt: timestamp, updatedBy: actor } });
      const keyRows = await apiKeys.find({ clientId: id }, { projection: { _id: 0, tokenHash: 0 } }).sort({ createdAt: -1 }).toArray();
      return { client: serializeApiClient({ ...clientRow, updatedAt: timestamp, updatedBy: actor }, keyRows), token: credential.token };
    },
    async revokeApiClient(id, { actor }) {
      const timestamp = new Date();
      const updated = await apiClients.findOneAndUpdate(
        { id, status: { $ne: 'revoked' } },
        { $set: { status: 'revoked', revokedAt: timestamp, updatedAt: timestamp, updatedBy: actor } },
        { returnDocument: 'after', projection: { _id: 0 } },
      );
      if (!updated) return null;
      await apiKeys.updateMany({ clientId: id, revokedAt: null }, { $set: { revokedAt: timestamp } });
      const keyRows = await apiKeys.find({ clientId: id }, { projection: { _id: 0, tokenHash: 0 } }).sort({ createdAt: -1 }).toArray();
      return serializeApiClient(updated, keyRows);
    },
    async verifyApiToken(token) {
      const timestamp = new Date();
      const keyRow = await apiKeys.findOne({ tokenHash: hashApiToken(token) }, { projection: { _id: 0 } });
      if (!keyRow || keyRow.revokedAt || (keyRow.expiresAt && new Date(keyRow.expiresAt) <= timestamp)) return null;
      const clientRow = await apiClients.findOne({ id: keyRow.clientId }, { projection: { _id: 0 } });
      if (!clientRow || clientRow.status !== 'active' || (clientRow.expiresAt && new Date(clientRow.expiresAt) <= timestamp)) return null;
      recordApiKeyUsage(keyRow.id, timestamp);
      return {
        managed: true,
        clientId: clientRow.id,
        clientName: clientRow.name,
        keyId: keyRow.id,
        scopes: [...clientRow.scopes],
        rateLimitPerMinute: clientRow.rateLimitPerMinute,
      };
    },
    async recordApiRequest(input) {
      const timestamp = input.startedAt ? new Date(input.startedAt) : new Date();
      const row = {
        id: crypto.randomUUID(),
        ...input,
        startedAt: timestamp,
        expiresAt: new Date(timestamp.getTime() + retentionDays * 86400000),
      };
      await apiRequests.insertOne(row);
      return serializeDocument(row);
    },
    async listApiRequests(filters = {}) {
      const page = normalizePositiveInteger(filters.page, 1, 100000);
      const pageSize = normalizePositiveInteger(filters.pageSize, 20, 100);
      const query = {
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.outcome ? { outcome: filters.outcome } : {}),
        ...(filters.endpoint ? { endpoint: filters.endpoint } : {}),
      };
      const [items, total] = await Promise.all([
        apiRequests.find(query, { projection: { _id: 0, expiresAt: 0 } }).sort({ startedAt: -1 })
          .skip((page - 1) * pageSize).limit(pageSize).toArray(),
        apiRequests.countDocuments(query),
      ]);
      return { items: items.map(serializeDocument), page, pageSize, total };
    },
    async getApiAccessOverview() {
      const since = new Date(Date.now() - 86400000);
      const [clientRows, keyRows, requestRows] = await Promise.all([
        apiClients.find({}, { projection: { _id: 0 } }).toArray(),
        apiKeys.find({}, { projection: { _id: 0, tokenHash: 0 } }).toArray(),
        apiRequests.find({ startedAt: { $gte: since } }, { projection: { _id: 0, httpStatus: 1, durationMs: 1, startedAt: 1 } })
          .sort({ startedAt: -1 }).limit(10000).toArray(),
      ]);
      return summarizeApiAccess(clientRows, keyRows, requestRows, since);
    },
    async getApiClientDelivery(id, clientId) {
      return serializeDocument(await deliveries.findOne(
        { id, apiClientId: clientId },
        { projection: { _id: 0, encryptedPayload: 0, expiresAt: 0 } },
      ));
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() {
      storeClosing = true;
      clearInterval(apiKeyUsageTimer);
      try {
        await flushApiKeyUsage();
      } finally {
        await client.close();
      }
    },
  };
}

module.exports = {
  createMemoryNotificationStore,
  createMongoNotificationStore,
  createDedupeScopeKey,
  percentile95,
};
