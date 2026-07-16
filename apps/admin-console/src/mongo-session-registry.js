import { MongoClient } from 'mongodb';
import { issueSession, verifySession } from './auth.js';

export async function createMongoSessionRegistry({
  uri,
  secret,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  maxSessions = 1024,
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const sessions = db.collection('sessions');
  await Promise.all([
    sessions.createIndex({ nonce: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  return {
    async issue({ username, ttlHours, now = Date.now() }) {
      const count = await sessions.estimatedDocumentCount();
      if (count >= maxSessions) {
        const overflow = count - maxSessions + 1;
        const oldest = await sessions.find({}, { projection: { _id: 1 } })
          .sort({ createdAt: 1 })
          .limit(overflow)
          .toArray();
        if (oldest.length > 0) await sessions.deleteMany({ _id: { $in: oldest.map((row) => row._id) } });
      }
      const token = issueSession({ username, secret, ttlHours, now });
      const session = verifySession(token, secret, now);
      await sessions.insertOne({
        nonce: session.nonce,
        subject: session.sub,
        expiresAt: new Date(session.exp * 1000),
        createdAt: new Date(now),
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
      });
      return active ? session : null;
    },

    async revoke(token, now = Date.now()) {
      const session = verifySession(token, secret, now);
      if (!session) return false;
      return (await sessions.deleteOne({ nonce: session.nonce })).deletedCount === 1;
    },

    async ping() {
      return (await db.command({ ping: 1 })).ok === 1;
    },

    async close() {
      await client.close();
    },
  };
}
