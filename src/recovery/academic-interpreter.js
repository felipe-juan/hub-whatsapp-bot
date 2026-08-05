'use strict';

const { canonicalSpeechText } = require('./language');
const { analyzeUnifiedQuery, detectRequestedIntents } = require('../engine/query-model');

const GENERIC_ENTITY_PATTERNS = Object.freeze({
  professor: /\b(?:professor|professora|docente)\b/u,
  discipline: /\b(?:disciplina|materia|matéria|aula)\b/u,
  semester: /\bsemestre\b/u
});

function detectIntent(text) {
  return detectRequestedIntents(text).intents;
}

function assessAcademicQuestion(text, { prepared = null, snapshot = null, now = Date.now() } = {}) {
  const normalized = canonicalSpeechText(text);
  const queryModel = prepared?.queryModel || analyzeUnifiedQuery(normalized, {
    scheduleEntries: snapshot?.disciplineDirectory || [], teachers: snapshot?.teachers || [], now,
    allowShortStandalone: false
  });
  const intents = queryModel.intents || [];
  const semester = Number(prepared?.semester || queryModel.entities?.semester || 0);
  const targetDate = prepared?.targetDate?.matched ? prepared.targetDate : queryModel.entities?.targetDate;
  const professors = [...(prepared?.professorMatches || [])].filter(match => match?.teacher && match.fuzzy !== true);
  if (!professors.length) for (const teacher of queryModel.entities?.professors || []) professors.push({ teacher, fuzzy: false, score: 100 });
  let disciplines = [...(prepared?.disciplineMatches || [])];
  const disciplineCandidates = [...(queryModel.entities?.disciplineCandidates || [])];
  if (!disciplines.length && queryModel.entities?.disciplines?.length) disciplines = [...queryModel.entities.disciplines];
  const academicSignal = intents.length > 0 || professors.length > 0 || disciplines.length > 0 || disciplineCandidates.length > 0 || semester > 0 || targetDate?.matched || targetDate?.iso;
  if (!academicSignal) return { matched: false, normalized, intents: [], queryModel };

  const primaryIntent = intents[0] || (disciplines.length || professors.length ? 'general' : (targetDate?.matched || targetDate?.iso) ? 'schedule' : semester ? 'semester_classes' : 'general');
  const missing = [];
  const hasSubject = disciplines.length || professors.length || semester;
  const needsDiscipline = intents.some(intent => ['room', 'professor', 'day', 'schedule', 'general'].includes(intent));
  if (intents.includes('contact')) {
    if (!professors.length && !disciplines.length) missing.push(GENERIC_ENTITY_PATTERNS.professor.test(normalized) ? 'professor' : 'subject');
  }
  if (needsDiscipline && !hasSubject) missing.push('discipline');
  if (intents.includes('professor_disciplines') && !professors.length) missing.push('professor');
  if (intents.includes('semester_classes') && !semester) missing.push('semester');
  if ((targetDate?.matched || targetDate?.iso) && !hasSubject && !semester && intents.some(intent => ['schedule', 'semester_classes'].includes(intent))) {
    missing.splice(0, missing.length, 'semester');
  }

  return {
    matched: true, normalized, intents, primaryIntent, semester,
    targetDate: targetDate?.matched ? targetDate : targetDate?.iso ? { ...targetDate, matched: true } : targetDate,
    professors, disciplines, disciplineCandidates, missing: [...new Set(missing)],
    confidence: Number(queryModel.confidence || 0), queryModel,
    exclusions: queryModel.excludedIntents || [], alternatives: queryModel.alternatives || [], evidence: queryModel.evidence || []
  };
}

function missingQuestion(assessment) {
  const missing = assessment?.missing?.[0] || '';
  const when = assessment?.targetDate?.expression ? ` ${assessment.targetDate.expression}` : '';
  if (missing === 'semester') return `Você quer consultar as aulas de qual semestre${when}?`;
  if (missing === 'professor') return 'Qual é o nome do professor?';
  if (missing === 'subject') return 'Você procura o contato de qual professor, disciplina ou setor?';
  if (missing === 'discipline') {
    const intents = new Set(assessment.intents || [assessment.primaryIntent]);
    if (intents.has('room')) return `De qual disciplina você quer saber a sala${when}?`;
    if (intents.has('professor')) return 'De qual disciplina você quer saber o professor?';
    if (intents.has('day')) return 'De qual disciplina você quer saber os dias de aula?';
    if (intents.has('schedule')) return `De qual disciplina ou semestre você quer saber o horário${when}?`;
    return 'De qual disciplina você quer informações?';
  }
  return '';
}

module.exports = { assessAcademicQuestion, missingQuestion, detectIntent };
