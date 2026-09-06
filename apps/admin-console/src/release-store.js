import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function iso(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeLimit(value, fallback = 20, maximum = 100) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), maximum);
}

function serializeDocument(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeDocument);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '_id')
    .map(([key, nested]) => [key, serializeDocument(nested)]));
}

function createBuildDocument(input, { idFactory, now }) {
  const timestamp = iso(now());
  return {
    id: String(input.id || idFactory()),
    environment: 'production',
    source: 'manual',
    status: 'queued',
    repository: '',
    workflow: '',
    ref: '',
    revision: '',
    targets: [],
    artifacts: [],
    requestedBy: 'system',
    workflowRun: null,
    error: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    timeline: [],
    ...clone(input),
  };
}

function updateRecord(record, patch, event, now) {
  Object.assign(record, clone(patch), { updatedAt: iso(now()) });
  if (event) record.timeline = [...(record.timeline || []), clone(event)].slice(-100);
  return clone(record);
}

export function createMemoryReleaseStore({
  idFactory = () => crypto.randomUUID(),
  now = () => new Date(),
} = {}) {
  const builds = [];

  return {
    async createBuild(input) {
      const document = createBuildDocument(input, { idFactory, now });
      if (builds.some((item) => item.id === document.id)) throw new Error(`Duplicate release build id: ${document.id}`);
      builds.push(document);
      return clone(document);
    },

    async getBuild(id) {
      return clone(builds.find((item) => item.id === String(id)) || null);
    },

    async updateBuild(id, patch, event = null) {
      const document = builds.find((item) => item.id === String(id));
      return document ? updateRecord(document, patch, event, now) : null;
    },

    async listBuilds({ status, limit = 20 } = {}) {
      const states = status ? new Set(String(status).split(',').map((value) => value.trim()).filter(Boolean)) : null;
      return clone(builds
        .filter((item) => !states || states.has(item.status))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        .slice(0, normalizeLimit(limit)));
    },

    async ping() {
      return true;
    },

    async close() {},
  };
}

function mongoPatch(patch) {
  const normalized = { ...patch, updatedAt: new Date() };
  for (const key of ['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'requestedAt']) {
    if (normalized[key] && !(normalized[key] instanceof Date)) normalized[key] = new Date(normalized[key]);
  }
  return normalized;
}

export async function createMongoReleaseStore({
  uri,
  client: sharedClient = null,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
} = {}) {
  if (!uri && !sharedClient) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = sharedClient || new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  if (!sharedClient) await client.connect();
  const db = client.db(databaseName);
  const builds = db.collection('release_builds');

  await Promise.all([
    builds.createIndex({ id: 1 }, { unique: true }),
    builds.createIndex({ createdAt: -1 }),
    builds.createIndex({ status: 1, updatedAt: -1 }),
    builds.createIndex({ 'workflowRun.id': 1 }, { sparse: true }),
  ]);

  return {
    async createBuild(input) {
      const document = createBuildDocument(input, { idFactory: () => crypto.randomUUID(), now: () => new Date() });
      await builds.insertOne(mongoPatch(document));
      return serializeDocument(document);
    },

    async getBuild(id) {
      const document = await builds.findOne({ id: String(id) }, { projection: { _id: 0 } });
      return document ? serializeDocument(document) : null;
    },

    async updateBuild(id, patch, event = null) {
      const update = { $set: mongoPatch(patch) };
      if (event) update.$push = { timeline: { $each: [event], $slice: -100 } };
      const document = await builds.findOneAndUpdate({ id: String(id) }, update, { returnDocument: 'after' });
      return document ? serializeDocument(document) : null;
    },

    async listBuilds({ status, limit = 20 } = {}) {
      const states = status ? String(status).split(',').map((value) => value.trim()).filter(Boolean) : [];
      const rows = await builds.find(states.length ? { status: { $in: states } } : {}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(normalizeLimit(limit))
        .toArray();
      return rows.map(serializeDocument);
    },

    async ping() {
      return (await db.command({ ping: 1 })).ok === 1;
    },

    async close() {
      if (!sharedClient) await client.close();
    },
  };
}
