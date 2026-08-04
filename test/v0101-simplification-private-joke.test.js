'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0101-'));
  const db = new Database(path.join(dir, 'bot.sqlite'), { seedBundledContent: true });
  return { dir, db, engine: new BotEngine(db) };
}
function close(ctx) { try { ctx.engine.close(); } catch {} try { ctx.db.close(); } catch {} fs.rmSync(ctx.dir, { recursive: true, force: true }); }
function message(body, replies, isGroup = false) {
  const from = isGroup ? '120363000000000000@g.us' : '5577999999999@s.whatsapp.net';
  return { fromMe: false, from, author: isGroup ? '5577888888888@s.whatsapp.net' : from, body,
    async getChat() { return { isGroup, id: { _serialized: from }, name: isGroup ? 'Grupo' : 'Pessoa' }; },
    async reply(text) { replies.push(String(text)); return { ok: true }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { ok: true }; }
  };
}

test('card Como passar em Cálculo is seeded with specific triggers', () => {
  const ctx = setup();
  try {
    const card = ctx.db.listAutomaticMessages().find(item => item.title === 'Como Passar em Cálculo?');
    assert.ok(card);
    const matched = ctx.engine.evaluate('como eu faço para passar em cálculo', { isGroup: false });
    assert.equal(matched.matched, true);
    assert.equal(matched.matchedItem, 'Como Passar em Cálculo?');
    assert.match(matched.text, /Depende da sua religião/);
    const unrelated = ctx.engine.evaluate('como passar do tcc i para o tcc ii?', { isGroup: false });
    assert.notEqual(unrelated.matchedItem, 'Como Passar em Cálculo?');
  } finally { close(ctx); }
});

test('unknown private messages always receive the fallback, even with cooldown enabled', async () => {
  const ctx = setup(); const replies = [];
  try {
    ctx.db.setSettings({ cooldown_seconds: '120' });
    await ctx.engine.handle(message('mensagem sem comando', replies));
    await ctx.engine.handle(message('outra mensagem sem comando', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[0], /Não identifiquei nenhum comando/);
    assert.match(replies[1], /Não identifiquei nenhum comando/);
  } finally { close(ctx); }
});

test('editor removes tags and details, moves variables, and edits title in header', () => {
  const root = path.join(__dirname, '..');
  const cards = fs.readFileSync(path.join(root, 'public', 'js', 'cards.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(cards, /tag-filter|Etiquetas com #|data-bulk=\"add-tag\"|Mais detalhes — opcional/);
  assert.match(cards, /Configurações avançadas/);
  const advanced = cards.indexOf('Configurações avançadas');
  assert.ok(cards.indexOf('Variáveis:', advanced) > advanced);
  assert.match(app, /modal-title-input/);
  assert.match(cards, /editableTitle:\{value:e\.title/);
});
