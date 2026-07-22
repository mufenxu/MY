import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const ACTIVE_INCIDENT_STATES = new Set(['open', 'acknowledged']);
const LATENCY_RESERVOIR_SIZE = 2048;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function iso(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeLimit(value, fallback = 100, maximum = 2000) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), maximum);
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return roundMetric(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]);
}

function serviceSeed(serviceId) {
  return [...String(serviceId || '')].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) % 2147483647, 1);
}

function createAvailabilityAccumulator(serviceId) {
  return {
    serviceId,
    samples: 0,
    healthy: 0,
    degraded: 0,
    offline: 0,
    maintenance: 0,
    unmonitored: 0,
    firstRecordedAt: null,
    lastRecordedAt: null,
    latencyCount: 0,
    latencySum: 0,
    latencyReservoir: [],
    reservoirState: serviceSeed(serviceId),
  };
}

function addLatencySample(accumulator, value) {
  if (!Number.isFinite(value)) return;
  accumulator.latencyCount += 1;
  accumulator.latencySum += value;
  if (accumulator.latencyReservoir.length < LATENCY_RESERVOIR_SIZE) {
    accumulator.latencyReservoir.push(value);
    return;
  }
  accumulator.reservoirState = (accumulator.reservoirState * 48271) % 2147483647;
  const replacement = Math.floor((accumulator.reservoirState / 2147483647) * accumulator.latencyCount);
  if (replacement < LATENCY_RESERVOIR_SIZE) accumulator.latencyReservoir[replacement] = value;
}

function availabilitySummary(accumulator) {
  return {
    serviceId: accumulator.serviceId,
    samples: accumulator.samples,
    healthy: accumulator.healthy,
    degraded: accumulator.degraded,
    offline: accumulator.offline,
    failed: Math.max(0, accumulator.samples - accumulator.healthy),
    excluded: {
      maintenance: accumulator.maintenance,
      unmonitored: accumulator.unmonitored,
    },
    firstRecordedAt: accumulator.firstRecordedAt,
    lastRecordedAt: accumulator.lastRecordedAt,
    latency: {
      count: accumulator.latencyCount,
      averageMs: accumulator.latencyCount ? roundMetric(accumulator.latencySum / accumulator.latencyCount) : null,
      p50Ms: percentile(accumulator.latencyReservoir, 0.5),
      p95Ms: percentile(accumulator.latencyReservoir, 0.95),
      p99Ms: percentile(accumulator.latencyReservoir, 0.99),
    },
  };
}

function serializeDocument(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDocument);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '_id')
    .map(([key, nested]) => [key, serializeDocument(nested)]));
}

export function createMemoryOperationsStore({
  statusRetentionDays = 30,
  auditRetentionDays = 180,
  idFactory = () => crypto.randomUUID(),
  now = () => new Date(),
} = {}) {
  let settings = null;
  const statusSamples = [];
  const blackboxSamples = [];
  const incidents = [];
  const auditEvents = [];

  function prune() {
    const timestamp = now().getTime();
    const statusCutoff = timestamp - statusRetentionDays * 86400000;
    const auditCutoff = timestamp - auditRetentionDays * 86400000;
    while (statusSamples[0] && Date.parse(statusSamples[0].recordedAt) < statusCutoff) statusSamples.shift();
    while (blackboxSamples[0] && Date.parse(blackboxSamples[0].recordedAt) < statusCutoff) blackboxSamples.shift();
    while (auditEvents[0] && Date.parse(auditEvents[0].occurredAt) < auditCutoff) auditEvents.shift();
  }

  const store = {
    async recordStatusSamples(samples, recordedAt = now()) {
      prune();
      const timestamp = iso(recordedAt);
      for (const sample of samples) {
        statusSamples.push({
          serviceId: sample.id,
          state: sample.state,
          httpStatus: sample.httpStatus ?? null,
          latencyMs: sample.latencyMs ?? null,
          reason: sample.reason || '',
          maintenance: Boolean(sample.maintenance),
          recordedAt: sample.checkedAt || timestamp,
        });
      }
    },

    async getStatusHistory({ serviceId, since, until, limit = 1000 } = {}) {
      prune();
      const sinceTime = since ? Date.parse(since) : 0;
      const untilTime = until ? Date.parse(until) : Number.POSITIVE_INFINITY;
      return clone(statusSamples
        .filter((sample) => !serviceId || sample.serviceId === serviceId)
        .filter((sample) => {
          const timestamp = Date.parse(sample.recordedAt);
          return timestamp >= sinceTime && timestamp <= untilTime;
        })
        .slice(-normalizeLimit(limit, 1000, 100000)));
    },

    async getAvailabilitySummary({ serviceId, since, until } = {}) {
      prune();
      const sinceTime = since ? Date.parse(since) : 0;
      const untilTime = until ? Date.parse(until) : Number.POSITIVE_INFINITY;
      const summaries = new Map();
      for (const sample of statusSamples) {
        if (serviceId && sample.serviceId !== serviceId) continue;
        const timestamp = Date.parse(sample.recordedAt);
        if (timestamp < sinceTime || timestamp > untilTime) continue;
        const accumulator = summaries.get(sample.serviceId) || createAvailabilityAccumulator(sample.serviceId);
        summaries.set(sample.serviceId, accumulator);
        if (sample.maintenance) {
          accumulator.maintenance += 1;
          continue;
        }
        if (sample.state === 'unmonitored') {
          accumulator.unmonitored += 1;
          continue;
        }
        accumulator.samples += 1;
        if (sample.state === 'healthy') accumulator.healthy += 1;
        if (sample.state === 'degraded') accumulator.degraded += 1;
        if (sample.state === 'offline') accumulator.offline += 1;
        if (!accumulator.firstRecordedAt || timestamp < Date.parse(accumulator.firstRecordedAt)) accumulator.firstRecordedAt = sample.recordedAt;
        if (!accumulator.lastRecordedAt || timestamp > Date.parse(accumulator.lastRecordedAt)) accumulator.lastRecordedAt = sample.recordedAt;
        addLatencySample(accumulator, sample.latencyMs);
      }
      return [...summaries.values()]
        .sort((left, right) => left.serviceId.localeCompare(right.serviceId))
        .map(availabilitySummary);
    },

    async getStatusRollups({ serviceId, since, until, limit = 2000 } = {}) {
      const samples = await store.getStatusHistory({ serviceId, since, until, limit: 100000 });
      const buckets = new Map();
      for (const sample of samples) {
        const bucketAt = new Date(Math.floor(Date.parse(sample.recordedAt) / 3600000) * 3600000).toISOString();
        const key = `${sample.serviceId}:${bucketAt}`;
        const bucket = buckets.get(key) || { serviceId: sample.serviceId, recordedAt: bucketAt, values: [], states: [], maintenance: false };
        if (Number.isFinite(sample.latencyMs)) bucket.values.push(sample.latencyMs);
        bucket.states.push(sample.state);
        bucket.maintenance ||= sample.maintenance;
        buckets.set(key, bucket);
      }
      return [...buckets.values()].sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt)).slice(-normalizeLimit(limit, 2000, 10000)).map((bucket) => ({
        serviceId: bucket.serviceId,
        recordedAt: bucket.recordedAt,
        latencyMs: bucket.values.length ? Math.round(bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length) : null,
        state: bucket.states.includes('offline') ? 'offline' : bucket.states.includes('degraded') ? 'degraded' : bucket.states.at(-1),
        maintenance: bucket.maintenance,
      }));
    },

    async recordBlackboxSamples(samples) {
      prune();
      const existing = new Set(blackboxSamples.map((sample) => `${sample.probeId}:${sample.targetId}:${sample.recordedAt}`));
      for (const sample of clone(samples)) {
        const key = `${sample.probeId}:${sample.targetId}:${sample.recordedAt}`;
        if (!existing.has(key)) blackboxSamples.push(sample);
        existing.add(key);
      }
      blackboxSamples.sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
    },

    async getBlackboxHistory({ probeId, targetId, since, until, limit = 1000 } = {}) {
      prune();
      const sinceTime = since ? Date.parse(since) : 0;
      const untilTime = until ? Date.parse(until) : Number.POSITIVE_INFINITY;
      return clone(blackboxSamples
        .filter((sample) => !probeId || sample.probeId === probeId)
        .filter((sample) => !targetId || sample.targetId === targetId)
        .filter((sample) => {
          const timestamp = Date.parse(sample.recordedAt);
          return timestamp >= sinceTime && timestamp <= untilTime;
        })
        .slice(-normalizeLimit(limit, 1000, 100000)));
    },

    async getLatestBlackboxSamples() {
      prune();
      const latest = new Map();
      for (const sample of blackboxSamples) latest.set(`${sample.probeId}:${sample.targetId}`, sample);
      return clone([...latest.values()]);
    },

    async findActiveIncident(key) {
      return clone(incidents.find((incident) => incident.key === key && ACTIVE_INCIDENT_STATES.has(incident.status)) || null);
    },

    async createIncident(input) {
      const timestamp = iso(now());
      const incident = {
        id: idFactory(),
        status: 'open',
        severity: 'warning',
        title: '运维事件',
        description: '',
        serviceId: null,
        source: 'monitor',
        observedState: null,
        openedAt: timestamp,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        mutedUntil: null,
        assignedTo: null,
        timeline: [],
        ...clone(input),
      };
      incidents.push(incident);
      return clone(incident);
    },

    async updateIncident(id, update, event = null) {
      const incident = incidents.find((item) => item.id === id);
      if (!incident) return null;
      Object.assign(incident, clone(update));
      if (event) {
        incident.timeline = [...(incident.timeline || []), clone(event)].slice(-100);
      }
      return clone(incident);
    },

    async listIncidents({ status, limit = 100 } = {}) {
      const allowed = status ? new Set(String(status).split(',').map((value) => value.trim())) : null;
      return clone(incidents
        .filter((incident) => !allowed || allowed.has(incident.status))
        .sort((left, right) => Date.parse(right.lastSeenAt || right.openedAt) - Date.parse(left.lastSeenAt || left.openedAt))
        .slice(0, normalizeLimit(limit)));
    },

    async addAudit(input) {
      prune();
      const event = {
        id: idFactory(),
        occurredAt: iso(now()),
        actor: 'system',
        action: 'unknown',
        outcome: 'success',
        targetType: 'platform',
        targetId: '',
        requestId: '',
        ip: '',
        userAgent: '',
        details: {},
        ...clone(input),
      };
      auditEvents.push(event);
      return clone(event);
    },

    async listAudit({ action, actor, outcome, limit = 100 } = {}) {
      prune();
      return clone(auditEvents
        .filter((event) => !action || event.action === action)
        .filter((event) => !actor || event.actor === actor)
        .filter((event) => !outcome || event.outcome === outcome)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
        .slice(0, normalizeLimit(limit)));
    },

    async getSettings(defaults = {}) {
      return clone({ ...defaults, ...(settings || {}) });
    },

    async updateSettings(patch, defaults = {}) {
      settings = { ...(settings || {}), ...clone(patch), updatedAt: iso(now()) };
      return clone({ ...defaults, ...settings });
    },

    async ping() {
      return true;
    },

    async close() {},
  };
  return store;
}

export async function createMongoOperationsStore({
  uri,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  statusRetentionDays = 30,
  auditRetentionDays = 180,
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const statusHistory = db.collection('service_status_history');
  const statusRollups = db.collection('service_status_rollups');
  const blackboxSamples = db.collection('external_blackbox_samples');
  const incidents = db.collection('operations_incidents');
  const auditEvents = db.collection('operations_audit');
  const settings = db.collection('operations_settings');

  await Promise.all([
    statusHistory.createIndex({ serviceId: 1, recordedAt: -1 }),
    statusHistory.createIndex({ recordedAt: -1, serviceId: 1 }),
    statusHistory.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    statusRollups.createIndex({ serviceId: 1, bucketAt: -1 }, { unique: true }),
    statusRollups.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    blackboxSamples.createIndex({ probeId: 1, targetId: 1, recordedAt: -1 }, { unique: true }),
    blackboxSamples.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    incidents.createIndex({ key: 1, status: 1 }),
    incidents.createIndex({ lastSeenAt: -1 }),
    auditEvents.createIndex({ occurredAt: -1 }),
    auditEvents.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const store = {
    async recordStatusSamples(samples, recordedAt = new Date()) {
      if (!samples.length) return;
      const expiresAt = new Date(recordedAt.getTime() + statusRetentionDays * 86400000);
      const historyDocuments = samples.map((sample) => ({
        serviceId: sample.id,
        state: sample.state,
        httpStatus: sample.httpStatus ?? null,
        latencyMs: sample.latencyMs ?? null,
        reason: sample.reason || '',
        maintenance: Boolean(sample.maintenance),
        recordedAt: new Date(sample.checkedAt || recordedAt),
        expiresAt,
      }));
      const rollupOperations = historyDocuments.map((sample) => {
        const bucketAt = new Date(Math.floor(sample.recordedAt.getTime() / 3600000) * 3600000);
        return {
          updateOne: {
            filter: { serviceId: sample.serviceId, bucketAt },
            update: {
              $set: { lastState: sample.state, lastRecordedAt: sample.recordedAt, expiresAt },
              $inc: {
                samples: 1,
                healthy: sample.state === 'healthy' ? 1 : 0,
                degraded: sample.state === 'degraded' ? 1 : 0,
                offline: sample.state === 'offline' ? 1 : 0,
                unmonitored: sample.state === 'unmonitored' ? 1 : 0,
                maintenance: sample.maintenance ? 1 : 0,
                latencySum: Number.isFinite(sample.latencyMs) ? sample.latencyMs : 0,
                latencyCount: Number.isFinite(sample.latencyMs) ? 1 : 0,
              },
            },
            upsert: true,
          },
        };
      });
      await Promise.all([
        statusHistory.insertMany(historyDocuments, { ordered: false }),
        statusRollups.bulkWrite(rollupOperations, { ordered: false }),
      ]);
    },

    async getStatusHistory({ serviceId, since, until, limit = 1000 } = {}) {
      const query = {
        ...(serviceId ? { serviceId } : {}),
        ...((since || until) ? {
          recordedAt: {
            ...(since ? { $gte: new Date(since) } : {}),
            ...(until ? { $lte: new Date(until) } : {}),
          },
        } : {}),
      };
      const rows = await statusHistory.find(query, { projection: { _id: 0, expiresAt: 0 } })
        .sort({ recordedAt: -1 })
        .limit(normalizeLimit(limit, 1000, 100000))
        .toArray();
      return rows.reverse().map(serializeDocument);
    },

    async getAvailabilitySummary({ serviceId, since, until } = {}) {
      const timeFilter = {
        ...(since ? { $gte: new Date(since) } : {}),
        ...(until ? { $lte: new Date(until) } : {}),
      };
      const match = {
        ...(serviceId ? { serviceId } : {}),
        ...(Object.keys(timeFilter).length ? { recordedAt: timeFilter } : {}),
      };
      const [result = { eligible: [], excluded: [] }] = await statusHistory.aggregate([
        { $match: match },
        {
          $facet: {
            eligible: [
              { $match: { maintenance: { $ne: true }, state: { $ne: 'unmonitored' } } },
              {
                $group: {
                  _id: '$serviceId',
                  samples: { $sum: 1 },
                  healthy: { $sum: { $cond: [{ $eq: ['$state', 'healthy'] }, 1, 0] } },
                  degraded: { $sum: { $cond: [{ $eq: ['$state', 'degraded'] }, 1, 0] } },
                  offline: { $sum: { $cond: [{ $eq: ['$state', 'offline'] }, 1, 0] } },
                  firstRecordedAt: { $min: '$recordedAt' },
                  lastRecordedAt: { $max: '$recordedAt' },
                  latencyCount: { $sum: { $cond: [{ $isNumber: '$latencyMs' }, 1, 0] } },
                  latencyAverage: { $avg: { $cond: [{ $isNumber: '$latencyMs' }, '$latencyMs', null] } },
                  latencyPercentiles: {
                    $percentile: {
                      input: { $cond: [{ $isNumber: '$latencyMs' }, '$latencyMs', null] },
                      p: [0.5, 0.95, 0.99],
                      method: 'approximate',
                    },
                  },
                },
              },
            ],
            excluded: [
              {
                $group: {
                  _id: '$serviceId',
                  maintenance: { $sum: { $cond: [{ $eq: ['$maintenance', true] }, 1, 0] } },
                  unmonitored: {
                    $sum: {
                      $cond: [
                        { $and: [{ $ne: ['$maintenance', true] }, { $eq: ['$state', 'unmonitored'] }] },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ], { allowDiskUse: false, maxTimeMS: 5000 }).toArray();
      const eligibleByService = new Map(result.eligible.map((row) => [row._id, row]));
      const excludedByService = new Map(result.excluded.map((row) => [row._id, row]));
      return [...new Set([...eligibleByService.keys(), ...excludedByService.keys()])]
        .sort((left, right) => left.localeCompare(right))
        .map((id) => {
          const eligible = eligibleByService.get(id) || {};
          const excluded = excludedByService.get(id) || {};
          const percentiles = eligible.latencyPercentiles || [];
          return {
            serviceId: id,
            samples: eligible.samples || 0,
            healthy: eligible.healthy || 0,
            degraded: eligible.degraded || 0,
            offline: eligible.offline || 0,
            failed: Math.max(0, (eligible.samples || 0) - (eligible.healthy || 0)),
            excluded: {
              maintenance: excluded.maintenance || 0,
              unmonitored: excluded.unmonitored || 0,
            },
            firstRecordedAt: eligible.firstRecordedAt?.toISOString?.() || null,
            lastRecordedAt: eligible.lastRecordedAt?.toISOString?.() || null,
            latency: {
              count: eligible.latencyCount || 0,
              averageMs: roundMetric(eligible.latencyAverage),
              p50Ms: roundMetric(percentiles[0]),
              p95Ms: roundMetric(percentiles[1]),
              p99Ms: roundMetric(percentiles[2]),
            },
          };
        });
    },

    async findActiveIncident(key) {
      const incident = await incidents.findOne({ key, status: { $in: [...ACTIVE_INCIDENT_STATES] } });
      return incident ? serializeDocument(incident) : null;
    },

    async getStatusRollups({ serviceId, since, until, limit = 2000 } = {}) {
      const query = {
        ...(serviceId ? { serviceId } : {}),
        ...((since || until) ? {
          bucketAt: {
            ...(since ? { $gte: new Date(since) } : {}),
            ...(until ? { $lte: new Date(until) } : {}),
          },
        } : {}),
      };
      const rows = await statusRollups.find(query, { projection: { _id: 0, expiresAt: 0 } })
        .sort({ bucketAt: 1 })
        .limit(normalizeLimit(limit, 2000, 10000))
        .toArray();
      return rows.map((row) => ({
        serviceId: row.serviceId,
        recordedAt: row.bucketAt.toISOString(),
        latencyMs: row.latencyCount ? Math.round(row.latencySum / row.latencyCount) : null,
        state: row.offline ? 'offline' : row.degraded ? 'degraded' : row.lastState,
        maintenance: Boolean(row.maintenance),
        availability: row.samples - row.unmonitored - row.maintenance > 0
          ? row.healthy / (row.samples - row.unmonitored - row.maintenance)
          : null,
      }));
    },

    async recordBlackboxSamples(samples) {
      if (!samples.length) return;
      const documents = samples.map((sample) => ({
        ...sample,
        recordedAt: new Date(sample.recordedAt),
        expiresAt: new Date(new Date(sample.recordedAt).getTime() + statusRetentionDays * 86400000),
      }));
      await blackboxSamples.bulkWrite(documents.map((document) => ({
        updateOne: {
          filter: { probeId: document.probeId, targetId: document.targetId, recordedAt: document.recordedAt },
          update: { $setOnInsert: document },
          upsert: true,
        },
      })), { ordered: true });
    },

    async getBlackboxHistory({ probeId, targetId, since, until, limit = 1000 } = {}) {
      const query = {
        ...(probeId ? { probeId } : {}),
        ...(targetId ? { targetId } : {}),
        ...((since || until) ? {
          recordedAt: {
            ...(since ? { $gte: new Date(since) } : {}),
            ...(until ? { $lte: new Date(until) } : {}),
          },
        } : {}),
      };
      const rows = await blackboxSamples.find(query, { projection: { _id: 0, expiresAt: 0 } })
        .sort({ recordedAt: -1 })
        .limit(normalizeLimit(limit, 1000, 100000))
        .toArray();
      return rows.reverse().map(serializeDocument);
    },

    async getLatestBlackboxSamples() {
      const rows = await blackboxSamples.aggregate([
        { $sort: { recordedAt: -1 } },
        { $group: { _id: { probeId: '$probeId', targetId: '$targetId' }, sample: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$sample' } },
        { $project: { _id: 0, expiresAt: 0 } },
      ]).toArray();
      return rows.map(serializeDocument);
    },

    async createIncident(input) {
      const timestamp = new Date();
      const incident = {
        id: crypto.randomUUID(),
        status: 'open',
        severity: 'warning',
        title: '运维事件',
        description: '',
        serviceId: null,
        source: 'monitor',
        observedState: null,
        openedAt: timestamp,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        mutedUntil: null,
        assignedTo: null,
        timeline: [],
        ...input,
      };
      for (const key of ['openedAt', 'firstSeenAt', 'lastSeenAt', 'acknowledgedAt', 'resolvedAt', 'mutedUntil']) {
        if (incident[key] && !(incident[key] instanceof Date)) incident[key] = new Date(incident[key]);
      }
      await incidents.insertOne(incident);
      return serializeDocument(incident);
    },

    async updateIncident(id, update, event = null) {
      const normalized = { ...update };
      for (const key of ['lastSeenAt', 'acknowledgedAt', 'resolvedAt', 'mutedUntil']) {
        if (normalized[key] && !(normalized[key] instanceof Date)) normalized[key] = new Date(normalized[key]);
      }
      const operations = { $set: normalized };
      if (event) operations.$push = { timeline: { $each: [event], $slice: -100 } };
      const result = await incidents.findOneAndUpdate({ id }, operations, { returnDocument: 'after' });
      return result ? serializeDocument(result) : null;
    },

    async listIncidents({ status, limit = 100 } = {}) {
      const states = status ? String(status).split(',').map((value) => value.trim()).filter(Boolean) : [];
      const rows = await incidents.find(states.length ? { status: { $in: states } } : {}, { projection: { _id: 0 } })
        .sort({ lastSeenAt: -1 })
        .limit(normalizeLimit(limit))
        .toArray();
      return rows.map(serializeDocument);
    },

    async addAudit(input) {
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const event = {
        id: crypto.randomUUID(),
        actor: 'system',
        action: 'unknown',
        outcome: 'success',
        targetType: 'platform',
        targetId: '',
        requestId: '',
        ip: '',
        userAgent: '',
        details: {},
        ...input,
        occurredAt,
        expiresAt: new Date(occurredAt.getTime() + auditRetentionDays * 86400000),
      };
      await auditEvents.insertOne(event);
      return serializeDocument(event);
    },

    async listAudit({ action, actor, outcome, limit = 100 } = {}) {
      const query = {
        ...(action ? { action } : {}),
        ...(actor ? { actor } : {}),
        ...(outcome ? { outcome } : {}),
      };
      const rows = await auditEvents.find(query, { projection: { _id: 0, expiresAt: 0 } })
        .sort({ occurredAt: -1 })
        .limit(normalizeLimit(limit))
        .toArray();
      return rows.map(serializeDocument);
    },

    async getSettings(defaults = {}) {
      const value = await settings.findOne({ _id: 'operations' });
      return { ...defaults, ...(value ? serializeDocument(value) : {}) };
    },

    async updateSettings(patch, defaults = {}) {
      await settings.updateOne(
        { _id: 'operations' },
        { $set: { ...patch, updatedAt: new Date() } },
        { upsert: true },
      );
      return store.getSettings(defaults);
    },

    async ping() {
      return (await db.command({ ping: 1 })).ok === 1;
    },

    async close() {
      await client.close();
    },
  };
  return store;
}
