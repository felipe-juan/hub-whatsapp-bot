'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { formatSemesterSchedulePrompt, semesterFromFollowUp } = require('../src/semester-schedule');
const { prepareMessage } = require('../src/message-analysis');
const { toPortugueseTitleCase } = require('../src/title-case');
const { createMessageAdapter } = require('../src/baileys-adapter');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0140-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { dir, db };
}

test('pedido de semestre mostra somente exemplos numéricos e continua aceitando formas antigas', () => {
  const text = formatSemesterSchedulePrompt(1, new Date('2026-08-03T12:00:00Z'));
  assert.match(text, /`3`, `5` ou `8`/u);
  assert.doesNotMatch(text, /terceiro semestre|3º semestre/u);
  assert.equal(semesterFromFollowUp('terceiro semestre'), 3);
  assert.equal(semesterFromFollowUp('5º semestre'), 5);
  assert.equal(semesterFromFollowUp('8'), 8);
});

test('títulos seguem capitalização portuguesa e a calculadora usa o título solicitado', () => {
  assert.equal(toPortugueseTitleCase('calculadora de prova final'), 'Calculadora de Prova Final');
  assert.equal(toPortugueseTitleCase('BSI — como iniciar o TCC I'), 'BSI — Como Iniciar o TCC I');
  const { dir, db } = temporaryDatabase();
  try {
    assert.equal(db.listCalculators().find(item => item.key === 'final').label, 'Calculadora de Prova Final');
    for (const card of db.listAutomaticMessages()) assert.equal(card.title, toPortugueseTitleCase(card.title));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('card de Felipe Juan aceita Felipe e inclui o projeto do curso', () => {
  const { dir, db } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const result = engine.evaluate('felipe', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matched, true);
    assert.equal(result.matchedItem, 'Contato — Felipe Juan');
    assert.match(result.text, /felipe-juan\.github\.io\/hub-arquivos-ifba/u);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('disciplina por sigla ou nome completo abre o card docente e aceita múltiplas consultas', () => {
  const { dir, db } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const byCode = engine.evaluate('sala e dia de aula de LPII', { isGroup: false, ignorePermissions: true });
    assert.equal(byCode.matchedItem, 'Professor — Alexandro dos Santos Silva');
    const byName = engine.evaluate('horários de Linguagem de Programação II', { isGroup: false, ignorePermissions: true });
    assert.equal(byName.matchedItem, 'Professor — Alexandro dos Santos Silva');
    const many = engine.evaluate('horários de LPII e BDI', { isGroup: false, ignorePermissions: true });
    assert.equal(many.type, 'multi_message');
    assert.equal(many.responseItems.length, 2);
    const group = engine.evaluate('horários de LPII e BDI', { isGroup: true, ignorePermissions: true });
    assert.equal(group.privateDelivery, true);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('análise central distingue consulta, narrativa e confirmação impossível', () => {
  const { dir, db } = temporaryDatabase();
  try {
    const teachers = db.listTeachers({ activeOnly: true });
    assert.equal(prepareMessage('quais aulas tem hoje no 3º semestre?', { teachers }).intent, 'schedule-query');
    assert.equal(prepareMessage('a aula de hoje foi boa', { teachers }).intent, 'schedule-narrative');
    assert.equal(prepareMessage('hoje tem aula de Pablo?', { teachers }).intent, 'professor-attendance-confirmation');
    assert.equal(prepareMessage('vai ter aula hoje normal', { teachers }).intent, 'schedule-status-confirmation');
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('snapshot da mensagem consulta somente o dia e semestre identificados', () => {
  const { dir, db } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const calls = [];
    const original = db.listProfessorScheduleEntries.bind(db);
    db.listProfessorScheduleEntries = options => { calls.push(options); return original(options); };
    engine.evaluate('quais aulas tem segunda no 5º semestre?', { isGroup: false, ignorePermissions: true, now: Date.parse('2026-08-03T12:00:00Z') });
    assert.ok(calls.some(call => Number(call.semester) === 5 && Number.isInteger(Number(call.dayOfWeek))));
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('adaptador pode entregar múltiplas respostas do grupo no privado', async () => {
  const sent = [];
  const socket = { user: { id: '557700000000:1@s.whatsapp.net' }, async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: `m${sent.length}` } }; } };
  const raw = { key: { id: 'in1', remoteJid: '120@g.us', participant: '557799999999@s.whatsapp.net', fromMe: false }, message: { conversation: 'teste' } };
  const adapted = createMessageAdapter({ raw, socket, metadataCache: new Map(), sendMessage: async (jid, content) => socket.sendMessage(jid, content) });
  await adapted.sendPrivateResponse({ text: 'Resposta privada' });
  assert.equal(sent[0].jid, '557799999999@s.whatsapp.net');
  assert.equal(sent[0].content.text, 'Resposta privada');
});

test('casos de regressão são persistidos e editáveis', () => {
  const { dir, db } = temporaryDatabase();
  try {
    const saved = db.saveRegressionCase({ phrase: 'teste de precisão', expectation: 'ignore', active: true });
    assert.equal(saved.phrase, 'teste de precisão');
    assert.ok(db.listRegressionCases({ activeOnly: true }).some(item => item.id === Number(saved.id)));
    assert.equal(db.deleteRegressionCase(saved.id).deleted, 1);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('disciplinas novas importadas entram no catálogo compacto por sigla e nome completo', () => {
  const { dir, db } = temporaryDatabase();
  try {
    const allan = db.listTeachers().find(item => item.name === 'Allan de Sousa Soares');
    db.saveProfessorScheduleEntry({
      teacher_id: allan.id, professor_name: allan.name, professor_email: allan.email,
      discipline_name: 'Computação Quântica Aplicada', discipline_code: 'CQA',
      semester_number: 8, day_of_week: 2, start_minutes: 1110, end_minutes: 1210,
      room: 'H999', academic_period: '2026.2', source_title: 'Teste', source_version: '1', source_date: '2026-08-03', active: true
    });
    const engine = new BotEngine(db);
    assert.equal(engine.evaluate('horários de CQA', { isGroup: false, ignorePermissions: true }).matchedItem, 'Professor — Allan de Sousa Soares');
    assert.equal(engine.evaluate('sala e dia de Computação Quântica Aplicada', { isGroup: false, ignorePermissions: true }).matchedItem, 'Professor — Allan de Sousa Soares');
    engine.close();
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('consulta múltipla em grupo envia cada card somente no privado do participante', async () => {
  const { dir, db } = temporaryDatabase(); const engine = new BotEngine(db);
  const privateResponses = []; const groupResponses = [];
  try {
    const message = {
      fromMe: false, from: '120363000000@g.us', author: '557799999999@s.whatsapp.net',
      body: 'horários de LPII e BDI', mentionedMe: false, quotedFromMe: false,
      timestampMs: Date.parse('2026-08-03T12:00:00Z'),
      async getChat() { return { isGroup: true, name: 'Grupo BSI', id: { _serialized: this.from }, async sendMessage(value) { groupResponses.push(value); } }; },
      async sendPrivateResponse(payload) { privateResponses.push(payload); return { key: { id: `p${privateResponses.length}` } }; },
      async sendResponse(payload) { groupResponses.push(payload); return { key: { id: `g${groupResponses.length}` } }; },
      async reply(value) { groupResponses.push(value); return { key: { id: `g${groupResponses.length}` } }; }
    };
    await engine.handle(message);
    assert.equal(privateResponses.length, 2);
    assert.equal(groupResponses.length, 0);
    assert.ok(privateResponses.every(item => /18h30/u.test(item.text)));
    assert.ok(privateResponses.every(item => !/@ifba\.edu\.br/u.test(item.text)));
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('uma mensagem reutiliza um único snapshot de conteúdo e consulta só o recorte do quadro', async () => {
  const { dir, db } = temporaryDatabase(); const engine = new BotEngine(db);
  const calls = { settings: 0, messages: 0, teachers: 0, schedule: [] };
  const wrap = (name, key) => { const original = db[name].bind(db); db[name] = (...args) => { calls[key] += 1; return original(...args); }; };
  wrap('getSettings', 'settings'); wrap('listAutomaticMessages', 'messages'); wrap('listTeachers', 'teachers');
  const originalSchedule = db.listProfessorScheduleEntries.bind(db);
  db.listProfessorScheduleEntries = options => { calls.schedule.push(options || {}); return originalSchedule(options); };
  try {
    const replies = [];
    const message = {
      fromMe: false, from: '557799999999@s.whatsapp.net', author: '557799999999@s.whatsapp.net',
      body: 'quais aulas segunda no 5 semestre?', mentionedMe: false, quotedFromMe: false,
      timestampMs: Date.parse('2026-08-03T12:00:00Z'),
      async getChat() { return { isGroup: false, name: 'Privado', id: { _serialized: this.from }, async sendMessage(value) { replies.push(value); } }; },
      async sendResponse(payload) { replies.push(payload); return { key: { id: 'one' } }; }, async reply(value) { replies.push(value); return { key: { id: 'one' } }; }
    };
    await engine.handle(message);
    assert.equal(calls.settings, 1);
    assert.equal(calls.messages, 1);
    assert.equal(calls.teachers, 1);
    assert.equal(calls.schedule.length, 1);
    assert.equal(calls.schedule[0].semester, 5);
    assert.equal(calls.schedule[0].dayOfWeek, 1);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
