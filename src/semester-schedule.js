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

const SEMESTER_WORDS = Object.freeze({
  1: ['1', '1o', '1a', 'primeiro', 'primeira'],
  2: ['2', '2o', '2a', 'segundo', 'segunda'],
  3: ['3', '3o', '3a', 'terceiro', 'terceira'],
  4: ['4', '4o', '4a', 'quarto', 'quarta'],
  5: ['5', '5o', '5a', 'quinto', 'quinta'],
  6: ['6', '6o', '6a', 'sexto', 'sexta'],
  7: ['7', '7o', '7a', 'setimo', 'setima'],
  8: ['8', '8o', '8a', 'oitavo', 'oitava']
});

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(safeDate);
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

function parseSemester(text) {
  const source = String(text || '');
  const ordinal = source.match(/(?:^|\s)([1-8])\s*(?:º|°|ª)(?=\s|$)/u);
  if (ordinal) return Number(ordinal[1]);

  const normalized = normalizeText(source);
  if (!normalized) return 0;
  const padded = ` ${normalized} `;
  const noun = '(?:semestre|sem|periodo)';
  for (const [number, aliases] of Object.entries(SEMESTER_WORDS)) {
    for (const alias of aliases) {
      const token = escapeRegExp(alias);
      const before = new RegExp(`(?:^|\\s)${token}(?:\\s+)${noun}(?:$|\\s)`, 'u');
      const after = new RegExp(`(?:^|\\s)${noun}(?:\\s+)${token}(?:$|\\s)`, 'u');
      if (before.test(padded) || after.test(padded)) return Number(number);
    }
  }

  // Formas naturais como “para o terceiro”, “turma do 3º” e “pro quinto”.
  const contextual = normalized.match(/\b(?:para|pro|pra|do|da|turma)\s+(?:o|a)?\s*(1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])\b/u)?.[1] || '';
  return contextual ? semesterNumberForAlias(contextual) : 0;
}

function hasScheduleIntent(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  // Menções narrativas sobre haver ou não aula não são consultas ao quadro.
  // Exemplos: “aula normal hoje né?”, “só quinta não teremos aula”.
  if (/\b(?:aula|aulas) normal(?:mente)?\b/u.test(normalized)
    || /\b(?:nao|nunca) (?:vai ter|tera|tem|teremos) aula\b/u.test(normalized)
    || /\b(?:so|apenas|menos) (?:na |no )?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*\b(?:nao|sem) (?:teremos )?aula\b/u.test(normalized)
    || /\ba semana toda\b/u.test(normalized)) return false;

  const subject = '(?:aula|aulas|horario|horarios|grade|disciplina|disciplinas|materia|materias|cadeira|cadeiras|componente|componentes)';
  const date = '(?:hoje|amanha|depois de amanha|ontem|domingo|segunda(?:-feira| feira)?|terca(?:-feira| feira)?|quarta(?:-feira| feira)?|quinta(?:-feira| feira)?|sexta(?:-feira| feira)?|sabado)';

  // Perguntas explícitas: “qual matéria tem hoje?”, “o que tem sexta?”.
  if (new RegExp(`\\b(?:qual|quais)(?:\\s+e)?(?:\\s+(?:o|a|os|as))?\\s+${subject}\\b`, 'u').test(normalized)) return true;
  if (/\b(?:o que|que) (?:tem|tera|vai ter)\b/u.test(normalized)) return true;
  if (new RegExp(`\\b(?:me diga|me fala|informe|quero saber|queria saber|gostaria de saber)\\b.*\\b${subject}\\b`, 'u').test(normalized)) return true;

  // Consultas nominais curtas: “aulas de amanhã”, “horário de sexta”.
  if (new RegExp(`(?:^|\\s)${subject}\\s+(?:de|do|da|para|na|no)?\\s*${date}(?:$|\\s)`, 'u').test(normalized)) return true;
  if (new RegExp(`(?:^|\\s)${date}\\s+(?:tem|tera|vai ter)?\\s*${subject}(?:$|\\s)`, 'u').test(normalized)) return true;

  return false;
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
  if (/\bhoje\b/u.test(normalized)) {
    return { matched: true, date: base, iso: dateIso(base), dayIndex: base.getUTCDay(), expression: 'hoje' };
  }
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

function classesForSemesterAndDay(semester, dayIndex) {
  const records = [];
  for (const professor of [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2]) {
    for (const entry of professor.classes || []) {
      const [discipline, semesterLabel, classDays, hours, room] = entry;
      if (!String(semesterLabel || '').startsWith(`${semester}º`)) continue;
      if (!dayMatches(classDays, dayIndex)) continue;
      records.push({
        discipline: formatDisciplineLabel(discipline),
        room: String(room || 'não informada').trim(),
        professor: professor.name,
        hours: String(hours || ''),
        order: firstMinutes(hours)
      });
    }
  }
  const seen = new Set();
  return records
    .sort((a, b) => a.order - b.order || a.discipline.localeCompare(b.discipline) || a.professor.localeCompare(b.professor))
    .filter(item => {
      const key = `${item.discipline}|${item.room}|${item.professor}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function semesterScheduleTitle(semester, dayIndex) {
  return `*Aula de ${DAY_DISPLAY_NAMES[dayIndex]} - ${semester}º Semestre*`;
}

function formatSemesterScheduleResponse(semester, dayIndex) {
  const title = semesterScheduleTitle(semester, dayIndex);
  const classes = classesForSemesterAndDay(semester, dayIndex);
  if (!classes.length) return `${title}\n\nNenhuma aula cadastrada para esse dia no quadro 2026.2.`;
  const body = classes.map(item => [
    `*${item.discipline}*`,
    `Sala: ${item.room}`,
    `Professor: ${item.professor}`
  ].join('\n')).join('\n\n');
  return `${title}\n\n${body}`;
}

function formatSemesterSchedulePrompt(dayIndex) {
  return [
    `Qual semestre você quer consultar para ${DAY_DISPLAY_NAMES[dayIndex]}?`,
    '',
    'Exemplo: responda `3º semestre`, `3 semestre` ou `terceiro semestre`.'
  ].join('\n');
}

function classifySemesterScheduleRequest(text, { now = Date.now(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  const target = parseTargetDate(text, now, timeZone);
  if (!target.matched) return null;
  const semester = parseSemester(text);
  const scheduleIntent = hasScheduleIntent(text);
  // Data + semestre já formam um pedido suficientemente específico, mesmo sem a palavra “aula”.
  if (!scheduleIntent && !semester) return null;
  if (!semester) return { kind: 'ask-semester', ...target };
  return {
    kind: 'schedule', semester, ...target,
    classes: classesForSemesterAndDay(semester, target.dayIndex),
    text: formatSemesterScheduleResponse(semester, target.dayIndex)
  };
}

function semesterFromFollowUp(text) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  const compact = normalized
    .replace(/^(?:o|a)\s+/u, '')
    .replace(/\s+(?:por favor)$/u, '')
    .trim();
  const direct = compact.match(/^(1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])(?:\s+(?:semestre|sem|periodo))?$/u)?.[1] || '';
  if (direct) return semesterNumberForAlias(direct);

  const semester = parseSemester(text);
  if (!semester) return 0;
  const residue = normalized
    .replace(/\b(?:1|2|3|4|5|6|7|8|1o|2o|3o|4o|5o|6o|7o|8o|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|setim[oa]|oitav[oa])\b/gu, '')
    .replace(/\b(?:semestre|sem|periodo|o|a|do|da)\b/gu, '')
    .trim();
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
  classesForSemesterAndDay,
  semesterScheduleTitle,
  formatSemesterScheduleResponse,
  formatSemesterSchedulePrompt,
  classifySemesterScheduleRequest,
  semesterFromFollowUp,
  zonedCalendarDate,
  dateIso
};
