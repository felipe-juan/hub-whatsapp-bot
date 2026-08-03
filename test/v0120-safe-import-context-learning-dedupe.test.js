'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { parseAcademicCalendarCsv } = require('../src/academic-calendar-import');
const { hasScheduleIntent, eventApplies } = require('../src/semester-schedule');

function holder(seed = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0120-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  const db = new Database(dbPath, { seedBundledContent: seed });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, dbPath, db, close(remove = true) { db.close(); if (remove) fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('importação seletiva do quadro preserva e-mail, gatilhos, anexo e mudanças não selecionadas', () => {
  const h = holder();
  try {
    const title = 'Professor — Amanda Ferraz de Oliveira Passos';
    const card = h.db.listAutomaticMessages().find(item => item.title === title);
    assert.ok(card);
    const originalSentences = [...(card.trigger.sentences || [])];
    h.db.setAutomaticMessageAttachment(card.id, { kind: 'image', file_name: 'amanda.png', stored_name: 'amanda-test.png', mime_type: 'image/png', size: 100 });
    const rows = h.db.listProfessorScheduleEntries({ academicPeriod: '2026.2', professor: 'Amanda Ferraz' });
    assert.ok(rows.length > 0);
    const records = [{
      name: 'Amanda Ferraz de Oliveira Passos', email: '', academic_period: '2026.2',
      classes: rows.map((row, index) => ({ discipline: row.discipline_name, semester: row.semester_label, day: row.day_label,
        hours: index === 0 ? '17h00–18h00' : row.hours_label, room: index === 0 ? 'H999' : row.room }))
    }];
    const preview = h.db.previewProfessorScheduleImport(records);
    const room = preview.plan.changes.find(change => change.type === 'room');
    const hours = preview.plan.changes.find(change => change.type === 'hours');
    assert.ok(room && hours);
    const result = h.db.applyProfessorScheduleImport(records, [room.id]);
    assert.equal(result.appliedChanges, 1);
    const updatedCard = h.db.getAutomaticMessage(card.id);
    assert.deepEqual(updatedCard.trigger.sentences, originalSentences);
    assert.equal(updatedCard.attachment.file_name, 'amanda.png');
    const updatedRows = h.db.listProfessorScheduleEntries({ academicPeriod: '2026.2', professor: 'Amanda Ferraz' });
    const changed = updatedRows.find(row => row.room === 'H999');
    assert.ok(changed);
    assert.notEqual(changed.hours_label, '17h00–18h00');
    const teacher = h.db.listTeachers().find(item => item.name === 'Amanda Ferraz de Oliveira Passos');
    assert.match(teacher.email, /@ifba\.edu\.br$/u);
  } finally { h.close(); }
});

test('continua consulta de aulas por reply reutilizando data e semestre', () => {
  const h = holder();
  try {
    const engine = new BotEngine(h.db);
    const message = { from: 'chat@s.whatsapp.net', author: 'user@s.whatsapp.net', quotedFromMe: true, timestampMs: Date.UTC(2026, 7, 3, 15) };
    engine.conversationContexts.set(engine.conversationKey(message), {
      kind: 'semester_schedule', title: 'BSI — Aulas por semestre e dia', targetDate: '2026-08-03', dayIndex: 1, semester: 3, expiresAt: Date.now() + 60000
    });
    const friday = engine.contextualFollowUpEvaluation(message, 'e na sexta?', h.db.getSettings());
    assert.equal(friday.matched, true);
    assert.match(friday.text, /Sexta-Feira, 07\/08\/2026 — 3º Semestre/u);
    const rooms = engine.contextualFollowUpEvaluation(message, 'e qual a sala?', h.db.getSettings());
    assert.equal(rooms.type, 'semester_schedule_rooms');
    assert.match(rooms.text, /Sala:/u);
    assert.doesNotMatch(rooms.text, /Professor:/u);
    const fourth = engine.contextualFollowUpEvaluation(message, 'e no quarto semestre?', h.db.getSettings());
    assert.equal(fourth.contextSubject.semester, 4);
    engine.close();
  } finally { h.close(); }
});

test('aprendizado assistido só altera o card depois de aprovação explícita', () => {
  const h = holder();
  try {
    const card = h.db.listAutomaticMessages().find(item => item.title.includes('Amanda Ferraz'));
    const phrase = 'que dia amanda pega a gente';
    const suggestion = h.db.addUnrecognizedSuggestion({ message: phrase, suggested_message_id: card.id, suggested_title: card.title, confidence: 0.9, reasons: ['nome reconhecido'] });
    assert.equal(h.db.getAutomaticMessage(card.id).trigger.sentences.includes(phrase), false);
    h.db.approveUnrecognizedSuggestion(suggestion.id);
    assert.equal(h.db.getAutomaticMessage(card.id).trigger.sentences.includes(phrase), true);
    assert.equal(h.db.getUnrecognizedSuggestion(suggestion.id).state, 'approved');
  } finally { h.close(); }
});

test('IDs de mensagens recebidas permanecem deduplicados após reabrir o banco', () => {
  const h = holder(false);
  assert.equal(h.db.claimIncomingMessage('grupo@g.us', 'ABC123'), true);
  assert.equal(h.db.claimIncomingMessage('grupo@g.us', 'ABC123'), false);
  // Mesmo um claim interrompido pelo encerramento do processo permanece
  // bloqueado para privilegiar a ausência de respostas duplicadas.
  h.close(false);
  const reopened = new Database(h.dbPath, { seedBundledContent: false });
  try { assert.equal(reopened.claimIncomingMessage('grupo@g.us', 'ABC123'), false); }
  finally { reopened.close(); fs.rmSync(h.dir, { recursive: true, force: true }); }
});

test('intenção distingue consulta de comentário e afirmação sobre aula', () => {
  assert.equal(hasScheduleIntent('qual aula tem hoje?'), true);
  assert.equal(hasScheduleIntent('será que tem aula hoje?'), true);
  assert.equal(hasScheduleIntent('a aula de hoje foi boa'), false);
  assert.equal(hasScheduleIntent('hoje não vai ter aula'), false);
});

test('CSV acadêmico importa intervalos e recorrências semanais', () => {
  const parsed = parseAcademicCalendarCsv('tipo,data_inicial,data_final,titulo,curso,semestres,disciplina,sala_anterior,nova_sala,recorrencia,dias_da_semana,intervalo_semanas\nMudança de sala,01/08/2026,31/08/2026,LPII na H105,bsi,3,LPII,H108,H105,semanal,quarta,1\nSem aulas,10/08/2026,14/08/2026,Semana suspensa,bsi,3,,,,,,\n');
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events[0].recurrence_weekdays, [3]);
  assert.equal(eventApplies({ ...parsed.events[0], semester_numbers: [3], active: true }, 3, '2026-08-05'), true);
  assert.equal(eventApplies({ ...parsed.events[0], semester_numbers: [3], active: true }, 3, '2026-08-06'), false);
  const h = holder(false);
  try {
    const result = h.db.applyAcademicCalendarImport(parsed.events);
    assert.equal(result.imported, 2);
    assert.equal(h.db.listAcademicCalendarEvents({ activeOnly: false }).length, 2);
  } finally { h.close(); }
});

test('painel expõe importação segura, calendário recorrente e aprendizado assistido', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const professors = fs.readFileSync(path.join(root, 'public', 'js', 'professors.js'), 'utf8');
  const calendar = fs.readFileSync(path.join(root, 'public', 'js', 'calendar.js'), 'utf8');
  assert.match(index, /data-view="learning"/u);
  assert.match(app, /renderLearningSuggestions/u);
  assert.match(professors, /selected_change_ids/u);
  assert.match(calendar, /recurrence_weekdays/u);
  assert.match(calendar, /import\/academic-calendar/u);
});
