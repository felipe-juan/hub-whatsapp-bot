'use strict';

const { normalizeText } = require('../text');
const { findDisciplineCandidates } = require('../discipline-directory');
const { parseSemester, parseTargetDate } = require('../semester-schedule');
const { canonicalSpeechText } = require('./language');

const INTENT_RULES = Object.freeze([
  ['contact', /\b(?:contato|email|e-mail|falar com|entrar em contato)\b/u],
  ['room', /\b(?:sala|salas|onde e|onde é|onde fica|local|laboratorio|laboratório|lab|predio|prédio|bloco)\b/u],
  ['professor', /\b(?:quem da|quem dá|quem ensina|quem ministra|professor(?:a)? de|qual(?: e| é)? o nome do professor|qual professor|docente)\b/u],
  ['schedule', /\b(?:horario|horário|horarios|horários|que horas|quando|aula hoje|aulas hoje|aula amanha|aula amanhã)\b/u],
  ['day', /\b(?:qual dia|quais dias|que dia|dias de aula|em quais dias)\b/u],
  ['professor_disciplines', /\b(?:quais materias|quais matérias|quais disciplinas|o que .* ensina|disciplinas do professor)\b/u],
  ['semester_classes', /\b(?:aulas do semestre|horarios do semestre|horários do semestre|grade do semestre|materias do semestre|matérias do semestre)\b/u],
  ['general', /\b(?:informacoes|informações|me fale|tudo sobre|dados de|sobre a disciplina)\b/u]
]);

const GENERIC_ENTITY_PATTERNS = Object.freeze({
  professor: /\b(?:professor|professora|docente)\b/u,
  discipline: /\b(?:disciplina|materia|matéria|aula)\b/u,
  semester: /\bsemestre\b/u
});

function detectIntent(text) {
  const normalized = canonicalSpeechText(text);
  const intents = [];
  for (const [intent, pattern] of INTENT_RULES) if (pattern.test(normalized)) intents.push(intent);
  if (!intents.length && /^(?:sala|professor|professora|horario|horário|contato|dia|semestre)$/u.test(normalized)) {
    const map = { sala: 'room', professor: 'professor', professora: 'professor', horario: 'schedule', contato: 'contact', dia: 'day', semestre: 'semester_classes' };
    intents.push(map[normalized]);
  }
  return [...new Set(intents)];
}

function assessAcademicQuestion(text, { prepared = null, snapshot = null, now = Date.now() } = {}) {
  const normalized = canonicalSpeechText(text);
  const intents = detectIntent(normalized);
  const semester = Number(prepared?.semester || parseSemester(normalized) || 0);
  const targetDate = prepared?.targetDate?.matched ? prepared.targetDate : parseTargetDate(normalized, now);
  const professors = [...(prepared?.professorMatches || [])].filter(match => match?.teacher && match.fuzzy !== true);
  let disciplines = [...(prepared?.disciplineMatches || [])];
  let disciplineCandidates = [];
  if (!disciplines.length && snapshot?.disciplineDirectory) {
    const resolved = findDisciplineCandidates(normalized, snapshot.disciplineDirectory);
    disciplineCandidates = resolved.matches || [];
    if (disciplineCandidates.length === 1) disciplines = disciplineCandidates;
  }
  const academicSignal = intents.length > 0 || professors.length > 0 || disciplines.length > 0 || disciplineCandidates.length > 0 || semester > 0 || targetDate?.matched;
  if (!academicSignal) return { matched: false, normalized, intents: [] };

  const primaryIntent = intents[0] || (disciplines.length || professors.length ? 'general' : targetDate?.matched ? 'schedule' : semester ? 'semester_classes' : 'general');
  const missing = [];
  const hasSubject = disciplines.length || professors.length || semester;
  if (primaryIntent === 'contact') {
    if (!professors.length && !disciplines.length) missing.push(GENERIC_ENTITY_PATTERNS.professor.test(normalized) ? 'professor' : 'subject');
  } else if (['room','professor','day','schedule','general'].includes(primaryIntent)) {
    if (!disciplines.length && !professors.length && !semester) missing.push('discipline');
  } else if (primaryIntent === 'professor_disciplines') {
    if (!professors.length) missing.push('professor');
  } else if (primaryIntent === 'semester_classes') {
    if (!semester) missing.push('semester');
  }
  if (targetDate?.matched && !hasSubject && !semester && ['schedule', 'semester_classes'].includes(primaryIntent)) missing.splice(0, missing.length, 'semester');

  let confidence = 0.25;
  confidence += intents.length ? 0.25 : 0;
  confidence += disciplines.length ? 0.25 : 0;
  confidence += professors.some(item => !item.fuzzy) ? 0.25 : professors.length ? 0.12 : 0;
  confidence += semester ? 0.15 : 0;
  confidence += targetDate?.matched ? 0.1 : 0;
  if (disciplineCandidates.length > 1) confidence = Math.min(confidence, 0.62);

  return {
    matched: true, normalized, intents, primaryIntent, semester, targetDate,
    professors, disciplines, disciplineCandidates, missing: [...new Set(missing)],
    confidence: Math.min(1, confidence)
  };
}

function missingQuestion(assessment) {
  const missing = assessment?.missing?.[0] || '';
  const when = assessment?.targetDate?.expression ? ` ${assessment.targetDate.expression}` : '';
  if (missing === 'semester') return `Você quer consultar as aulas de qual semestre${when}?`;
  if (missing === 'professor') return 'Qual é o nome do professor?';
  if (missing === 'subject') return 'Você procura o contato de qual professor, disciplina ou setor?';
  if (missing === 'discipline') {
    if (assessment.primaryIntent === 'room') return `De qual disciplina você quer saber a sala${when}?`;
    if (assessment.primaryIntent === 'professor') return 'De qual disciplina você quer saber o professor?';
    if (assessment.primaryIntent === 'day') return 'De qual disciplina você quer saber os dias de aula?';
    if (assessment.primaryIntent === 'schedule') return `De qual disciplina ou semestre você quer saber o horário${when}?`;
    return 'De qual disciplina você quer informações?';
  }
  return '';
}

module.exports = { assessAcademicQuestion, missingQuestion, detectIntent };
