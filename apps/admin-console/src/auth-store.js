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
    username: account.username,
    role: account.role,
    active: account.active !== false,
    totpEnabled: Boolean(account.totpSecretEncrypted),
    recoveryCodesRemaining: Array.isArray(account.recoveryCodeHashes) ? account.recoveryCodeHashes.length : 0,
    passkeyCount: Array.isArray(account.passkeys) ? account.passkeys.length : 0,
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

export function createMemoryAuthStore({ bootstrap, encryptionKey, issuer = 'MY Platform', now = () => Date.now() } = {}) {
  const key = decodeKey(encryptionKey);
  const initial = validateBootstrap(bootstrap);
  const accounts = new Map();
  const challenges = new Map();
  accounts.set(initial.username, {
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
    async createAccount({ username, passwordHash, role }) {
      const normalizedUsername = normalizeUsername(username);
      const normalizedRole = normalizeRole(role);
      if (!normalizedUsername || !passwordHash || !normalizedRole) throw new Error('INVALID_ACCOUNT');
      if (accounts.has(normalizedUsername)) throw new Error('ACCOUNT_EXISTS');
      const account = {
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
      if ((account.role === 'super_admin') && (role !== 'super_admin' || !active)) {
        const remaining = [...accounts.values()].filter((item) => item.active !== false && item.role === 'super_admin' && item.username !== account.username);
        if (remaining.length === 0) throw new Error('LAST_SUPER_ADMIN');
      }
      account.role = role;
      account.active = active;
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
      account.updatedAt = nowDate(now());
      return true;
    },
    consumeSecondFactor,
    async beginTotpEnrollment(username) {
      const account = accountFor(username);
      if (!account) return null;
      const secret = generateBase32();
      const uri = totpUri({ issuer, username: account.username, secret });
      account.pendingTotp = { secretEncrypted: encryptSecret(secret, key), expiresAt: now() + 10 * 60_000 };
      return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 }), expiresAt: new Date(account.pendingTotp.expiresAt).toISOString() };
    },
    async confirmTotpEnrollment(username, token) {
      const account = accountFor(username);
      if (!account?.pendingTotp || account.pendingTotp.expiresAt <= now()) return null;
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
      return (account?.passkeys || []).map(({ publicKey, ...passkey }) => ({ ...passkey }));
    },
    async getPasskeys(username) {
      return structuredClone(accountFor(username)?.passkeys || []);
    },
    async savePasskey(username, passkey) {
      const account = accountFor(username);
      if (!account || account.passkeys.some((item) => item.id === passkey.id)) return false;
      account.passkeys.push(structuredClone(passkey));
      account.updatedAt = nowDate(now());
      return true;
    },
    async updatePasskeyCounter(username, id, counter) {
      const passkey = accountFor(username)?.passkeys.find((item) => item.id === id);
      if (!passkey) return false;
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
      challenges.set(id, { kind, username: normalizeUsername(username), challenge, expiresAt: now() + ttlMs });
      return id;
    },
    async consumeChallenge(id, kind, username) {
      const value = challenges.get(String(id || ''));
      challenges.delete(String(id || ''));
      if (!value || value.expiresAt <= now() || value.kind !== kind || value.username !== normalizeUsername(username)) return null;
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
  encryptionKey,
  bootstrap,
  issuer = 'MY Platform',
  databaseName = process.env.PLATFORM_MONGODB_DATABASE || 'platform_app',
  now = () => Date.now(),
} = {}) {
  if (!uri) throw new Error('PLATFORM_MONGODB_URI is required.');
  const key = decodeKey(encryptionKey);
  const initial = validateBootstrap(bootstrap);
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  await client.connect();
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
    async createAccount({ username, passwordHash, role }) {
      const normalizedUsername = normalizeUsername(username);
      const normalizedRole = normalizeRole(role);
      if (!normalizedUsername || !passwordHash || !normalizedRole) throw new Error('INVALID_ACCOUNT');
      const timestamp = nowDate(now());
      try {
        await accounts.insertOne({
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
      await accounts.updateOne({ username: account.username }, { $set: { role, active, updatedAt: nowDate(now()) } });
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
        { $set: { passwordHash, source: 'managed', updatedAt: nowDate(now()) } },
      );
      return result.matchedCount === 1;
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
      await accounts.updateOne({ username: account.username }, { $set: {
        pendingTotp: { secretEncrypted: encryptSecret(secret, key), expiresAt },
        updatedAt: nowDate(now()),
      } });
      return { secret, uri: uriValue, qrDataUrl: await QRCode.toDataURL(uriValue, { errorCorrectionLevel: 'M', margin: 1, width: 240 }), expiresAt: expiresAt.toISOString() };
    },
    async confirmTotpEnrollment(username, token) {
      const account = await rawAccount(username);
      if (!account?.pendingTotp || account.pendingTotp.expiresAt.getTime() <= now()) return null;
      const secret = decryptSecret(account.pendingTotp.secretEncrypted, key);
      const counter = matchTotp(token, secret, now(), { window: 1 });
      if (counter === null) return null;
      const recoveryCodes = createRecoveryCodes();
      const result = await accounts.updateOne({ username: account.username, 'pendingTotp.expiresAt': account.pendingTotp.expiresAt }, {
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
      return (account?.passkeys || []).map(({ publicKey, ...passkey }) => passkey);
    },
    async getPasskeys(username) {
      return (await rawAccount(username))?.passkeys || [];
    },
    async savePasskey(username, passkey) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), 'passkeys.id': { $ne: passkey.id } },
        { $push: { passkeys: passkey }, $set: { updatedAt: nowDate(now()) } },
      );
      return result.modifiedCount === 1;
    },
    async updatePasskeyCounter(username, id, counter) {
      const result = await accounts.updateOne(
        { username: normalizeUsername(username), 'passkeys.id': id },
        { $set: { 'passkeys.$.counter': counter, 'passkeys.$.lastUsedAt': nowDate(now()), updatedAt: nowDate(now()) } },
      );
      return result.modifiedCount === 1;
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
      await challenges.insertOne({ id, kind, username: normalizeUsername(username), challenge, expiresAt: new Date(now() + ttlMs) });
      return id;
    },
    async consumeChallenge(id, kind, username) {
      const value = await challenges.findOneAndDelete({
        id: String(id || ''),
        kind,
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
    async close() { await client.close(); },
  };
}

export { decryptSecret, encryptSecret, normalizeRecoveryCode, normalizeRole, normalizeUsername };
