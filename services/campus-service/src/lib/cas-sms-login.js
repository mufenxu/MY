const MOBILE_PATTERN = /^1[3-9]\d{9}$/;

export const CAS_SMS_SEND_PATH = "/cas/smsLogin/sendSms";

export const SMS_PENDING_TTL_MS = 5 * 60 * 1000;

export const SMS_PENDING_MAX_ENTRIES = 200;

export const SMS_CODE_MAX_ATTEMPTS = 5;

export function casSmsSendUrl(casOrigin) {
  return new URL(CAS_SMS_SEND_PATH, casOrigin).href;
}

export function isMobilePhone(value) {
  return MOBILE_PATTERN.test(String(value || "").replace(/\s+/g, ""));
}

export function normalizeSmsPhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length === 13 && digits.startsWith("861")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return "";
}

export function maskSmsPhone(phone) {
  const value = String(phone || "");
  if (value.length !== 11) return value;
  return `${value.slice(0, 3)}****${value.slice(7)}`;
}

export function looksLikeSmsChallenge(html) {
  const source = String(html || "");
  if (!source) return false;
  const hasSmsField = /id=["']smscode["']|name=["']smscode["']/i.test(source);
  const hasSmsText = /动态验证码|短信验证码|短信验证|请输入.*验证码/.test(source);
  const hasPasswordField = /id=["']passwordShow["']|id=["']password["']/i.test(source);
  return (hasSmsField || hasSmsText) && !hasPasswordField;
}

export const SMS_SEND_INTERVAL_MS = 60 * 1000;

export function createSmsPendingStore({
  ttlMs = SMS_PENDING_TTL_MS,
  maxEntries = SMS_PENDING_MAX_ENTRIES,
  sendIntervalMs = SMS_SEND_INTERVAL_MS,
  now = () => Date.now(),
  newId = () => globalThis.crypto.randomUUID()
} = {}) {
  const entries = new Map();
  const lastSentAt = new Map();

  function sendAllowed(userId) {
    const previous = lastSentAt.get(userId);
    if (!previous) return { allowed: true, retryAfterMs: 0 };
    const elapsed = now() - previous;
    if (elapsed >= sendIntervalMs) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: sendIntervalMs - elapsed };
  }

  function markSent(userId) {
    lastSentAt.set(userId, now());
    if (lastSentAt.size > maxEntries) {
      const oldest = lastSentAt.keys().next().value;
      if (oldest !== undefined) lastSentAt.delete(oldest);
    }
  }

  function prune(currentTime) {
    for (const [id, entry] of entries) {
      if (currentTime - entry.createdAt >= ttlMs) entries.delete(id);
    }
    while (entries.size > maxEntries) {
      const oldestId = entries.keys().next().value;
      if (oldestId === undefined) break;
      entries.delete(oldestId);
    }
  }

  function put({ userId, jar, phone, execution, action, serviceUrl }) {
    const currentTime = now();
    for (const [id, entry] of entries) {
      if (entry.userId === userId) entries.delete(id);
    }
    const id = newId();
    entries.set(id, {
      userId,
      jar,
      phone,
      execution,
      action,
      serviceUrl,
      attempts: 0,
      createdAt: currentTime
    });
    prune(currentTime);
    return { id, expiresInMs: ttlMs };
  }

  function take({ userId, id }) {
    const entry = entries.get(id);
    if (!entry) return { ok: false, reason: "missing" };
    if (entry.userId !== userId) return { ok: false, reason: "missing" };
    if (now() - entry.createdAt >= ttlMs) {
      entries.delete(id);
      return { ok: false, reason: "expired" };
    }
    entry.attempts += 1;
    if (entry.attempts > SMS_CODE_MAX_ATTEMPTS) {
      entries.delete(id);
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: true, entry };
  }

  function drop(id) {
    entries.delete(id);
  }

  function size() {
    prune(now());
    return entries.size;
  }

  return { put, take, drop, size, sendAllowed, markSent };
}
