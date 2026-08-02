const { ConcurrencyLimiter } = require('./concurrency-limiter');

class ConversationQueue {
  constructor(onChange = null, { maxConcurrent = 8, inactiveTtlMs = 30 * 60_000, name = 'conversation-queue' } = {}) {
    this.entries = new Map();
    this.lastActivity = new Map();
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.pendingTotal = 0;
    this.activeKeys = new Set();
    this.accepting = true;
    this.inactiveTtlMs = Math.max(60_000, Number(inactiveTtlMs || 30 * 60_000));
    this.limiter = new ConcurrencyLimiter({ maxConcurrent, name: `${name}:global`, onChange: () => this.notify() });
    this.cleanupTimer = setInterval(() => this.cleanupInactive(), Math.min(this.inactiveTtlMs, 5 * 60_000));
    this.cleanupTimer.unref?.();
  }

  notify() { this.onChange?.(this.stats()); }

  enqueue(key, task, { priority = 0 } = {}) {
    if (!this.accepting) return Promise.reject(new Error('Fila de conversas encerrando; novas mensagens não são aceitas.'));
    const queueKey = String(key || 'unknown');
    const previous = this.entries.get(queueKey) || Promise.resolve();
    this.pendingTotal += 1;
    this.lastActivity.set(queueKey, Date.now());
    this.notify();

    let settled;
    const ordered = previous.catch(() => undefined).then(() => this.limiter.schedule(async () => {
      this.pendingTotal = Math.max(0, this.pendingTotal - 1);
      this.activeKeys.add(queueKey);
      this.lastActivity.set(queueKey, Date.now());
      this.notify();
      try { return await task(); }
      finally {
        this.activeKeys.delete(queueKey);
        this.lastActivity.set(queueKey, Date.now());
        this.notify();
      }
    }, { priority, label: queueKey }));

    settled = ordered.finally(() => {
      if (this.entries.get(queueKey) === settled) this.entries.delete(queueKey);
      this.lastActivity.set(queueKey, Date.now());
      this.notify();
    });
    this.entries.set(queueKey, settled);
    return ordered;
  }

  cleanupInactive(now = Date.now()) {
    const cutoff = now - this.inactiveTtlMs;
    for (const [key, touchedAt] of this.lastActivity) {
      if (touchedAt >= cutoff || this.entries.has(key) || this.activeKeys.has(key)) continue;
      this.lastActivity.delete(key);
    }
    this.notify();
  }

  stopAccepting() {
    // Bloqueia apenas novos enqueues. Tarefas já encadeadas por conversa ainda
    // precisam entrar no limitador para o encerramento ser realmente gracioso.
    this.accepting = false;
    this.notify();
  }

  resumeAccepting() {
    this.accepting = true;
    this.limiter.resumeAccepting();
    this.notify();
  }

  async whenIdle(timeoutMs = 0) {
    const started = Date.now();
    while (this.entries.size || this.pendingTotal || this.activeKeys.size || this.limiter.stats().active || this.limiter.stats().queued) {
      if (timeoutMs > 0 && Date.now() - started >= timeoutMs) return false;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return true;
  }

  close() {
    this.stopAccepting();
    this.limiter.stopAccepting();
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  stats() {
    const limiter = this.limiter.stats();
    return {
      queuedMessages: this.pendingTotal + limiter.queued,
      activeConversations: this.activeKeys.size,
      trackedConversations: this.entries.size,
      rememberedConversations: this.lastActivity.size,
      maxConcurrent: limiter.maxConcurrent,
      accepting: this.accepting,
      oldestQueuedMs: limiter.oldestQueuedMs
    };
  }
}

module.exports = { ConversationQueue };
