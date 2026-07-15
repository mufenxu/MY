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

export function issueSession({ username, secret, ttlHours, now = Date.now() }) {
  const payload = encodeJson({
    sub: username,
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
