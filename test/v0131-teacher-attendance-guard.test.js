'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0131-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakePrivateMessage(body) {
  const replies = [];
  return {
    replies,
    message: {
      fromMe: false,
      from: '5577888888888@s.whatsapp.net',
      body,
      timestampMs: Date.UTC(2026, 7, 3, 15),
      senderName: 'Pessoa',
      hasQuotedMessage: false,
      quotedFromMe: false,
      mentionedMe: false,
      async react() {},
      async reply(text) { replies.push(String(text)); },
      async sendResponse(payload) { replies.push(String(payload.text || '')); },
      async getChat() { return { isGroup: false, name: 'Conversa privada', id: { _serialized: this.from } }; }
    }
  };
}

test('confirmações sobre presença do professor ou realização real da aula são ignoradas', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const variants = [
      'hoje tem aula de Pablo?',
      'a professora Amanda vai dar aula hoje?',
      'vai ter aula com Alexandro amanhã?',
      'Pablo dá aula sexta?',
      'a aula de Amanda hoje está confirmada?',
      'Amanda vem hoje?'
    ];
    for (const value of variants) {
      const result = engine.simulate(value, { isGroup: true });
      assert.equal(result.matched, false, value);
      assert.equal(result.blockedBy, 'teacher-attendance-unverifiable', value);
      assert.equal(result.suppressPrivateFallback, true, value);
    }
    engine.close();
  } finally { holder.close(); }
});

test('consultas objetivas ao quadro continuam funcionando', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const professor = engine.simulate('quais dias Pablo dá aula?', { isGroup: true });
    assert.equal(professor.type, 'message');
    assert.equal(professor.matchedItem, 'Professor — Pablo Freire Matos');

    const room = engine.simulate('qual sala de Pablo?', { isGroup: true });
    assert.equal(room.type, 'message');
    assert.equal(room.matchedItem, 'Professor — Pablo Freire Matos');

    const semester = engine.simulate('quais aulas hoje no 3º semestre?', { isGroup: true });
    assert.equal(semester.type, 'semester_schedule');
    engine.close();
  } finally { holder.close(); }
});

test('no privado, confirmação não recebe nem o fallback de ajuda', async () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const request = fakePrivateMessage('hoje tem aula de Pablo?');
    await engine.handle(request.message);
    assert.deepEqual(request.replies, []);
    engine.close();
  } finally { holder.close(); }
});
