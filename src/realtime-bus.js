const { EventEmitter } = require('node:events');

class RealtimeBus {
  constructor({ maxEntries = 200, batchWindowMs = 0, batchedTypes = null } = {}) {
    this.maxEntries = Math.max(20, Math.min(2000, Number(maxEntries || 200)));
    this.events = [];
    this.nextId = 1;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.batchWindowMs = Math.max(0, Math.min(2000, Number(batchWindowMs || 0)));
    this.batchedTypes = new Set(batchedTypes || [
      'whatsapp-status','admin-task-progress','database-change','data-changed','settings-changed','diagnostic-summary'
    ]);
    this.pending = new Map();
    this.batchTimer = null;
  }

  emitEvent(type, payload = {}) {
    const event = {
      id: this.nextId++,
      type: String(type || 'update').slice(0, 80),
      createdAt: new Date().toISOString(),
      payload: payload && typeof payload === 'object' ? payload : { value: payload }
    };
    this.events.push(event);
    if (this.events.length > this.maxEntries) this.events.splice(0, this.events.length - this.maxEntries);
    this.emitter.emit('event', event);
    return event;
  }

  publish(type, payload = {}) {
    const safeType = String(type || 'update').slice(0, 80);
    if (!this.batchWindowMs || !this.batchedTypes.has(safeType)) return this.emitEvent(safeType, payload);
    this.pending.set(safeType, payload && typeof payload === 'object' ? payload : { value: payload });
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), this.batchWindowMs);
      this.batchTimer.unref?.();
    }
    return { id: 0, type: safeType, queued: true };
  }

  flush() {
    clearTimeout(this.batchTimer);
    this.batchTimer = null;
    if (!this.pending.size) return null;
    const events = [...this.pending.entries()].map(([type, payload]) => ({ type, payload }));
    this.pending.clear();
    return this.emitEvent('realtime-batch', { events });
  }

  list({ after = 0, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(this.maxEntries, Number(limit || 100)));
    return this.events.filter(item => item.id > Number(after || 0)).slice(-safeLimit);
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  close() {
    this.flush();
    clearTimeout(this.batchTimer);
    this.batchTimer = null;
    this.emitter.removeAllListeners();
  }

  stats() { return { count: this.events.length, pending: this.pending.size, lastId: this.nextId - 1, maxEntries: this.maxEntries, batchWindowMs: this.batchWindowMs }; }
}

module.exports = { RealtimeBus };
