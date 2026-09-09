import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { MongoClient } from 'mongodb';
import { matchTotp } from './auth.js';

const ROLES = new Set(['viewer', 'operator', 'super_admin']);
const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{3,64}$/;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 10;

function nowDate(now = Date.now()) {
  return new Date(now);
}

function normalizeUsername(value) {
  const username = String(value || '').trim();
  return USERNAME_PATTERN.test(username) ? username : '';
}

function normalizeRole(value) {
  const role = String(value || '').trim();
  return ROLES.has(role) ? role : '';
}

export function normalizeServiceBindings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SERVICE_BINDINGS');
  const result = {};
  for (const [service, input] of Object.entries(value)) {
    if (!['core', 'exam', 'campus'].includes(service) || typeof input !== 'string') throw new Error('INVALID_SERVICE_BINDINGS');
    const username = input.trim();
    if (username && !/^[A-Za-z0-9._@-]{1,128}$/.test(username)) throw new Error('INVALID_SERVICE_BINDINGS');
    if (username) result[service] = username;
  }
  return result;
}

function decodeKey(value) {
  const key = Buffer.from(String(value || ''), 'base64url');
  if (key.length !== 32) throw new Error('PLATFORM_AUTH_ENCRYPTION_KEY must be a Base64URL-encoded 32-byte key.');
  return key;
}

function encryptSecret(value, key) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['enc', 'v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}

function decryptSecret(value, key) {
  if (!value) return '';
  const [prefix, version, ivValue, tagValue, ciphertextValue, extra] = String(value).split(':');
  if (prefix !== 'enc' || version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function keyedHash(value, key, purpose) {
  return crypto.createHmac('sha256', key).update(`${purpose}:${String(value || '')}`).digest('base64url');
}

function normalizeRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function createRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = crypto.randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase();
    return value.match(/.{1,5}/g).join('-');
  });
}

function generateBase32(bytes = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = crypto.randomBytes(bytes);
  let bits = '';
  for (const byte of input) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id || String(account._id),
    username: account.username,
    role: account.role,
    active: account.active !== false,
    totpEnabled: Boolean(account.totpSecretEncrypted),
    recoveryCodesRemaining: Array.isArray(account.recoveryCodeHashes) ? account.recoveryCodeHashes.length : 0,
    passkeyCount: Array.isArray(account.passkeys) ? account.passkeys.length : 0,
    serviceBindings: { ...account.serviceBindings },
    createdAt: account.createdAt?.toISOString?.() || account.createdAt || null,
    updatedAt: account.updatedAt?.toISOString?.() || account.updatedAt || null,
    lastLoginAt: account.lastLoginAt?.toISOString?.() || account.lastLoginAt || null,
  };
}

function privateAccount(account, key) {
  if (!account) return null;
  return {
    ...publicAccount(account),
    passwordHash: account.passwordHash,
    authVersion: Number(account.authVersion) || 0,
    totpSecret: decryptSecret(account.totpSecretEncrypted, key),
    lastTotpCounter: Number.isSafeInteger(account.lastTotpCounter) ? account.lastTotpCounter : -1,
  };
}

function validateBootstrap(bootstrap) {
  const username = normalizeUsername(bootstrap?.username);
  const role = normalizeRole(bootstrap?.role);
  if (!username || !bootstrap?.passwordHash || !role) throw new Error('A valid bootstrap administrator is required.');
  return { username, passwordHash: bootstrap.passwordHash, role, totpSecret: bootstrap.totpSecret || '' };
}

function totpUri({ issuer, username, secret }) {
  const label = `${issuer}:${username}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

export function createMemoryAuthStore({ bootstrap, encryptionKey, issuer = 'MY Platform', legacyBindings = {}, now = () => Date.now() } = {}) {
  const key = decodeKey(encryptionKey);
  const initial = validateBootstrap(bootstrap);
  const accounts = new Map();
  const challenges = new Map();
  accounts.set(initial.username, {
    id: crypto.randomUUID(),
    authVersion: 0,
    serviceBindings: normalizeServiceBindings(Object.fromEntries(['core', 'exam', 'campus'].map((service) => [service, legacyBindings[service] || initial.username]))),
    username: initial.username,
    passwordHash: initial.passwordHash,
    role: initial.role,
    active: true,
    totpSecretEncrypted: encryptSecret(initial.totpSecret, key),
    lastTotpCounter: -1,
    recoveryCodeHashes: [],
    passkeys: [],
    knownIpHashes: [],
    createdAt: nowDate(now()),
    updatedAt: nowDate(now()),
  });

  function accountFor(username) {
    return accounts.get(normalizeUsername(username)) || null;
  }

  async function consumeSecondFactor(username, { totp = '', recoveryCode = '' } = {}) {
    const account = accountFor(username);
    const secret = decryptSecret(account?.totpSecretEncrypted, key);
    if (!account || !secret) return { valid: Boolean(account), method: 'none' };
    const counter = matchTotp(totp, secret, now());
    if (counter !== null && counter > (account.lastTotpCounter ?? -1)) {
      account.lastTotpCounter = counter;
      account.updatedAt = nowDate(now());
      return { valid: true, method: 'totp' };
    }
    const normalized = normalizeRecoveryCode(recoveryCode);
    const recoveryHash = normalized ? keyedHash(normalized, key, 'recovery') : '';
    const recoveryIndex = account.recoveryCodeHashes.indexOf(recoveryHash);
    if (recoveryIndex >= 0) {
      account.recoveryCodeHashes.splice(recoveryIndex, 1);
      account.updatedAt = nowDate(now());
      return { valid: true, method: 'recovery_code' };
    }
    return { valid: false, method: 'invalid' };
  }

  return {
    async findAccount(username) {
      return privateAccount(accountFor(username), key);
    },
    async listAccounts() {
      return [...accounts.values()].map(publicAccount).sort((left, right) => left.username.localeCompare(right.username));
    },
    async createAccount({ username, passwordHash, role, serviceBindings = {} }) {
      const normalizedUsername = normalizeUsername(username);
      const normalizedRole = normalizeRole(role);
      if (!normalizedUsername || !passwordHash || !normalizedRole) throw new Error('INVALID_ACCOUNT');
      if (accounts.has(normalizedUsername)) throw new Error('ACCOUNT_EXISTS');
      const account = {
        id: crypto.randomUUID(),
        authVersion: 0,
        serviceBindings: normalizeServiceBindings(serviceBindings),
        username: normalizedUsername,
        passwordHash,
        role: normalizedRole,
        active: true,
        totpSecretEncrypted: '',
        lastTotpCounter: -1,
        recoveryCodeHashes: [],
        passkeys: [],
        knownIpHashes: [],
        createdAt: nowDate(now()),
        updatedAt: nowDate(now()),
      };
      accounts.set(normalizedUsername, account);
      return publicAccount(account);
    },
    async updateAccount(username, patch) {
      const account = accountFor(username);
      if (!account) return null;
      const role = patch.role === undefined ? account.role : normalizeRole(patch.role);
      const active = patch.active === undefined ? account.active : Boolean(patch.active);
      if (!role) throw new Error('INVALID_ROLE');
      const serviceBindings = patch.serviceBindings === undefined ? account.serviceBindings : normalizeServiceBindings(patch.serviceBindings);
      if ((account.role === 'super_admin') && (role !== 'super_admin' || !active)) {
        const remaining = [...accounts.values()].filter((item) => item.active !== false && item.role === 'super_admin' && item.username !== account.username);
        if (remaining.length === 0) throw new Error('LAST_SUPER_ADMIN');
      }
      account.role = role;
      account.active = active;
      account.serviceBindings = serviceBindings;
      account.authVersion = (account.authVersion || 0) + 1;
      account.updatedAt = nowDate(now());
      return publicAccount(account);
    },
    async upgradePasswordHash(username, expectedHash, passwordHash) {
      const account = accountFor(username);
      if (!account || account.passwordHash !== expectedHash) return false;
      account.passwordHash = passwordHash;
      account.updatedAt = nowDate(now());
      return true;
    },
    async setPasswordHash(username, passwordHash) {
      const account = accountFor(username);
      if (!account || !passwordHash) return false;
      account.passwordHash = passwordHash;
      account.authVersion = (account.authVersion || 0) + 1;
      account.updatedAt = nowDate(now());
      return true;
    },
    async resetCredentials(username, authVersion, passwordHash) {
      const account = accountFor(username);
      if (!account?.active || (account.authVersion || 0) !== authVersion) return false;
      Object.assign(account, { passwordHash, authVersion: authVersion + 1, totpSecretEncrypted: '', lastTotpCounter: -1, recoveryCodeHashes: [], passkeys: [], updatedAt: nowDate(now()) });
      delete account.pendingTotp;
      return true;
    },
    consumeSecondFactor,
    async beginTotpEnrollment(username) {
      const account = accountFor(username);
      if (!account) return null;
      const secret = generateBase32();
      const uri = totpUri({ issuer, username: account.username, secret });
      const id = crypto.randomUUID();
      const expiresAt = now() + 10 * 60_000;
      account.pendingTotp = { id, secretEncrypted: encryptSecret(secret, key), expiresAt };
      return { id, secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 }), expiresAt: new Date(expiresAt).toISOString() };
    },
    async confirmTotpEnrollment(username, token, { enrollmentId, authVersion } = {}) {
      const account = accountFor(username);
      if (!account?.active || !account.pendingTotp || account.pendingTotp.expiresAt <= now()
        || (enrollmentId && enrollmentId !== account.pendingTotp.id) || (authVersion !== undefined && authVersion !== account.authVersion)) return null;
      const secret = decryptSecret(account.pendingTotp.secretEncrypted, key);
      const counter = matchTotp(token, secret, now(), { window: 1 });
      if (counter === null) return null;
      const recoveryCodes = createRecoveryCodes();
      account.totpSecretEncrypted = encryptSecret(secret, key);
      account.lastTotpCounter = counter;
      account.recoveryCodeHashes = recoveryCodes.map((code) => keyedHash(normalizeRecoveryCode(code), key, 'recovery'));
      delete account.pendingTotp;
      account.updatedAt = nowDate(now());
      return { recoveryCodes };
    },
    async disableTotp(username) {
      const account = accountFor(username);
      if (!account) return false;
      account.totpSecretEncrypted = '';
      account.lastTotpCounter = -1;
      account.recoveryCodeHashes = [];
      delete account.pendingTotp;
      account.updatedAt = nowDate(now());
      return true;
    },
    async regenerateRecoveryCodes(username) {
      const account = accountFor(username);
      if (!account?.totpSecretEncrypted) return null;
      const recoveryCodes = createRecoveryCodes();
      account.recoveryCodeHashes = recoveryCodes.map((code) => keyedHash(normalizeRecoveryCode(code), key, 'recovery'));
      account.updatedAt = nowDate(now());
      return { recoveryCodes };
    },
    async listPasskeys(username) {
      const account = accountFor(username);
      return (account?.passkeys || []).map(({ publicKey: _publicKey, ...passkey }) => ({ ...passkey }));
    },
    async getPasskeys(username) {
      return structuredClone(accountFor(username)?.passkeys || []);
    },
    async findPasskey(id) {
      const passkeyId = String(id || '');
      if (!passkeyId) return null;
      for (const account of accounts.values()) {
        const passkey = account.active === false ? null : account.passkeys.find((item) => item.id === passkeyId);
        if (passkey) return { username: account.username, passkey: structuredClone(passkey) };
      }
      return null;
    },
    async savePasskey(username, passkey, { accountId, authVersion } = {}) {
      const account = accountFor(username);
      if (!account?.active || (accountId && account.id !== accountId) || (authVersion !== undefined && account.authVersion !== authVersion)
        || account.passkeys.some((item) => item.id === passkey.id)) return false;
      account.passkeys.push(structuredClone(passkey));
      account.updatedAt = nowDate(now());
      return true;
    },
    async updatePasskeyCounter(username, id, counter, { accountId, authVersion, previousCounter } = {}) {
      const account = accountFor(username);
      if (!account?.active || (accountId && account.id !== accountId) || (authVersion !== undefined && account.authVersion !== authVersion)) return false;
      const passkey = account.passkeys.find((item) => item.id === id);
      if (!passkey || (previousCounter !== undefined && passkey.counter !== previousCounter)) return false;
      passkey.counter = counter;
      passkey.lastUsedAt = new Date(now()).toISOString();
      return true;
    },
    async deletePasskey(username, id) {
      const account = accountFor(username);
      if (!account) return false;
      const before = account.passkeys.length;
      account.passkeys = account.passkeys.filter((item) => item.id !== id);
      return account.passkeys.length !== before;
    },
    async saveChallenge({ kind, username, challenge, ttlMs = 5 * 60_000 }) {
      const id = crypto.randomBytes(24).toString('base64url');
      for (const [key, value] of challenges) if (value.expiresAt <= now()) challenges.delete(key);
      challenges.set(keyedHash(id, key, 'challenge'), { kind, username: normalizeUsername(username), challenge, attempts: 0, expiresAt: now() + ttlMs });
      return id;
    },
    async findChallenge(id, kind) {
      const value = challenges.get(keyedHash(id, key, 'challenge'));
      return value && value.kind === kind && value.expiresAt > now() && value.attempts < 5 ? structuredClone(value) : null;
    },
    async failChallenge(id, kind) {
      const value = challenges.get(keyedHash(id, key, 'challenge'));
      if (value?.kind === kind) value.attempts += 1;
    },
    async consumeChallenge(id, kind, username) {
      const hash = keyedHash(id, key, 'challenge');
      const value = challenges.get(hash);
      if (!value || value.attempts >= 5 || value.expiresAt <= now() || value.kind !== kind || value.username !== normalizeUsername(username)) return null;
      challenges.delete(hash);
      return value.challenge;
    },
    async rememberLoginIp(username, ip) {
      const account = accountFor(username);
      if (!account) return { newIp: false };
      const value = keyedHash(ip, key, 'login-ip');
      const newIp = !account.knownIpHashes.includes(value);
      account.knownIpHashes = [value, ...account.knownIpHashes.filter((item) => item !== value)].slice(0, 8);
      account.lastLoginAt = nowDate(now());
      return { newIp };
    },
    async ping() { return true; },
    async close() {},
  };
}

export async function createMongoAuthStore({
  uri,
  client: sharedClient = null,
  encryptionKey,
  bootstrap,
  issuer = 'MY Platform',
  legacyBindings = {},
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  now = () => Date.now(),
} = {}) {
  if (!uri && !sharedClient) throw new Error('PLATFORM_MONGODB_URI is required.');
  const key = decodeKey(encryptionKey);
  const initial = validateBootstrap(bootstrap);
  const client = sharedClient || new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  if (!sharedClient) await client.connect();
  const db = client.db(databaseName);
  const accounts = db.collection('admin_accounts');
  const challenges = db.collection('auth_challenges');
  await Promise.all([
    accounts.createIndex({ username: 1 }, { unique: true }),
    challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  const createdAt = nowDate(now());
  await accounts.updateOne({ username: initial.username }, {
    $setOnInsert: {
      id: crypto.randomUUID(),
      authVersion: 0,
      serviceBindings: normalizeServiceBindings(Object.fromEntries(['core', 'exam', 'campus'].map((service) => [service, legacyBindings[service] || initial.username]))),
      username: initial.username,
      passwordHash: initial.passwordHash,
      role: initial.role,
      active: true,
      totpSecretEncrypted: encryptSecret(initial.totpSecret, key),
      lastTotpCounter: -1,
      recoveryCodeHashes: [],
      passkeys: [],
      knownIpHashes: [],
      source: 'environment-bootstrap',
      createdAt,
      updatedAt: createdAt,
    },
  }, { upsert: true });

  // Preserve each existing account's effective mappings when introducing explicit bindings.
  await accounts.updateMany({ id: { $exists: false } }, [{ $set: {
    id: { $toString: '$_id' },
    authVersion: { $ifNull: ['$authVersion', 0] },
    serviceBindings: Object.fromEntries(['core', 'exam', 'campus'].map((service) => [service, normalizeServiceBindings(legacyBindings)[service] || '$username'])),
  } }]);

  async function rawAccount(username) {
    const normalized = normalizeUsername(username);
    return normalized ? accounts.findOne({ username: normalized }) : null;
  }

  return {
    async findAccount(username) {
      return privateAccount(await rawAccount(username), key);
    },
    async listAccounts() {
      return accounts.find({}, { projection: { passwordHash: 0, knownIpHashes: 0, pendingTotp: 0 } })
        .sort({ username: 1 }).toArray().then((rows) => rows.map(publicAccount));
    },
    async createAccount({ username, passwordHash, role, serviceBindings = {} }) {
      const normalizedUsername = normalizeUsername(username);
      const normalizedRole = normalizeRole(role);
      if (!normalizedUsername || !passwordHash || !normalizedRole) throw new Error('INVALID_ACCOUNT');
      const timestamp = nowDate(now());
      try {
        await accounts.insertOne({
          id: crypto.randomUUID(),
          authVersion: 0,
          serviceBindings: normalizeServiceBindings(serviceBindings),
          username: normalizedUsername,
          passwordHash,
          role: normalizedRole,
          active: true,
          totpSecretEncrypted: '',
          lastTotpCounter: -1,
          recoveryCodeHashes: [],
          passkeys: [],
          knownIpHashes: [],
          source: 'managed',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        if (error?.code === 11000) throw new Error('ACCOUNT_EXISTS');
        throw error;
      }
      return publicAccount(await rawAccount(normalizedUsername));
    },
    async updateAccount(username, patch) {
      const account = await rawAccount(username);
      if (!account) return null;
      const role = patch.role === undefined ? account.role : normalizeRole(patch.role);
      const active = patch.active === undefined ? account.active : Boolean(patch.active);
      if (!role) throw new Error('INVALID_ROLE');
      if (account.role === 'super_admin' && (role !== 'super_admin' || !active)) {
        const remaining = await accounts.countDocuments({ username: { $ne: account.username }, active: true, role: 'super_admin' });
        if (remaining === 0) throw new Error('LAST_SUPER_ADMIN');
      }
      const serviceBindings = patch.serviceBindings === undefined ? account.serviceBindings : normalizeServiceBindings(patch.serviceBindings);
      await accounts.updateOne({ username: account.username }, { $set: { role, active, serviceBindings, updatedAt: nowDate(now()) }, $inc: { authVersion: 1 } });
      return publicAccount(await rawAccount(account.username));
    },
    async upgradePasswordHash(username, expectedHash, passwordHash) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), passwordHash: expectedHash },
        { $set: { passwordHash, updatedAt: nowDate(now()) } },
      );
      return result.modifiedCount === 1;
    },
    async setPasswordHash(username, passwordHash) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username) },
        { $set: { passwordHash, source: 'managed', updatedAt: nowDate(now()) }, $inc: { authVersion: 1 } },
      );
      return result.matchedCount === 1;
    },
    async resetCredentials(username, authVersion, passwordHash) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), active: true, authVersion },
        { $set: { passwordHash, source: 'managed', totpSecretEncrypted: '', lastTotpCounter: -1, recoveryCodeHashes: [], passkeys: [], updatedAt: nowDate(now()) }, $unset: { pendingTotp: '' }, $inc: { authVersion: 1 } },
      );
      return result.modifiedCount === 1;
    },
    async consumeSecondFactor(username, { totp = '', recoveryCode = '' } = {}) {
      const account = await rawAccount(username);
      const secret = decryptSecret(account?.totpSecretEncrypted, key);
      if (!account || !secret) return { valid: Boolean(account), method: 'none' };
      const counter = matchTotp(totp, secret, now());
      if (counter !== null) {
        const result = await accounts.updateOne({
          username: account.username,
          $or: [{ lastTotpCounter: { $lt: counter } }, { lastTotpCounter: { $exists: false } }],
        }, { $set: { lastTotpCounter: counter, updatedAt: nowDate(now()) } });
        if (result.modifiedCount === 1) return { valid: true, method: 'totp' };
      }
      const normalized = normalizeRecoveryCode(recoveryCode);
      if (normalized) {
        const recoveryHash = keyedHash(normalized, key, 'recovery');
        const result = await accounts.updateOne(
          { username: account.username, recoveryCodeHashes: recoveryHash },
          { $pull: { recoveryCodeHashes: recoveryHash }, $set: { updatedAt: nowDate(now()) } },
        );
        if (result.modifiedCount === 1) return { valid: true, method: 'recovery_code' };
      }
      return { valid: false, method: 'invalid' };
    },
    async beginTotpEnrollment(username) {
      const account = await rawAccount(username);
      if (!account) return null;
      const secret = generateBase32();
      const uriValue = totpUri({ issuer, username: account.username, secret });
      const expiresAt = new Date(now() + 10 * 60_000);
      const id = crypto.randomUUID();
      const result = await accounts.updateOne({ _id: account._id, active: true, authVersion: account.authVersion || 0 }, { $set: {
        pendingTotp: { id, secretEncrypted: encryptSecret(secret, key), expiresAt },
        updatedAt: nowDate(now()),
      } });
      if (!result.matchedCount) return null;
      return { id, secret, uri: uriValue, qrDataUrl: await QRCode.toDataURL(uriValue, { errorCorrectionLevel: 'M', margin: 1, width: 240 }), expiresAt: expiresAt.toISOString() };
    },
    async confirmTotpEnrollment(username, token, { enrollmentId, authVersion } = {}) {
      const account = await rawAccount(username);
      if (!account?.active || !account.pendingTotp || account.pendingTotp.expiresAt.getTime() <= now()
        || (enrollmentId && enrollmentId !== account.pendingTotp.id) || (authVersion !== undefined && authVersion !== account.authVersion)) return null;
      const secret = decryptSecret(account.pendingTotp.secretEncrypted, key);
      const counter = matchTotp(token, secret, now(), { window: 1 });
      if (counter === null) return null;
      const recoveryCodes = createRecoveryCodes();
      const result = await accounts.updateOne({ _id: account._id, active: true, authVersion: account.authVersion || 0, 'pendingTotp.id': account.pendingTotp.id, 'pendingTotp.expiresAt': account.pendingTotp.expiresAt }, {
        $set: {
          totpSecretEncrypted: encryptSecret(secret, key),
          lastTotpCounter: counter,
          recoveryCodeHashes: recoveryCodes.map((code) => keyedHash(normalizeRecoveryCode(code), key, 'recovery')),
          updatedAt: nowDate(now()),
        },
        $unset: { pendingTotp: '' },
      });
      return result.modifiedCount === 1 ? { recoveryCodes } : null;
    },
    async disableTotp(username) {
      const result = await accounts.updateOne({ username: normalizeUsername(username) }, {
        $set: { totpSecretEncrypted: '', lastTotpCounter: -1, recoveryCodeHashes: [], updatedAt: nowDate(now()) },
        $unset: { pendingTotp: '' },
      });
      return result.matchedCount === 1;
    },
    async regenerateRecoveryCodes(username) {
      const account = await rawAccount(username);
      if (!account?.totpSecretEncrypted) return null;
      const recoveryCodes = createRecoveryCodes();
      await accounts.updateOne({ username: account.username }, { $set: {
        recoveryCodeHashes: recoveryCodes.map((code) => keyedHash(normalizeRecoveryCode(code), key, 'recovery')),
        updatedAt: nowDate(now()),
      } });
      return { recoveryCodes };
    },
    async listPasskeys(username) {
      const account = await rawAccount(username);
      return (account?.passkeys || []).map(({ publicKey: _publicKey, ...passkey }) => passkey);
    },
    async getPasskeys(username) {
      return (await rawAccount(username))?.passkeys || [];
    },
    async findPasskey(id) {
      const passkeyId = String(id || '');
      if (!passkeyId) return null;
      const account = await accounts.findOne(
        { active: { $ne: false }, 'passkeys.id': passkeyId },
        { projection: { username: 1, passkeys: { $elemMatch: { id: passkeyId } } } },
      );
      const passkey = account?.passkeys?.[0];
      return passkey ? { username: account.username, passkey } : null;
    },
    async savePasskey(username, passkey, { accountId, authVersion } = {}) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), active: true, ...(accountId ? { id: accountId } : {}), ...(authVersion !== undefined ? { authVersion } : {}), 'passkeys.id': { $ne: passkey.id } },
        { $push: { passkeys: passkey }, $set: { updatedAt: nowDate(now()) } },
      );
      return result.modifiedCount === 1;
    },
    async updatePasskeyCounter(username, id, counter, { accountId, authVersion, previousCounter } = {}) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), active: true, ...(accountId ? { id: accountId } : {}), ...(authVersion !== undefined ? { authVersion } : {}), passkeys: { $elemMatch: { id, ...(previousCounter !== undefined ? { counter: previousCounter } : {}) } } },
        { $set: { 'passkeys.$.counter': counter, 'passkeys.$.lastUsedAt': nowDate(now()), updatedAt: nowDate(now()) } },
      );
      return result.matchedCount === 1;
    },
    async deletePasskey(username, id) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username) },
        { $pull: { passkeys: { id: String(id || '') } }, $set: { updatedAt: nowDate(now()) } },
      );
      return result.modifiedCount === 1;
    },
    async saveChallenge({ kind, username, challenge, ttlMs = 5 * 60_000 }) {
      const id = crypto.randomBytes(24).toString('base64url');
      await challenges.insertOne({ id: keyedHash(id, key, 'challenge'), kind, username: normalizeUsername(username), challenge, attempts: 0, expiresAt: new Date(now() + ttlMs) });
      return id;
    },
    async findChallenge(id, kind) {
      return challenges.findOne({ id: keyedHash(id, key, 'challenge'), kind, attempts: { $lt: 5 }, expiresAt: { $gt: nowDate(now()) } });
    },
    async failChallenge(id, kind) {
      await challenges.updateOne({ id: keyedHash(id, key, 'challenge'), kind, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } });
    },
    async consumeChallenge(id, kind, username) {
      const value = await challenges.findOneAndDelete({
        id: keyedHash(id, key, 'challenge'),
        kind,
        attempts: { $lt: 5 },
        username: normalizeUsername(username),
        expiresAt: { $gt: nowDate(now()) },
      });
      return value?.challenge || null;
    },
    async rememberLoginIp(username, ip) {
      const account = await rawAccount(username);
      if (!account) return { newIp: false };
      const value = keyedHash(ip, key, 'login-ip');
      const newIp = !(account.knownIpHashes || []).includes(value);
      await accounts.updateOne({ username: account.username }, {
        $set: {
          knownIpHashes: [value, ...(account.knownIpHashes || []).filter((item) => item !== value)].slice(0, 8),
          lastLoginAt: nowDate(now()),
          updatedAt: nowDate(now()),
        },
      });
      return { newIp };
    },
    async ping() { return (await db.command({ ping: 1 })).ok === 1; },
    async close() { if (!sharedClient) await client.close(); },
  };
}

export { decryptSecret, encryptSecret, normalizeRecoveryCode, normalizeRole, normalizeUsername };
