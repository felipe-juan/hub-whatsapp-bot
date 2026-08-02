'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { createMessageAdapter } = require('../src/baileys-adapter');
const { AdminServer } = require('../src/admin-server');
const { INSTITUTIONAL_CARDS_V098 } = require('../src/institutional-cards');
const { readAdminJs } = require('./helpers/admin-assets');

function temporaryDatabase(seedBundledContent = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v098-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent });
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

test('institutional cards have a single canonical source file', () => {
  assert.ok(INSTITUTIONAL_CARDS_V098.length >= 100);
  const titles = INSTITUTIONAL_CARDS_V098.map(item => item.message.title);
  assert.equal(new Set(titles).size, titles.length);
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'src', 'si-support-messages-v083.js'), 'utf8');
  const bsi = fs.readFileSync(path.join(__dirname, '..', 'src', 'ifba-bsi-cards-v095.js'), 'utf8');
  assert.match(legacy, /institutional-cards/);
  assert.match(bsi, /institutional-cards/);
  assert.doesNotMatch(legacy, /capne\.vdc@ifba\.edu\.br/);
  assert.doesNotMatch(bsi, /capne\.vdc@ifba\.edu\.br/);
});

test('structured sectors use safe direct phrases and final-question policy', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    let result = engine.evaluate('contato caens', { isGroup: false, ignorePermissions: true });
    assert.equal(result.type, 'sector'); assert.match(result.text, /caens\.vdc@ifba\.edu\.br/i);
    result = engine.evaluate('alguma coisa contato caens', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matched, false);
    result = engine.evaluate('você sabe o contato da caens?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.type, 'sector');
    result = engine.evaluate('você sabe o contato da caens', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matched, false);
  } finally { closeAll(engine, db, dir); }
});

test('short context resolves sector follow-up only inside the same conversation', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('contato da caens', replies));
    await engine.handle(mockMessage('e onde fica?', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[0], /caens\.vdc@ifba\.edu\.br/i);
    assert.match(replies[1], /Bloco do CVT/i);
    const other = [];
    await engine.handle(mockMessage('e onde fica?', other, '5522888888888@s.whatsapp.net'));
    assert.equal(other.length, 1);
    assert.match(other[0], /Não identifiquei nenhum comando/);
  } finally { closeAll(engine, db, dir); }
});

test('mais detalhes and fonte use the contextual TCC flow', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('onde encontro o regulamento de tcc de bsi?', replies));
    await engine.handle(mockMessage('mais detalhes', replies));
    await engine.handle(mockMessage('qual a fonte?', replies));
    assert.equal(replies.length, 3);
    assert.match(replies[0], /Envie \*mais detalhes\*/i);
    assert.match(replies[1], /Trabalho de Conclusão de Curso I/i);
    assert.match(replies[2], /Fonte da informação/i);
    assert.match(replies[2], /regulamento-trabalho-conclusao-curso\.pdf/i);
    assert.match(replies[2], /01\/08\/2026/);
  } finally { closeAll(engine, db, dir); }
});

test('guided flows support five options and resolve to the selected card', async () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db); const replies = [];
  try {
    await engine.handle(mockMessage('quero começar meu estágio', replies));
    assert.match(replies[0], /5\. Entregar relatório/);
    await engine.handle(mockMessage('5', replies));
    assert.match(replies[1], /Conclusão do estágio obrigatório/i);
  } finally { closeAll(engine, db, dir); }
});

test('sector records and card source fields survive JSON backup', () => {
  const first = temporaryDatabase(); const second = temporaryDatabase(false);
  try {
    const caens = first.db.listSectors().find(item => item.acronym === 'CAENS');
    first.db.saveSector({ ...caens, location: 'Local confirmado de teste' }, caens.id);
    second.db.importData(first.db.exportData());
    const restored = second.db.listSectors().find(item => item.acronym === 'CAENS');
    assert.equal(restored.location, 'Local confirmado de teste');
    const tcc = second.db.listAutomaticMessages().find(item => item.title === 'BSI — Regulamento de TCC');
    assert.ok(tcc.source_url); assert.ok(tcc.details_text); assert.equal(tcc.verified_at, '2026-08-01');
  } finally { closeAll(null, first.db, first.dir); closeAll(null, second.db, second.dir); }
});

test('attachment and text are sent in the same WhatsApp message', async () => {
  const calls = [];
  const socket = { user: { id: '5511000000000:1@s.whatsapp.net' }, async sendMessage(jid, content, options) { calls.push({ jid, content, options }); return { key: { id: String(calls.length) } }; } };
  const adapter = createMessageAdapter({ raw: { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'source' }, message: { conversation: 'oi' } }, socket, metadataCache: new Map() });
  const result = await adapter.sendResponse({ text: 'Veja o documento.', attachmentPath: '/tmp/a.pdf', attachment: { kind: 'document', mime_type: 'application/pdf', file_name: 'a.pdf' } }, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].content.caption, 'Veja o documento.');
  assert.deepEqual(calls[0].content.document, { url: '/tmp/a.pdf' });
  assert.equal(Boolean(calls[0].options?.quoted), true);
  assert.equal(result.combined, true);
});

test('media failure preserves text as an explicit fallback', async () => {
  const calls = [];
  const socket = { user: { id: '5511000000000:1@s.whatsapp.net' }, async sendMessage(jid, content) { calls.push(content); if (content.document) throw new Error('falha de mídia'); return { ok: true }; } };
  const adapter = createMessageAdapter({ raw: { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'source' }, message: { conversation: 'oi' } }, socket, metadataCache: new Map() });
  const result = await adapter.sendResponse({ text: 'Texto preservado.', attachmentPath: '/tmp/a.gif', attachment: { kind: 'document', mime_type: 'image/gif', file_name: 'a.gif' } }, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].text, 'Texto preservado.');
  assert.equal(result.attachmentSent, false);
  assert.equal(result.fallbackTextSent, true);
});

test('admin asset exposes sector editor and separated source fields', () => {
  const app = readAdminJs(path.join(__dirname, '..'));
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(app, /Cadastro de setores/);
  assert.doesNotMatch(app, /Mais detalhes — opcional/);
  assert.doesNotMatch(app, /Etiquetas com #/);
  assert.match(app, /editableTitle/);
  assert.match(app, /source_url/);
  assert.match(app, /verified_at/);
  assert.match(index, /app\.js\?v=0\.10\.1/);
  assert.match(index, /js\/sectors\.js\?v=0\.10\.1/);
});

test('institutional migration does not falsely verify administrator cards', () => {
  const { db, dir } = temporaryDatabase(false);
  try {
    const custom = db.saveAutomaticMessage({
      title: 'Card personalizado com fonte externa',
      response_text: 'Resposta criada pelo administrador.\n\n🔎 Fonte oficial: https://example.com/documento',
      trigger: { sentences: ['card personalizado'], require_question_mark: true },
      active: true
    });
    db.saveAutomaticMessageDraft({
      ...custom,
      response_text: 'Rascunho personalizado.\n\n🔎 Fonte oficial: https://example.com/rascunho',
      source_url: '', source_title: '', verified_at: ''
    }, custom.id);
    db.migrateInstitutionalCardsV098();
    const migrated = db.getAutomaticMessage(custom.id);
    assert.equal(migrated.source_url, 'https://example.com/documento');
    assert.equal(migrated.source_title, '');
    assert.equal(migrated.verified_at, '');
    assert.equal(migrated.draft.source_url, 'https://example.com/rascunho');
    assert.equal(migrated.draft.source_title, '');
    assert.equal(migrated.draft.verified_at, '');
  } finally { closeAll(null, db, dir); }
});


test('authenticated sector API creates and updates structured records', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v098-admin-'));
  const publicDir = path.join(dir, 'public'); fs.mkdirSync(publicDir); fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>ok</h1>');
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: false });
  const whatsapp = { getStatus: () => ({ state: 'stopped' }), syncGroups: async () => 0, restart: async () => {}, logout: async () => {} };
  const admin = new AdminServer({ config: { adminPassword: 'segredo', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database: db, whatsapp });
  await new Promise(resolve => admin.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { try { admin.server.close(); } catch {} try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${admin.server.address().port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segredo' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const createdResponse = await fetch(`${base}/api/sectors`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ acronym: 'TESTE', name: 'Setor de Teste', email: 'teste@ifba.edu.br', aliases: ['setor teste'], services: ['orientação de teste'], active: true }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.acronym, 'TESTE');
  const updatedResponse = await fetch(`${base}/api/sectors/${created.id}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...created, location: 'Sala T01' }) });
  assert.equal(updatedResponse.status, 200);
  const listed = await fetch(`${base}/api/sectors?q=teste`, { headers: { cookie } }).then(response => response.json());
  assert.equal(listed.length, 1); assert.equal(listed[0].location, 'Sala T01');
});
