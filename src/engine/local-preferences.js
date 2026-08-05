'use strict';

class LocalPreferenceStore {
  constructor({ ttlMs = 10 * 60_000, maxEntries = 1500 } = {}) {
    this.ttlMs = Math.max(60_000, Number(ttlMs || 10 * 60_000));
    this.maxEntries = Math.max(100, Number(maxEntries || 1500));
    this.items = new Map();
  }
  get(key) {
    const item = this.items.get(String(key || ''));
    if (!item || item.expiresAt <= Date.now()) { if (item) this.items.delete(String(key || '')); return null; }
    return { ...item.value };
  }
  set(key, value = {}) {
    const id = String(key || ''); if (!id) return null;
    const clean = Object.fromEntries(Object.entries(value).filter(([, current]) => current !== undefined && current !== null && current !== ''));
    if (!Object.keys(clean).length) return null;
    this.items.set(id, { value: clean, expiresAt: Date.now() + this.ttlMs });
    if (this.items.size > this.maxEntries) {
      const oldest = this.items.keys().next().value; if (oldest) this.items.delete(oldest);
    }
    return clean;
  }
  clear(key) { this.items.delete(String(key || '')); }
  cleanup(now = Date.now()) { for (const [key, item] of this.items) if (item.expiresAt <= now) this.items.delete(key); }
  size() { return this.items.size; }
}

function preferencesFromSubject(subject = {}) {
  const discipline = subject.discipline || subject.disciplineCode || subject.disciplineName || subject.disciplineNames?.[0] || (subject.kind === 'discipline_card' ? subject.referenceText : '') || '';
  return {
    semester: Number(subject.semester || 0) || null,
    targetDate: subject.targetDate || '', dayIndex: Number.isInteger(Number(subject.dayIndex)) ? Number(subject.dayIndex) : null,
    discipline, professor: subject.professor || subject.professorName || subject.teacherNames?.[0] || '', intents: subject.intents || (subject.intent ? [subject.intent] : [])
  };
}

function applyLocalPreferences(prepared = {}, preferences = {}, raw = '') {
  const lead = /^(?:e|mas|entao|então|tambem|também|agora|na sexta|sexta|hoje|amanha|amanhã)\b/iu.test(String(raw || '').trim());
  if (!lead) return prepared;
  const next = { ...prepared };
  if (!next.semester && preferences.semester) next.semester = preferences.semester;
  if (!next.targetDate?.matched && preferences.targetDate) next.targetDate = { matched: true, iso: preferences.targetDate, dayIndex: preferences.dayIndex, expression: 'contexto recente' };
  next.localPreferencesApplied = true;
  next.localPreferences = preferences;
  return next;
}

module.exports = { LocalPreferenceStore, preferencesFromSubject, applyLocalPreferences };
