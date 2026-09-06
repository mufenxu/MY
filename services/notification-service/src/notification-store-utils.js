const crypto = require('crypto');

function normalizePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), maximum);
}

function appDedupeScopeKey(caller, idempotencyKey) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([String(caller || ''), String(idempotencyKey || '')]))
    .digest('hex');
}

function appCursor(value) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!decoded || !decoded.createdAt || !decoded.id) return null;
    return { createdAt: new Date(decoded.createdAt), id: String(decoded.id) };
  } catch {
    return null;
  }
}

function encodeAppCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ createdAt: new Date(row.createdAt).toISOString(), id: row.id }), 'utf8').toString('base64url');
}

function serializeAppDevice(row) {
  if (!row) return null;
  return {
    installationId: row.installationId,
    provider: row.provider,
    appVersion: row.appVersion || '',
    deviceModel: row.deviceModel || '',
    createdAt: serializeDocument(row.createdAt),
    updatedAt: serializeDocument(row.updatedAt),
    lastSeenAt: serializeDocument(row.lastSeenAt),
  };
}

function serializeAppNotification(row, recipient, protector) {
  if (!row || !recipient) return null;
  const payload = protector.decrypt(row.encryptedPayload);
  return {
    id: row.id,
    recipientId: recipient.recipientId,
    category: row.category,
    priority: row.priority,
    ...payload,
    createdAt: serializeDocument(row.createdAt),
    expiresAt: serializeDocument(row.expiresAt),
    readAt: serializeDocument(recipient.readAt),
    snoozedUntil: serializeDocument(recipient.snoozedUntil),
  };
}

function appDeviceOverview(rows = []) {
  const now = Date.now();
  const active = rows.filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > now);
  const lastSeenAt = active
    .map((row) => row.lastSeenAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
  return {
    total: active.length,
    pollOnly: active.filter((row) => row.provider === 'poll' || !row.encryptedToken).length,
    pushReady: active.filter((row) => row.provider !== 'poll' && row.encryptedToken).length,
    lastSeenAt: serializeDocument(lastSeenAt),
  };
}

function registeredAppUsers(rows = []) {
  const byUser = new Map();
  for (const row of rows) {
    const userId = String(row.recipientId || '').trim();
    if (!userId) continue;
    const devices = byUser.get(userId) || [];
    devices.push(row);
    byUser.set(userId, devices);
  }
  return [...byUser.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([userId, devices]) => ({ userId, ...appDeviceOverview(devices) }));
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

module.exports = {
  TERMINAL_JOB_STATUSES,
  activeJobStatus,
  apiRequestMatches,
  appCursor,
  appDedupeScopeKey,
  appDeviceOverview,
  applyMemoryJobUpdate,
  createDedupeScopeKey,
  encodeAppCursor,
  matchesFilters,
  mongoJobMutation,
  normalizePositiveInteger,
  paged,
  percentile95,
  registeredAppUsers,
  serializeApiClient,
  serializeApiKey,
  serializeAppDevice,
  serializeAppNotification,
  serializeDocument,
  summarize,
  summarizeApiAccess,
};
