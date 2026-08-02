class LruCache {
  constructor({ maxEntries = 500, ttlMs = 5 * 60_000 } = {}) {
    this.maxEntries = Math.max(10, Math.min(20_000, Number(maxEntries || 500)));
    this.ttlMs = Math.max(0, Number(ttlMs || 0));
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) { this.misses += 1; return undefined; }
    if (this.ttlMs && Date.now() - entry.createdAt > this.ttlMs) {
      this.map.delete(key); this.misses += 1; return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, createdAt: Date.now() });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value);
      this.evictions += 1;
    }
    return value;
  }

  clear() { this.map.clear(); }
  stats() { return { size: this.map.size, maxEntries: this.maxEntries, ttlMs: this.ttlMs, hits: this.hits, misses: this.misses, evictions: this.evictions }; }
}

module.exports = { LruCache };
