'use strict';

const { normalizeText } = require('./text');
const { SI_DISCIPLINE_CODES_2026_2, formatDisciplineLabel } = require('./si-professors-2026-2');

const DAY_INDEX_BY_TOKEN = Object.freeze({
  domingo: 0,
  segunda: 1, 'segunda-feira': 1,
  terca: 2, 'terca-feira': 2,
  quarta: 3, 'quarta-feira': 3,
  quinta: 4, 'quinta-feira': 4,
  sexta: 5, 'sexta-feira': 5,
  sabado: 6
});
const DAY_LABELS = Object.freeze(['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']);

function semesterNumber(value) {
  const match = normalizeText(value).match(/\b([1-8])(?:o|a)?\b/u);
  return match ? Number(match[1]) : 0;
}

function disciplineCode(value) {
  const name = String(value || '').trim();
  return SI_DISCIPLINE_CODES_2026_2[name] || '';
}

function dayIndexes(value) {
  const normalized = normalizeText(value).replace(/\s*-\s*/g, '-');
  const found = [];
  for (const [token, index] of Object.entries(DAY_INDEX_BY_TOKEN)) {
    const pattern = new RegExp(`(?:^|\\s)${token.replace('-', '(?:-| )')}(?:$|\\s)`, 'u');
    if (pattern.test(` ${normalized} `) && !found.includes(index)) found.push(index);
  }
  return found.sort((a, b) => a - b);
}

function clockMinutes(hour, minute = '0') {
  const h = Number(hour); const m = Number(minute || 0);
  return Number.isInteger(h) && h >= 0 && h <= 23 && Number.isInteger(m) && m >= 0 && m <= 59 ? h * 60 + m : null;
}

function parseHours(value) {
  const source = String(value || '').trim();
  const points = [...source.matchAll(/\b(\d{1,2})\s*(?:h|:)(\d{2})?\b/giu)]
    .map(match => clockMinutes(match[1], match[2] || '00')).filter(Number.isInteger);
  return {
    label: source,
    start_minutes: points.length ? points[0] : null,
    end_minutes: points.length ? points.at(-1) : null
  };
}

function normalizeStructuredScheduleEntry(entry = {}, professor = {}, source = {}) {
  const discipline = String(entry.discipline || entry[0] || '').trim();
  const semester = String(entry.semester || entry[1] || '').trim();
  const day = String(entry.day || entry[2] || '').trim();
  const hours = String(entry.hours || entry[3] || '').trim();
  const room = String(entry.room || entry[4] || '').trim();
  const times = parseHours(hours);
  const professorName = String(professor.name || entry.professor_name || '').trim();
  const professorEmail = String(professor.email || entry.professor_email || '').trim().toLowerCase();
  return dayIndexes(day).map(dayIndex => ({
    teacher_id: Number(professor.id || entry.teacher_id || 0) || null,
    professor_name: professorName,
    professor_email: professorEmail,
    discipline_name: discipline,
    discipline_code: disciplineCode(discipline),
    discipline_label: formatDisciplineLabel(discipline),
    semester_number: semesterNumber(semester),
    semester_label: semester,
    day_of_week: dayIndex,
    day_label: DAY_LABELS[dayIndex],
    start_minutes: times.start_minutes,
    end_minutes: times.end_minutes,
    hours_label: times.label,
    room,
    academic_period: String(professor.academic_period || source.academic_period || '2026.2').trim(),
    source_title: String(source.source_title || source.file || '').trim(),
    source_version: String(source.source_version || source.version || '').trim(),
    source_date: String(source.source_date || source.published_at || '').trim(),
    active: entry.active === undefined ? true : Boolean(entry.active)
  })).filter(row => row.professor_name && row.discipline_name && row.semester_number && Number.isInteger(row.day_of_week));
}

function structuredScheduleRowsFromProfessors(professors = [], source = {}) {
  return (professors || []).flatMap(professor => (professor.classes || []).flatMap(entry =>
    normalizeStructuredScheduleEntry(entry, professor, source)));
}

module.exports = {
  DAY_LABELS,
  semesterNumber,
  disciplineCode,
  dayIndexes,
  parseHours,
  normalizeStructuredScheduleEntry,
  structuredScheduleRowsFromProfessors
};
