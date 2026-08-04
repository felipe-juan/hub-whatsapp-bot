const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { createMessageAdapter, extractMentionedJids } = require('../src/baileys-adapter');

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v089-'));
  const db = new Database(path.join(dir, 'bot.sqlite'), { seedBundledContent: false });
  db.deleteExampleData();
  db.setSettings({ bot_name: 'HUB Bot', cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db };
}

function fakeMessage(body, { mentionedMe = false, isGroup = false } = {}) {
  const replies = [];
  const from = isGroup ? '120363000000000000@g.us' : '5577999999999@s.whatsapp.net';
  const message = {
    fromMe: false,
    from,
    author: isGroup ? '5577888888888@s.whatsapp.net' : from,
    body,
    mentionedMe,
    senderName: 'Pessoa Teste',
    async getChat() {
      return {
        isGroup,
        id: { _serialized: from },
        name: isGroup ? 'Grupo Teste' : 'Pessoa Teste',
        async sendMessage(text) { replies.push(String(text)); }
      };
    },
    async reply(text) { replies.push(String(text)); },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { ok: true }; }
  };
  return { message, replies };
}

test('a palavra bot em grupo não é tratada como menção', async t => {
  const { dir, db } = makeDb();
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const engine = new BotEngine(db);
  const { message, replies } = fakeMessage('Bot, você pode me ajudar com isso?', { isGroup: true });
  await engine.handle(message);
  assert.equal(replies.length, 0);
});

test('menção real por @ também ativa a orientação', async t => {
  const { dir, db } = makeDb();
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const engine = new BotEngine(db);
  const { message, replies } = fakeMessage('Você consegue ajudar?', { mentionedMe: true, isGroup: true });
  await engine.handle(message);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Não identifiquei nenhum comando/);
});

test('mensagem comum no privado recebe orientação mesmo sem menção', async t => {
  const { dir, db } = makeDb();
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const engine = new BotEngine(db);
  const { message, replies } = fakeMessage('alguém pode me ajudar com isso?');
  await engine.handle(message);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Não identifiquei nenhum comando/);
});

test('mensagem comum em grupo sem menção continua ignorada', async t => {
  const { dir, db } = makeDb();
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const engine = new BotEngine(db);
  const { message, replies } = fakeMessage('alguém pode me ajudar com isso?', { isGroup: true });
  await engine.handle(message);
  assert.equal(replies.length, 0);
});

test('gatilho válido tem prioridade mesmo quando a mensagem menciona o bot', async t => {
  const { dir, db } = makeDb();
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  db.saveAutomaticMessage({
    title: 'Contato Allan',
    response_text: 'RESPOSTA CONFIGURADA DO ALLAN',
    trigger: { sentences: ['contato do professor allan'], keywords: [] },
    active: true,
    scope: 'both'
  });
  const engine = new BotEngine(db);
  const { message, replies } = fakeMessage('Bot, qual o contato do professor Allan?');
  await engine.handle(message);
  assert.deepEqual(replies, ['RESPOSTA CONFIGURADA DO ALLAN']);
});

test('adaptador identifica menção real ao próprio JID', () => {
  const raw = {
    key: { remoteJid: '120363000000000000@g.us', participant: '5577888888888@s.whatsapp.net', fromMe: false },
    message: {
      extendedTextMessage: {
        text: '@HUB consegue ajudar?',
        contextInfo: { mentionedJid: ['5577991112222@s.whatsapp.net'] }
      }
    },
    pushName: 'Pessoa'
  };
  const socket = { user: { id: '5577991112222:12@s.whatsapp.net' }, sendMessage: async () => ({}) };
  assert.deepEqual(extractMentionedJids(raw.message), ['5577991112222@s.whatsapp.net']);
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  assert.equal(adapter.mentionedMe, true);
});
