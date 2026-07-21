import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function serialize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '_id')
    .map(([key, nested]) => [key, serialize(nested)]));
}

export function createMemoryConfigurationStore({
  now = () => new Date(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  let state = null;
  const versions = [];
  const changes = [];
  return {
    async ensureBaseline(settings) {
      if (!state) {
        state = { currentVersion: 1, updatedAt: now().toISOString() };
        versions.push({ version: 1, settings: clone(settings), createdAt: now().toISOString(), createdBy: 'system', summary: 'Initial configuration baseline', sourceChangeId: null });
      }
      return clone(state);
    },
    async getState() { return clone(state); },
    async setState(next) { state = clone(next); return clone(state); },
    async createVersion(version) { versions.push(clone(version)); return clone(version); },
    async getVersion(version) { return clone(versions.find((item) => item.version === Number(version)) || null); },
    async listVersions(limit = 20) { return clone(versions.slice().sort((a, b) => b.version - a.version).slice(0, Number(limit) || 20)); },
    async createChange(input) {
      const change = { id: idFactory(), status: 'pending', createdAt: now().toISOString(), updatedAt: now().toISOString(), ...clone(input) };
      changes.push(change);
      return clone(change);
    },
    async getChange(id) { return clone(changes.find((item) => item.id === id) || null); },
    async listChanges(limit = 50) { return clone(changes.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, Number(limit) || 50)); },
    async claimChange(id) {
      const change = changes.find((item) => item.id === id && item.status === 'pending');
      if (!change) return null;
      change.status = 'applying';
      change.updatedAt = now().toISOString();
      return clone(change);
    },
    async updateChange(id, patch) {
      const change = changes.find((item) => item.id === id);
      if (!change) return null;
      Object.assign(change, clone(patch), { updatedAt: now().toISOString() });
      return clone(change);
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoConfigurationStore({
  uri,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const state = db.collection('configuration_state');
  const versions = db.collection('configuration_versions');
  const changes = db.collection('configuration_changes');
  await Promise.all([
    versions.createIndex({ version: -1 }, { unique: true }),
    changes.createIndex({ id: 1 }, { unique: true }),
    changes.createIndex({ status: 1, createdAt: -1 }),
  ]);

  return {
    async ensureBaseline(settings) {
      const timestamp = new Date();
      await state.updateOne({ _id: 'operations' }, { $setOnInsert: { currentVersion: 1, updatedAt: timestamp } }, { upsert: true });
      await versions.updateOne({ version: 1 }, { $setOnInsert: { version: 1, settings, createdAt: timestamp, createdBy: 'system', summary: 'Initial configuration baseline', sourceChangeId: null } }, { upsert: true });
      return serialize(await state.findOne({ _id: 'operations' }));
    },
    async getState() { return serialize(await state.findOne({ _id: 'operations' })); },
    async setState(next) {
      await state.updateOne({ _id: 'operations' }, { $set: { ...next, updatedAt: new Date() } }, { upsert: true });
      return serialize(await state.findOne({ _id: 'operations' }));
    },
    async createVersion(version) { await versions.insertOne({ ...version, createdAt: new Date(version.createdAt) }); return serialize(version); },
    async getVersion(version) { return serialize(await versions.findOne({ version: Number(version) }, { projection: { _id: 0 } })); },
    async listVersions(limit = 20) { return (await versions.find({}, { projection: { _id: 0 } }).sort({ version: -1 }).limit(Math.min(100, Math.max(1, Number(limit) || 20))).toArray()).map(serialize); },
    async createChange(input) {
      const timestamp = new Date();
      const change = { id: crypto.randomUUID(), status: 'pending', createdAt: timestamp, updatedAt: timestamp, ...input };
      await changes.insertOne(change);
      return serialize(change);
    },
    async getChange(id) { return serialize(await changes.findOne({ id }, { projection: { _id: 0 } })); },
    async listChanges(limit = 50) { return (await changes.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(Math.min(200, Math.max(1, Number(limit) || 50))).toArray()).map(serialize); },
    async claimChange(id) {
      const row = await changes.findOneAndUpdate({ id, status: 'pending' }, { $set: { status: 'applying', updatedAt: new Date() } }, { returnDocument: 'after' });
      return row ? serialize(row) : null;
    },
    async updateChange(id, patch) {
      const normalized = { ...patch, updatedAt: new Date() };
      for (const key of ['approvedAt', 'rejectedAt', 'appliedAt']) if (normalized[key]) normalized[key] = new Date(normalized[key]);
      const row = await changes.findOneAndUpdate({ id }, { $set: normalized }, { returnDocument: 'after' });
      return row ? serialize(row) : null;
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { await client.close(); },
  };
}
