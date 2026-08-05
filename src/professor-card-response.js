'use strict';

const { normalizeText } = require('./text');

const FIELD_ORDER = Object.freeze(['professor', 'contact', 'discipline', 'semester', 'day', 'hours', 'room']);

function requestedProfessorFields(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (/\b(?:tudo|todas?\s+as\s+informacoes|informacoes?\s+completas?|card\s+completo|dados\s+completos?|sobre)\b/u.test(normalized)) return [];
  const fields = new Set();
  if (/\b(?:quem\s+(?:da|dara|ministra|leciona|ensina)|qual\s+(?:e\s+)?(?:o|a)?\s*professor(?:a)?|qual\s+(?:e\s+)?(?:o\s+)?nome\s+(?:do|da)\s+professor(?:a)?|nome\s+(?:do|da)\s+professor(?:a)?|professor(?:a)?\s+de|docente\s+de)\b/u.test(normalized)) fields.add('professor');
  if (/\b(?:contato|ctt|e-?mail|email|telefone|whatsapp|falar\s+com)\b/u.test(normalized)) fields.add('contact');
  if (/\b(?:qual|quais|que)\s+(?:materia|materias|disciplina|disciplinas)\b|\b(?:materia|materias|disciplina|disciplinas)\s+(?:do|da|de)\b/u.test(normalized)) fields.add('discipline');
  if (/\b(?:semestre|periodo)\b/u.test(normalized)) fields.add('semester');
  if (/\b(?:em\s+)?(?:qual|quais|que)\s+dias?\b|\bdias?\s+de\s+aula\b/u.test(normalized)) fields.add('day');
  if (/\b(?:horario|horarios|que\s+horas|quando)\b/u.test(normalized)) { fields.add('day'); fields.add('hours'); }
  if (/\b(?:sala|salas|laboratorio|laboratorios|lab|onde)\b/u.test(normalized)) fields.add('room');
  return FIELD_ORDER.filter(field => fields.has(field));
}


function isProfessorPrivatePhoneRequest(text, { professorMatches = [], disciplineMatches = [], hasProfessorContext = false } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const asksPrivateNumber = /\b(?:numero|número|telefone|celular|whatsapp|whats|zap)\b/u.test(normalized);
  if (!asksPrivateNumber) return false;
  const mentionsProfessorRole = /\b(?:professor|professora|professores|professoras|docente|docentes|prof|profa)\b/u.test(normalized);
  const hasExactProfessor = (professorMatches || []).some(match => match && match.fuzzy !== true && match.teacher);
  const refersToProfessor = hasProfessorContext || mentionsProfessorRole || hasExactProfessor;
  if (!refersToProfessor) return false;
  // Telefones de setores e canais institucionais continuam sendo tratados pelo
  // diretório institucional, desde que não haja um professor identificado.
  const onlyInstitutionalSector = !hasProfessorContext && !hasExactProfessor
    && /\b(?:caens|cores|capne|biblioteca|coordenacao|coordenação|campus|setor|instituto|ifba)\b/u.test(normalized);
  return !onlyInstitutionalSector;
}

function formatProfessorPhonePrivacyResponse(teachers = []) {
  const names = uniqueBy((teachers || []).filter(Boolean), teacher => normalizeText(teacher.name))
    .map(teacher => String(teacher.name || '').trim()).filter(Boolean);
  const subject = names.length === 1 ? ` de *${names[0]}*` : '';
  return [
    '*Telefone de professores*',
    '',
    `Por privacidade e segurança, o bot não fornece número pessoal, telefone ou WhatsApp${subject}.`,
    '',
    'Para entrar em contato, consulte o e-mail institucional no card do docente ou procure a Coordenação de BSI.'
  ].join('\n');
}

function professorIntentLabel(fields = []) {
  const values = new Set(fields);
  if (!values.size) return 'informações completas';
  const labels = [];
  if (values.has('room')) labels.push('sala');
  if (values.has('day') || values.has('hours')) labels.push('horário');
  if (values.has('contact')) labels.push('contato');
  if (values.has('professor')) labels.push('professor');
  if (values.has('semester')) labels.push('semestre');
  if (values.has('discipline')) labels.push('disciplinas');
  return [...new Set(labels)].join(' + ') || 'informações específicas';
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

function professorDisplayName(value, minimumWords = 2) {
  const words = String(value || '').trim().split(/\s+/u).filter(Boolean);
  if (words.length <= minimumWords) return words.join(' ');
  return words.slice(0, minimumWords).join(' ');
}

function usefulFields(fields = []) {
  const requested = new Set(fields);
  const display = new Set(fields);
  // Uma sala sem o dia e a disciplina costuma ser pouco útil. O título já
  // identifica a disciplina; o dia é incluído como contexto mínimo.
  if (requested.has('room')) {
    // Uma consulta somente de sala recebe contexto de dia e horário. Em uma
    // pergunta com múltiplas intenções, mostre apenas os campos pedidos e o
    // docente necessário para desambiguar ofertas.
    if (requested.size === 1) {
      display.add('day');
      display.add('hours');
    }
    display.add('professor');
  }

  // Dia e horário formam uma única informação acadêmica útil.
  if (requested.has('day')) display.add('hours');
  if (requested.has('hours')) display.add('day');
  if (requested.has('contact')) display.add('professor');
  return FIELD_ORDER.filter(field => display.has(field));
}

function missingScheduleResponse(teachers, requested) {
  const names = uniqueBy(teachers.filter(Boolean), teacher => normalizeText(teacher.name)).map(item => item.name).filter(Boolean);
  const subject = names.length === 1 ? ` de ${names[0]}` : '';
  if (requested.has('room')) return `A sala dessa disciplina ainda não está cadastrada${subject}.`;
  if (requested.has('hours') || requested.has('day')) return `O horário dessa disciplina ainda não está cadastrado${subject}.`;
  if (requested.has('semester')) return 'O semestre dessa disciplina ainda não está cadastrado.';
  return '';
}

function formatProfessorFieldResponse({ entries = [], teachers = [], fields = [] } = {}) {
  const requested = new Set(fields);
  if (!requested.size) return '';
  const displayFields = new Set(usefulFields(fields));
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
      if (people.length > 1 || requested.has('contact')) lines.push(`*${person.name}*`);
      if (requested.has('professor') && people.length === 1 && !requested.has('contact')) lines.push(`• *Professor:* ${person.name}`);
      if (requested.has('contact')) lines.push(`• *Contato:* ${person.email || 'não cadastrado'}`);
      if (people.length > 1) lines.push('');
    }
    return lines.join('\n').trim();
  }

  if (!cleanEntries.length) return missingScheduleResponse(cleanTeachers, requested);

  const grouped = new Map();
  for (const entry of cleanEntries) {
    const key = [normalizeText(entry.discipline_code || entry.discipline_name), normalizeText(entry.professor_name)].join('|');
    if (!grouped.has(key)) grouped.set(key, { professor: entry.professor_name, email: entry.professor_email, title: disciplineTitle(entry), entries: [] });
    grouped.get(key).entries.push(entry);
  }
  const groups = [...grouped.values()];
  const blocks = [];
  for (const group of groups) {
    const lines = [`*${group.title}*`];
    if (displayFields.has('professor')) {
      const professorName = requested.has('room') ? professorDisplayName(group.professor, 2) : group.professor;
      lines.push(`• *Professor:* ${professorName || 'não cadastrado'}`);
    }
    if (displayFields.has('contact')) lines.push(`• *Contato:* ${group.email || 'não cadastrado'}`);
    if (requested.has('discipline') && !requested.has('professor') && groups.length === 1) lines.push(`• *Disciplina:* ${group.title}`);

    const semesters = uniqueBy(group.entries, entry => Number(entry.semester_number)).map(entry => entry.semester_label || `${entry.semester_number}º semestre`);
    if (displayFields.has('semester')) lines.push(`• *Semestre${semesters.length > 1 ? 's' : ''}:* ${semesters.join(', ') || 'não cadastrado'}`);

    const scheduleRows = uniqueBy(group.entries, entry => [
      displayFields.has('day') ? Number(entry.day_of_week) : '',
      displayFields.has('hours') ? entry.hours_label : '',
      displayFields.has('room') ? normalizeText(entry.room) : '',
      String(entry._schedule_status_label || '')
    ].join('|'));
    if (displayFields.has('day') || displayFields.has('hours') || displayFields.has('room')) {
      const hasAnyRoom = scheduleRows.some(entry => String(entry.room || '').trim());
      const hasAnyHours = scheduleRows.some(entry => String(entry.hours_label || '').trim());
      if (requested.has('room') && !hasAnyRoom) {
        lines.push('A sala dessa disciplina ainda não está cadastrada.');
      } else if ((requested.has('hours') || requested.has('day')) && !hasAnyHours) {
        lines.push('O horário dessa disciplina ainda não está cadastrado.');
      } else {
        scheduleRows.forEach((entry, index) => {
          if (index > 0) lines.push('');
          if (entry._schedule_status_label) lines.push(`*${entry._schedule_status_label}*`);
          if (displayFields.has('day')) lines.push(`• *Dia:* ${entry.day_label || 'não informado'}`);
          if (displayFields.has('hours')) lines.push(`• *Horário:* ${entry.hours_label || 'não informado'}`);
          if (displayFields.has('room')) lines.push(`• *Sala:* *${entry.room || 'não cadastrada'}*`);
        });
      }
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

module.exports = { requestedProfessorFields, professorIntentLabel, formatProfessorFieldResponse, professorDisplayName, isProfessorPrivatePhoneRequest, formatProfessorPhonePrivacyResponse };
