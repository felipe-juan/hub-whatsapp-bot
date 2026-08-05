'use strict';

const { normalizeText } = require('../text');
const { parseSemester, parseTargetDate } = require('../semester-schedule');
const { canonicalSpeechText, isCancel, isListDisciplines, isUnknownSubject } = require('./language');
const { detectRequestedIntents, parseEntityCorrections, looksLikeCompleteRequest, intentLabels, validateConversationState } = require('../engine/query-model');

const INTENT_LABELS = Object.freeze({
  room: 'sala', schedule: 'horário', day: 'dias de aula', professor: 'professor',
  professor_disciplines: 'disciplinas do professor', contact: 'contato', discipline: 'disciplina',
  semester_classes: 'aulas do semestre', source: 'fonte', services: 'serviços', general: 'informações'
});

const INTENT_ALIASES = Object.freeze([
  ['room', /\b(?:sala|local|onde fica|onde e|onde é)\b/u],
  ['schedule', /\b(?:horario|horário|que horas)\b/u],
  ['day', /\b(?:dia|dias de aula|quais dias)\b/u],
  ['contact', /\b(?:contato|email|e-mail|telefone|whatsapp)\b/u],
  ['professor', /\b(?:professor|professora|quem ensina|quem ministra)\b/u],
  ['semester_classes', /\b(?:semestre|grade|aulas do semestre)\b/u]
]);

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function disciplineValue(discipline = {}) { return String(discipline.code || discipline.name || discipline.label || '').trim(); }

function slotsFromAssessment(assessment = {}) {
  const discipline = assessment.disciplines?.[0] || assessment.disciplineCandidates?.[0] || null;
  const professor = assessment.professors?.[0]?.teacher || assessment.professors?.[0] || null;
  const intents = unique(assessment.intents?.length ? assessment.intents : [assessment.primaryIntent || 'general']);
  return {
    intent: intents[0] || 'general', intents,
    excludedIntents: unique(assessment.exclusions || assessment.queryModel?.excludedIntents || []),
    discipline: discipline ? { code: discipline.code || '', name: discipline.name || '', label: discipline.label || '' } : null,
    professor: professor ? { id: Number(professor.id || 0), name: professor.name || '' } : null,
    semester: Number(assessment.semester || 0),
    targetDate: assessment.targetDate?.matched || assessment.targetDate?.iso ? {
      iso: assessment.targetDate.iso || '', dayIndex: Number.isInteger(assessment.targetDate.dayIndex) ? assessment.targetDate.dayIndex : null,
      expression: assessment.targetDate.expression || ''
    } : null,
    entityMode: '', evidence: assessment.evidence || []
  };
}

function mergeSlots(base = {}, patch = {}) {
  const patchIntents = patch.intents || (patch.intent ? [patch.intent] : []);
  const baseIntents = base.intents || (base.intent ? [base.intent] : []);
  const excluded = unique([...(base.excludedIntents || []), ...(patch.excludedIntents || [])]);
  const intents = unique(patch.replaceIntents ? patchIntents : [...baseIntents, ...patchIntents]).filter(intent => !excluded.includes(intent));
  const merged = {
    intent: intents[0] || patch.intent || base.intent || 'general', intents,
    excludedIntents: excluded,
    discipline: patch.discipline === undefined ? (base.discipline || null) : patch.discipline,
    professor: patch.professor === undefined ? (base.professor || null) : patch.professor,
    semester: patch.semester === undefined ? Number(base.semester || 0) : Number(patch.semester || 0),
    targetDate: patch.targetDate === undefined ? (base.targetDate || null) : patch.targetDate,
    entityMode: patch.entityMode === undefined ? (base.entityMode || '') : patch.entityMode,
    evidence: [...(base.evidence || []), ...(patch.evidence || [])]
  };
  const validity = validateConversationState(merged);
  if (!validity.valid) throw new Error(`Estado conversacional inválido: ${validity.errors.join(' ')}`);
  return merged;
}

function formatUnderstanding(slots = {}, { expected = '', compact = false } = {}) {
  const lines = [compact ? '*Entendido:*' : '*Entendido até agora:*', ''];
  const intents = slots.intents?.length ? slots.intents : [slots.intent].filter(Boolean);
  lines.push(`• ${intents.length > 1 ? 'Intenções' : 'Intenção'}: ${intentLabels(intents).join(' + ') || 'não informada'}`);
  lines.push(`• Disciplina: ${slots.discipline ? [slots.discipline.code, slots.discipline.name].filter(Boolean).join(' — ') : 'não informada'}`);
  if (slots.professor || expected === 'professor' || expected === 'subject') lines.push(`• Professor: ${slots.professor?.name || 'não informado'}`);
  if (slots.semester || expected === 'semester') lines.push(`• Semestre: ${slots.semester ? `${slots.semester}º` : 'não informado'}`);
  if (slots.targetDate) lines.push(`• Data: ${slots.targetDate.expression || slots.targetDate.iso || 'informada'}`);
  if (slots.excludedIntents?.length) lines.push(`• Não solicitado: ${intentLabels(slots.excludedIntents).join(', ')}`);
  return lines.join('\n');
}

function expectedForSlots(slots = {}) {
  const intents = new Set(slots.intents?.length ? slots.intents : [slots.intent]);
  const hasSubject = Boolean(slots.discipline || slots.professor || Number(slots.semester || 0));
  if (intents.has('semester_classes') && !Number(slots.semester || 0)) return 'semester';
  if (intents.has('professor_disciplines') && !slots.professor) return 'professor';
  if (intents.has('contact') && !slots.discipline && !slots.professor) return slots.entityMode === 'discipline' ? 'discipline' : slots.entityMode === 'professor' ? 'professor' : 'subject';
  if ([...intents].some(intent => ['room', 'schedule', 'day', 'professor', 'general'].includes(intent)) && !hasSubject) return 'discipline';
  return '';
}

function intentPrompt(intent) {
  return ({ room: 'qual sala', schedule: 'qual horario', day: 'quais dias de aula', professor: 'quem ensina',
    professor_disciplines: 'quais disciplinas', contact: 'contato', semester_classes: 'aulas do semestre',
    source: 'fonte', services: 'servicos', discipline: 'disciplina', general: 'informacoes sobre' })[intent] || 'informacoes sobre';
}

function buildQueryFromSlots(slots = {}, fallback = '') {
  const subject = slots.discipline ? disciplineValue(slots.discipline) : slots.professor?.name || (slots.semester ? `${slots.semester} semestre` : '');
  const when = slots.targetDate?.expression || slots.targetDate?.iso || '';
  const intents = slots.intents?.length ? slots.intents : [slots.intent || 'general'];
  const prompts = intents.filter(intent => !(slots.excludedIntents || []).includes(intent)).map(intentPrompt);
  const joined = prompts.length <= 1 ? prompts[0] : `${prompts.slice(0, -1).join(', ')} e ${prompts.at(-1)}`;
  const built = `${joined || 'informacoes sobre'} ${[subject, when].filter(Boolean).join(' ')}`.replace(/\s{2,}/gu, ' ').trim();
  return built.length >= 4 ? built : String(fallback || '').trim();
}

function intentFromText(text = '') {
  const detected = detectRequestedIntents(text).intents;
  if (detected.length) return detected[0];
  const normalized = canonicalSpeechText(text);
  for (const [intent, pattern] of INTENT_ALIASES) if (pattern.test(normalized)) return intent;
  return '';
}

function parseExplicitCorrection(text = '', now = Date.now(), options = {}) {
  const normalized = canonicalSpeechText(text);
  if (!normalized) return null;
  const corrections = parseEntityCorrections(normalized, { ...options, now });
  const correctionSignal = corrections.length > 0 || /\b(?:nao e|não é|quero|trocar|troque|mudar|mude|corrigir|na verdade|e sim|é sim)\b/u.test(normalized);
  if (!correctionSignal && !/^e\s+(?:amanha|amanhã|hoje|depois de amanha|depois de amanhã)$/u.test(normalized)) return null;
  const patch = { normalized, corrections };
  for (const correction of corrections) {
    if (correction.field === 'intents') { patch.intents = correction.value; patch.intent = correction.value?.[0] || ''; patch.replaceIntents = correction.operation === 'replace'; }
    else if (correction.field === 'semester') patch.semester = correction.value;
    else if (correction.field === 'targetDate') patch.targetDate = correction.value;
    else if (correction.field === 'entityMode') patch.entityMode = correction.value;
    else if (correction.field === 'discipline') patch.discipline = correction.value;
    else if (correction.field === 'professor') patch.professor = correction.value;
  }
  if (!patch.semester) {
    const semester = parseSemester(normalized); if (semester) patch.semester = semester;
  }
  if (!patch.targetDate) {
    const targetDate = parseTargetDate(normalized, now);
    if (targetDate?.matched) patch.targetDate = { iso: targetDate.iso || '', dayIndex: targetDate.dayIndex, expression: targetDate.expression || '' };
  }
  return patch;
}

function looksLikeNewCompleteRequest(text = '', { expected = '', scheduleEntries = [], teachers = [], now = Date.now() } = {}) {
  const normalized = canonicalSpeechText(text);
  if (!normalized || isCancel(normalized) || isListDisciplines(normalized) || isUnknownSubject(normalized)) return false;
  if (parseExplicitCorrection(normalized, now, { scheduleEntries, teachers })) return false;
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length === 1 && ['discipline', 'professor', 'semester', 'subject'].includes(expected)) return false;
  return looksLikeCompleteRequest(text, { scheduleEntries, teachers, now, allowShortStandalone: false });
}

function routingTopic(text = '') {
  const normalized = normalizeText(text);
  if (/\b(?:matricula|matrícula|rematricula|rematrícula|registro escolar|historico|histórico|trancamento)\b/u.test(normalized)) return 'enrollment';
  if (/\b(?:estagio|estágio|empresa|termo de compromisso)\b/u.test(normalized)) return 'internship';
  if (/\b(?:livro|biblioteca|emprestimo|empréstimo|renovacao|renovação)\b/u.test(normalized)) return 'library';
  if (/\b(?:auxilio|auxílio|bolsa|paae|assistencia estudantil|assistência estudantil|servico social|serviço social)\b/u.test(normalized)) return 'aid';
  if (/\b(?:senha|conta|suap|wifi|wi-fi|internet|acesso|login)\b/u.test(normalized)) return 'technology';
  if (/\b(?:tcc|trabalho de conclusao|trabalho de conclusão|orientador|banca)\b/u.test(normalized)) return 'tcc';
  return '';
}

const ROUTING_TARGETS = Object.freeze({
  enrollment: ['CORES', 'Coordenação do BSI', 'CAENS'], internship: ['Coordenação de Estágio'],
  library: ['Biblioteca'], aid: ['CAENS', 'Serviço Social'], technology: ['CGTI'], tcc: ['Coordenação do BSI']
});

module.exports = {
  INTENT_LABELS, ROUTING_TARGETS, slotsFromAssessment, mergeSlots, formatUnderstanding,
  expectedForSlots, buildQueryFromSlots, intentFromText, parseExplicitCorrection,
  looksLikeNewCompleteRequest, routingTopic
};
