'use strict';

const { normalizeText } = require('./text');
const { parseSemester, parseTargetDate, hasScheduleIntent, isScheduleStatusConfirmation, DEFAULT_TIME_ZONE } = require('./semester-schedule');
const { findTeacherMatches } = require('./professor-location');
const { findDisciplineMatches, hasDisciplineInformationIntent } = require('./discipline-directory');

const NARRATIVE_CLASS_PATTERNS = Object.freeze([
  /\b(?:a aula|as aulas|a materia|as materias|a disciplina|as disciplinas)\b.*\b(?:foi|foram|estava|estavam|acabou|acabaram|comecou|comecaram|foi boa|foram boas)\b/u,
  /\b(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:nao vai ter|nao tera|nao teremos|foi cancelad[ao]s?|foram cancelad[ao]s?)\b/u,
  /\ba semana toda\b/u
]);
const PROFESSOR_INFORMATION_PATTERNS = Object.freeze([
  /\b(?:qual|quais|onde|quando|que horas|qual horario|quais horarios|qual dia|quais dias|que dia|que materia|qual materia|quais materias|que disciplina|qual disciplina|quais disciplinas|em qual sala|qual sala|em que sala|qual semestre|quais semestres|de que|de qual|de quais)\b/u
]);
const PROFESSOR_ATTENDANCE_PATTERNS = Object.freeze([
  /\b(?:vai|ira|vem|vira|comparece|comparecera|aparece|aparecera)\b.*\b(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u,
  /\b(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:tem|tera|vai ter) aulas? (?:de|com)\b/u,
  /\b(?:aula|aulas)\b.*\b(?:confirmad[ao]s?|cancelad[ao]s?)\b/u,
  /\b(?:da|dara|ministra|ministrara|leciona|lecionara)\s+aulas?\b.*\b(?:hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u,
  /\b(?:tem|tera|vai ter)\s+aulas?\b.*\b(?:hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u,
  /\b(?:vai|ira)\s+(?:dar|ministrar|lecionar)\s+aulas?\b/u,
  /\b(?:da|dara|ministra|ministrara|leciona|lecionara)\s+aulas?\b/u,
  /\b(?:tem|tera|vai ter|havera|vai haver)\s+aulas?\s+(?:de|do|da|com)\b/u,
  /\b(?:vem|vira|vai vir|comparece|vai comparecer|aparece|vai aparecer)\b.*\b(?:dar|ministrar|lecionar)\s+aulas?\b/u
]);

function isProfessorAttendanceConfirmation({ normalized = '', professorMatches = [] } = {}) {
  if (!normalized || !professorMatches.length) return false;
  if (PROFESSOR_INFORMATION_PATTERNS.some(pattern => pattern.test(normalized))) return false;
  return PROFESSOR_ATTENDANCE_PATTERNS.some(pattern => pattern.test(normalized));
}

function tokenize(normalized) { return normalized ? normalized.split(/\s+/u).filter(Boolean) : []; }

function classifyAcademicIntent({ raw, normalized, targetDate, semester, professorMatches, disciplineMatches }) {
  if (isScheduleStatusConfirmation(raw)) return 'schedule-status-confirmation';
  if (NARRATIVE_CLASS_PATTERNS.some(pattern => pattern.test(normalized))) return 'schedule-narrative';
  if (isProfessorAttendanceConfirmation({ normalized, professorMatches })) return 'professor-attendance-confirmation';
  if (targetDate?.matched && hasScheduleIntent(raw)) return 'schedule-query';
  if (disciplineMatches.length && hasDisciplineInformationIntent(raw)) return 'discipline-query';
  if (professorMatches.length && /\b(?:contato|ctt|email|e-mail|dia|dias|horario|horarios|materia|materias|disciplina|disciplinas|sala|salas|laboratorio|lab|aula|aulas)\b/u.test(normalized)) return 'professor-query';
  if (semester && targetDate?.matched) return 'schedule-query';
  return 'other';
}

function prepareMessage(rawText, {
  now = Date.now(), timeZone = DEFAULT_TIME_ZONE, teachers = [], scheduleEntries = [],
  isGroup = false, hasReply = false, mentionedMe = false
} = {}) {
  const raw = String(rawText || '').trim();
  const normalized = normalizeText(raw);
  const tokens = tokenize(normalized);
  const targetDate = parseTargetDate(raw, now, timeZone);
  const semester = parseSemester(raw);
  const professorMatches = findTeacherMatches(normalized, teachers);
  const disciplineMatches = findDisciplineMatches(normalized, scheduleEntries);
  const intent = classifyAcademicIntent({ raw, normalized, targetDate, semester, professorMatches, disciplineMatches });
  return Object.freeze({
    raw, normalized, tokens: Object.freeze(tokens), tokenSet: new Set(tokens),
    targetDate, semester, intent,
    professorMatches: Object.freeze(professorMatches),
    disciplineMatches: Object.freeze(disciplineMatches),
    isGroup: Boolean(isGroup), hasReply: Boolean(hasReply), mentionedMe: Boolean(mentionedMe),
    now: Number(now || Date.now()), timeZone
  });
}

module.exports = {
  prepareMessage, classifyAcademicIntent, isProfessorAttendanceConfirmation,
  NARRATIVE_CLASS_PATTERNS, PROFESSOR_INFORMATION_PATTERNS, PROFESSOR_ATTENDANCE_PATTERNS
};
