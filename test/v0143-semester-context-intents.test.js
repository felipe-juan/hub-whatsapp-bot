'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { DiagnosticBus } = require('../src/diagnostics');
const { formatProfessorFieldResponse } = require('../src/professor-card-response');
const { SEMESTER_WEEKLY_CARDS_V0143 } = require('../src/content/semester-weekly-cards');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0143-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', diagnostic_enabled: 'true', private_context_without_reply: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function mockMessage(body, replies, from = '5511999999999@s.whatsapp.net', timestampMs = Date.now()) {
  return {
    fromMe: false, from, author: from, body, senderName: 'Estudante', timestampMs,
    quotedFromMe: false, mentionedMe: false,
    async getChat() { return { isGroup: false, id: { _serialized: from }, name: 'Estudante' }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { key: { id: `reply-${replies.length}` } }; }
  };
}

test('há um card semanal completo para cada semestre de BSI', () => {
  assert.equal(SEMESTER_WEEKLY_CARDS_V0143.length, 8);
  const expectedRows = [6, 6, 7, 9, 9, 11, 10, 5];
  SEMESTER_WEEKLY_CARDS_V0143.forEach((definition, index) => {
    const semester = index + 1;
    const text = definition.message.response_text;
    assert.match(definition.message.title, new RegExp(`${semester}º semestre`, 'u'));
    assert.equal((text.match(/^• \*/gmu) || []).length, expectedRows[index]);
    assert.match(text, /Professor(?:es)?:/u);
    assert.match(text, /Sala(?:s)?:/u);
    assert.match(text, /Horário:/u);
  });
  const seventh = SEMESTER_WEEKLY_CARDS_V0143[6].message.response_text;
  assert.match(seventh, /Atividades Curriculares de Extensão IV/u);
  assert.match(seventh, /Segunda-feira[\s\S]*Quarta-feira/u);
});

test('pergunta de sala preserva contexto acadêmico útil', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const result = engine.simulate('qual sala de LPI?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.detectedIntent, 'sala');
    assert.match(result.text, /LPI — Linguagem de Programação I/u);
    assert.match(result.text, /segunda-feira/u);
    assert.match(result.text, /18h30/u);
    assert.match(result.text, /\*Sala:\* \*H008\*/u);
    assert.doesNotMatch(result.text, /claudiorodolfo@|Estruturas de Dados|ACEX II/u);
  } finally { engine.close(); holder.close(); }
});

test('pergunta plural sobre dias do professor aciona o card, mas presença pontual continua bloqueada', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const plural = engine.simulate('em quais dias Amanda dá aula?', { isGroup: false, ignorePermissions: true });
    assert.equal(plural.matched, true);
    assert.equal(plural.detectedIntent, 'horário');
    assert.match(plural.text, /segunda-feira/u);
    assert.match(plural.text, /terça-feira/u);
    assert.match(plural.text, /quarta-feira/u);
    assert.match(plural.text, /18h30/u);

    for (const phrase of ['Amanda dá aula hoje?', 'Amanda dará aula amanhã?', 'Crescêncio vem dar aula hoje?']) {
      const result = engine.evaluate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, false, phrase);
      assert.equal(result.blockedBy, 'teacher-attendance-unverifiable', phrase);
      assert.equal(result.detectedIntent, 'presença não verificável', phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('setores retornam somente o campo solicitado e mantêm contexto', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const email = engine.simulate('qual é o e-mail da CAENS?', { isGroup: false, ignorePermissions: true });
    assert.equal(email.detectedIntent, 'e-mail');
    assert.match(email.text, /caens\.vdc@ifba\.edu\.br/u);
    assert.doesNotMatch(email.text, /Bloco do CVT|WhatsApp|Telefone|Fonte:/u);

    const location = engine.simulate('onde fica a CAENS?', { isGroup: false, ignorePermissions: true });
    assert.equal(location.detectedIntent, 'localização');
    assert.match(location.text, /Bloco do CVT/u);
    assert.doesNotMatch(location.text, /caens\.vdc@ifba\.edu\.br|WhatsApp|Telefone|Fonte:/u);
  } finally { engine.close(); holder.close(); }
});

test('continuação privada recupera professor ou disciplina sem repetição', async () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db); const replies = [];
  try {
    await engine.handle(mockMessage('qual sala de LPI?', replies));
    await engine.handle(mockMessage('e o horário?', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[0], /\*Sala:\* \*H008\*/u);
    assert.match(replies[1], /LPI — Linguagem de Programação I/u);
    assert.match(replies[1], /18h30/u);
    assert.doesNotMatch(replies[1], /claudiorodolfo@|Estruturas de Dados/u);
  } finally { engine.close(); holder.close(); }
});

test('consulta docente com hoje prioriza aula atual ou próxima sem pedir semestre', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const beforeClass = engine.evaluate('onde Allan dá aula hoje?', {
      isGroup: false, ignorePermissions: true, now: Date.UTC(2026, 7, 6, 20, 0)
    });
    assert.equal(beforeClass.type, 'message');
    assert.match(beforeClass.text, /Próxima aula/u);
    assert.match(beforeClass.text, /MDI — Matemática Discreta I/u);
    assert.match(beforeClass.text, /H204/u);
    assert.doesNotMatch(beforeClass.text, /Qual semestre/u);

    const duringClass = engine.evaluate('onde Allan dá aula hoje?', {
      isGroup: false, ignorePermissions: true, now: Date.UTC(2026, 7, 6, 22, 0)
    });
    assert.match(duringClass.text, /Aula em andamento/u);
  } finally { engine.close(); holder.close(); }
});

test('dados ausentes geram mensagem explícita em vez do card completo', () => {
  const text = formatProfessorFieldResponse({
    fields: ['room'],
    teachers: [{ name: 'Docente Teste', email: 'docente@example.invalid' }],
    entries: [{ professor_name: 'Docente Teste', discipline_code: 'TESTE', discipline_name: 'Disciplina Teste', day_of_week: 1, day_label: 'segunda-feira', hours_label: '18h30–20h10', room: '' }]
  });
  assert.match(text, /A sala dessa disciplina ainda não está cadastrada/u);
  assert.doesNotMatch(text, /docente@example\.invalid/u);
});

test('diagnóstico registra a intenção classificada', async () => {
  const holder = temporaryDatabase(); const diagnostics = new DiagnosticBus({ maxEntries: 50 });
  const engine = new BotEngine(holder.db, { diagnostics }); const replies = [];
  try {
    await engine.handle(mockMessage('qual sala de LPI?', replies));
    await engine.handle(mockMessage('Crescêncio dá aula hoje?', replies));
    const events = diagnostics.list();
    assert.equal(events.length, 2);
    assert.equal(events[0].intent, 'sala');
    assert.equal(events[0].outcome, 'responded');
    assert.equal(events[1].intent, 'presença não verificável');
    assert.equal(events[1].outcome, 'ignored');
  } finally { engine.close(); holder.close(); }
});

test('card semanal é identificado como intenção de horário', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const result = engine.evaluate('quais aulas do 3º semestre?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matched, true);
    assert.equal(result.detectedIntent, 'horário');
    assert.match(result.text, /Professor:/u);
    assert.match(result.text, /Sala:/u);
    assert.match(result.text, /Horário:/u);
  } finally { engine.close(); holder.close(); }
});
