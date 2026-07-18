import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
export const SESSION_COOKIE_NAME = 'my_platform_session';

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

export function createSessionRegistry({ secret, maxSessions = 1024 } = {}) {
  const activeSessions = new Map();

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
    });
    return token;
  }

  function verify(token, now = Date.now()) {
    prune(now);
    const session = verifySession(token, secret, now);
    const active = session ? activeSessions.get(session.nonce) : null;
    if (!active || active.exp !== session.exp || active.sub !== session.sub) return null;
    return { ...session, role: active.role || session.role || 'super_admin' };
  }

  function revoke(token, now = Date.now()) {
    const session = verifySession(token, secret, now);
    if (!session) return false;
    return activeSessions.delete(session.nonce);
  }

  function revokeByNonce(nonce) {
    return activeSessions.delete(String(nonce || ''));
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
        expiresAt: new Date(session.exp * 1000).toISOString(),
      }));
  }

  return {
    issue,
    verify,
    revoke,
    revokeByNonce,
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

export function verifyTotp(token, secret, now = Date.now(), { window = 1, periodSeconds = 30 } = {}) {
  const normalizedToken = String(token || '').replace(/\s/g, '');
  const key = decodeBase32(secret);
  if (!/^\d{6}$/.test(normalizedToken) || !key?.length) return false;

  const counter = Math.floor(now / 1000 / periodSeconds);
  for (let offset = -window; offset <= window; offset += 1) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + offset));
    const digest = crypto.createHmac('sha1', key).update(buffer).digest();
    const position = digest[digest.length - 1] & 0x0f;
    const code = ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
    if (safeEqual(code, normalizedToken)) return true;
  }
  return false;
}

export async function createPasswordHash(password, salt = crypto.randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('管理员密码至少需要 10 个字符。');
  }
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${Buffer.from(salt).toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, saltValue, hashValue, extra] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue || extra) return false;

  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await scryptAsync(String(password || ''), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
