'use strict';

const { normalizeText } = require('./text');

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const {
  SI_PROFESSORS_2026_2,
  SI_PENDING_2026_2,
  formatDisciplineLabel
} = require('./si-professors-2026-2');

const SEMESTER_SCHEDULE_CARD_TITLE = 'BSI — Aulas por semestre e dia';
const DEFAULT_TIME_ZONE = 'America/Bahia';
const DATE_FORMATTERS = new Map();
function dateFormatter(timeZone = DEFAULT_TIME_ZONE) {
  const key = String(timeZone || DEFAULT_TIME_ZONE);
  if (!DATE_FORMATTERS.has(key)) DATE_FORMATTERS.set(key, new Intl.DateTimeFormat('en-CA', { timeZone: key, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return DATE_FORMATTERS.get(key);
}
const DAY_NAMES = Object.freeze([
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'
]);
const DAY_DISPLAY_NAMES = Object.freeze([
  'Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira',
  'Quinta-Feira', 'Sexta-Feira', 'Sábado'
]);

const DAY_ALIASES = Object.freeze([
  ['domingo'],
  ['segunda-feira', 'segunda feira', 'segunda'],
  ['terça-feira', 'terca-feira', 'terça feira', 'terca feira', 'terça', 'terca'],
  ['quarta-feira', 'quarta feira', 'quarta'],
  ['quinta-feira', 'quinta feira', 'quinta'],
  ['sexta-feira', 'sexta feira', 'sexta'],
  ['sábado', 'sabado']
]);

const DAY_ALIAS_PATTERNS = Object.freeze(DAY_ALIASES.map(aliases => Object.freeze(
  aliases.map(alias => new RegExp(`(?:^|\\s)${escapeRegExp(normalizeText(alias))}(?:$|\\s)`, 'u'))
)));
const SCHEDULE_SUBJECT_PATTERN = '(?:aula|aulas|horario|horarios|grade|disciplina|disciplinas|materia|materias|cadeira|cadeiras|componente|componentes)';
const SCHEDULE_DATE_PATTERN = '(?:hoje|amanha|depois de amanha|ontem|domingo|segunda(?:-feira| feira)?|terca(?:-feira| feira)?|quarta(?:-feira| feira)?|quinta(?:-feira| feira)?|sexta(?:-feira| feira)?|sabado)';
const SCHEDULE_INTENT_PATTERNS = Object.freeze([
  new RegExp(`\\bsera que\\b.*\\b${SCHEDULE_SUBJECT_PATTERN}\\b`, 'u'),
  new RegExp(`\\b(?:qual|quais)(?:\\s+e)?(?:\\s+(?:o|a|os|as))?\\s+${SCHEDULE_SUBJECT_PATTERN}\\b`, 'u'),
  /\b(?:o que|que) (?:tem|tera|vai ter)\b/u,
  new RegExp(`\\b(?:me diga|me fala|informe|quero saber|queria saber|gostaria de saber)\\b.*\\b${SCHEDULE_SUBJECT_PATTERN}\\b`, 'u'),
  new RegExp(`(?:^|\\s)${SCHEDULE_SUBJECT_PATTERN}\\s+(?:de|do|da|para|na|no)?\\s*${SCHEDULE_DATE_PATTERN}(?:$|\\s)`, 'u'),
  new RegExp(`(?:^|\\s)${SCHEDULE_DATE_PATTERN}\\s+(?:tem|tera|vai ter)?\\s*${SCHEDULE_SUBJECT_PATTERN}(?:$|\\s)`, 'u')
]);
const SEMESTER_WORDS = Object.freeze({
  1: ['1', '1o', '1a', 'i', 'primeiro', 'primeira'],
  2: ['2', '2o', '2a', 'ii', 'segundo', 'segunda'],
  3: ['3', '3o', '3a', 'iii', 'terceiro', 'terceira'],
  4: ['4', '4o', '4a', 'iv', 'quarto', 'quarta'],
  5: ['5', '5o', '5a', 'v', 'quinto', 'quinta'],
  6: ['6', '6o', '6a', 'vi', 'sexto', 'sexta'],
  7: ['7', '7o', '7a', 'vii', 'setimo', 'setima'],
  8: ['8', '8o', '8a', 'viii', 'oitavo', 'oitava']
});
const SEMESTER_PATTERNS = Object.freeze(Object.entries(SEMESTER_WORDS).flatMap(([number, aliases]) => aliases.flatMap(alias => {
  const token = escapeRegExp(alias);
  const noun = '(?:semestre|sem|periodo)';
  return [
    { number: Number(number), pattern: new RegExp(`(?:^|\\s)${token}(?:\\s+)${noun}(?:$|\\s)`, 'u') },
    { number: Number(number), pattern: new RegExp(`(?:^|\\s)${noun}(?:\\s+)${token}(?:$|\\s)`, 'u') }
  ];
})));

function semesterNumberForAlias(value) {
  const normalized = normalizeText(value);
  for (const [number, aliases] of Object.entries(SEMESTER_WORDS)) {
    if (aliases.includes(normalized)) return Number(number);
  }
  return 0;
}

function zonedCalendarDate(value = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(Number(value));
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const parts = dateFormatter(timeZone).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day), 12));
}

function addCalendarDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + Number(amount || 0));
  return result;
}

function dateIso(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function dateDisplay(dateOrIso) {
  const value = typeof dateOrIso === 'string' ? new Date(`${dateOrIso}T12:00:00Z`) : dateOrIso;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return '';
  return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

function parseSemester(text) {
  const source = String(text || '');
  const ordinal = source.match(/(?:^|\s)([1-8])\s*(?:º|°|ª)(?=\s|$)/u);
  if (ordinal) return Number(ordinal[1]);

  const normalized = normalizeText(source);
  if (!normalized) return 0;
  const padded = ` ${normalized} `;
  for (const entry of SEMESTER_PATTERNS) if (entry.pattern.test(padded)) return entry.number;

  const contextual = normalized.match(/\b(?:para|pro|pra|do|da|turma)\s+(?:o|a)?\s*(1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|viii|vii|vi|iv|v|iii|ii|i|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])\b/u)?.[1] || '';
  return contextual ? semesterNumberForAlias(contextual) : 0;
}

function isScheduleStatusConfirmation(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const target = parseTargetDate(text);
  if (!target.matched) return false;

  const mentionsClass = /\b(?:aula|aulas)\b/u.test(normalized);
  const saysNormal = /\b(?:normal|normais|normalmente)\b/u.test(normalized);
  if (!mentionsClass || !saysNormal) return false;

  // Perguntas abertas sobre qual aula, matéria, disciplina, horário ou sala
  // continuam sendo consultas válidas. A exceção é para confirmações do tipo
  // “vai ter aula hoje normal?”, cuja resposta depende de informação em tempo
  // real que o bot não possui.
  const asksScheduleDetails = /\b(?:qual|quais|o que|que aula|que aulas|que materia|que materias|que disciplina|que disciplinas|que horario|que horarios|qual horario|quais horarios|onde|em qual sala|quem)\b/u.test(normalized);
  return !asksScheduleDetails;
}

function hasScheduleIntent(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (isScheduleStatusConfirmation(text)) return false;

  if (/\b(?:aula|aulas) normal(?:mente)?\b/u.test(normalized)
    || /\b(?:nao|nunca) (?:vai ter|tera|tem|teremos) aula\b/u.test(normalized)
    || /\b(?:so|apenas|menos) (?:na |no )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:nao|sem) (?:teremos )?aula\b/u.test(normalized)
    || /\ba semana toda\b/u.test(normalized)
    || /\b(?:a aula|as aulas|a materia|a disciplina)\b.*\b(?:foi|foram|estava|estavam|acabou|acabaram|comecou|comecaram)\b/u.test(normalized)) return false;

  return SCHEDULE_INTENT_PATTERNS.some(pattern => pattern.test(normalized));
}

function parseTargetDate(text, now = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  const normalized = normalizeText(text);
  const base = zonedCalendarDate(now, timeZone);
  if (/\bdepois de amanha\b/u.test(normalized)) {
    const date = addCalendarDays(base, 2);
    return { matched: true, date, iso: dateIso(date), dayIndex: date.getUTCDay(), expression: 'depois de amanhã' };
  }
  if (/\bamanha\b/u.test(normalized)) {
    const date = addCalendarDays(base, 1);
    return { matched: true, date, iso: dateIso(date), dayIndex: date.getUTCDay(), expression: 'amanhã' };
  }
  if (/\bhoje\b/u.test(normalized)) return { matched: true, date: base, iso: dateIso(base), dayIndex: base.getUTCDay(), expression: 'hoje' };
  if (/\bontem\b/u.test(normalized)) {
    const date = addCalendarDays(base, -1);
    return { matched: true, date, iso: dateIso(date), dayIndex: date.getUTCDay(), expression: 'ontem' };
  }

  for (let dayIndex = 0; dayIndex < DAY_ALIASES.length; dayIndex += 1) {
    const found = DAY_ALIASES[dayIndex].some(alias => new RegExp(`(?:^|\\s)${escapeRegExp(normalizeText(alias))}(?:$|\\s)`, 'u').test(` ${normalized} `));
    if (!found) continue;
    let difference = (dayIndex - base.getUTCDay() + 7) % 7;
    if (/\b(?:proxim[oa]|que vem)\b/u.test(normalized) && difference === 0) difference = 7;
    const date = addCalendarDays(base, difference);
    return { matched: true, date, iso: dateIso(date), dayIndex, expression: DAY_NAMES[dayIndex] };
  }
  return { matched: false };
}

function dayMatches(classDays, dayIndex) {
  const normalized = normalizeText(classDays);
  return DAY_ALIASES[dayIndex].some(alias => {
    const token = normalizeText(alias);
    return new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:$|\\s)`, 'u').test(` ${normalized} `);
  });
}

function firstMinutes(hours) {
  const match = String(hours || '').match(/(\d{1,2})h(\d{2})/u);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function classesFromBundled(semester, dayIndex) {
  const records = [];
  for (const professor of [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2]) {
    for (const entry of professor.classes || []) {
      const [discipline, semesterLabel, classDays, hours, room] = entry;
      if (!String(semesterLabel || '').startsWith(`${semester}º`)) continue;
      if (!dayMatches(classDays, dayIndex)) continue;
      records.push({
        discipline: formatDisciplineLabel(discipline), disciplineCode: '', disciplineName: discipline,
        room: String(room || 'não informada').trim(), professor: professor.name,
        hours: String(hours || ''), order: firstMinutes(hours), end: null
      });
    }
  }
  return records;
}

function classesFromStructured(semester, dayIndex, scheduleEntries = []) {
  return scheduleEntries.filter(entry => Number(entry.semester_number) === Number(semester) && Number(entry.day_of_week) === Number(dayIndex) && entry.active !== false)
    .map(entry => ({
      discipline: entry.discipline_label || formatDisciplineLabel(entry.discipline_name),
      disciplineCode: String(entry.discipline_code || ''), disciplineName: String(entry.discipline_name || ''),
      room: String(entry.room || 'não informada').trim(), professor: String(entry.professor_name || '').trim(),
      hours: String(entry.hours_label || ''), order: Number.isInteger(Number(entry.start_minutes)) ? Number(entry.start_minutes) : firstMinutes(entry.hours_label),
      end: entry.end_minutes === null || entry.end_minutes === undefined ? null : Number(entry.end_minutes)
    }));
}

function deduplicateClasses(records) {
  const seen = new Set();
  return records.sort((a, b) => a.order - b.order || a.discipline.localeCompare(b.discipline) || a.professor.localeCompare(b.professor))
    .filter(item => {
      const key = `${item.discipline}|${item.room}|${item.professor}|${item.order}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
}

function classesForSemesterAndDay(semester, dayIndex, scheduleEntries = null) {
  const records = Array.isArray(scheduleEntries) && scheduleEntries.length
    ? classesFromStructured(semester, dayIndex, scheduleEntries)
    : classesFromBundled(semester, dayIndex);
  return deduplicateClasses(records);
}

function eventApplies(event, semester, iso) {
  if (event.active === false || String(event.start_date || '') > iso || String(event.end_date || event.start_date || '') < iso) return false;
  const semesters = Array.isArray(event.semester_numbers) ? event.semester_numbers.map(Number) : [];
  if (semesters.length && !semesters.includes(Number(semester))) return false;
  if (String(event.recurrence_type || 'none') !== 'weekly') return true;
  const weekdays = Array.isArray(event.recurrence_weekdays) ? event.recurrence_weekdays.map(Number) : [];
  const target = new Date(`${iso}T12:00:00Z`); const start = new Date(`${event.start_date}T12:00:00Z`);
  if (!Number.isFinite(target.getTime()) || !Number.isFinite(start.getTime()) || !weekdays.includes(target.getUTCDay())) return false;
  const weeks = Math.floor((target.getTime() - start.getTime()) / (7 * 86400000));
  return weeks >= 0 && weeks % Math.max(1, Number(event.recurrence_interval || 1)) === 0;
}

function effectiveScheduleDay(dayIndex, events = []) {
  const replacement = events.find(event => ['replacement_day','class_replacement'].includes(event.event_type) && Number.isInteger(Number(event.replacement_day_of_week)));
  return replacement ? Number(replacement.replacement_day_of_week) : dayIndex;
}

function eventMatchesClass(event, item) {
  const code = normalizeText(event.discipline_code || '');
  const professor = normalizeText(event.professor_name || '');
  const oldRoom = normalizeText(event.old_room || '');
  if (code && code !== normalizeText(item.disciplineCode) && !normalizeText(item.discipline).startsWith(`${code} `)) return false;
  if (professor && !normalizeText(item.professor).includes(professor)) return false;
  if (oldRoom && normalizeText(item.room) !== oldRoom) return false;
  return true;
}

function applyCalendarExceptions(classes, events = []) {
  let output = classes.map(item => ({ ...item }));
  const notices = [];
  const blockers = events.filter(event => ['no_classes','recess'].includes(event.event_type));
  if (blockers.length) {
    for (const event of blockers) notices.push(`⚠️ *${event.title}*${event.description ? `\n${event.description}` : ''}`);
    return { classes: [], notices, blocked: true };
  }

  for (const event of events) {
    if (event.event_type === 'partial_no_classes') {
      const start = event.start_minutes === null || event.start_minutes === undefined ? Number.NEGATIVE_INFINITY : Number(event.start_minutes);
      const end = event.end_minutes === null || event.end_minutes === undefined ? Number.POSITIVE_INFINITY : Number(event.end_minutes);
      output = output.filter(item => {
        const classStart = Number.isFinite(Number(item.order)) ? Number(item.order) : 0;
        const classEnd = Number.isFinite(Number(item.end)) ? Number(item.end) : classStart;
        const overlapsSuspension = classEnd > start && classStart < end;
        return !overlapsSuspension;
      });
      notices.push(`⚠️ *${event.title}*${event.description ? `\n${event.description}` : ''}`);
    } else if (event.event_type === 'room_change') {
      let changed = 0;
      output = output.map(item => {
        if (!eventMatchesClass(event, item) || !event.new_room) return item;
        changed += 1; return { ...item, room: event.new_room };
      });
      if (changed) notices.push(`⚠️ *Mudança excepcional de sala:* ${event.title}${event.description ? `\n${event.description}` : ''}`);
    } else if (event.event_type === 'warning') {
      notices.push(`⚠️ *${event.title}*${event.description ? `\n${event.description}` : ''}`);
    } else if (['replacement_day','class_replacement'].includes(event.event_type)) {
      notices.push(`⚠️ *${event.title}*${event.description ? `\n${event.description}` : ''}`);
    }
  }
  return { classes: deduplicateClasses(output), notices, blocked: false };
}

function semesterScheduleTitle(semester, dayIndex, date = null) {
  const datePart = date ? `, ${dateDisplay(date)}` : '';
  return `*Aulas de ${DAY_DISPLAY_NAMES[dayIndex]}${datePart} — ${semester}º Semestre*`;
}

function formatSemesterScheduleResponse(semester, targetOrDayIndex, { scheduleEntries = null, calendarEvents = [], academicPeriod = '2026.2' } = {}) {
  const target = typeof targetOrDayIndex === 'number'
    ? { dayIndex: targetOrDayIndex, date: null, iso: '' }
    : targetOrDayIndex;
  const events = (calendarEvents || []).filter(event => eventApplies(event, semester, target.iso || dateIso(target.date)));
  const scheduleDay = effectiveScheduleDay(target.dayIndex, events);
  const title = semesterScheduleTitle(semester, target.dayIndex, target.date);
  const regular = classesForSemesterAndDay(semester, scheduleDay, scheduleEntries);
  const applied = applyCalendarExceptions(regular, events);
  const noticeText = applied.notices.length ? `${applied.notices.join('\n\n')}\n\n` : '';
  if (!applied.classes.length) {
    const message = applied.blocked
      ? 'O quadro semanal regular foi suspenso para esta data.'
      : `Nenhuma aula cadastrada para esse dia no quadro ${academicPeriod}.`;
    return `${title}\n\n${noticeText}${message}`.trim();
  }
  const body = applied.classes.map(item => [
    `*${item.discipline}*`,
    `Sala: ${item.room}`,
    `Professor: ${item.professor}`
  ].join('\n')).join('\n\n');
  return `${title}\n\n${noticeText}${body}`.trim();
}

function scheduleDetailIntent(text) {
  const normalized = normalizeText(text).replace(/^(?:e|mas|entao)\s+/, '').trim();
  if (/^(?:qual|quais)?\s*(?:a )?(?:sala|salas|laboratorio|laboratorios|lab)(?:\s+(?:e|sao|serao))?$/u.test(normalized)) return 'rooms';
  if (/^(?:quem|qual|quais)?\s*(?:e|sao|serao)?\s*(?:o|a|os|as)?\s*professor(?:a|es|as)?$/u.test(normalized)) return 'professors';
  return '';
}

function formatSemesterScheduleDetail(semester, target, detail, { scheduleEntries = null, calendarEvents = [], academicPeriod = '2026.2' } = {}) {
  const events = (calendarEvents || []).filter(event => eventApplies(event, semester, target.iso || dateIso(target.date)));
  const scheduleDay = effectiveScheduleDay(target.dayIndex, events);
  const regular = classesForSemesterAndDay(semester, scheduleDay, scheduleEntries);
  const applied = applyCalendarExceptions(regular, events);
  const title = semesterScheduleTitle(semester, target.dayIndex, target.date);
  if (!applied.classes.length) return `${title}\n\nNenhuma aula disponível para essa continuação no quadro ${academicPeriod}.`;
  if (detail === 'rooms') return `${title}\n\n${applied.classes.map(item => `*${item.discipline}*\nSala: ${item.room}`).join('\n\n')}`;
  if (detail === 'professors') return `${title}\n\n${applied.classes.map(item => `*${item.discipline}*\nProfessor: ${item.professor}`).join('\n\n')}`;
  return formatSemesterScheduleResponse(semester, target, { scheduleEntries, calendarEvents, academicPeriod });
}

function formatSemesterSchedulePrompt(dayIndex, date = null) {
  const datePart = date ? `, ${dateDisplay(date)}` : '';
  return [
    `Qual semestre você quer consultar para ${DAY_DISPLAY_NAMES[dayIndex]}${datePart}?`,
    '',
    'Exemplo: responda apenas com um número, como `3`, `5` ou `8`.'
  ].join('\n');
}

function classifySemesterScheduleRequest(text, {
  now = Date.now(), timeZone = DEFAULT_TIME_ZONE, scheduleEntries = null, calendarEvents = [], academicPeriod = '2026.2'
} = {}) {
  const target = parseTargetDate(text, now, timeZone);
  if (!target.matched) return null;
  const semester = parseSemester(text);
  const scheduleIntent = hasScheduleIntent(text);
  if (!scheduleIntent && !semester) return null;
  if (!semester) return { kind: 'ask-semester', ...target };
  const events = (calendarEvents || []).filter(event => eventApplies(event, semester, target.iso));
  const scheduleDay = effectiveScheduleDay(target.dayIndex, events);
  return {
    kind: 'schedule', semester, ...target,
    classes: classesForSemesterAndDay(semester, scheduleDay, scheduleEntries),
    events,
    text: formatSemesterScheduleResponse(semester, target, { scheduleEntries, calendarEvents, academicPeriod })
  };
}

function semesterFromFollowUp(text) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  const compact = normalized.replace(/^(?:o|a)\s+/u, '').replace(/\s+(?:por favor)$/u, '').trim();
  const direct = compact.match(/^(1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|viii|vii|vi|iv|v|iii|ii|i|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])(?:\s+(?:semestre|sem|periodo))?$/u)?.[1] || '';
  if (direct) return semesterNumberForAlias(direct);
  const semester = parseSemester(text);
  if (!semester) return 0;
  const residue = normalized
    .replace(/\b(?:1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|viii|vii|vi|iv|v|iii|ii|i|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])\b/gu, '')
    .replace(/\b(?:semestre|sem|periodo|o|a|do|da)\b/gu, '').trim();
  return residue ? 0 : semester;
}

module.exports = {
  SEMESTER_SCHEDULE_CARD_TITLE,
  DEFAULT_TIME_ZONE,
  DAY_NAMES,
  DAY_DISPLAY_NAMES,
  parseSemester,
  parseTargetDate,
  hasScheduleIntent,
  isScheduleStatusConfirmation,
  classesForSemesterAndDay,
  semesterScheduleTitle,
  formatSemesterScheduleResponse,
  formatSemesterSchedulePrompt,
  formatSemesterScheduleDetail,
  scheduleDetailIntent,
  classifySemesterScheduleRequest,
  semesterFromFollowUp,
  zonedCalendarDate,
  dateIso,
  dateDisplay,
  applyCalendarExceptions,
  effectiveScheduleDay,
  eventApplies
};
