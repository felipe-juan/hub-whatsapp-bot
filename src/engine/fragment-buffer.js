'use strict';

const { normalizeText } = require('../text');

function isLikelyFragment(text = '') {
  const raw = String(text || '').trim();
  const normalized = normalizeText(raw);
  if (!normalized || raw.length > 90 || /[?!.]\s*$/u.test(raw)) return false;
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length > 7) return false;
  if (/^(?:qual sala|qual horario|qual horário|quem ensina|qual professor|contato|sala|horario|horário|professor|aulas? de|de\s+[a-z0-9]{1,20}|hoje|amanha|amanhã|depois de amanha|depois de amanhã)$/u.test(normalized)) return true;
  if (tokens.length <= 2 && /^(?:ap|ia|so|si|ed|gp|bd|bdii|mdi|mdii|pwi|pwii|calculo|cálculo|programacao|programação)$/u.test(normalized)) return true;
  return false;
}

class FragmentBuffer {
  constructor({ windowMs = 1500 } = {}) {
    this.windowMs = Math.max(250, Math.min(5000, Number(windowMs || 1500)));
    this.buffers = new Map();
  }
  has(key) { return this.buffers.has(String(key || '')); }
  size() { return this.buffers.size; }
  clear() {
    for (const entry of this.buffers.values()) clearTimeout(entry.timer);
    this.buffers.clear();
  }
  push(key, item, { windowMs = this.windowMs, flush } = {}) {
    const id = String(key || '');
    if (!id) throw new Error('Chave do fragmento ausente.');
    let entry = this.buffers.get(id);
    if (!entry) entry = { items: [], timer: null, createdAt: Date.now() };
    clearTimeout(entry.timer);
    entry.items.push(item);
    const execute = () => {
      const current = this.buffers.get(id);
      if (!current) return;
      this.buffers.delete(id);
      Promise.resolve(flush?.(current.items)).catch(() => {});
    };
    entry.timer = setTimeout(execute, Math.max(250, Math.min(5000, Number(windowMs || this.windowMs))));
    entry.timer.unref?.();
    this.buffers.set(id, entry);
    return entry.items.length;
  }
  flushNow(key, flush) {
    const id = String(key || ''); const entry = this.buffers.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer); this.buffers.delete(id);
    Promise.resolve(flush?.(entry.items)).catch(() => {});
    return true;
  }
}

module.exports = { FragmentBuffer, isLikelyFragment };
