import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

export const QR_LOGIN_TTL_MS = 90_000;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

function tokenMatches(value, expectedHash) {
  const actual = Buffer.from(hashToken(value));
  const expected = Buffer.from(String(expectedHash || ''));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicRecord(record, currentTime = Date.now()) {
  if (!record) return null;
  const result = clone(record);
  delete result.scanTokenHash;
  delete result.browserVerifierHash;
  if (Date.parse(result.expiresAt) <= currentTime && !['consumed', 'rejected'].includes(result.status)) {
    result.status = 'expired';
  }
  return result;
}

function serialize(record, currentTime = Date.now()) {
  if (!record) return null;
  const result = Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== '_id')
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
  return publicRecord(result, currentTime);
}

function requestSecrets({ idFactory, secretFactory, codeFactory }) {
  return {
    requestId: idFactory(),
    scanToken: secretFactory(),
    browserVerifier: secretFactory(),
    verificationCode: String(codeFactory()).padStart(4, '0'),
  };
}

export function createMemoryQrLoginStore({
  now = () => new Date(),
  idFactory = () => crypto.randomUUID(),
  secretFactory = () => crypto.randomBytes(32).toString('base64url'),
  codeFactory = () => crypto.randomInt(0, 10_000),
  ttlMs = QR_LOGIN_TTL_MS,
} = {}) {
  const requests = new Map();

  function readActive(requestId) {
    const record = requests.get(String(requestId));
    if (!record || Date.parse(record.expiresAt) <= now().getTime()) return null;
    return record;
  }

  return {
    async create({ browserIp = '', browserUserAgent = '' } = {}) {
      const secrets = requestSecrets({ idFactory, secretFactory, codeFactory });
      const createdAt = now();
      const record = {
        id: secrets.requestId,
        status: 'pending',
        scanTokenHash: hashToken(secrets.scanToken),
        browserVerifierHash: hashToken(secrets.browserVerifier),
        verificationCode: secrets.verificationCode,
        browserIp: String(browserIp).slice(0, 128),
        browserUserAgent: String(browserUserAgent).slice(0, 256),
        scannedBy: null,
        scannedAt: null,
        approvedBy: null,
        approvedAt: null,
        confirmationMethod: null,
        rejectedAt: null,
        consumedAt: null,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
      };
      requests.set(record.id, record);
      return { ...secrets, record: publicRecord(record, createdAt.getTime()) };
    },
    async getForBrowser(requestId, browserVerifier) {
      const record = readActive(requestId);
      return record && tokenMatches(browserVerifier, record.browserVerifierHash) ? publicRecord(record, now().getTime()) : null;
    },
    async scan(requestId, scanToken, username) {
      const record = readActive(requestId);
      if (!record || !tokenMatches(scanToken, record.scanTokenHash)) return null;
      if (record.status === 'pending') {
        record.status = 'scanned';
        record.scannedBy = username;
        record.scannedAt = now().toISOString();
      }
      if (record.status !== 'scanned' || record.scannedBy !== username) return null;
      return publicRecord(record, now().getTime());
    },
    async getForActor(requestId, username) {
      const record = readActive(requestId);
      return record?.scannedBy === username ? publicRecord(record, now().getTime()) : null;
    },
    async approve(requestId, username, confirmationMethod = 'biometric') {
      const record = readActive(requestId);
      if (!record || record.status !== 'scanned' || record.scannedBy !== username) return null;
      record.status = 'approved';
      record.approvedBy = username;
      record.approvedAt = now().toISOString();
      record.confirmationMethod = confirmationMethod;
      return publicRecord(record, now().getTime());
    },
    async reject(requestId, username) {
      const record = readActive(requestId);
      if (!record || record.scannedBy !== username || !['scanned', 'approved'].includes(record.status)) return null;
      record.status = 'rejected';
      record.rejectedAt = now().toISOString();
      return publicRecord(record, now().getTime());
    },
    async cancel(requestId, browserVerifier) {
      const record = readActive(requestId);
      if (!record || !tokenMatches(browserVerifier, record.browserVerifierHash) || !['pending', 'scanned'].includes(record.status)) return null;
      record.status = 'rejected';
      record.rejectedAt = now().toISOString();
      return publicRecord(record, now().getTime());
    },
    async consume(requestId, browserVerifier) {
      const record = readActive(requestId);
      if (!record || record.status !== 'approved' || !tokenMatches(browserVerifier, record.browserVerifierHash)) return null;
      record.status = 'consumed';
      record.consumedAt = now().toISOString();
      return publicRecord(record, now().getTime());
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoQrLoginStore({
  uri,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  ttlMs = QR_LOGIN_TTL_MS,
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const requests = db.collection('qr_login_requests');
  await Promise.all([
    requests.createIndex({ id: 1 }, { unique: true }),
    requests.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    requests.createIndex({ status: 1, createdAt: -1 }),
  ]);

  function activeFilter(requestId) {
    return { id: String(requestId), expiresAt: { $gt: new Date() } };
  }

  return {
    async create({ browserIp = '', browserUserAgent = '' } = {}) {
      const secrets = requestSecrets({
        idFactory: () => crypto.randomUUID(),
        secretFactory: () => crypto.randomBytes(32).toString('base64url'),
        codeFactory: () => crypto.randomInt(0, 10_000),
      });
      const createdAt = new Date();
      const record = {
        id: secrets.requestId,
        status: 'pending',
        scanTokenHash: hashToken(secrets.scanToken),
        browserVerifierHash: hashToken(secrets.browserVerifier),
        verificationCode: secrets.verificationCode,
        browserIp: String(browserIp).slice(0, 128),
        browserUserAgent: String(browserUserAgent).slice(0, 256),
        scannedBy: null,
        scannedAt: null,
        approvedBy: null,
        approvedAt: null,
        confirmationMethod: null,
        rejectedAt: null,
        consumedAt: null,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + ttlMs),
      };
      await requests.insertOne(record);
      return { ...secrets, record: serialize(record) };
    },
    async getForBrowser(requestId, browserVerifier) {
      const record = await requests.findOne(activeFilter(requestId));
      return record && tokenMatches(browserVerifier, record.browserVerifierHash) ? serialize(record) : null;
    },
    async scan(requestId, scanToken, username) {
      const record = await requests.findOne(activeFilter(requestId));
      if (!record || !tokenMatches(scanToken, record.scanTokenHash)) return null;
      if (record.status === 'scanned' && record.scannedBy === username) return serialize(record);
      const updated = await requests.findOneAndUpdate(
        { ...activeFilter(requestId), status: 'pending' },
        { $set: { status: 'scanned', scannedBy: username, scannedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return serialize(updated);
    },
    async getForActor(requestId, username) {
      return serialize(await requests.findOne({ ...activeFilter(requestId), scannedBy: username }));
    },
    async approve(requestId, username, confirmationMethod = 'biometric') {
      return serialize(await requests.findOneAndUpdate(
        { ...activeFilter(requestId), status: 'scanned', scannedBy: username },
        { $set: { status: 'approved', approvedBy: username, approvedAt: new Date(), confirmationMethod } },
        { returnDocument: 'after' },
      ));
    },
    async reject(requestId, username) {
      return serialize(await requests.findOneAndUpdate(
        { ...activeFilter(requestId), status: { $in: ['scanned', 'approved'] }, scannedBy: username },
        { $set: { status: 'rejected', rejectedAt: new Date() } },
        { returnDocument: 'after' },
      ));
    },
    async cancel(requestId, browserVerifier) {
      const record = await requests.findOne(activeFilter(requestId));
      if (!record || !tokenMatches(browserVerifier, record.browserVerifierHash)) return null;
      return serialize(await requests.findOneAndUpdate(
        { ...activeFilter(requestId), status: { $in: ['pending', 'scanned'] } },
        { $set: { status: 'rejected', rejectedAt: new Date() } },
        { returnDocument: 'after' },
      ));
    },
    async consume(requestId, browserVerifier) {
      const record = await requests.findOne(activeFilter(requestId));
      if (!record || !tokenMatches(browserVerifier, record.browserVerifierHash)) return null;
      return serialize(await requests.findOneAndUpdate(
        { ...activeFilter(requestId), status: 'approved' },
        { $set: { status: 'consumed', consumedAt: new Date() } },
        { returnDocument: 'after' },
      ));
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { await client.close(); },
  };
}
