'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { classifyBotReaction } = require('../src/reactions');
const { implicitQuestionStructure } = require('../src/semantic-question');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0109-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakePrivateMessage(body) {
  const reactions = [];
  const replies = [];
  return {
    reactions,
    replies,
    message: {
      fromMe: false,
      from: '5577888888888@s.whatsapp.net',
      body,
      senderName: 'Pessoa',
      hasQuotedMessage: false,
      quotedFromMe: false,
      mentionedMe: false,
      async react(emoji) { reactions.push(emoji); },
      async reply(text) { replies.push(String(text)); },
      async sendResponse(payload) { replies.push(String(payload.text || '')); },
      async getChat() { return { isGroup: false, name: 'Conversa privada', id: { _serialized: this.from } }; }
    }
  };
}

test('perguntas sobre dias e matérias abrem o card completo da professora', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const variants = [
      'professora amanda da aula em quais dias e para quais matérias',
      'quais os dias de aula da prof amanda',
      'quais matérias a professora amanda dá',
      'em quais dias amanda dá aula'
    ];
    for (const value of variants) {
      const result = engine.simulate(value, { isGroup: true });
      assert.equal(result.type, 'message', value);
      assert.equal(result.matchedItem, 'Professor — Amanda Ferraz de Oliveira Passos', value);
      assert.match(result.text, /Amanda Ferraz de Oliveira Passos/u, value);
      assert.match(result.text, /Horários e salas/u, value);
      assert.match(result.text, /Gestão de Projetos/u, value);
    }
    engine.close();
  } finally { holder.close(); }
});

test('estrutura interrogativa docente pode aparecer depois do nome sem ponto de interrogação', () => {
  assert.equal(implicitQuestionStructure('professora amanda da aula em quais dias e para quais matérias'), true);
  assert.equal(implicitQuestionStructure('professora amanda dá aula normalmente na quarta'), false);
});

test('no privado, elogio e ofensa reagem sem reply ou menção', async () => {
  assert.deepEqual(
    classifyBotReaction({ body: 'vlw', hasQuotedMessage: false, quotedFromMe: false }, 'vlw', { isPrivate: true }),
    { kind: 'thanks', emoji: '❤️', reason: 'private-conversation' }
  );
  assert.deepEqual(
    classifyBotReaction({ body: 'vtnc', hasQuotedMessage: false, quotedFromMe: false }, 'vtnc', { isPrivate: true }),
    { kind: 'offense', emoji: '😔', reason: 'private-conversation' }
  );

  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const thanks = fakePrivateMessage('vlw');
    await engine.handle(thanks.message);
    assert.deepEqual(thanks.reactions, ['❤️']);
    assert.deepEqual(thanks.replies, []);

    const offense = fakePrivateMessage('burro');
    await engine.handle(offense.message);
    assert.deepEqual(offense.reactions, ['😔']);
    assert.deepEqual(offense.replies, []);
    engine.close();
  } finally { holder.close(); }
});

test('em grupo, mensagem solta continua sem reação', () => {
  assert.equal(classifyBotReaction({ body: 'vlw', hasQuotedMessage: false, quotedFromMe: false }, 'vlw', { isPrivate: false }), null);
  assert.equal(classifyBotReaction({ body: 'vtnc', hasQuotedMessage: false, quotedFromMe: false }, 'vtnc', { isPrivate: false }), null);
});

test('migração v0.10.9 atualiza gatilhos docentes já existentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0109-migration-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  let db = new Database(dbPath, { seedBundledContent: true });
  const card = db.listAutomaticMessages().find(item => item.title === 'Professor — Amanda Ferraz de Oliveira Passos');
  const oldTrigger = { ...card.trigger, sentences: ['contato amanda'] };
  db.db.prepare('UPDATE automatic_messages SET trigger_json=? WHERE id=?').run(JSON.stringify(oldTrigger), card.id);
  db.db.prepare("UPDATE settings SET value='false' WHERE key='content_v0109_professor_schedule_private_reactions'").run();
  db.close();

  db = new Database(dbPath, { seedBundledContent: true });
  const migrated = db.listAutomaticMessages().find(item => item.title === 'Professor — Amanda Ferraz de Oliveira Passos');
  assert.ok(migrated.trigger.sentences.includes('quais os dias de aula da prof amanda'));
  assert.equal(db.getSetting('content_v0109_professor_schedule_private_reactions'), 'true');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
