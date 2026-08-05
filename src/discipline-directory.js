'use strict';

const { normalizeText } = require('./text');
const {
  STATIC_DISCIPLINE_CATALOG,
  buildDisciplineCatalog,
  findCatalogMatches,
  findCatalogCandidates,
  extractQueryFragment,
  formatDisciplineList
} = require('./discipline-catalog');

const STATIC_DISCIPLINES = STATIC_DISCIPLINE_CATALOG;

function buildDisciplineDirectory(scheduleEntries = []) {
  return buildDisciplineCatalog(scheduleEntries);
}

function findDisciplineMatches(text, scheduleEntries = [], options = {}) {
  return findCatalogMatches(text, scheduleEntries, options);
}

function findDisciplineCandidates(text, scheduleEntries = [], options = {}) {
  return findCatalogCandidates(text, scheduleEntries, options);
}

function extractDisciplineQueryFragment(text = '') {
  return extractQueryFragment(text);
}

function isDirectDisciplineReference(text, matches = []) {
  const normalized = normalizeText(text);
  if (!normalized || !matches.length) return false;
  return matches.some(match => [match.matchedAlias, match.code, match.name, ...(match.aliases || [])]
    .map(normalizeText).filter(Boolean).some(alias => alias === normalized));
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
  hasDisciplineInformationIntent,
  formatDisciplineList
};
