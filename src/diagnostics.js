const { EventEmitter } = require('node:events');

function sanitizeEvent(input = {}) {
  const details = Array.isArray(input.details) ? input.details.slice(0, 100).map(item => ({
    id: Number(item.id || 0),
    title: String(item.title || '').slice(0, 160),
    matched: Boolean(item.matched),
    score: Number(item.score || 0),
    scope: String(item.scope || 'both'),
    keywordMatched: Number(item.keywordMatched || 0),
    keywordTotal: Number(item.keywordTotal || 0),
    reasons: Array.isArray(item.reasons) ? item.reasons.map(String).slice(0, 20) : [],
    blockedReasons: Array.isArray(item.blockedReasons) ? item.blockedReasons.map(String).slice(0, 20) : []
  })) : [];
  return {
    type: String(input.type || 'info').slice(0, 40),
    outcome: String(input.outcome || '').slice(0, 40),
    chatType: input.chatType === 'group' ? 'group' : 'private',
    chatName: String(input.chatName || '').slice(0, 160),
    message: String(input.message || '').slice(0, 2000),
    matchedItem: String(input.matchedItem || '').slice(0, 160),
    intent: String(input.intent || '').slice(0, 80),
    reply: String(input.reply || '').slice(0, 1000),
    summary: String(input.summary || '').slice(0, 500),
    rateLimited: Boolean(input.rateLimited),
    details
  };
}

class DiagnosticBus {
  constructor({ maxEntries = 500 } = {}) {
    this.maxEntries = Math.max(50, Math.min(2000, Number(maxEntries || 500)));
    this.events = [];
    this.nextId = 1;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  add(input = {}) {
    const event = { id: this.nextId++, createdAt: new Date().toISOString(), ...sanitizeEvent(input) };
    this.events.push(event);
    if (this.events.length > this.maxEntries) this.events.splice(0, this.events.length - this.maxEntries);
    this.emitter.emit('event', event);
    return event;
  }

  list({ after = 0, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(this.maxEntries, Number(limit || 200)));
    return this.events.filter(event => event.id > Number(after || 0)).slice(-safeLimit);
  }

  subscribe(listener) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  clear() { this.events = []; }
  stats() { return { count: this.events.length, maxEntries: this.maxEntries, lastId: this.nextId - 1 }; }
}

module.exports = { DiagnosticBus };
