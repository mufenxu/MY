import { MongoClient } from 'mongodb';
import { issueSession, verifySession } from './auth.js';

export async function createMongoSessionRegistry({
  uri,
  secret,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  maxSessions = 1024,
  idleTimeoutMinutes = 30,
  touchIntervalMs = 60_000,
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const sessions = db.collection('sessions');
  const idleTimeoutMs = Math.max(Number(idleTimeoutMinutes) || 30, 1) * 60_000;
  await Promise.all([
    sessions.createIndex({ nonce: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  await sessions.updateMany(
    { lastSeenAt: { $exists: false } },
    [{ $set: { lastSeenAt: { $ifNull: ['$createdAt', '$$NOW'] } } }],
  );

  return {
    async issue({ username, role = 'super_admin', ttlHours, ip = '', userAgent = '', now = Date.now() }) {
      const count = await sessions.estimatedDocumentCount();
      if (count >= maxSessions) {
        const overflow = count - maxSessions + 1;
        const oldest = await sessions.find({}, { projection: { _id: 1 } })
          .sort({ createdAt: 1 })
          .limit(overflow)
          .toArray();
        if (oldest.length > 0) await sessions.deleteMany({ _id: { $in: oldest.map((row) => row._id) } });
      }
      const token = issueSession({ username, role, secret, ttlHours, now });
      const session = verifySession(token, secret, now);
      await sessions.insertOne({
        nonce: session.nonce,
        subject: session.sub,
        role,
        ip: String(ip || '').slice(0, 128),
        userAgent: String(userAgent || '').slice(0, 256),
        expiresAt: new Date(session.exp * 1000),
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
      });
      return token;
    },

    async verify(token, now = Date.now()) {
      const session = verifySession(token, secret, now);
      if (!session) return null;
      const active = await sessions.findOne({
        nonce: session.nonce,
        subject: session.sub,
        expiresAt: { $gt: new Date(now) },
        lastSeenAt: { $gt: new Date(now - idleTimeoutMs) },
      });
      if (!active) return null;
      if (now - active.lastSeenAt.getTime() >= touchIntervalMs) {
        active.lastSeenAt = new Date(now);
        await sessions.updateOne(
          { nonce: session.nonce, lastSeenAt: { $lt: new Date(now - touchIntervalMs) } },
          { $set: { lastSeenAt: active.lastSeenAt } },
        );
      }
      const reauthenticatedUntil = active.reauthenticatedUntil instanceof Date
        && active.reauthenticatedUntil.getTime() > now
        ? Math.floor(active.reauthenticatedUntil.getTime() / 1000)
        : 0;
      return {
        ...session,
        role: active.role || session.role || 'super_admin',
        idleExpiresAt: Math.min(session.exp, Math.floor((active.lastSeenAt.getTime() + idleTimeoutMs) / 1000)),
        reauthenticatedUntil,
      };
    },

    async markReauthenticated(token, { now = Date.now(), ttlSeconds = 300 } = {}) {
      const session = verifySession(token, secret, now);
      if (!session) return null;
      const nowSeconds = Math.floor(now / 1000);
      const reauthenticatedUntil = Math.min(
        session.exp,
        nowSeconds + Math.min(Math.max(Number(ttlSeconds) || 300, 30), 300),
      );
      const result = await sessions.updateOne({
        nonce: session.nonce,
        subject: session.sub,
        expiresAt: { $gt: new Date(now) },
      }, {
        $set: { reauthenticatedUntil: new Date(reauthenticatedUntil * 1000) },
      });
      return result.matchedCount === 1 ? reauthenticatedUntil : null;
    },

    async revoke(token, now = Date.now()) {
      const session = verifySession(token, secret, now);
      if (!session) return false;
      return (await sessions.deleteOne({ nonce: session.nonce })).deletedCount === 1;
    },

    async revokeByNonce(nonce) {
      return (await sessions.deleteOne({ nonce: String(nonce || '') })).deletedCount === 1;
    },

    async revokeBySubject(subject) {
      return (await sessions.deleteMany({ subject: String(subject || '') })).deletedCount;
    },

    async list({ subject, limit = 100 } = {}) {
      const query = {
        expiresAt: { $gt: new Date() },
        ...(subject ? { subject } : {}),
      };
      return sessions.find(query, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
        .toArray()
        .then((rows) => rows.map((row) => ({
          ...row,
          role: row.role || 'super_admin',
          createdAt: row.createdAt?.toISOString?.() || row.createdAt,
          lastSeenAt: row.lastSeenAt?.toISOString?.() || row.lastSeenAt,
          idleExpiresAt: new Date(Math.min(
            row.expiresAt.getTime(),
            row.lastSeenAt.getTime() + idleTimeoutMs,
          )).toISOString(),
          expiresAt: row.expiresAt?.toISOString?.() || row.expiresAt,
        })));
    },

    async ping() {
      return (await db.command({ ping: 1 })).ok === 1;
    },

    async close() {
      await client.close();
    },
  };
}
