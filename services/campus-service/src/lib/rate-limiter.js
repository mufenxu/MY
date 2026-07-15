export class FixedWindowAttemptLimiter {
  constructor({ limit, windowMs, maxEntries = 10_000 }) {
    if (!Number.isFinite(limit) || limit < 1) throw new TypeError("limit must be a positive number");
    if (!Number.isFinite(windowMs) || windowMs < 1) throw new TypeError("windowMs must be a positive number");
    this.limit = Math.floor(limit);
    this.windowMs = Math.floor(windowMs);
    this.maxEntries = Math.max(100, Math.floor(maxEntries));
    this.entries = new Map();
  }

  check(key, now = Date.now()) {
    const normalized = String(key || "unknown");
    const row = this.entries.get(normalized);
    if (!row || row.resetAt <= now) {
      if (row) this.entries.delete(normalized);
      return { allowed: true, retryAfterMs: 0, remaining: this.limit };
    }
    return {
      allowed: row.count < this.limit,
      retryAfterMs: row.count >= this.limit ? Math.max(1, row.resetAt - now) : 0,
      remaining: Math.max(0, this.limit - row.count)
    };
  }

  recordFailure(key, now = Date.now()) {
    const normalized = String(key || "unknown");
    this.sweep(now);
    let row = this.entries.get(normalized);
    if (!row || row.resetAt <= now) {
      this.ensureCapacity();
      row = { count: 0, resetAt: now + this.windowMs, touchedAt: now };
      this.entries.set(normalized, row);
    }
    row.count += 1;
    row.touchedAt = now;
    return this.check(normalized, now);
  }

  reset(key) {
    this.entries.delete(String(key || "unknown"));
  }

  sweep(now = Date.now()) {
    for (const [key, row] of this.entries) {
      if (row.resetAt <= now) this.entries.delete(key);
    }
  }

  ensureCapacity() {
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }

  get size() {
    return this.entries.size;
  }
}
