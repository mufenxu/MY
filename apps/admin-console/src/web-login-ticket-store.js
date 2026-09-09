import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

export const WEB_LOGIN_TICKET_TTL_MS = 30_000;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

function publicRecord(record) {
  if (!record) return null;
  const result = clone(record);
  delete result.ticketHash;
  return result;
}

function serialize(record) {
  if (!record) return null;
  const result = Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== '_id')
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
  return publicRecord(result);
}

export function createMemoryWebLoginTicketStore({
  now = () => new Date(),
  secretFactory = () => crypto.randomBytes(32).toString('base64url'),
  ttlMs = WEB_LOGIN_TICKET_TTL_MS,
} = {}) {
  const tickets = new Map();

  return {
    async create({
      username,
      role,
      redirect,
      appSessionNonce = '',
      appIp = '',
      appUserAgent = '',
      sessionKind = 'browser',
    }) {
      const ticket = secretFactory();
      const createdAt = now();
      const record = {
        ticketHash: hashToken(ticket),
        status: 'pending',
        username,
        role,
        redirect,
        appSessionNonce: String(appSessionNonce).slice(0, 160),
        appIp: String(appIp).slice(0, 128),
        appUserAgent: String(appUserAgent).slice(0, 256),
        sessionKind: String(sessionKind || 'browser').slice(0, 32),
        consumedAt: null,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
      };
      tickets.set(record.ticketHash, record);
      return { ticket, record: publicRecord(record) };
    },
    async consume(ticket) {
      const ticketHash = hashToken(ticket);
      const record = tickets.get(ticketHash);
      if (!record || record.status !== 'pending' || Date.parse(record.expiresAt) <= now().getTime()) return null;
      record.status = 'consumed';
      record.consumedAt = now().toISOString();
      return publicRecord(record);
    },
    async revokeForSessions({ subject, nonce, exceptNonce } = {}) {
      for (const record of tickets.values()) {
        if (record.status === 'pending' && (!subject || record.username === subject)
          && (!nonce || record.appSessionNonce === nonce) && record.appSessionNonce !== exceptNonce) {
          record.status = 'revoked';
        }
      }
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoWebLoginTicketStore({
  uri,
  client: sharedClient = null,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  ttlMs = WEB_LOGIN_TICKET_TTL_MS,
} = {}) {
  if (!uri && !sharedClient) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = sharedClient || new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  if (!sharedClient) await client.connect();
  const db = client.db(databaseName);
  const tickets = db.collection('web_login_tickets');
  await Promise.all([
    tickets.createIndex({ ticketHash: 1 }, { unique: true }),
    tickets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    tickets.createIndex({ username: 1, createdAt: -1 }),
  ]);

  return {
    async create({
      username,
      role,
      redirect,
      appSessionNonce = '',
      appIp = '',
      appUserAgent = '',
      sessionKind = 'browser',
    }) {
      const ticket = crypto.randomBytes(32).toString('base64url');
      const createdAt = new Date();
      const record = {
        ticketHash: hashToken(ticket),
        status: 'pending',
        username,
        role,
        redirect,
        appSessionNonce: String(appSessionNonce).slice(0, 160),
        appIp: String(appIp).slice(0, 128),
        appUserAgent: String(appUserAgent).slice(0, 256),
        sessionKind: String(sessionKind || 'browser').slice(0, 32),
        consumedAt: null,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + ttlMs),
      };
      await tickets.insertOne(record);
      return { ticket, record: serialize(record) };
    },
    async consume(ticket) {
      return serialize(await tickets.findOneAndUpdate(
        {
          ticketHash: hashToken(ticket),
          status: 'pending',
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: 'consumed', consumedAt: new Date() } },
        { returnDocument: 'after' },
      ));
    },
    async revokeForSessions({ subject, nonce, exceptNonce } = {}) {
      await tickets.updateMany({
        status: 'pending',
        ...(subject ? { username: subject } : {}),
        ...(nonce ? { appSessionNonce: nonce } : exceptNonce ? { appSessionNonce: { $ne: exceptNonce } } : {}),
      }, { $set: { status: 'revoked' } });
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { if (!sharedClient) await client.close(); },
  };
}
