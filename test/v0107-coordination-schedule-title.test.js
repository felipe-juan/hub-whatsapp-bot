'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const {
  parseSemester,
  classifySemesterScheduleRequest,
  formatSemesterScheduleResponse,
  formatSemesterSchedulePrompt,
  semesterFromFollowUp
} = require('../src/semester-schedule');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0107-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakeMessage(body, { from = '120363000000000000@g.us', timestampMs = Date.UTC(2026, 7, 3, 15) } = {}) {
  const replies = [];
  return {
    replies,
    message: {
      fromMe: false, from, author: '5577888888888@s.whatsapp.net', body, timestampMs,
      senderName: 'Pessoa', hasQuotedMessage: false, quotedFromMe: false,
      async react() {}, async reply(text) { replies.push(String(text)); },
      async sendResponse(payload) { replies.push(String(payload.text || '')); },
      async getChat() { return { isGroup: from.endsWith('@g.us'), name: 'Grupo', id: { _serialized: from }, async sendMessage(text) { replies.push(String(text)); } }; }
    }
  };
}

test('card de contato da Coordenação de BSI reúne os dados oficiais do HUB', () => {
  const holder = temporaryDatabase();
  try {
    const card = holder.db.listAutomaticMessages().find(item => item.title === 'BSI — Contato da coordenação');
    assert.ok(card);
    assert.match(card.response_text, /Pablo Freire Matos/u);
    assert.match(card.response_text, /csi\.vdc@ifba\.edu\.br/u);
    assert.match(card.response_text, /0800 077 0084 — ramal 1261/u);
    assert.match(card.response_text, /Sala H410/u);
    assert.ok(card.trigger.sentences.includes('contato da coordenação de bsi'));
  } finally { holder.close(); }
});

test('perguntas de contato usam o card completo da Coordenação de BSI', async () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const result = await engine.simulate('qual o contato da coordenação de bsi', { isGroup: true });
    assert.equal(result.type, 'message');
    assert.equal(result.matchedItem, 'BSI — Contato da coordenação');
    assert.match(result.text, /Pablo Freire Matos/u);
    engine.close();
  } finally { holder.close(); }
});

test('semestres numéricos, ordinais e por extenso são equivalentes', () => {
  for (const value of ['2 semestre', '2º semestre', '2° semestre', '2o semestre', 'segundo semestre', 'semestre 2', 'período 2']) {
    assert.equal(parseSemester(value), 2, value);
  }
  for (const value of ['2', '2º', 'segundo', '2 semestre']) assert.equal(semesterFromFollowUp(value), 2, value);
});

test('resposta de aulas começa pelo dia da semana e semestre usados no cálculo', () => {
  const text = formatSemesterScheduleResponse(3, 1);
  assert.ok(text.startsWith('*Aula de Segunda-Feira - 3º Semestre*'));
  assert.match(text, /\*LPII - Linguagem de Programação II\*\nSala: H108\nProfessor: Alexandro dos Santos Silva/u);
  assert.doesNotMatch(text, /18h|Fonte/u);
});

test('consultas de matéria aceitam variações de semestre e próxima ocorrência', () => {
  const now = Date.UTC(2026, 7, 3, 15); // segunda-feira
  const variants = [
    'qual matéria tem hoje no 3 semestre',
    'aula de hoje do 3º semestre',
    'hoje terceiro semestre',
    'disciplinas de hoje semestre 3'
  ];
  for (const value of variants) {
    const result = classifySemesterScheduleRequest(value, { now });
    assert.equal(result?.kind, 'schedule', value);
    assert.equal(result.semester, 3, value);
    assert.ok(result.text.startsWith('*Aula de Segunda-Feira - 3º Semestre*'), value);
  }
  const nextMonday = classifySemesterScheduleRequest('segunda que vem 3º semestre', { now });
  assert.equal(nextMonday.iso, '2026-08-10');
});

test('pergunta de semestre ausente informa o dia e exemplos de resposta', async () => {
  assert.match(formatSemesterSchedulePrompt(2), /Terça-Feira/u);
  assert.match(formatSemesterSchedulePrompt(2), /`3º semestre`, `3 semestre` ou `terceiro semestre`/u);

  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const first = fakeMessage('qual matéria tem amanhã?');
    await engine.handle(first.message);
    assert.match(first.replies[0], /Terça-Feira/u);
    assert.match(first.replies[0], /Exemplo:/u);

    const second = fakeMessage('3');
    await engine.handle(second.message);
    assert.ok(second.replies[0].startsWith('*Aula de Terça-Feira - 3º Semestre*'));
    engine.close();
  } finally { holder.close(); }
});

test('comentários sobre aula normal não abrem a pergunta de semestre', async () => {
  const statements = [
    'aula normal hoje né?',
    'hoje é aula normal, só quinta que não teremos',
    'a semana toda (menos quinta) é aula normal para nós',
    'quinta não teremos aula'
  ];
  for (const value of statements) {
    assert.equal(classifySemesterScheduleRequest(value, { now: Date.UTC(2026, 7, 3, 15) }), null, value);
  }

  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    for (const value of statements) {
      const message = fakeMessage(value);
      await engine.handle(message.message);
      assert.equal(message.replies.length, 0, value);
    }
    engine.close();
  } finally { holder.close(); }
});
