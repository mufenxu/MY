import { MongoClient } from 'mongodb';
import { issueSession, verifySession, createNativeCredentials, nativeAccessMatches, sessionTokenHash } from './auth.js';

export async function createMongoSessionRegistry({
  uri,
  client: sharedClient = null,
  secret,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  maxSessions = 1024,
  idleTimeoutMinutes = 30,
  touchIntervalMs = 60_000,
} = {}) {
  if (!uri && !sharedClient) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = sharedClient || new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  if (!sharedClient) await client.connect();
  const db = client.db(databaseName);
  const sessions = db.collection('sessions');
  const defaultIdleTimeoutMinutes = Math.max(Number(idleTimeoutMinutes) || 30, 1);
  const sessionIdleTimeoutMs = (session) => (
    Math.max(Number(session?.idleTimeoutMinutes) || defaultIdleTimeoutMinutes, 1) * 60_000
  );
  await Promise.all([
    sessions.createIndex({ nonce: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  await sessions.updateMany(
    { lastSeenAt: { $exists: false } },
    [{ $set: { lastSeenAt: { $ifNull: ['$createdAt', '$$NOW'] } } }],
  );

  return {
    async issue({
      username,
      accountId,
      authVersion = 0,
      role = 'super_admin',
      ttlHours,
      idleTimeoutMinutes: sessionIdleTimeoutMinutes = defaultIdleTimeoutMinutes,
      ip = '',
      userAgent = '',
      deviceId = '',
      deviceName = '',
      sessionKind = 'browser',
      parentSessionNonce = '',
      replaceExisting = false,
      nativeSecurity = null,
      accessTtlSeconds = 900,
      now = Date.now(),
    }) {
      const count = await sessions.estimatedDocumentCount();
      if (count >= maxSessions) {
        const overflow = count - maxSessions + 1;
        const oldest = await sessions.find({}, { projection: { _id: 1 } })
          .sort({ createdAt: 1 })
          .limit(overflow)
          .toArray();
        if (oldest.length > 0) await sessions.deleteMany({ _id: { $in: oldest.map((row) => row._id) } });
      }
      const token = issueSession({ username, accountId, authVersion, role, secret, ttlHours, now });
      const session = verifySession(token, secret, now);
      const normalizedKind = String(sessionKind || 'browser').slice(0, 32);
      const normalizedParentNonce = String(parentSessionNonce || '').slice(0, 160);
      const normalizedDeviceId = String(deviceId || '').slice(0, 128);
      const normalizedDeviceName = String(deviceName || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 96);
      const normalizedIp = String(ip || '').slice(0, 128);
      const normalizedUserAgent = String(userAgent || '').slice(0, 256);
      const native = nativeSecurity ? createNativeCredentials({ ...session, nativeKeyThumbprint: nativeSecurity.thumbprint }, secret, accessTtlSeconds, now) : null;
      await sessions.insertOne({
        nonce: session.nonce,
        subject: session.sub,
        accountId: session.accountId,
        authVersion: session.authVersion,
        role,
        ip: normalizedIp,
        userAgent: normalizedUserAgent,
        deviceId: normalizedDeviceId,
        deviceName: normalizedDeviceName,
        sessionKind: normalizedKind,
        parentSessionNonce: normalizedParentNonce,
        idleTimeoutMinutes: Math.max(Number(sessionIdleTimeoutMinutes) || defaultIdleTimeoutMinutes, 1),
        expiresAt: new Date(session.exp * 1000),
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
        ...(native ? {
          nativeKeyThumbprint: nativeSecurity.thumbprint, nativeIntegrity: nativeSecurity.integrity,
          nativeAttestedAt: nativeSecurity.attestedAt, nativeVersionCode: nativeSecurity.versionCode,
          accessTokenHash: native.accessTokenHash, refreshTokenHash: native.refreshTokenHash,
        } : {}),
      });
      if (replaceExisting && (normalizedParentNonce || normalizedDeviceId)) {
        await sessions.deleteMany({
          nonce: { $ne: session.nonce },
          subject: session.sub,
          sessionKind: normalizedKind,
          ...(normalizedParentNonce ? { parentSessionNonce: normalizedParentNonce } : {}),
          ...(normalizedDeviceId ? { deviceId: normalizedDeviceId } : {}),
        });
      }
      return native ? { token: native.token, refreshToken: native.refreshToken, accessExpiresAt: native.accessExpiresAt, expiresAt: session.exp } : token;
    },

    async verify(token, now = Date.now()) {
      const session = verifySession(token, secret, now);
      if (!session) return null;
      const active = await sessions.findOne({
        nonce: session.nonce,
        subject: session.sub,
        expiresAt: { $gt: new Date(now) },
      });
      if (!active) return null;
      if (active.nativeKeyThumbprint && !nativeAccessMatches(active, token, now)) return null;
      if (active.parentSessionNonce && !await this.isActive({ nonce: active.parentSessionNonce, subject: active.subject, now })) return null;
      const idleTimeoutMs = sessionIdleTimeoutMs(active);
      if (active.lastSeenAt.getTime() + idleTimeoutMs <= now) return null;
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
        sessionKind: active.sessionKind || (String(active.userAgent || '').startsWith('MY-Control-Android/') ? 'native_app' : 'browser'),
        nativeKeyThumbprint: active.nativeKeyThumbprint || '',
        nativeIntegrity: active.nativeIntegrity || 'unverified',
        nativeAttestedAt: active.nativeAttestedAt || 0,
        nativeVersionCode: active.nativeVersionCode || 0,
        idleExpiresAt: Math.min(session.exp, Math.floor((active.lastSeenAt.getTime() + idleTimeoutMs) / 1000)),
        reauthenticatedUntil,
      };
    },

    async markReauthenticated(token, { now = Date.now(), ttlSeconds = 300 } = {}) {
      const session = await this.verify(token, now);
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

    async refreshNative(refreshToken, { thumbprint, accessTtlSeconds = 900, now = Date.now() } = {}) {
      const nonce = String(refreshToken || '').split('.')[0];
      const active = await sessions.findOne({ nonce, nativeKeyThumbprint: thumbprint, expiresAt: { $gt: new Date(now) } });
      if (!active?.nativeKeyThumbprint || active.lastSeenAt.getTime() + sessionIdleTimeoutMs(active) <= now) return null;
      const refreshTokenHash = sessionTokenHash(refreshToken);
      if (active.refreshTokenHash !== refreshTokenHash) {
        await this.revokeByNonce(nonce);
        return null;
      }
      const identity = { sub: active.subject, accountId: active.accountId, authVersion: active.authVersion, role: active.role, nonce, exp: Math.floor(active.expiresAt.getTime() / 1000), nativeKeyThumbprint: thumbprint };
      const credentials = createNativeCredentials(identity, secret, accessTtlSeconds, now);
      const updated = await sessions.updateOne({ nonce, nativeKeyThumbprint: thumbprint, refreshTokenHash }, { $set: {
        accessTokenHash: credentials.accessTokenHash, refreshTokenHash: credentials.refreshTokenHash,
        previousAccessTokenHash: active.accessTokenHash, previousAccessUntil: now + 60_000, lastSeenAt: new Date(now),
      } });
      if (updated.modifiedCount !== 1) {
        await this.revokeByNonce(nonce);
        return null;
      }
      return {
        token: credentials.token, refreshToken: credentials.refreshToken, accessExpiresAt: credentials.accessExpiresAt,
        expiresAt: identity.exp, sub: identity.sub, accountId: identity.accountId, authVersion: identity.authVersion,
        nonce, nativeIntegrity: active.nativeIntegrity, nativeAttestedAt: active.nativeAttestedAt,
        nativeVersionCode: active.nativeVersionCode,
      };
    },

    async revoke(token, now = Date.now()) {
      const session = verifySession(token, secret, now);
      if (!session) return false;
      return this.revokeByNonce(session.nonce);
    },

    async revokeByNonce(nonce, { subject } = {}) {
      return (await sessions.deleteMany({
        $or: [{ nonce: String(nonce || '') }, { parentSessionNonce: String(nonce || '') }],
        ...(subject ? { subject } : {}),
      })).deletedCount > 0;
    },

    async revokeBySubject(subject, { exceptNonce } = {}) {
      if (exceptNonce) await sessions.updateOne({ subject: String(subject || ''), nonce: exceptNonce }, { $set: { parentSessionNonce: '' } });
      return (await sessions.deleteMany({ subject: String(subject || ''), ...(exceptNonce ? { nonce: { $ne: exceptNonce } } : {}) })).deletedCount;
    },

    async isActive({ nonce, subject, now = Date.now() } = {}) {
      if (!nonce || !subject) return false;
      const active = await sessions.findOne({
        nonce: String(nonce),
        subject: String(subject),
        expiresAt: { $gt: new Date(now) },
      }, {
        projection: { lastSeenAt: 1, idleTimeoutMinutes: 1 },
      });
      return Boolean(active?.lastSeenAt && active.lastSeenAt.getTime() + sessionIdleTimeoutMs(active) > now);
    },

    async list({ subject, limit = 100 } = {}) {
      const query = {
        expiresAt: { $gt: new Date() },
        ...(subject ? { subject } : {}),
      };
      return sessions.find(query, { projection: { _id: 0, accessTokenHash: 0, previousAccessTokenHash: 0, refreshTokenHash: 0 } })
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
        .toArray()
        .then((rows) => rows
          .filter((row) => row.lastSeenAt.getTime() + sessionIdleTimeoutMs(row) > Date.now())
          .map((row) => ({
            ...row,
            role: row.role || 'super_admin',
            sessionKind: String(row.sessionKind || '').trim()
              || (String(row.userAgent || '').startsWith('MY-Control-Android/') ? 'native_app' : 'browser'),
            parentSessionNonce: row.parentSessionNonce || '',
            deviceId: row.deviceId || '',
            createdAt: row.createdAt?.toISOString?.() || row.createdAt,
            lastSeenAt: row.lastSeenAt?.toISOString?.() || row.lastSeenAt,
            idleExpiresAt: new Date(Math.min(
              row.expiresAt.getTime(),
              row.lastSeenAt.getTime() + sessionIdleTimeoutMs(row),
            )).toISOString(),
            expiresAt: row.expiresAt?.toISOString?.() || row.expiresAt,
          })));
    },

    async ping() {
      return (await db.command({ ping: 1 })).ok === 1;
    },

    async close() {
      if (!sharedClient) await client.close();
    },
  };
}
