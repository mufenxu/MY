import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const MAX_ACCOUNTS = 1000;
const MAX_ALIASES = 100;
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 1000;
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);
const ALIAS_TYPES = new Set(['plus', 'workspace', 'custom', 'other']);
const ALIAS_STATUSES = new Set(['candidate', 'confirmed', 'unavailable']);
const OPENAI_STATUSES = new Set(['unregistered', 'registered', 'verification', 'abnormal', 'disabled', 'unknown']);
const EMAIL_STATUSES = new Set(['normal', 'attention', 'unavailable', 'unknown']);

function invalid(field, message = `Invalid Google account ${field}`) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function normalizeEmail(value, field) {
  if (typeof value !== 'string') return invalid(field);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return invalid(field);
  return email;
}

function normalizeId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= MAX_ID_LENGTH ? id : crypto.randomUUID();
}

function normalizeText(value, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > MAX_TEXT_LENGTH) return invalid(field);
  return value.trim();
}

function normalizeEnum(value, allowed, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!allowed.has(normalized)) return invalid(field);
  return normalized;
}

function normalizeTimestamp(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) return invalid(field);
  return timestamp;
}

function normalizeAlias(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('alias');
  return {
    id: normalizeId(raw.id),
    address: normalizeEmail(raw.address, 'alias address'),
    aliasType: normalizeEnum(raw.aliasType, ALIAS_TYPES, 'plus', 'alias type'),
    aliasStatus: normalizeEnum(raw.aliasStatus, ALIAS_STATUSES, 'candidate', 'alias status'),
    openAiStatus: normalizeEnum(raw.openAiStatus, OPENAI_STATUSES, 'unregistered', 'OpenAI status'),
    registeredAt: normalizeTimestamp(raw.registeredAt, 'registeredAt'),
    lastVerifiedAt: normalizeTimestamp(raw.lastVerifiedAt, 'lastVerifiedAt'),
    note: normalizeText(raw.note, 'alias note'),
  };
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('record');
  if (!Array.isArray(raw.aliases) || raw.aliases.length > MAX_ALIASES) return invalid('aliases');
  const primaryEmail = normalizeEmail(raw.primaryEmail, 'primary email');
  const aliases = raw.aliases.map(normalizeAlias);
  const aliasIds = new Set();
  const aliasAddresses = new Set();
  for (const alias of aliases) {
    if (aliasIds.has(alias.id) || aliasAddresses.has(alias.address) || alias.address === primaryEmail) {
      return invalid('duplicate alias');
    }
    aliasIds.add(alias.id);
    aliasAddresses.add(alias.address);
  }
  return {
    id: normalizeId(raw.id),
    primaryEmail,
    displayName: normalizeText(raw.displayName, 'display name'),
    emailStatus: normalizeEnum(raw.emailStatus, EMAIL_STATUSES, 'unknown', 'email status'),
    note: normalizeText(raw.note, 'note'),
    lastCheckedAt: normalizeTimestamp(raw.lastCheckedAt, 'lastCheckedAt'),
    aliases,
  };
}

function normalizeAccounts(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_ACCOUNTS) {
    return invalid('accounts', `accounts must be an array with at most ${MAX_ACCOUNTS} items`);
  }
  const ids = new Set();
  const emails = new Set();
  return raw.map((item) => {
    const account = normalizeAccount(item);
    if (ids.has(account.id)) return invalid('duplicate account id');
    if (emails.has(account.primaryEmail)) return invalid('duplicate primary email');
    ids.add(account.id);
    emails.add(account.primaryEmail);
    return account;
  });
}

function snapshotOf(ledger) {
  return {
    accounts: ledger?.accounts || [],
    revision: Number.isSafeInteger(ledger?.revision) && ledger.revision >= 0 ? ledger.revision : 0,
  };
}

function revisionFilter(expectedRevision) {
  return expectedRevision === 0
    ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
    : { revision: expectedRevision };
}

export function createMemoryGoogleAccountStore() {
  const ledgers = new Map();
  return {
    async get(username) {
      return snapshotOf(ledgers.get(username));
    },
    async replace(username, rawAccounts, expectedRevision) {
      const accounts = normalizeAccounts(rawAccounts);
      const current = ledgers.get(username);
      const currentRevision = current?.revision ?? 0;
      if (current && currentRevision !== expectedRevision) return null;
      const ledger = { accounts, revision: expectedRevision + 1, updatedAt: Date.now() };
      ledgers.set(username, ledger);
      return snapshotOf(ledger);
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoGoogleAccountStore({
  uri,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const collection = db.collection('google_account_ledgers');
  await collection.createIndex({ updatedAt: -1 });

  return {
    async get(username) {
      return snapshotOf(await collection.findOne({ _id: username }, { projection: { _id: 0, accounts: 1, revision: 1 } }));
    },
    async replace(username, rawAccounts, expectedRevision) {
      const accounts = normalizeAccounts(rawAccounts);
      const updated = await collection.findOneAndUpdate(
        { _id: username, ...revisionFilter(expectedRevision) },
        { $set: { accounts, updatedAt: new Date() }, $inc: { revision: 1 } },
        { returnDocument: 'after' },
      );
      const ledger = updated?.value || updated;
      if (ledger) return snapshotOf(ledger);
      if (expectedRevision !== 0) return null;
      try {
        const created = { _id: username, accounts, revision: 1, updatedAt: new Date() };
        await collection.insertOne(created);
        return snapshotOf(created);
      } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
      }
    },
    async ping() {
      await db.command({ ping: 1 });
      return true;
    },
    async close() {
      await client.close();
    },
  };
}
