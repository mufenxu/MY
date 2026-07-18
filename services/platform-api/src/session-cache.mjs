import crypto from 'node:crypto';

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function createSessionVerifierCache({
  verify,
  ttlMs = 5_000,
  negativeTtlMs = 1_000,
  maxEntries = 2_048,
  now = () => Date.now(),
} = {}) {
  if (typeof verify !== 'function') throw new TypeError('verify must be a function');

  const positiveTtl = boundedInteger(ttlMs, 5_000, 250, 30_000);
  const negativeTtl = boundedInteger(negativeTtlMs, 1_000, 100, positiveTtl);
  const capacity = boundedInteger(maxEntries, 2_048, 16, 20_000);
  const entries = new Map();

  function cacheKey(token) {
    return crypto.createHash('sha256').update(String(token)).digest('base64url');
  }

  function touch(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function prune(timestamp = now()) {
    for (const [key, entry] of entries) {
      if (!entry.pending && entry.expiresAt <= timestamp) entries.delete(key);
    }
    while (entries.size > capacity) entries.delete(entries.keys().next().value);
  }

  function valueExpiresAt(value, timestamp) {
    const sessionExpiry = Number(value?.exp) * 1_000;
    const cacheExpiry = timestamp + positiveTtl;
    return Number.isFinite(sessionExpiry)
      ? Math.min(cacheExpiry, sessionExpiry)
      : cacheExpiry;
  }

  async function verifyToken(token) {
    if (!token) return null;

    const key = cacheKey(token);
    const timestamp = now();
    const existing = entries.get(key);
    if (existing && (existing.pending || existing.expiresAt > timestamp)) {
      touch(key, existing);
      return existing.pending || existing.value;
    }
    if (existing) entries.delete(key);

    const entry = { expiresAt: timestamp + positiveTtl, pending: null, value: null };
    entry.pending = Promise.resolve().then(() => verify(token));
    entries.set(key, entry);
    prune(timestamp);

    try {
      const value = await entry.pending;
      if (entries.get(key) === entry) {
        entry.pending = null;
        entry.value = value || null;
        const completedAt = now();
        entry.expiresAt = value
          ? valueExpiresAt(value, completedAt)
          : completedAt + negativeTtl;
        touch(key, entry);
      }
      return value || null;
    } catch (error) {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  }

  return {
    clear: () => entries.clear(),
    invalidate: (token) => token ? entries.delete(cacheKey(token)) : false,
    prune,
    size: () => entries.size,
    verify: verifyToken,
  };
}
