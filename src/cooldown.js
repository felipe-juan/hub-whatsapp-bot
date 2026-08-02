class Cooldown {
  constructor() { this.entries = new Map(); }
  isActive(chatId, type, signature, seconds) {
    const key = `${chatId}:${type}:${signature}`;
    const previous = this.entries.get(key) || 0;
    return Date.now() - previous < Math.max(0, Number(seconds || 0)) * 1000;
  }
  touch(chatId, type, signature) {
    this.entries.set(`${chatId}:${type}:${signature}`, Date.now());
    if (this.entries.size > 5000) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000);
      for (const [key] of oldest) this.entries.delete(key);
    }
  }
}
module.exports = { Cooldown };
