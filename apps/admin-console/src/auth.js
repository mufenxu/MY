import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
export const SESSION_COOKIE_NAME = 'my_platform_session';
export const PRODUCTION_SESSION_COOKIE_NAME = '__Host-my_platform_session';

const LEGACY_SCRYPT_COST = 2 ** 14;
const SCRYPT_COST = 2 ** 17;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 192 * 1024 * 1024;

export function sessionCookieName(isProduction = false) {
  return isProduction ? PRODUCTION_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex < 1) return cookies;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

export function issueSession({ username, role = 'super_admin', secret, ttlHours, now = Date.now() }) {
  const payload = encodeJson({
    sub: username,
    role,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlHours * 60 * 60,
    nonce: crypto.randomBytes(12).toString('base64url'),
  });
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return null;

  try {
    const parsed = decodeJson(payload);
    if (!parsed.sub || !Number.isFinite(parsed.exp) || parsed.exp <= Math.floor(now / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createSessionRegistry({
  secret,
  maxSessions = 1024,
  idleTimeoutMinutes = 30,
  touchIntervalMs = 60_000,
} = {}) {
  const activeSessions = new Map();
  const idleTimeoutMs = Math.max(Number(idleTimeoutMinutes) || 30, 1) * 60_000;

  function prune(now = Date.now()) {
    const nowSeconds = Math.floor(now / 1000);
    for (const [nonce, session] of activeSessions) {
      if (session.exp <= nowSeconds) activeSessions.delete(nonce);
    }
  }

  function issue({ username, role = 'super_admin', ttlHours, ip = '', userAgent = '', now = Date.now() }) {
    prune(now);
    while (activeSessions.size >= maxSessions) {
      activeSessions.delete(activeSessions.keys().next().value);
    }
    const token = issueSession({ username, role, secret, ttlHours, now });
    const session = verifySession(token, secret, now);
    activeSessions.set(session.nonce, {
      ...session,
      ip: String(ip || '').slice(0, 128),
      userAgent: String(userAgent || '').slice(0, 256),
      createdAt: new Date(now).toISOString(),
      lastSeenAt: now,
    });
    return token;
  }

  function verify(token, now = Date.now()) {
    prune(now);
    const session = verifySession(token, secret, now);
    const active = session ? activeSessions.get(session.nonce) : null;
    if (!active || active.exp !== session.exp || active.sub !== session.sub) return null;
    if (active.lastSeenAt + idleTimeoutMs <= now) {
      activeSessions.delete(session.nonce);
      return null;
    }
    if (now - active.lastSeenAt >= touchIntervalMs) active.lastSeenAt = now;
    return {
      ...session,
      role: active.role || session.role || 'super_admin',
      idleExpiresAt: Math.min(session.exp, Math.floor((active.lastSeenAt + idleTimeoutMs) / 1000)),
      reauthenticatedUntil: active.reauthenticatedUntil > Math.floor(now / 1000)
        ? active.reauthenticatedUntil
        : 0,
    };
  }

  function markReauthenticated(token, { now = Date.now(), ttlSeconds = 300 } = {}) {
    const session = verifySession(token, secret, now);
    const active = session ? activeSessions.get(session.nonce) : null;
    if (!active || active.exp !== session.exp || active.sub !== session.sub) return null;
    const nowSeconds = Math.floor(now / 1000);
    active.reauthenticatedUntil = Math.min(
      active.exp,
      nowSeconds + Math.min(Math.max(Number(ttlSeconds) || 300, 30), 300),
    );
    return active.reauthenticatedUntil;
  }

  function revoke(token, now = Date.now()) {
    const session = verifySession(token, secret, now);
    if (!session) return false;
    return activeSessions.delete(session.nonce);
  }

  function revokeByNonce(nonce) {
    return activeSessions.delete(String(nonce || ''));
  }

  function revokeBySubject(subject) {
    let revoked = 0;
    for (const [nonce, session] of activeSessions) {
      if (session.sub === subject && activeSessions.delete(nonce)) revoked += 1;
    }
    return revoked;
  }

  function list({ subject } = {}) {
    prune();
    return [...activeSessions.values()]
      .filter((session) => !subject || session.sub === subject)
      .sort((left, right) => right.iat - left.iat)
      .map((session) => ({
        nonce: session.nonce,
        subject: session.sub,
        role: session.role || 'super_admin',
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
        idleExpiresAt: new Date(Math.min(session.exp * 1000, session.lastSeenAt + idleTimeoutMs)).toISOString(),
        expiresAt: new Date(session.exp * 1000).toISOString(),
      }));
  }

  return {
    issue,
    verify,
    markReauthenticated,
    revoke,
    revokeByNonce,
    revokeBySubject,
    list,
    size: () => activeSessions.size,
  };
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(value || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) return null;
  let bits = '';
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function matchTotp(token, secret, now = Date.now(), { window = 1, periodSeconds = 30 } = {}) {
  const normalizedToken = String(token || '').replace(/\s/g, '');
  const key = decodeBase32(secret);
  if (!/^\d{6}$/.test(normalizedToken) || !key?.length) return null;

  const counter = Math.floor(now / 1000 / periodSeconds);
  for (let offset = -window; offset <= window; offset += 1) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + offset));
    const digest = crypto.createHmac('sha1', key).update(buffer).digest();
    const position = digest[digest.length - 1] & 0x0f;
    const code = ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
    if (safeEqual(code, normalizedToken)) return counter + offset;
  }
  return null;
}

export function verifyTotp(token, secret, now = Date.now(), options) {
  return matchTotp(token, secret, now, options) !== null;
}

function parsePasswordHash(storedHash) {
  const parts = String(storedHash || '').split('$');
  let cost;
  let blockSize;
  let parallelization;
  let saltValue;
  let hashValue;

  if (parts.length === 3 && parts[0] === 'scrypt') {
    [, saltValue, hashValue] = parts;
    cost = LEGACY_SCRYPT_COST;
    blockSize = SCRYPT_BLOCK_SIZE;
    parallelization = SCRYPT_PARALLELIZATION;
  } else if (parts.length === 6 && parts[0] === 'scrypt') {
    cost = Number.parseInt(parts[1], 10);
    blockSize = Number.parseInt(parts[2], 10);
    parallelization = Number.parseInt(parts[3], 10);
    saltValue = parts[4];
    hashValue = parts[5];
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(cost)
    || cost < LEGACY_SCRYPT_COST
    || cost > 2 ** 20
    || (cost & (cost - 1)) !== 0
    || !Number.isSafeInteger(blockSize)
    || blockSize < 1
    || blockSize > 32
    || !Number.isSafeInteger(parallelization)
    || parallelization < 1
    || parallelization > 16
    || !saltValue
    || !hashValue
  ) return null;

  const salt = Buffer.from(saltValue, 'base64url');
  const hash = Buffer.from(hashValue, 'base64url');
  if (salt.length < 16 || salt.length > 64 || hash.length !== SCRYPT_KEY_LENGTH) return null;
  return { cost, blockSize, parallelization, salt, hash, legacy: parts.length === 3 };
}

export function isPasswordHash(value) {
  return Boolean(parsePasswordHash(value));
}

export function passwordHashNeedsUpgrade(value) {
  const parsed = parsePasswordHash(value);
  return Boolean(parsed && (parsed.legacy || parsed.cost < SCRYPT_COST));
}

export async function createPasswordHash(password, salt = crypto.randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 15 || password.length > 256) {
    throw new Error('管理员密码长度需要在 15 到 256 个字符之间。');
  }
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    Buffer.from(salt).toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password, storedHash) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return false;

  try {
    const actual = await scryptAsync(String(password || ''), parsed.salt, parsed.hash.length, {
      N: parsed.cost,
      r: parsed.blockSize,
      p: parsed.parallelization,
      maxmem: Math.max(SCRYPT_MAX_MEMORY, 128 * parsed.cost * parsed.blockSize + 1024 * 1024),
    });
    return parsed.hash.length === actual.length && crypto.timingSafeEqual(parsed.hash, actual);
  } catch {
    return false;
  }
}
