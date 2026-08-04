const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { DiagnosticBus } = require('../src/diagnostics');
const { AttachmentManager, normalizeMime } = require('../src/attachment-manager');
const { createMessageAdapter } = require('../src/baileys-adapter');
const { RecentMessageTracker } = require('../src/message-tracker');
const { AdminServer } = require('../src/admin-server');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v060-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function cleanup(db, dir) { try { db?.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); }

function baseMessage(overrides = {}) {
  return {
    title: 'Calendário do Curso',
    scope: 'both',
    response_text: '📅 Resposta administrada',
    trigger: { match_mode: 'all', keywords: ['calendário', '?'] },
    active: true,
    ...overrides
  };
}

test('escopo por mensagem bloqueia ou libera grupos e conversas privadas', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'test.sqlite')); db.deleteExampleData();
  const groupItem = db.saveAutomaticMessage(baseMessage({ title: 'Grupo', scope: 'group', response_text: 'grupo' }));
  const privateItem = db.saveAutomaticMessage(baseMessage({ title: 'Privado', scope: 'private', response_text: 'privado', trigger: { match_mode: 'all', keywords: ['privado', '?'] } }));
  const engine = new BotEngine(db);

  assert.equal(engine.evaluate('calendário?', { isGroup: true }).matchedItem, 'Grupo');
  const blockedPrivate = engine.evaluate('calendário?', { isGroup: false });
  assert.equal(blockedPrivate.matched, false);
  assert.match(blockedPrivate.analysis.find(item => item.id === groupItem.id).blockedReasons.join(' '), /somente grupos/);
  assert.equal(engine.evaluate('privado?', { isGroup: false }).matchedItem, 'Privado');
  assert.equal(engine.evaluate('privado?', { isGroup: true }).matched, false);
  assert.ok(privateItem.id);
  cleanup(db, dir);
});

test('etiquetas antigas são descartadas em salvamento, duplicação e histórico', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'test.sqlite')); db.deleteExampleData();
  const original = db.saveAutomaticMessage(baseMessage({ tags: ['curso', 'datas'], topic: 'Calendário' }));
  assert.equal(original.topic, '');
  assert.deepEqual(original.tags, []);
  assert.equal(db.listAutomaticMessages({ search: 'datas' }).some(item => item.id === original.id), false);

  const copy = db.duplicateAutomaticMessage(original.id);
  assert.equal(copy.active, false);
  assert.equal(copy.scope, original.scope);
  assert.deepEqual(copy.tags, []);
  assert.match(copy.title, /^Cópia de /);

  db.saveAutomaticMessage(baseMessage({ response_text: '📅 Versão alterada', tags: ['alterada'] }), original.id);
  const history = db.listAutomaticMessageHistory(original.id);
  const old = history.find(entry => entry.snapshot.response_text === '📅 Resposta administrada');
  assert.ok(old, 'a versão anterior deve estar no histórico');
  const restored = db.restoreAutomaticMessageHistory(original.id, old.id);
  assert.equal(restored.response_text, '📅 Resposta administrada');
  assert.deepEqual(restored.tags, []);
  cleanup(db, dir);
});


test('backup preserva histórico de alterações e sinaliza que anexos binários são locais', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'a.sqlite')); db.deleteExampleData();
  const item = db.saveAutomaticMessage(baseMessage());
  db.saveAutomaticMessage(baseMessage({ response_text: 'segunda versão' }), item.id);
  const backup = db.exportData();
  assert.equal(backup.attachment_files_included, false);
  assert.ok(backup.automatic_message_history.some(entry => entry.message_id === item.id));
  db.close();

  const restored = new Database(path.join(dir, 'b.sqlite')); restored.deleteExampleData();
  restored.importData(backup);
  const restoredItem = restored.listAutomaticMessages().find(entry => entry.title === item.title);
  assert.ok(restoredItem);
  assert.ok(restored.listAutomaticMessageHistory(restoredItem.id).length >= 1);
  cleanup(restored, dir);
});

test('gerenciador de anexos aceita MIME genérico pela extensão e protege caminhos', async () => {
  const dir = tempDir(); const manager = new AttachmentManager({ dir });
  assert.equal(normalizeMime('arquivo.docx', 'application/octet-stream'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const attachment = await manager.save(Buffer.from('conteúdo de teste'), { fileName: '../arquivo.docx', mimeType: 'application/octet-stream' });
  assert.equal(attachment.file_name, 'arquivo.docx');
  assert.equal(attachment.kind, 'document');
  assert.equal(await fs.promises.readFile(await manager.resolve(attachment), 'utf8'), 'conteúdo de teste');
  assert.equal(await manager.resolve({ stored_name: '../segredo' }), null);
  await assert.rejects(() => manager.save(Buffer.from('x'), { fileName: 'malware.exe', mimeType: 'application/octet-stream' }), /não permitido/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('adaptador Baileys envia imagem, áudio e documento com o texto configurado', async () => {
  const sent = [];
  const socket = { async sendMessage(jid, content, options) { sent.push({ jid, content, options }); } };
  const raw = { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'A1' }, message: { conversation: 'teste' } };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });

  await adapter.sendResponse({ text: 'legenda', attachmentPath: '/tmp/a.png', attachment: { kind: 'image', mime_type: 'image/png', file_name: 'a.png' } }, true);
  assert.equal(sent[0].content.caption, 'legenda');
  assert.deepEqual(sent[0].options, { quoted: raw });
  assert.equal(sent[0].content.image.url, '/tmp/a.png');

  await adapter.sendResponse({ text: 'ouça', attachmentPath: '/tmp/a.mp3', attachment: { kind: 'audio', mime_type: 'audio/mpeg', file_name: 'a.mp3' } }, true);
  assert.equal(sent[1].content.caption, 'ouça');
  assert.equal(sent[1].content.document.url, '/tmp/a.mp3');

  await adapter.sendResponse({ text: 'documento', attachmentPath: '/tmp/a.pdf', attachment: { kind: 'document', mime_type: 'application/pdf', file_name: 'a.pdf' } }, true);
  assert.equal(sent[2].content.caption, 'documento');
  assert.equal(sent[2].content.document.url, '/tmp/a.pdf');
  assert.equal(sent[2].content.fileName, 'a.pdf');
});

test('diagnóstico registra uma decisão final por mensagem e explica todas as regras', async () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'test.sqlite')); db.deleteExampleData();
  db.setSettings({ cooldown_seconds: '0', log_matched_messages: 'false', diagnostic_enabled: 'true' });
  db.saveAutomaticMessage(baseMessage());
  db.saveAutomaticMessage(baseMessage({ title: 'Somente privado', scope: 'private', response_text: 'privado' }));
  const diagnostics = new DiagnosticBus({ maxEntries: 50 });
  const engine = new BotEngine(db, { diagnostics });
  const replies = [];
  const message = {
    fromMe: false, from: 'grupo@g.us', author: '5511@s.whatsapp.net', body: '.Qual é o calendário?',
    async getChat() { return { isGroup: true, id: { _serialized: 'grupo@g.us' }, name: 'Grupo teste' }; },
    async sendResponse(payload) { replies.push(payload); }
  };
  await engine.handle(message);
  assert.equal(replies.length, 1);
  const events = diagnostics.list();
  assert.equal(events.length, 1, 'não deve criar um evento provisório e outro final para a mesma mensagem');
  assert.equal(events[0].outcome, 'responded');
  assert.equal(events[0].matchedItem, 'Calendário do Curso');
  assert.ok(events[0].details.length >= 2);
  assert.ok(events[0].details.some(detail => detail.blockedReasons.some(reason => /somente privado/.test(reason))));
  cleanup(db, dir);
});

test('rastreador de mensagens deduplica eventos e limita o uso de memória', () => {
  let now = 1_000_000;
  const tracker = new RecentMessageTracker({ maxMessages: 100, maxSeen: 100, retentionMs: 60_000, now: () => now });
  const raw = { key: { remoteJid: 'grupo@g.us', participant: '5511@s.whatsapp.net', id: 'MSG1' }, message: { conversation: 'olá' } };
  assert.equal(tracker.has(raw), false);
  assert.equal(tracker.remember(raw), true);
  assert.equal(tracker.has(raw), true);
  assert.deepEqual(tracker.getMessage('MSG1'), raw.message);
  // O participante não altera a identidade: o mesmo ID no mesmo chat continua sendo a mesma mensagem.
  assert.equal(tracker.has({ ...raw, key: { ...raw.key, participant: 'outro@s.whatsapp.net' } }), true);
  for (let i = 2; i <= 180; i += 1) tracker.remember({ key: { remoteJid: 'grupo@g.us', id: `MSG${i}` }, message: { conversation: String(i) } });
  assert.ok(tracker.stats().cachedMessages <= 100);
  assert.ok(tracker.stats().seenMessages <= 100);
  now += 120_000;
  tracker.remember({ key: { remoteJid: 'grupo@g.us', id: 'NOVO' }, message: { conversation: 'novo' } });
  tracker.prune();
  assert.ok(tracker.stats().cachedMessages <= 100);
});


test('API administrativa oferece duplicação, histórico, anexo e diagnóstico protegidos por login', async t => {
  const dir = tempDir(); const publicDir = path.join(dir, 'public'); fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>painel</h1>');
  const db = new Database(path.join(dir, 'test.sqlite')); db.deleteExampleData();
  const item = db.saveAutomaticMessage(baseMessage());
  db.saveAutomaticMessage(baseMessage({ response_text: 'segunda versão' }), item.id);
  const diagnostics = new DiagnosticBus(); diagnostics.add({ outcome: 'ignored', message: 'teste', summary: 'sem regra' });
  const attachments = new AttachmentManager({ dir: path.join(dir, 'attachments') });
  const whatsapp = { getStatus: () => ({ state: 'stopped' }), syncGroups: async () => 0, restart: async () => {}, logout: async () => {} };
  const engine = new BotEngine(db, { diagnostics });
  const admin = new AdminServer({ config: { adminPassword: 'segredo', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database: db, whatsapp, engine, diagnostics, attachments });
  await new Promise(resolve => admin.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { admin.server.close(); cleanup(db, dir); });
  const base = `http://127.0.0.1:${admin.server.address().port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segredo' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const unauthorized = await fetch(`${base}/api/diagnostics`);
  assert.equal(unauthorized.status, 401);
  const diagnosticResponse = await fetch(`${base}/api/diagnostics`, { headers: { cookie } });
  assert.equal((await diagnosticResponse.json()).length, 1);

  const duplicate = await fetch(`${base}/api/messages/${item.id}/duplicate`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(duplicate.status, 201);
  assert.equal((await duplicate.json()).active, false);

  const upload = await fetch(`${base}/api/messages/${item.id}/attachment`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent('manual.pdf') }, body: Buffer.from('%PDF-test')
  });
  assert.equal(upload.status, 201);
  assert.equal((await upload.json()).attachment.mime_type, 'application/pdf');
  const download = await fetch(`${base}/api/messages/${item.id}/attachment/download`, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.equal(Buffer.from(await download.arrayBuffer()).toString(), '%PDF-test');

  const history = await fetch(`${base}/api/messages/${item.id}/history`, { headers: { cookie } });
  assert.ok((await history.json()).length >= 2);
});

test('painel expõe diagnóstico, escopo, anexos, duplicação e histórico sem etiquetas', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = readAdminJs(path.join(__dirname, '..'));
  assert.match(html, /data-view="diagnostics"/);
  assert.match(app, /Diagnóstico em tempo real/);
  assert.match(app, /Somente grupos/);
  assert.match(app, /Somente privado/);
  assert.match(app, /Anexo da mensagem/);
  assert.match(app, /duplicate-message/);
  assert.match(app, /Histórico de alterações/);
  assert.doesNotMatch(app, /Pasta(?:s)? de mensagens|folder-filter|name="folder"/);
  assert.doesNotMatch(app, /Etiquetas com #|tag-filter|data-bulk=\"add-tag\"/);
});
