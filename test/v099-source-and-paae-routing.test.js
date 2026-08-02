'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v099-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { db, dir };
}
function closeAll(engine, db, dir) {
  try { engine?.close(); } catch {}
  try { db?.close(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}
function mockMessage(body, replies, from = '5511999999999@s.whatsapp.net') {
  return {
    fromMe: false, from, author: from, body, senderName: 'Estudante',
    async getChat() { return { isGroup: false, id: { _serialized: from }, name: 'Estudante', async sendMessage(text) { replies.push(String(text)); } }; },
    async reply(text) { replies.push(String(text)); return { ok: true }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { ok: true }; }
  };
}

test('card response automatically includes structured source and verification date', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('Quanto tempo dura o curso de BSI?', replies));
    assert.equal(replies.length, 1);
    assert.match(replies[0], /🔎 \*Fonte:\* Página oficial do IFBA/);
    assert.match(replies[0], /sistemas-de-informacao/);
    assert.match(replies[0], /🗓️ \*Verificada em:\* 01\/08\/2026/);
  } finally { closeAll(engine, db, dir); }
});

test('structured sector response also includes source in the same message', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('contato caens', replies));
    assert.equal(replies.length, 1);
    assert.match(replies[0], /caens\.vdc@ifba\.edu\.br/i);
    assert.match(replies[0], /🔎 \*Fonte:\* Página oficial do IFBA/);
    assert.match(replies[0], /coordenacao-de-apoio-ao-ensino-caens/);
  } finally { closeAll(engine, db, dir); }
});

test('source link is not duplicated when already visible in the card response', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('Onde encontro os editais do PAAE?', replies));
    const url = 'https://portal.ifba.edu.br/conquista/ensino/servico-social-1';
    assert.equal(replies[0].split(url).length - 1, 1);
    assert.match(replies[0], /Link oficial informado na resposta acima/);
    assert.match(replies[0], /Verificada em:\* 01\/08\/2026/);
  } finally { closeAll(engine, db, dir); }
});

test('PAAE edital request is routed to the edital card, not sector location', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const result = engine.simulate('Onde encontro os editais do PAAE?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.type, 'message');
    assert.equal(result.matchedItem, 'PAAE — Editais atuais');
    assert.match(result.text, /Editais do PAAE/);
    assert.doesNotMatch(result.text, /Não há localização confirmada/);
  } finally { closeAll(engine, db, dir); }
});

test('physical location requests for PAAE still use the sector directory', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const result = engine.simulate('Onde fica o Serviço Social?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.type, 'sector');
    assert.match(result.text, /Serviço Social/);
  } finally { closeAll(engine, db, dir); }
});

test('explicit source follow-up is not decorated twice', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('contato caens', replies));
    await engine.handle(mockMessage('qual a fonte?', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[1], /Página oficial do IFBA/);
    assert.equal((replies[1].match(/coordenacao-de-apoio-ao-ensino-caens/g) || []).length, 1);
    assert.equal((replies[1].match(/🔎 \*Fonte:/g) || []).length, 0);
  } finally { closeAll(engine, db, dir); }
});
