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

const CONNECTOR_WORDS = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'das', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos']);
const QUERY_STOPWORDS = new Set([
  ...CONNECTOR_WORDS,
  'qual', 'quais', 'que', 'quem', 'onde', 'quando', 'como', 'nome', 'nomes',
  'professor', 'professora', 'professores', 'professoras', 'docente', 'docentes', 'prof', 'profa',
  'sala', 'salas', 'laboratorio', 'laboratorios', 'lab', 'predio', 'bloco', 'andar',
  'dia', 'dias', 'horario', 'horarios', 'hora', 'horas', 'aula', 'aulas',
  'materia', 'materias', 'disciplina', 'disciplinas', 'semestre', 'semestres',
  'contato', 'email', 'telefone', 'whatsapp', 'numero', 'celular',
  'fica', 'ficam', 'sera', 'serao', 'ministrada', 'ministrado', 'ministradas', 'ministrados',
  'leciona', 'lecionada', 'lecionado', 'ensina', 'da', 'dar', 'dara', 'informe', 'informar',
  'me', 'diga', 'mostre', 'passa', 'passe', 'favor'
]);

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

function wordVariants(word = '') {
  const normalized = normalizeText(word);
  if (!normalized) return [];
  const variants = [normalized];
  if (normalized.endsWith('s') && normalized.length > 5) variants.push(normalized.slice(0, -1));
  else if (normalized.length >= 5) variants.push(`${normalized}s`);
  return unique(variants);
}

function uniqueFirstWordAliases(items = []) {
  const counts = new Map();
  const firstWords = new Map();
  for (const item of items) {
    const first = normalizeText(String(item.name || '').trim()).split(/\s+/u).filter(Boolean)[0] || '';
    if (!first) continue;
    firstWords.set(normalizeText(item.name), first);
    counts.set(first, Number(counts.get(first) || 0) + 1);
  }
  const aliases = new Map();
  for (const item of items) {
    const key = normalizeText(item.name);
    const first = firstWords.get(key) || '';
    // Só aceita a primeira palavra quando ela identifica uma única disciplina.
    // Palavras muito curtas ou excessivamente genéricas continuam proibidas.
    if (first.length < 5 || counts.get(first) !== 1 || first === 'meio') continue;
    aliases.set(key, wordVariants(first));
  }
  return aliases;
}

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
  const items = [...byName.values()];
  const firstWordAliases = uniqueFirstWordAliases(items);
  return items.map(item => ({
    ...item,
    aliases: unique([
      ...item.aliases,
      ...(firstWordAliases.get(normalizeText(item.name)) || [])
    ]).sort((a, b) => normalizeText(b).length - normalizeText(a).length)
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

function disciplineSearchKey(value = '') {
  return normalizeText(value).split(/\s+/u).filter(token => token && !CONNECTOR_WORDS.has(token)).join(' ');
}

function extractDisciplineQueryFragment(text = '') {
  const tokens = normalizeText(text).split(/\s+/u).filter(Boolean);
  return tokens.filter(token => !QUERY_STOPWORDS.has(token)).join(' ').trim();
}

function findDisciplineCandidates(text, scheduleEntries = []) {
  const fragment = extractDisciplineQueryFragment(text);
  const key = disciplineSearchKey(fragment);
  if (key.length < 2) return { fragment, matches: [] };
  const ranked = [];
  for (const item of buildDisciplineDirectory(scheduleEntries)) {
    let bestRank = Number.POSITIVE_INFINITY;
    const aliases = unique([item.code, item.name, ...(item.aliases || [])]);
    for (const alias of aliases) {
      const aliasKey = disciplineSearchKey(alias);
      if (!aliasKey) continue;
      if (aliasKey === key) bestRank = Math.min(bestRank, 0);
      else if (aliasKey.startsWith(`${key} `)) bestRank = Math.min(bestRank, 1);
    }
    if (Number.isFinite(bestRank)) ranked.push({ ...item, matchedAlias: fragment, candidateRank: bestRank });
  }
  const matches = [...new Map(ranked
    .sort((a, b) => a.candidateRank - b.candidateRank || String(a.name).localeCompare(String(b.name)))
    .map(item => [normalizeText(item.name), item])).values()];
  return { fragment, matches };
}

function isDirectDisciplineReference(text, matches = []) {
  const normalized = normalizeText(text);
  if (!normalized || !matches.length) return false;
  return matches.some(match => unique([match.matchedAlias, match.code, match.name, ...(match.aliases || [])])
    .some(alias => normalizeText(alias) === normalized));
}

function hasDisciplineInformationIntent(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return /\b(?:sala|salas|dia|dias|horario|horarios|materia|materias|disciplina|disciplinas|aula|aulas|professor|professora|docente|quem|onde|quando|contato|email|e-mail|laboratorio|lab|semestre|semestres|informacao|informacoes|dados|tudo|ministra|ministro|ministrao|ministração|leciona|ensina|da|nome)\b/u.test(normalized)
    && (/\?$/.test(String(text || '').trim()) || /^(?:qual|quais|onde|quando|quem|professor|professora|docente|sala|salas|dia|dias|horario|horarios|contato|email|e-mail|laboratorio|lab|informacao|informacoes|dados|tudo)\b/u.test(normalized)
      || /\b(?:sala|salas)\s+e\s+(?:dia|dias|horario|horarios)\b/u.test(normalized));
}

module.exports = {
  STATIC_DISCIPLINES,
  buildDisciplineDirectory,
  findDisciplineMatches,
  findDisciplineCandidates,
  extractDisciplineQueryFragment,
  isDirectDisciplineReference,
  hasDisciplineInformationIntent
};
