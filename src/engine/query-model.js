'use strict';

const { normalizeText } = require('../text');
const { canonicalSpeechText } = require('../recovery/language');
const { parseSemester, parseTargetDate } = require('../semester-schedule');
const { findDisciplineCandidates, findDisciplineMatches } = require('../discipline-directory');
const { findTeacherMatches } = require('../professor-location');

const INTENT_DEFINITIONS = Object.freeze([
  { id: 'room', field: 'room', label: 'sala', patterns: [ /\b(?:sala|salas|laboratorio|laboratório|laboratorios|laboratórios|lab|local da aula|onde e a aula|onde é a aula|onde fica)\b/u ] },
  { id: 'schedule', field: 'hours', label: 'horário', patterns: [ /\b(?:horario|horário|horarios|horários|que horas|qual hora)\b/u ] },
  { id: 'day', field: 'day', label: 'dias de aula', patterns: [ /\b(?:quais dias|qual dia|dias de aula|dia da aula|quando tem aula)\b/u ] },
  { id: 'professor', field: 'professor', label: 'professor', patterns: [ /\b(?:quem ensina|quem ministra|quem leciona|qual(?:\s+e)?\s+(?:o\s+)?professor|qual(?:\s+e)?\s+(?:a\s+)?professora|professor(?:a)? de|docente de)\b/u ] },
  { id: 'contact', field: 'contact', label: 'contato', patterns: [ /\b(?:contato|ctt|email|e-mail|telefone|whatsapp|falar com)\b/u ] },
  { id: 'professor_disciplines', field: 'discipline', label: 'disciplinas do professor', patterns: [ /\b(?:quais materias|quais matérias|quais disciplinas|o que .* ensina|disciplinas do professor|materias do professor|matérias do professor)\b/u ] },
  { id: 'discipline', field: 'discipline', label: 'disciplina', patterns: [ /\b(?:qual disciplina|qual materia|qual matéria)\b/u ] },
  { id: 'semester_classes', field: 'semester', label: 'aulas do semestre', patterns: [ /\b(?:aulas do semestre|grade do semestre|horario do semestre|horário do semestre|materias do semestre|matérias do semestre)\b/u ] },
  { id: 'source', field: 'source', label: 'fonte', patterns: [ /\b(?:fonte|de onde veio|onde foi publicado|link oficial)\b/u ] },
  { id: 'services', field: 'services', label: 'serviços', patterns: [ /\b(?:o que resolve|quais serviços|que servicos|para que serve|o que faz)\b/u ] },
  { id: 'calculator', field: 'calculator', label: 'cálculo da nota final', patterns: [ /\b(?:calculadora da final|calcular (?:a )?nota|quanto (?:eu )?preciso tirar|nota minima da final|nota mínima da final)\b/u ] },
  { id: 'calendar', field: 'calendar', label: 'data ou calendário', patterns: [ /\b(?:calendario|calendário|data da (?:prova|final)|dia da (?:prova|final)|quando (?:e|é|vai ser) (?:a )?(?:prova )?final)\b/u ] },
  { id: 'general', field: 'general', label: 'informações', patterns: [ /\b(?:informacoes|informações|me fale|tudo sobre|dados de|sobre a disciplina)\b/u ] }
]);

const INTENT_BY_ID = Object.freeze(Object.fromEntries(INTENT_DEFINITIONS.map(item => [item.id, item])));
const FIELD_TO_INTENT = Object.freeze(Object.fromEntries(INTENT_DEFINITIONS.map(item => [item.field, item.id])));
const STATE_FIELDS = Object.freeze(['discipline', 'professor', 'semester', 'targetDate', 'intents', 'excludedIntents', 'entityMode']);

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }

function detectRequestedIntents(text = '') {
  const normalized = canonicalSpeechText(text);
  const intents = [];
  const evidence = [];
  for (const definition of INTENT_DEFINITIONS) {
    for (const pattern of definition.patterns) {
      const match = pattern.exec(normalized);
      if (!match) continue;
      intents.push(definition.id);
      evidence.push({ type: 'intent', intent: definition.id, text: match[0], weight: 1 });
      break;
    }
  }
  if (!intents.length && /^(?:sala|professor|professora|horario|horário|contato|dia|semestre)$/u.test(normalized)) {
    const single = { sala: 'room', professor: 'professor', professora: 'professor', horario: 'schedule', 'horário': 'schedule', contato: 'contact', dia: 'day', semestre: 'semester_classes' }[normalized];
    if (single) intents.push(single);
  }
  return { intents: unique(intents), evidence };
}

function detectIntentExclusions(text = '', requestedIntents = []) {
  const normalized = canonicalSpeechText(text);
  const excluded = [];
  const evidence = [];
  for (const definition of INTENT_DEFINITIONS) {
    const aliases = definition.patterns.map(pattern => pattern.source).join('|');
    const negation = new RegExp(`(?:\\bnao\\s+(?:quero|preciso|e|é|sobre)|\\bsem)\\s+(?:[^,.;]{0,20})?(?:${aliases})`, 'u');
    const match = negation.exec(normalized);
    if (match) {
      excluded.push(definition.id);
      evidence.push({ type: 'exclusion', intent: definition.id, text: match[0], weight: -1 });
    }
  }
  const onlyMatch = /\b(?:so|só|somente|apenas)\s+(?:quero\s+)?(?:a|o)?\s*([\p{L}\s-]{2,45})/u.exec(normalized);
  if (onlyMatch) {
    const only = detectRequestedIntents(onlyMatch[1]).intents;
    if (only.length) {
      for (const intent of requestedIntents) if (!only.includes(intent)) excluded.push(intent);
      evidence.push({ type: 'only', intents: only, text: onlyMatch[0], weight: 1 });
    }
  }
  return { excludedIntents: unique(excluded), evidence };
}

function exactProfessorFromText(text, teachers = []) {
  const matches = findTeacherMatches(normalizeText(text), teachers).filter(item => item?.teacher && item.fuzzy !== true);
  return matches.length === 1 ? matches[0].teacher : null;
}

function disciplineFromText(text, scheduleEntries = [], { allowShortStandalone = true } = {}) {
  const direct = findDisciplineMatches(text, scheduleEntries, { allowShortStandalone });
  if (direct.length) return {
    discipline: direct.length === 1 ? direct[0] : null,
    alternatives: direct,
    fragment: direct.map(item => item.matchedAlias || item.code || item.name).join(' ')
  };
  const result = findDisciplineCandidates(text, scheduleEntries, { allowShortStandalone });
  return {
    discipline: result.matches?.length === 1 ? result.matches[0] : null,
    alternatives: result.matches || [],
    fragment: result.fragment || ''
  };
}

function affirmativeCorrectionSegment(canonical = '') {
  const explicit = canonical.split(/\b(?:mas|e sim|é sim|na verdade|quero|troque para|mude para|corrija para)\b/u);
  if (explicit.length > 1) return explicit.at(-1).trim();
  const replacement = /^nao e (.+?) e (.+)$/u.exec(canonical);
  if (replacement) return replacement[2].trim();
  const positiveThenNegative = /^(?:e )?(.+?)\s+nao\s+(.+)$/u.exec(canonical);
  if (positiveThenNegative) return positiveThenNegative[1].trim();
  return canonical;
}

function parseEntityCorrections(text = '', { scheduleEntries = [], teachers = [], now = Date.now() } = {}) {
  const canonical = canonicalSpeechText(text);
  const normalized = normalizeText(canonical);
  const corrections = [];
  const signal = /\b(?:nao e|não é|na verdade|troca(?:r)?|troque|muda(?:r)?|mude|corrigir|corrija|quero|e sim|é sim)\b/u.test(canonical);
  if (!signal && !/\b(?:hoje|amanha|amanhã|depois de amanha|depois de amanhã)\b.*\b(?:nao|não)\b/u.test(canonical)) return corrections;

  const positiveSegment = affirmativeCorrectionSegment(canonical);
  const intentResult = detectRequestedIntents(positiveSegment);
  const positiveExclusions = detectIntentExclusions(positiveSegment, intentResult.intents).excludedIntents;
  const positiveIntents = intentResult.intents.filter(intent => !positiveExclusions.includes(intent));
  if (positiveIntents.length) corrections.push({ field: 'intents', operation: 'replace', value: positiveIntents, reason: 'correção explícita de intenção' });

  const positiveDiscipline = disciplineFromText(positiveSegment, scheduleEntries, { allowShortStandalone: true }).discipline;
  if (positiveDiscipline) corrections.push({ field: 'discipline', operation: 'replace', value: {
    code: positiveDiscipline.code || '', name: positiveDiscipline.name || '', label: positiveDiscipline.label || ''
  }, reason: 'correção explícita de disciplina' });

  const positiveProfessor = exactProfessorFromText(positiveSegment, teachers);
  if (positiveProfessor) corrections.push({ field: 'professor', operation: 'replace', value: { id: Number(positiveProfessor.id || 0), name: positiveProfessor.name || '' }, reason: 'correção explícita de professor' });

  const semester = parseSemester(positiveSegment);
  if (semester) corrections.push({ field: 'semester', operation: 'replace', value: semester, reason: 'correção explícita de semestre' });

  const date = parseTargetDate(positiveSegment, now);
  if (date?.matched) corrections.push({ field: 'targetDate', operation: 'replace', value: {
    iso: date.iso || '', dayIndex: date.dayIndex, expression: date.expression || ''
  }, reason: 'correção explícita de data' });

  if (/\b(?:nao e|não é)\s+professor\b.*\b(?:e|é)\s+disciplina\b/u.test(canonical)) {
    corrections.push({ field: 'entityMode', operation: 'replace', value: 'discipline', reason: 'correção de tipo de entidade' });
    corrections.push({ field: 'professor', operation: 'clear', value: null, reason: 'professor explicitamente excluído' });
  }
  if (/\b(?:nao e|não é)\s+disciplina\b.*\b(?:e|é)\s+professor\b/u.test(canonical)) {
    corrections.push({ field: 'entityMode', operation: 'replace', value: 'professor', reason: 'correção de tipo de entidade' });
    corrections.push({ field: 'discipline', operation: 'clear', value: null, reason: 'disciplina explicitamente excluída' });
  }
  return corrections;
}

function scoreAlternatives({ disciplineAlternatives = [], professorMatches = [], intents = [], excludedIntents = [] } = {}) {
  const alternatives = [];
  for (const item of disciplineAlternatives.slice(0, 5)) alternatives.push({
    kind: 'discipline', id: item.code || normalizeText(item.name), title: [item.code, item.name].filter(Boolean).join(' — '),
    confidence: Math.max(0.25, Math.min(0.98, Number(item.score || 80) / 100)), evidence: item.reasons || []
  });
  for (const match of professorMatches.slice(0, 5)) alternatives.push({
    kind: 'professor', id: Number(match.teacher?.id || 0) || normalizeText(match.teacher?.name), title: match.teacher?.name || '',
    confidence: match.fuzzy ? 0.62 : 0.95, evidence: [match.fuzzy ? 'nome semelhante' : 'nome exato']
  });
  for (const intent of intents.filter(item => !excludedIntents.includes(item))) alternatives.push({
    kind: 'intent', id: intent, title: INTENT_BY_ID[intent]?.label || intent, confidence: 0.9, evidence: ['intenção explicitamente mencionada']
  });
  return alternatives.sort((a, b) => b.confidence - a.confidence);
}

function analyzeUnifiedQuery(text = '', { scheduleEntries = [], teachers = [], now = Date.now(), allowShortStandalone = false } = {}) {
  const raw = String(text || '').trim();
  const canonical = canonicalSpeechText(raw);
  const normalized = normalizeText(canonical);
  const intentResult = detectRequestedIntents(canonical);
  const exclusionResult = detectIntentExclusions(canonical, intentResult.intents);
  let activeIntents = intentResult.intents.filter(intent => !exclusionResult.excludedIntents.includes(intent));
  const disciplineResult = disciplineFromText(canonical, scheduleEntries, { allowShortStandalone });
  const professorMatches = findTeacherMatches(normalized, teachers).filter(match => match?.teacher);
  const exactProfessors = professorMatches.filter(match => match.fuzzy !== true);
  const semester = parseSemester(canonical);
  const targetDate = parseTargetDate(canonical, now);
  const corrections = parseEntityCorrections(canonical, { scheduleEntries, teachers, now });
  const latestCorrection = field => [...corrections].reverse().find(item => item.field === field);
  const intentCorrection = latestCorrection('intents');
  if (intentCorrection?.operation === 'replace') activeIntents = unique(intentCorrection.value || []).filter(intent => !exclusionResult.excludedIntents.includes(intent));
  const disciplineCorrection = latestCorrection('discipline');
  const professorCorrection = latestCorrection('professor');
  const semesterCorrection = latestCorrection('semester');
  const dateCorrection = latestCorrection('targetDate');
  const effectiveDiscipline = disciplineCorrection?.operation === 'replace' ? disciplineCorrection.value : disciplineResult.discipline;
  const effectiveProfessor = professorCorrection?.operation === 'replace' ? professorCorrection.value : (exactProfessors.length === 1 ? exactProfessors[0].teacher : null);
  const effectiveSemester = semesterCorrection?.operation === 'replace' ? Number(semesterCorrection.value || 0) : semester;
  const effectiveTargetDate = dateCorrection?.operation === 'replace' ? dateCorrection.value : (targetDate?.matched ? { iso: targetDate.iso || '', dayIndex: targetDate.dayIndex, expression: targetDate.expression || '' } : null);
  const effectiveDisciplineAlternatives = effectiveDiscipline ? unique([effectiveDiscipline, ...disciplineResult.alternatives].map(item => JSON.stringify(item))).map(item => JSON.parse(item)) : disciplineResult.alternatives;
  const evidence = [...intentResult.evidence, ...exclusionResult.evidence];
  if (effectiveDiscipline) evidence.push({ type: 'entity', entity: 'discipline', text: disciplineResult.fragment || effectiveDiscipline.code || effectiveDiscipline.name, weight: 1 });
  if (effectiveProfessor) evidence.push({ type: 'entity', entity: 'professor', text: effectiveProfessor.name, weight: 1 });
  if (effectiveSemester) evidence.push({ type: 'entity', entity: 'semester', text: String(effectiveSemester), weight: 0.7 });
  if (effectiveTargetDate) evidence.push({ type: 'entity', entity: 'date', text: effectiveTargetDate.expression || effectiveTargetDate.iso, weight: 0.7 });
  const alternatives = scoreAlternatives({ disciplineAlternatives: effectiveDisciplineAlternatives, professorMatches, intents: activeIntents, excludedIntents: exclusionResult.excludedIntents });
  let confidence = 0.15;
  confidence += activeIntents.length ? 0.25 : 0;
  confidence += effectiveDiscipline ? 0.25 : effectiveDisciplineAlternatives.length ? 0.12 : 0;
  confidence += effectiveProfessor ? 0.25 : professorMatches.length ? 0.1 : 0;
  confidence += effectiveSemester ? 0.1 : 0;
  confidence += effectiveTargetDate ? 0.1 : 0;
  if (alternatives.length > 1 && alternatives[0].kind === alternatives[1].kind && alternatives[0].confidence - alternatives[1].confidence < 0.12) confidence = Math.min(confidence, 0.62);
  return {
    raw, canonical, normalized,
    intents: activeIntents,
    excludedIntents: exclusionResult.excludedIntents,
    entities: {
      disciplines: effectiveDiscipline ? [effectiveDiscipline] : [],
      disciplineCandidates: effectiveDisciplineAlternatives,
      professors: effectiveProfessor ? [effectiveProfessor] : [],
      professorCandidates: professorMatches,
      semester: effectiveSemester || 0,
      targetDate: effectiveTargetDate
    },
    corrections,
    evidence,
    alternatives,
    confidence: Math.min(1, confidence)
  };
}

function applyCorrections(state = {}, corrections = []) {
  const next = { ...state };
  for (const correction of corrections || []) {
    if (!STATE_FIELDS.includes(correction.field)) continue;
    if (correction.operation === 'clear') next[correction.field] = correction.field === 'intents' || correction.field === 'excludedIntents' ? [] : null;
    else next[correction.field] = correction.value;
  }
  return next;
}

function mergeQueryState(base = {}, model = {}) {
  const entities = model.entities || {};
  let next = {
    ...base,
    intents: unique([...(base.intents || (base.intent ? [base.intent] : [])), ...(model.intents || [])]).filter(intent => !(model.excludedIntents || []).includes(intent)),
    excludedIntents: unique([...(base.excludedIntents || []), ...(model.excludedIntents || [])]),
    discipline: entities.disciplines?.[0] ? {
      code: entities.disciplines[0].code || '', name: entities.disciplines[0].name || '', label: entities.disciplines[0].label || ''
    } : (base.discipline || null),
    professor: entities.professors?.[0] ? { id: Number(entities.professors[0].id || 0), name: entities.professors[0].name || '' } : (base.professor || null),
    semester: Number(entities.semester || base.semester || 0),
    targetDate: entities.targetDate || base.targetDate || null,
    evidence: [...(base.evidence || []), ...(model.evidence || [])]
  };
  next = applyCorrections(next, model.corrections || []);
  next.intent = next.intents?.[0] || base.intent || 'general';
  return next;
}

function validateConversationState(state = {}) {
  const errors = [];
  if (!Array.isArray(state.intents || [])) errors.push('intents deve ser uma lista.');
  if (state.invalidAttempts !== undefined && (!Number.isInteger(Number(state.invalidAttempts)) || Number(state.invalidAttempts) < 0)) errors.push('invalidAttempts deve ser inteiro não negativo.');
  if (state.expiresAt !== undefined && !Number.isFinite(Number(state.expiresAt))) errors.push('expiresAt deve ser numérico.');
  if (state.discipline && !String(state.discipline.code || state.discipline.name || '').trim()) errors.push('disciplina deve ter código ou nome.');
  if (state.professor && !String(state.professor.name || '').trim()) errors.push('professor deve ter nome.');
  if (state.semester && (!Number.isInteger(Number(state.semester)) || Number(state.semester) < 1 || Number(state.semester) > 12)) errors.push('semestre inválido.');
  return { valid: errors.length === 0, errors };
}

function looksLikeCompleteRequest(text = '', options = {}) {
  const model = analyzeUnifiedQuery(text, options);
  const tokens = model.normalized.split(/\s+/u).filter(Boolean);
  const lead = /^(?:qual|quais|quem|onde|quando|como|me passa|me diga|queria|preciso|manda|mostra|deixa isso|agora quero|contato|email|sala|horario|horário|aulas?|professor|professora|documento|calendario|calendário|biblioteca|caens|cores|tcc|estagio|estágio)\b/u.test(model.canonical);
  return Boolean((model.intents.length && (model.entities.disciplines.length || model.entities.professors.length || model.entities.semester || tokens.length >= 3)) || lead || /\?\s*$/u.test(String(text || '').trim()));
}

function intentLabels(intents = []) { return intents.map(intent => INTENT_BY_ID[intent]?.label || intent); }

module.exports = {
  INTENT_DEFINITIONS, INTENT_BY_ID, FIELD_TO_INTENT,
  detectRequestedIntents, detectIntentExclusions, parseEntityCorrections,
  analyzeUnifiedQuery, mergeQueryState, applyCorrections,
  validateConversationState, looksLikeCompleteRequest, intentLabels
};
