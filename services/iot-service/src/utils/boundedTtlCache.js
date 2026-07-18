class BoundedTtlCache {
  constructor({ maxEntries = 1024, ttlMs = 60000, now = () => Date.now() } = {}) {
    this.maxEntries = Math.max(1, Number.parseInt(maxEntries, 10) || 1024);
    this.ttlMs = Math.max(1, Number.parseInt(ttlMs, 10) || 60000);
    this.now = now;
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }

  delete(key) {
    return this.entries.delete(key);
  }

  prune(timestamp = this.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= timestamp) this.entries.delete(key);
    }
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.prune();
    this.entries.delete(key);
    this.entries.set(key, {
      expiresAt: this.now() + Math.max(1, Number.parseInt(ttlMs, 10) || this.ttlMs),
      value
    });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
    return this;
  }
}

module.exports = {
  BoundedTtlCache
};
