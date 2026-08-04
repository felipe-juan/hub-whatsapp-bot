'use strict';

const { normalizeText } = require('./text');

const FIELD_ORDER = Object.freeze(['professor', 'contact', 'discipline', 'semester', 'day', 'hours', 'room']);

function requestedProfessorFields(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (/\b(?:tudo|todas?\s+as\s+informacoes|informacoes?\s+completas?|card\s+completo|dados\s+completos?|sobre)\b/u.test(normalized)) return [];
  const fields = new Set();
  if (/\b(?:quem\s+(?:da|dara|ministra|leciona|ensina)|qual\s+(?:e\s+)?(?:o|a)?\s*professor(?:a)?|professor(?:a)?\s+de|docente\s+de)\b/u.test(normalized)) fields.add('professor');
  if (/\b(?:contato|ctt|e-?mail|email|telefone|whatsapp|falar\s+com)\b/u.test(normalized)) fields.add('contact');
  if (/\b(?:qual|quais|que)\s+(?:materia|materias|disciplina|disciplinas)\b|\b(?:materia|materias|disciplina|disciplinas)\s+(?:do|da|de)\b/u.test(normalized)) fields.add('discipline');
  if (/\b(?:semestre|periodo)\b/u.test(normalized)) fields.add('semester');
  if (/\b(?:em\s+)?(?:qual|quais|que)\s+dias?\b|\bdias?\s+de\s+aula\b/u.test(normalized)) fields.add('day');
  if (/\b(?:horario|horarios|que\s+horas|quando)\b/u.test(normalized)) { fields.add('day'); fields.add('hours'); }
  if (/\b(?:sala|salas|laboratorio|laboratorios|lab|onde)\b/u.test(normalized)) fields.add('room');
  return FIELD_ORDER.filter(field => fields.has(field));
}

function uniqueBy(items, keyFor) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFor(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function disciplineTitle(entry) {
  const code = String(entry.discipline_code || '').trim();
  const name = String(entry.discipline_name || '').trim();
  return code ? `${code} — ${name}` : name;
}

function formatProfessorFieldResponse({ entries = [], teachers = [], fields = [] } = {}) {
  const requested = new Set(fields);
  if (!requested.size) return '';
  const cleanEntries = uniqueBy(entries.filter(Boolean), entry => [
    normalizeText(entry.professor_name), normalizeText(entry.discipline_code || entry.discipline_name),
    Number(entry.day_of_week), Number(entry.start_minutes), normalizeText(entry.room)
  ].join('|'));
  const cleanTeachers = uniqueBy(teachers.filter(Boolean), teacher => normalizeText(teacher.name));
  if (!cleanEntries.length && !cleanTeachers.length) return '';

  const onlyIdentity = [...requested].every(field => ['professor', 'contact'].includes(field));
  if (onlyIdentity) {
    const people = cleanTeachers.length ? cleanTeachers : uniqueBy(cleanEntries.map(entry => ({ name: entry.professor_name, email: entry.professor_email })), person => normalizeText(person.name));
    const lines = [];
    for (const person of people) {
      if (people.length > 1) lines.push(`👤 *${person.name}*`);
      if (requested.has('professor') && people.length === 1) lines.push(`👤 *Professor:* ${person.name}`);
      if (requested.has('contact')) lines.push(`📧 *Contato:* ${person.email || 'não cadastrado'}`);
      if (people.length > 1) lines.push('');
    }
    return lines.join('\n').trim();
  }

  const grouped = new Map();
  for (const entry of cleanEntries) {
    const key = [normalizeText(entry.discipline_code || entry.discipline_name), normalizeText(entry.professor_name)].join('|');
    if (!grouped.has(key)) grouped.set(key, { professor: entry.professor_name, email: entry.professor_email, title: disciplineTitle(entry), entries: [] });
    grouped.get(key).entries.push(entry);
  }
  const groups = [...grouped.values()];
  const blocks = [];
  for (const group of groups) {
    const lines = [`📚 *${group.title}*`];
    if (requested.has('professor')) lines.push(`👤 *Professor:* ${group.professor}`);
    if (requested.has('contact')) lines.push(`📧 *Contato:* ${group.email || 'não cadastrado'}`);
    if (requested.has('discipline') && !requested.has('professor') && groups.length === 1) lines.push(`📖 *Disciplina:* ${group.title}`);

    const semesters = uniqueBy(group.entries, entry => Number(entry.semester_number)).map(entry => entry.semester_label || `${entry.semester_number}º semestre`);
    if (requested.has('semester')) lines.push(`🎓 *Semestre${semesters.length > 1 ? 's' : ''}:* ${semesters.join(', ')}`);

    const scheduleRows = uniqueBy(group.entries, entry => [
      requested.has('day') ? Number(entry.day_of_week) : '',
      requested.has('hours') ? entry.hours_label : '',
      requested.has('room') ? normalizeText(entry.room) : ''
    ].join('|'));
    if (requested.has('day') || requested.has('hours') || requested.has('room')) {
      for (const entry of scheduleRows) {
        const parts = [];
        if (requested.has('day')) parts.push(entry.day_label || 'dia não informado');
        if (requested.has('hours')) parts.push(entry.hours_label || 'horário não informado');
        if (requested.has('room')) parts.push(`sala ${entry.room || 'não informada'}`);
        lines.push(`• ${parts.join(' — ')}`);
      }
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

module.exports = { requestedProfessorFields, formatProfessorFieldResponse };
