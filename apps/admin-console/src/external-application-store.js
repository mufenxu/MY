import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';

export const EXTERNAL_AUTHORIZATION_CODE_TTL_MS = 60_000;

const scrypt = promisify(crypto.scrypt);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url');
}

async function hashSecret(secret, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = await scrypt(String(secret || ''), salt, 32);
  return `scrypt$${salt}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifySecret(secret, encoded) {
  const [scheme, salt, digest] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const actual = Buffer.from((await scrypt(String(secret || ''), salt, 32)));
  const expected = Buffer.from(digest, 'base64url');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function secretHint(secret) {
  const value = String(secret || '');
  return value.length <= 8 ? value : value.slice(-8);
}

function serializeDates(record) {
  if (!record) return null;
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => key !== '_id')
    .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : clone(value)]));
}

function publicApplication(record) {
  const result = serializeDates(record);
  if (!result) return null;
  delete result.clientSecretHash;
  return result;
}

function publicAuthorizationCode(record) {
  const result = serializeDates(record);
  if (!result) return null;
  delete result.codeHash;
  return result;
}

function applicationRecord(input, {
  id,
  clientId,
  clientSecretHash,
  clientSecretHint,
  createdAt,
  updatedAt,
}) {
  return {
    id,
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    clientId,
    clientSecretHash,
    clientSecretHint,
    redirectUris: clone(input.redirectUris || []),
    launchUrl: String(input.launchUrl || '').trim(),
    healthUrl: String(input.healthUrl || '').trim() || null,
    requiredRole: String(input.requiredRole || 'viewer'),
    openMode: String(input.openMode || 'webview'),
    enabled: input.enabled !== false,
    createdAt,
    createdBy: String(input.actor || 'system'),
    updatedAt,
    updatedBy: String(input.actor || 'system'),
  };
}

function applicationPatch(input, updatedAt) {
  const patch = { updatedAt, updatedBy: String(input.actor || 'system') };
  for (const key of ['name', 'description', 'launchUrl', 'healthUrl', 'requiredRole', 'openMode']) {
    if (key in input) patch[key] = String(input[key] || '').trim() || (key === 'healthUrl' ? null : '');
  }
  if ('redirectUris' in input) patch.redirectUris = clone(input.redirectUris || []);
  if ('enabled' in input) patch.enabled = input.enabled !== false;
  return patch;
}

export function createMemoryExternalApplicationStore({
  now = () => new Date(),
  idFactory = () => crypto.randomUUID(),
  clientIdFactory = () => `my_${crypto.randomBytes(18).toString('base64url')}`,
  secretFactory = () => crypto.randomBytes(32).toString('base64url'),
  codeFactory = () => crypto.randomBytes(32).toString('base64url'),
  codeTtlMs = EXTERNAL_AUTHORIZATION_CODE_TTL_MS,
} = {}) {
  const applications = new Map();
  const clientIndex = new Map();
  const authorizationCodes = new Map();

  return {
    async createApplication(input) {
      const id = idFactory();
      const clientId = clientIdFactory();
      const clientSecret = secretFactory();
      const timestamp = now().toISOString();
      const record = applicationRecord(input, {
        id,
        clientId,
        clientSecretHash: await hashSecret(clientSecret),
        clientSecretHint: secretHint(clientSecret),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      applications.set(id, record);
      clientIndex.set(clientId, id);
      return { application: publicApplication(record), clientSecret };
    },

    async listApplications() {
      return [...applications.values()]
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
        .map(publicApplication);
    },

    async getApplication(id) {
      return publicApplication(applications.get(String(id)) || null);
    },

    async findApplicationByClientId(clientId) {
      const id = clientIndex.get(String(clientId));
      return publicApplication(id ? applications.get(id) : null);
    },

    async updateApplication(id, input) {
      const record = applications.get(String(id));
      if (!record) return null;
      Object.assign(record, applicationPatch(input, now().toISOString()));
      return publicApplication(record);
    },

    async deleteApplication(id) {
      const record = applications.get(String(id));
      if (!record) return false;
      applications.delete(String(id));
      clientIndex.delete(record.clientId);
      return true;
    },

    async rotateClientSecret(id, actor = 'system') {
      const record = applications.get(String(id));
      if (!record) return null;
      const clientSecret = secretFactory();
      record.clientSecretHash = await hashSecret(clientSecret);
      record.clientSecretHint = secretHint(clientSecret);
      record.updatedAt = now().toISOString();
      record.updatedBy = String(actor || 'system');
      return { application: publicApplication(record), clientSecret };
    },

    async verifyClientSecret(clientId, clientSecret) {
      const id = clientIndex.get(String(clientId));
      const record = id ? applications.get(id) : null;
      return Boolean(record && await verifySecret(clientSecret, record.clientSecretHash));
    },

    async createAuthorizationCode(input) {
      const code = codeFactory();
      const createdAt = now();
      const record = {
        codeHash: hashToken(code),
        status: 'pending',
        clientId: String(input.clientId || ''),
        redirectUri: String(input.redirectUri || ''),
        username: String(input.username || ''),
        role: String(input.role || 'viewer'),
        scope: String(input.scope || 'openid'),
        nonce: String(input.nonce || '').slice(0, 256),
        codeChallenge: String(input.codeChallenge || ''),
        sessionNonce: String(input.sessionNonce || '').slice(0, 160),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + codeTtlMs).toISOString(),
        consumedAt: null,
      };
      authorizationCodes.set(record.codeHash, record);
      return { code, record: publicAuthorizationCode(record) };
    },

    async consumeAuthorizationCode({ code, clientId, redirectUri, codeChallenge }) {
      const record = authorizationCodes.get(hashToken(code));
      if (
        !record
        || record.status !== 'pending'
        || record.clientId !== String(clientId || '')
        || record.redirectUri !== String(redirectUri || '')
        || (codeChallenge !== undefined && record.codeChallenge !== String(codeChallenge || ''))
        || Date.parse(record.expiresAt) <= now().getTime()
      ) return null;
      record.status = 'consumed';
      record.consumedAt = now().toISOString();
      return publicAuthorizationCode(record);
    },

    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoExternalApplicationStore({
  uri,
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  codeTtlMs = EXTERNAL_AUTHORIZATION_CODE_TTL_MS,
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(databaseName);
  const applications = db.collection('external_applications');
  const authorizationCodes = db.collection('external_authorization_codes');
  await Promise.all([
    applications.createIndex({ id: 1 }, { unique: true }),
    applications.createIndex({ clientId: 1 }, { unique: true }),
    applications.createIndex({ enabled: 1, name: 1 }),
    authorizationCodes.createIndex({ codeHash: 1 }, { unique: true }),
    authorizationCodes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  return {
    async createApplication(input) {
      const clientSecret = crypto.randomBytes(32).toString('base64url');
      const timestamp = new Date();
      const record = applicationRecord(input, {
        id: crypto.randomUUID(),
        clientId: `my_${crypto.randomBytes(18).toString('base64url')}`,
        clientSecretHash: await hashSecret(clientSecret),
        clientSecretHint: secretHint(clientSecret),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await applications.insertOne(record);
      return { application: publicApplication(record), clientSecret };
    },

    async listApplications() {
      return (await applications.find({}).sort({ name: 1 }).toArray()).map(publicApplication);
    },

    async getApplication(id) {
      return publicApplication(await applications.findOne({ id: String(id || '') }));
    },

    async findApplicationByClientId(clientId) {
      return publicApplication(await applications.findOne({ clientId: String(clientId || '') }));
    },

    async updateApplication(id, input) {
      return publicApplication(await applications.findOneAndUpdate(
        { id: String(id || '') },
        { $set: applicationPatch(input, new Date()) },
        { returnDocument: 'after' },
      ));
    },

    async deleteApplication(id) {
      return (await applications.deleteOne({ id: String(id || '') })).deletedCount === 1;
    },

    async rotateClientSecret(id, actor = 'system') {
      const clientSecret = crypto.randomBytes(32).toString('base64url');
      const record = await applications.findOneAndUpdate(
        { id: String(id || '') },
        { $set: {
          clientSecretHash: await hashSecret(clientSecret),
          clientSecretHint: secretHint(clientSecret),
          updatedAt: new Date(),
          updatedBy: String(actor || 'system'),
        } },
        { returnDocument: 'after' },
      );
      return record ? { application: publicApplication(record), clientSecret } : null;
    },

    async verifyClientSecret(clientId, clientSecret) {
      const record = await applications.findOne(
        { clientId: String(clientId || '') },
        { projection: { clientSecretHash: 1 } },
      );
      return Boolean(record && await verifySecret(clientSecret, record.clientSecretHash));
    },

    async createAuthorizationCode(input) {
      const code = crypto.randomBytes(32).toString('base64url');
      const createdAt = new Date();
      const record = {
        codeHash: hashToken(code),
        status: 'pending',
        clientId: String(input.clientId || ''),
        redirectUri: String(input.redirectUri || ''),
        username: String(input.username || ''),
        role: String(input.role || 'viewer'),
        scope: String(input.scope || 'openid'),
        nonce: String(input.nonce || '').slice(0, 256),
        codeChallenge: String(input.codeChallenge || ''),
        sessionNonce: String(input.sessionNonce || '').slice(0, 160),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + codeTtlMs),
        consumedAt: null,
      };
      await authorizationCodes.insertOne(record);
      return { code, record: publicAuthorizationCode(record) };
    },

    async consumeAuthorizationCode({ code, clientId, redirectUri, codeChallenge }) {
      return publicAuthorizationCode(await authorizationCodes.findOneAndUpdate(
        {
          codeHash: hashToken(code),
          status: 'pending',
          clientId: String(clientId || ''),
          redirectUri: String(redirectUri || ''),
          ...(codeChallenge !== undefined ? { codeChallenge: String(codeChallenge || '') } : {}),
          expiresAt: { $gt: new Date() },
        },
        { $set: { status: 'consumed', consumedAt: new Date() } },
        { returnDocument: 'after' },
      ));
    },

    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { await client.close(); },
  };
}
