'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeText } = require('./text');

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}
function issue(type, severity, title, details, meta = {}) {
  return { type, severity, title, details, ...meta };
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }

function runConsistencyCheck(database, { attachmentsDir = '' } = {}) {
  const teachers = database.listTeachers?.({ activeOnly: false }) || [];
  const entries = database.listProfessorScheduleEntries?.({ activeOnly: false }) || [];
  const messages = database.listAutomaticMessages?.() || [];
  const events = database.listAcademicCalendarEvents?.({ activeOnly: false }) || [];
  const items = [];

  for (const teacher of teachers.filter(item => item.active !== false)) {
    if (!validEmail(teacher.email)) items.push(issue('professor_email', 'warning', `Professor sem e-mail válido: ${teacher.name}`, 'Cadastre um e-mail institucional válido.', { teacher_id: teacher.id }));
  }
  for (const entry of entries.filter(item => item.active !== false)) {
    const label = `${entry.professor_name} · ${entry.discipline_name || 'disciplina sem nome'}`;
    if (!String(entry.discipline_code || '').trim()) items.push(issue('discipline_code', 'warning', `Disciplina sem sigla: ${label}`, 'Informe a sigla para permitir consultas e exceções precisas.', { schedule_entry_id: entry.id }));
    if (!String(entry.room || '').trim() || /não\s+informad/i.test(String(entry.room))) items.push(issue('room', 'warning', `Aula sem sala: ${label}`, `${entry.day_label || 'Dia não informado'} · ${entry.hours_label || 'horário não informado'}`, { schedule_entry_id: entry.id }));
    if (!validEmail(entry.professor_email)) items.push(issue('schedule_email', 'info', `Horário sem e-mail válido: ${label}`, 'O e-mail do cadastro docente será usado quando disponível.', { schedule_entry_id: entry.id }));
  }

  const live = entries.filter(item => item.active !== false && Number.isFinite(Number(item.start_minutes)) && Number.isFinite(Number(item.end_minutes)));
  const seenPairs = new Set();
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i]; const b = live[j];
      if (String(a.academic_period) !== String(b.academic_period) || Number(a.day_of_week) !== Number(b.day_of_week)) continue;
      if (!overlaps(Number(a.start_minutes), Number(a.end_minutes), Number(b.start_minutes), Number(b.end_minutes))) continue;
      const key = `${Math.min(a.id,b.id)}:${Math.max(a.id,b.id)}`; if (seenPairs.has(key)) continue; seenPairs.add(key);
      const sameProfessor = normalizeText(a.professor_name) === normalizeText(b.professor_name);
      const sameRoom = a.room && b.room && normalizeText(a.room) === normalizeText(b.room) && !sameProfessor;
      const sameSemester = Number(a.semester_number) === Number(b.semester_number)
        && !(normalizeText(a.discipline_code || a.discipline_name) === normalizeText(b.discipline_code || b.discipline_name)
          && normalizeText(a.professor_name) === normalizeText(b.professor_name));
      if (sameProfessor) items.push(issue('professor_overlap', 'error', `Professor com aulas simultâneas: ${a.professor_name}`, `${a.day_label}: ${a.discipline_code || a.discipline_name} (${a.hours_label}) e ${b.discipline_code || b.discipline_name} (${b.hours_label}).`, { entry_ids: [a.id,b.id] }));
      if (sameRoom) items.push(issue('room_overlap', 'error', `Sala ocupada por dois professores: ${a.room}`, `${a.day_label}: ${a.professor_name} e ${b.professor_name}.`, { entry_ids: [a.id,b.id] }));
      if (sameSemester) items.push(issue('semester_overlap', 'error', `Horários sobrepostos no ${a.semester_number}º semestre`, `${a.day_label}: ${a.discipline_code || a.discipline_name} e ${b.discipline_code || b.discipline_name}.`, { entry_ids: [a.id,b.id] }));
    }
  }

  for (const message of messages) {
    const candidates = [message, message.draft].filter(Boolean);
    for (const current of candidates) {
      const attachment = current.attachment;
      if (!attachment?.stored_name || !attachmentsDir) continue;
      const resolved = path.resolve(attachmentsDir, path.basename(attachment.stored_name));
      if (!fs.existsSync(resolved)) items.push(issue('missing_attachment', 'error', `Anexo ausente: ${current.title || message.title}`, attachment.file_name || attachment.stored_name, { message_id: message.id }));
    }
  }

  const knownCodes = new Set(entries.map(item => normalizeText(item.discipline_code)).filter(Boolean));
  const knownNames = new Set(entries.map(item => normalizeText(item.discipline_name)).filter(Boolean));
  for (const event of events) {
    const code = normalizeText(event.discipline_code);
    if (code && !knownCodes.has(code) && !knownNames.has(code)) items.push(issue('unknown_exception_discipline', 'warning', `Exceção usa disciplina não cadastrada: ${event.discipline_code}`, event.title, { event_id: event.id }));
  }

  const counts = items.reduce((acc, item) => { acc[item.severity] = (acc[item.severity] || 0) + 1; return acc; }, { error: 0, warning: 0, info: 0 });
  return { ok: counts.error === 0, checked_at: new Date().toISOString(), count: items.length, counts, items };
}

module.exports = { runConsistencyCheck, overlaps };
