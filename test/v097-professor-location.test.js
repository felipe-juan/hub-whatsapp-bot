'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { readAdminJs } = require('./helpers/admin-assets');
const {
  classifyProfessorLocationRequest,
  formatProfessorLocationResponse,
  isStaleConfirmation
} = require('../src/professor-location');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v097-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function closeAll(engine, db, dir) {
  try { engine?.close(); } catch {}
  try { db?.close(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}

test('direct professor location phrases work without ?, but conversational text does not', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    for (const body of [
      'sala do professor Allan',
      'onde fica o professor Allan',
      'qual é a sala do professor Allan',
      'em qual sala está o professor Allan',
      'sala do docente Allan',
      'onde fica o docente Allan',
      'gabinete do docente Allan'
    ]) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body);
      assert.equal(result.type, 'professor_location', body);
      assert.equal(result.matchedItem, 'Localização — Allan de Sousa Soares', body);
    }
    for (const body of [
      'falei com Allan sobre a sala',
      'o professor comentou sobre o laboratório',
      'estou procurando uma sala',
      'alguma coisa sala do professor Allan'
    ]) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, false, body);
    }
  } finally { closeAll(engine, db, dir); }
});

test('long professor location questions work with explicit structure even without final ?', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    const valid = engine.evaluate('você sabe onde fica o professor Allan?', { isGroup: false, ignorePermissions: true });
    assert.equal(valid.matched, true);
    assert.equal(valid.type, 'professor_location');
    const missingQuestion = engine.evaluate('você sabe onde fica o professor Allan', { isGroup: false, ignorePermissions: true });
    assert.equal(missingQuestion.matched, true);
    assert.equal(missingQuestion.type, 'professor_location');
    const questionInMiddle = engine.evaluate('você sabe onde fica o professor Allan? obrigado', { isGroup: false, ignorePermissions: true });
    assert.equal(questionInMiddle.matched, true);
    assert.equal(questionInMiddle.type, 'professor_location');
  } finally { closeAll(engine, db, dir); }
});

test('generic professor request asks for a name and exclusions protect other cards', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    for (const body of ['onde fica o professor?', 'sala do professor', 'onde fica o docente?', 'sala do docente']) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body);
      assert.equal(result.type, 'professor_location_prompt', body);
      assert.match(result.text, /De qual professor/i);
    }
    const coordination = engine.evaluate('onde fica a coordenação de BSI?', { isGroup: false, ignorePermissions: true });
    assert.equal(coordination.matched, true);
    assert.equal(coordination.matchedItem, 'CSI — location');
    const laboratory = engine.evaluate('qual é a sala do laboratório de redes de BSI?', { isGroup: false, ignorePermissions: true });
    assert.equal(laboratory.matched, true);
    assert.equal(laboratory.matchedItem, 'BSI — Laboratórios de redes');
  } finally { closeAll(engine, db, dir); }
});

test('classroom request resolves to the individual professor card with the current room', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    for (const [body, expectedTitle] of [
      ['qual é a sala da aula do professor Allan?', 'Professor — Allan de Sousa Soares'],
      ['qual é a sala da aula do professor Allan', 'Professor — Allan de Sousa Soares'],
      ['em qual sala é a turma da professora Amanda?', 'Professor — Amanda Ferraz de Oliveira Passos'],
      ['em qual sala é a turma da professora Amanda', 'Professor — Amanda Ferraz de Oliveira Passos']
    ]) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body);
      assert.equal(result.type, 'message', body);
      assert.equal(result.matchedItem, expectedTitle, body);
      assert.match(result.text, /Horários e salas — 2026\.2/);
      assert.match(result.text, /Sala: \*[A-Z]\d{3}\*/);
    }
    const officeQuestion = engine.evaluate('onde encontro o professor Allan para falar sobre a aula?', { isGroup: false, ignorePermissions: true });
    assert.equal(officeQuestion.matched, true);
    assert.equal(officeQuestion.type, 'professor_location');
  } finally { closeAll(engine, db, dir); }
});

test('unconfirmed rooms are never invented and confirmed rooms include source and date', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    let allan = db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    assert.ok(allan);
    let result = engine.evaluate('onde fica o professor Allan?', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /Não há uma sala de atendimento confirmada/i);
    assert.match(result.text, /allansoares@ifba\.edu\.br/i);
    assert.doesNotMatch(result.text, /Local de atendimento:/i);

    allan = db.saveTeacher({
      ...allan,
      room: 'H410', building: 'Bloco H', room_confirmed_at: '2026-08-02',
      room_source: 'Coordenação de Sistemas de Informação'
    }, allan.id);
    result = engine.evaluate('onde fica o professor Allan?', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /Local de atendimento:\*? H410/i);
    assert.match(result.text, /Bloco H/i);
    assert.match(result.text, /02\/08\/2026/);
    assert.match(result.text, /Coordenação de Sistemas de Informação/i);
  } finally { closeAll(engine, db, dir); }
});

test('room validation requires date and source when a room is supplied', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const allan = db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    assert.throws(() => db.saveTeacher({ ...allan, room: 'H410' }, allan.id), /data de confirmação/i);
    assert.throws(() => db.saveTeacher({ ...allan, room: 'H410', room_confirmed_at: '2026-08-02' }, allan.id), /fonte/i);
  } finally { closeAll(null, db, dir); }
});

test('ambiguous first names trigger a surname choice', () => {
  const teachers = [
    { id: 1, name: 'João Rodrigues', email: 'joao1@ifba.edu.br', aliases: ['joão'], active: true },
    { id: 2, name: 'João Almeida', email: 'joao2@ifba.edu.br', aliases: ['joão'], active: true }
  ];
  const result = classifyProfessorLocationRequest('onde fica o professor João?', teachers);
  assert.equal(result.matched, true);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.matches.length, 2);
});

test('stale confirmation warning is deterministic', () => {
  assert.equal(isStaleConfirmation('2025-01-01', 180, Date.parse('2026-08-02T12:00:00Z')), true);
  assert.equal(isStaleConfirmation('2026-07-01', 180, Date.parse('2026-08-02T12:00:00Z')), false);
  const text = formatProfessorLocationResponse({
    name: 'Professor Teste', email: 'teste@ifba.edu.br', room: 'H100', building: 'H',
    room_confirmed_at: '2025-01-01', room_source: 'Coordenação'
  }, { staleDays: 180, now: Date.parse('2026-08-02T12:00:00Z') });
  assert.match(text, /mais de seis meses/i);
});

test('database seeds one structured record per BSI professor and panel exposes editor', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const teachers = db.listTeachers({ activeOnly: true });
    assert.ok(teachers.length >= 28);
    const allan = teachers.find(item => item.name === 'Allan de Sousa Soares');
    assert.deepEqual(allan.aliases.includes('allan'), true);
    assert.ok(allan.disciplines.includes('Matemática Discreta I'));
    assert.equal(allan.academic_period, '2026.2');
    assert.ok(Array.isArray(allan.schedule));
    const app = readAdminJs(path.join(__dirname, '..'));
    assert.match(app, /Cadastro docente/);
    assert.match(app, /room_confirmed_at/);
    assert.match(app, /room_source/);
  } finally { closeAll(null, db, dir); }
});

test('JSON backup preserves structured professor location data', () => {
  const first = temporaryDatabase();
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v097-restore-'));
  const restored = new Database(path.join(secondDir, 'hub.sqlite'), { seedBundledContent: false });
  try {
    const allan = first.db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    first.db.saveTeacher({ ...allan, room: 'H410', building: 'Bloco H', room_confirmed_at: '2026-08-02', room_source: 'Coordenação de BSI' }, allan.id);
    restored.importData(first.db.exportData());
    const restoredAllan = restored.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    assert.equal(restoredAllan.room, 'H410');
    assert.equal(restoredAllan.building, 'Bloco H');
    assert.equal(restoredAllan.room_confirmed_at, '2026-08-02');
    assert.equal(restoredAllan.room_source, 'Coordenação de BSI');
  } finally {
    first.db.close(); restored.close();
    fs.rmSync(first.dir, { recursive: true, force: true });
    fs.rmSync(secondDir, { recursive: true, force: true });
  }
});

test('schedule import updates disciplines and hours without erasing confirmed room', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const allan = db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    db.saveTeacher({ ...allan, room: 'H410', building: 'Bloco H', room_confirmed_at: '2026-08-02', room_source: 'Coordenação de BSI' }, allan.id);
    const report = db.applyProfessorScheduleImport([{
      name: 'Allan de Sousa Soares', email: 'allansoares@ifba.edu.br', academic_period: '2027.1', semesters: ['3º semestre'],
      classes: [{ discipline: 'Teoria dos Grafos', semester: '3º semestre', day: 'terça-feira', hours: '18h30–20h10' }]
    }]);
    assert.equal(report.errors.length, 0);
    const updated = db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    assert.equal(updated.room, 'H410');
    assert.equal(updated.room_source, 'Coordenação de BSI');
    assert.equal(updated.academic_period, '2027.1');
    assert.deepEqual(updated.disciplines, ['Teoria dos Grafos']);
    assert.equal(updated.schedule[0].day, 'terça-feira');
  } finally { closeAll(null, db, dir); }
});
