'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { phraseMatch } = require('../src/trigger-rules');
const {
  classifySemesterScheduleRequest,
  formatSemesterScheduleResponse
} = require('../src/semester-schedule');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0110-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('quadro docente é persistido em campos estruturados e mantém a fonte', () => {
  const holder = temporaryDatabase();
  try {
    const rows = holder.db.listProfessorScheduleEntries({ academicPeriod: '2026.2' });
    assert.ok(rows.length >= 60);
    const lpii = rows.find(row => row.professor_name === 'Alexandro dos Santos Silva' && row.discipline_code === 'LPII');
    assert.ok(lpii);
    assert.deepEqual({
      professor: lpii.professor_name,
      email: lpii.professor_email,
      discipline: lpii.discipline_name,
      acronym: lpii.discipline_code,
      semester: lpii.semester_number,
      day: lpii.day_of_week,
      start: lpii.start_minutes,
      end: lpii.end_minutes,
      room: lpii.room
    }, {
      professor: 'Alexandro dos Santos Silva', email: 'alexandrossilva@ifba.edu.br',
      discipline: 'Linguagem de Programação II', acronym: 'LPII', semester: 3,
      day: 1, start: 1110, end: 1320, room: 'H108'
    });
    assert.equal(lpii.source_version, 'Versão 2');
    assert.equal(lpii.source_date, '2026-07-28');
  } finally { holder.close(); }
});

test('tolerância varia por tipo de termo sem aproximar palavras genéricas', () => {
  assert.equal(phraseMatch('contato da caen', 'contato da caens', 1).matched, true);
  assert.equal(phraseMatch('contato da coers', 'contato da cores', 1).matched, true);
  assert.equal(phraseMatch('aulq de hoje', 'aula de hoje', 1).matched, false);
  assert.equal(phraseMatch('contaro da caens', 'contato da caens', 1).matched, false);
});

test('erro moderado no nome do professor ainda encontra o card correto', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const result = engine.simulate('quais os dias de aula da professora amnada', { isGroup: true });
    assert.equal(result.type, 'message');
    assert.equal(result.matchedItem, 'Professor — Amanda Ferraz de Oliveira Passos');
    const twoEdits = engine.simulate('quais os dias de aula do professor alxndro', { isGroup: true });
    assert.equal(twoEdits.type, 'message');
    assert.equal(twoEdits.matchedItem, 'Professor — Alexandro dos Santos Silva');
    const caens = engine.simulate('contato da caen', { isGroup: true });
    assert.equal(caens.type, 'sector');
    assert.equal(caens.matchedItem, 'CAENS — contact');
    const cores = engine.simulate('contato da coers', { isGroup: true });
    assert.equal(cores.type, 'sector');
    assert.equal(cores.matchedItem, 'CORES — contact');
    const acex = engine.simulate('acez e atividade complementar são a mesma coisa', { isGroup: true });
    assert.equal(acex.matchedItem, 'BSI — ACEX ou atividade complementar');
    assert.equal(engine.simulate('contaro da caens', { isGroup: true }).type, 'none');
    engine.close();
  } finally { holder.close(); }
});

test('consulta dinâmica exibe data explícita e usa o quadro estruturado', () => {
  const holder = temporaryDatabase();
  try {
    const scheduleEntries = holder.db.listProfessorScheduleEntries({ academicPeriod: '2026.2' });
    const result = classifySemesterScheduleRequest('qual aula tem hoje no 3º semestre', {
      now: Date.UTC(2026, 7, 3, 15), scheduleEntries, calendarEvents: [], academicPeriod: '2026.2'
    });
    assert.equal(result.kind, 'schedule');
    assert.ok(result.text.startsWith('*Aulas de Segunda-Feira, 03/08/2026 — 3º Semestre*'));
    assert.match(result.text, /\*LPII - Linguagem de Programação II\*\nSala: H108\nProfessor: Alexandro dos Santos Silva/u);
  } finally { holder.close(); }
});

test('feriado, suspensão parcial, reposição e mudança temporária alteram o quadro', () => {
  const holder = temporaryDatabase();
  try {
    const scheduleEntries = holder.db.listProfessorScheduleEntries({ academicPeriod: '2026.2' });
    const holiday = formatSemesterScheduleResponse(3, { dayIndex: 1, date: new Date(Date.UTC(2026, 8, 7, 12)), iso: '2026-09-07' }, {
      scheduleEntries, calendarEvents: holder.db.academicCalendarEventsForDate('2026-09-07', { course: 'bsi', semester: 3 })
    });
    assert.match(holiday, /Independência do Brasil/u);
    assert.match(holiday, /quadro semanal regular foi suspenso/u);
    assert.doesNotMatch(holiday, /Sala: H108/u);

    const roomChange = formatSemesterScheduleResponse(3, { dayIndex: 1, date: new Date(Date.UTC(2026, 7, 10, 12)), iso: '2026-08-10' }, {
      scheduleEntries, calendarEvents: [{ event_type: 'room_change', start_date: '2026-08-10', end_date: '2026-08-10', title: 'LPII em outra sala', discipline_code: 'LPII', new_room: 'H105', semester_numbers: [3], active: true }]
    });
    assert.match(roomChange, /Mudança excepcional de sala/u);
    assert.match(roomChange, /Sala: H105/u);
    assert.doesNotMatch(roomChange, /Sala: H108/u);

    const partial = formatSemesterScheduleResponse(3, { dayIndex: 1, date: new Date(Date.UTC(2026, 7, 10, 12)), iso: '2026-08-10' }, {
      scheduleEntries, calendarEvents: [{ event_type: 'partial_no_classes', start_date: '2026-08-10', end_date: '2026-08-10', title: 'Noturno suspenso', start_minutes: 1080, end_minutes: null, semester_numbers: [], active: true }]
    });
    assert.match(partial, /Noturno suspenso/u);
    assert.doesNotMatch(partial, /LPII/u);

    const replacement = formatSemesterScheduleResponse(3, { dayIndex: 6, date: new Date(Date.UTC(2026, 7, 8, 12)), iso: '2026-08-08' }, {
      scheduleEntries, calendarEvents: [{ event_type: 'replacement_day', start_date: '2026-08-08', end_date: '2026-08-08', title: 'Sábado letivo com horário de segunda', replacement_day_of_week: 1, semester_numbers: [3], active: true }]
    });
    assert.match(replacement, /Sábado letivo com horário de segunda/u);
    assert.match(replacement, /LPII/u);
  } finally { holder.close(); }
});

test('exceções acadêmicas podem ser cadastradas e removidas no banco', () => {
  const holder = temporaryDatabase();
  try {
    const saved = holder.db.saveAcademicCalendarEvent({
      event_type: 'room_change', start_date: '2026-08-11', end_date: '2026-08-11', title: 'Sala provisória',
      course: 'bsi', semester_numbers: [5], discipline_code: 'PWII', old_room: 'H205', new_room: 'H105', active: true
    });
    assert.equal(saved.new_room, 'H105');
    assert.deepEqual(saved.semester_numbers, [5]);
    assert.equal(holder.db.academicCalendarEventsForDate('2026-08-11', { course: 'bsi', semester: 5 }).some(item => item.id === saved.id), true);
    assert.equal(holder.db.deleteAcademicCalendarEvent(saved.id), true);
  } finally { holder.close(); }
});

test('backup preserva quadro estruturado e exceções acadêmicas personalizadas', () => {
  const source = temporaryDatabase();
  const target = temporaryDatabase();
  try {
    source.db.saveAcademicCalendarEvent({
      event_type: 'room_change', start_date: '2026-08-17', end_date: '2026-08-17', title: 'Teste de backup',
      course: 'bsi', semester_numbers: [3], discipline_code: 'LPII', new_room: 'H999', active: true
    });
    const backup = source.db.exportData();
    assert.equal(backup.version, 11);
    assert.ok(backup.professor_schedule_entries.length >= 60);
    assert.ok(backup.academic_calendar_events.some(event => event.title === 'Teste de backup'));
    target.db.importData(backup);
    assert.ok(target.db.listProfessorScheduleEntries({ academicPeriod: '2026.2' }).length >= 60);
    assert.ok(target.db.academicCalendarEventsForDate('2026-08-17', { course: 'bsi', semester: 3 }).some(event => event.title === 'Teste de backup'));
  } finally { source.close(); target.close(); }
});

test('painel oferece gestão de calendário e consulta do quadro estruturado', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const cards = fs.readFileSync(path.join(root, 'public', 'js', 'cards.js'), 'utf8');
  const calendar = fs.readFileSync(path.join(root, 'public', 'js', 'calendar.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'src', 'admin-server.js'), 'utf8');
  assert.match(index, /\/js\/calendar\.js/u);
  assert.match(cards, /Calendário e exceções/u);
  assert.match(calendar, /Nova exceção/u);
  assert.match(server, /\/api\/academic-calendar/u);
  assert.match(server, /\/api\/professor-schedule-entries/u);
});
