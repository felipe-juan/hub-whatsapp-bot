'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { hasScheduleIntent, isScheduleStatusConfirmation, classifySemesterScheduleRequest } = require('../src/semester-schedule');

function holder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0133-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true', contextual_followup_seconds: '300' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakePrivateMessage(body, sendId = 'bot-response') {
  const replies = [];
  return { replies, message: {
    fromMe: false, from: '5577888888888@s.whatsapp.net', author: '5577888888888@s.whatsapp.net',
    authorAliases: ['5577888888888@s.whatsapp.net'], body, timestampMs: Date.UTC(2026, 7, 3, 15),
    senderName: 'Pessoa', hasQuotedMessage: false, quotedFromMe: false, quotedMessageId: '', mentionedMe: false,
    async react() {},
    async reply(text) { replies.push(String(text)); return { key: { id: sendId } }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { key: { id: sendId } }; },
    async getChat() { return { isGroup: false, name: 'Conversa privada', id: { _serialized: this.from } }; }
  } };
}

test('confirmações de aula normal não são consultas ao quadro', () => {
  const variants = [
    'vai ter aula hoje normal',
    'vai ter aula normal hoje?',
    'hoje vai ter aula normal né?',
    'hoje tem aulas normais?',
    'a aula de amanhã vai ser normal?',
    'as aulas de sexta serão normais?'
  ];
  for (const value of variants) {
    assert.equal(isScheduleStatusConfirmation(value), true, value);
    assert.equal(hasScheduleIntent(value), false, value);
    assert.equal(classifySemesterScheduleRequest(value, { now: Date.UTC(2026, 7, 3, 15) }), null, value);
  }
});

test('perguntas abertas sobre o quadro continuam válidas mesmo usando normal', () => {
  const value = 'qual é o horário normal das aulas de hoje no 3º semestre?';
  assert.equal(isScheduleStatusConfirmation(value), false);
  assert.equal(hasScheduleIntent(value), true);
});

test('a exceção suprime o fallback privado e não consome pedido pendente de semestre', async () => {
  const h = holder();
  try {
    const engine = new BotEngine(h.db);
    const first = fakePrivateMessage('qual matéria tem hoje?', 'semester-prompt');
    await engine.handle(first.message);
    assert.match(first.replies[0], /Qual semestre/u);

    const confirmation = fakePrivateMessage('vai ter aula hoje normal');
    await engine.handle(confirmation.message);
    assert.deepEqual(confirmation.replies, []);

    const semester = fakePrivateMessage('5 semestre', 'semester-result');
    await engine.handle(semester.message);
    assert.equal(semester.replies.length, 1);
    assert.match(semester.replies[0], /5º Semestre/u);
    engine.close();
  } finally { h.close(); }
});

test('simulação explica que a confirmação em tempo real é indisponível', () => {
  const h = holder();
  try {
    const engine = new BotEngine(h.db);
    const result = engine.simulate('vai ter aula hoje normal?', { isGroup: true });
    assert.equal(result.matched, false);
    assert.equal(result.blockedBy, 'schedule-status-unverifiable');
    assert.equal(result.suppressPrivateFallback, true);
    engine.close();
  } finally { h.close(); }
});
