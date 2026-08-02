class RecentMessageTracker {
  constructor({ maxMessages = 1500, maxSeen = 3000, retentionMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxMessages = Math.max(100, Number(maxMessages || 1500));
    this.maxSeen = Math.max(this.maxMessages, Number(maxSeen || 3000));
    this.retentionMs = Math.max(60_000, Number(retentionMs || 15 * 60 * 1000));
    this.now = now;
    this.messages = new Map();
    this.seen = new Map();
  }

  id(raw) { return String(raw?.key?.id || ''); }
  key(raw) {
    const id = this.id(raw);
    return id ? `${raw?.key?.remoteJid || ''}:${id}` : '';
  }
  has(raw) { const key = this.key(raw); return Boolean(key && this.seen.has(key)); }
  remember(raw) {
    const id = this.id(raw); const key = this.key(raw);
    if (!id || !key) return false;
    const at = this.now();
    this.messages.set(key, raw.message);
    this.seen.set(key, at);
    this.prune(at);
    return true;
  }
  getMessage(keyOrId) {
    if (keyOrId && typeof keyOrId === 'object') {
      const id = String(keyOrId.id || '');
      const remoteJid = String(keyOrId.remoteJid || '');
      return id && remoteJid ? this.messages.get(`${remoteJid}:${id}`) : undefined;
    }
    const id = String(keyOrId || '');
    if (!id) return undefined;
    let found;
    for (const [key, message] of this.messages) {
      if (!key.endsWith(`:${id}`)) continue;
      if (found !== undefined) return undefined;
      found = message;
    }
    return found;
  }
  prune(at = this.now()) {
    const cutoff = at - this.retentionMs;
    if (this.seen.size > this.maxSeen) {
      for (const [key, seenAt] of this.seen) if (seenAt < cutoff) this.seen.delete(key);
      if (this.seen.size > this.maxSeen) {
        const overflow = this.seen.size - this.maxSeen;
        for (const key of [...this.seen.keys()].slice(0, overflow)) this.seen.delete(key);
      }
    }
    if (this.messages.size > this.maxMessages) {
      const liveKeys = new Set(this.seen.keys());
      for (const key of this.messages.keys()) if (!liveKeys.has(key)) this.messages.delete(key);
      if (this.messages.size > this.maxMessages) {
        const overflow = this.messages.size - this.maxMessages;
        for (const id of [...this.messages.keys()].slice(0, overflow)) this.messages.delete(id);
      }
    }
  }
  clear() { this.messages.clear(); this.seen.clear(); }
  stats() { return { cachedMessages: this.messages.size, seenMessages: this.seen.size }; }
}

module.exports = { RecentMessageTracker };
