'use strict';

const { normalizeText } = require('./text');
const {
  SI_PROFESSORS_2026_2,
  SI_DISCIPLINE_CODES_2026_2,
  SI_DISCIPLINE_ALIASES_2026_2,
  formatDisciplineLabel
} = require('./si-professors-2026-2');

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function escapeRegExp(value = '') { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function phrasePattern(value) {
  const escaped = escapeRegExp(normalizeText(value)).replace(/\\\s\+/g, '\\s+');
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s|[?!,.;:])`, 'u');
}

function staticDisciplineEntries() {
  const owners = new Map();
  for (const teacher of SI_PROFESSORS_2026_2) {
    for (const entry of teacher.classes || []) {
      const discipline = String(entry[0] || '').trim();
      if (!discipline) continue;
      if (!owners.has(discipline)) owners.set(discipline, new Set());
      owners.get(discipline).add(teacher.name);
    }
  }
  return [...owners].map(([name, professorNames]) => ({
    name,
    code: SI_DISCIPLINE_CODES_2026_2[name] || '',
    label: formatDisciplineLabel(name),
    aliases: unique([name, SI_DISCIPLINE_CODES_2026_2[name], ...(SI_DISCIPLINE_ALIASES_2026_2[name] || [])]),
    professorNames: [...professorNames]
  }));
}

const STATIC_DISCIPLINES = Object.freeze(staticDisciplineEntries());

function buildDisciplineDirectory(scheduleEntries = []) {
  const byName = new Map(STATIC_DISCIPLINES.map(item => [normalizeText(item.name), { ...item, aliases: [...item.aliases], professorNames: [...item.professorNames] }]));
  for (const entry of scheduleEntries || []) {
    const name = String(entry.discipline_name || '').trim();
    if (!name) continue;
    const key = normalizeText(name);
    const current = byName.get(key) || { name, code: '', label: '', aliases: [], professorNames: [] };
    const code = String(entry.discipline_code || current.code || '').trim().toUpperCase();
    current.name = name;
    current.code = code;
    current.label = code ? `${code} - ${name}` : formatDisciplineLabel(name);
    current.aliases = unique([...current.aliases, name, code, ...(SI_DISCIPLINE_ALIASES_2026_2[name] || [])]);
    current.professorNames = unique([...current.professorNames, String(entry.professor_name || '').trim()]);
    byName.set(key, current);
  }
  return [...byName.values()].map(item => ({
    ...item,
    aliases: unique(item.aliases).sort((a, b) => normalizeText(b).length - normalizeText(a).length)
  }));
}

function findDisciplineMatches(text, scheduleEntries = []) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const matches = [];
  const occupied = [];
  const directory = buildDisciplineDirectory(scheduleEntries);
  const candidates = directory.flatMap(item => item.aliases.map(alias => ({ item, alias, normalizedAlias: normalizeText(alias) })))
    .filter(candidate => candidate.normalizedAlias.length >= 2)
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);
  for (const candidate of candidates) {
    const pattern = phrasePattern(candidate.alias);
    const match = pattern.exec(normalized);
    if (!match) continue;
    const start = match.index + (match[0].startsWith(' ') ? 1 : 0);
    const end = start + candidate.normalizedAlias.length;
    if (occupied.some(range => start < range.end && end > range.start)) continue;
    if (matches.some(existing => normalizeText(existing.name) === normalizeText(candidate.item.name))) continue;
    occupied.push({ start, end });
    matches.push({ ...candidate.item, matchedAlias: candidate.alias, start, end });
  }
  return matches.sort((a, b) => a.start - b.start);
}

function hasDisciplineInformationIntent(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return /\b(?:sala|salas|dia|dias|horario|horarios|materia|materias|disciplina|disciplinas|aula|aulas|professor|professora|quem|onde|quando|contato|email|e-mail|laboratorio|lab|ministra|ministro|ministrao|ministração|leciona|ensina|da)\b/u.test(normalized)
    && (/\?$/.test(String(text || '').trim()) || /^(?:qual|quais|onde|quando|quem|professor|professora|docente|sala|salas|dia|dias|horario|horarios|contato|email|e-mail|laboratorio|lab)\b/u.test(normalized)
      || /\b(?:sala|salas)\s+e\s+(?:dia|dias|horario|horarios)\b/u.test(normalized));
}

module.exports = {
  STATIC_DISCIPLINES,
  buildDisciplineDirectory,
  findDisciplineMatches,
  hasDisciplineInformationIntent
};
