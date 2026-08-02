const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { importAutomaticMessagesCsv } = require('../src/csv-import');
const { BackupManager } = require('../src/backup-manager');
function tempDir(prefix = 'hub-v050-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function clean(file) { const db = new Database(file); db.deleteExampleData(); return db; }

test('rascunho não altera mensagem publicada até publicação explícita', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite'));
  const live = db.saveAutomaticMessage({ title: 'Mensagem', response_text: 'Resposta antiga', trigger: { keywords: ['teste'] }, active: true });
  db.saveAutomaticMessageDraft({ title: 'Mensagem', response_text: 'Resposta nova', trigger: { keywords: ['teste novo'] }, active: true }, live.id);
  assert.equal(db.listAutomaticMessages({ activeOnly: true })[0].response_text, 'Resposta antiga');
  assert.equal(db.getAutomaticMessage(live.id).draft.response_text, 'Resposta nova');
  db.publishAutomaticMessage(live.id); assert.equal(db.listAutomaticMessages({ activeOnly: true })[0].response_text, 'Resposta nova');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('permissões por grupo bloqueiam mensagens e calculadoras individualmente', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite')); db.upsertGroup('grupo@g.us', 'Grupo');
  db.setGroupPermissions('grupo@g.us', { enabled: true, allow_messages: false, allow_help: true, allow_calculator: false });
  assert.equal(db.isFeatureAllowed('grupo@g.us', 'messages', 'all'), false); assert.equal(db.isFeatureAllowed('grupo@g.us', 'help', 'all'), true); assert.equal(db.isFeatureAllowed('grupo@g.us', 'calculator', 'selected'), false);
  db.setGroupPermissions('grupo@g.us', { enabled: false }); assert.equal(db.isFeatureAllowed('grupo@g.us', 'messages', 'selected'), false);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('simulador devolve exatamente a resposta completa cadastrada', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite'));
  db.saveAutomaticMessage({ title: 'Barema', topic: 'Acadêmico', response_text: '📌 Resposta manual\nhttps://example.org/barema', trigger: { keywords: ['barema'] }, active: true });
  const engine = new BotEngine(db); const result = engine.simulate('onde encontro o barema?', { ignorePermissions: true });
  assert.equal(result.matched, true); assert.equal(result.type, 'message'); assert.equal(result.text, '📌 Resposta manual\nhttps://example.org/barema'); assert.equal(engine.getMetrics().totalReplies, 0);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('simulador testa rascunho sem colocá-lo em produção', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite'));
  db.saveAutomaticMessageDraft({ title: 'Quebra', response_text: 'Resposta em rascunho', trigger: { keywords: ['quebra de requisito'] }, active: true });
  const engine = new BotEngine(db);
  assert.equal(engine.simulate('quebra de requisito', { ignorePermissions: true, includeDrafts: false }).matched, false);
  assert.equal(engine.simulate('quebra de requisito', { ignorePermissions: true, includeDrafts: true }).text, 'Resposta em rascunho');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('detecta conflitos entre mensagens automáticas', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite'));
  db.saveAutomaticMessage({ title: 'Matriz', response_text: 'A', trigger: { keywords: ['matriz curricular'] }, active: true });
  db.saveAutomaticMessage({ title: 'Fluxograma', response_text: 'B', trigger: { keywords: ['matriz curricular'] }, active: true });
  assert.ok(db.getConflictReport().conflicts.some(item => item.type === 'message-trigger'));
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('importa mensagens por CSV com resposta completa', () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite'));
  const csv = 'title,topic,keywords,response_text,priority,active,publish\nBarema,Acadêmico,"barema|horas complementares","Resposta completa",10,true,true\n';
  const report = importAutomaticMessagesCsv(db, csv); assert.equal(report.created, 1); assert.equal(report.published, 1); assert.equal(db.listAutomaticMessages({ activeOnly: true })[0].response_text, 'Resposta completa');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('respostas podem citar ou não a mensagem original', async () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite')); db.saveAutomaticMessage({ title: 'Teste', response_text: 'Resposta', trigger: { keywords: ['teste'] }, active: true }); db.setSettings({ cooldown_seconds: '0', log_matched_messages: 'false' });
  const engine = new BotEngine(db); let quoted = 0; let loose = 0; const chat = { isGroup: true, name: 'Grupo', id: { _serialized: 'grupo@g.us' }, sendMessage: async () => { loose += 1; } };
  const msg = () => ({ fromMe: false, from: 'grupo@g.us', body: 'teste?', getChat: async () => chat, reply: async () => { quoted += 1; } });
  await engine.handle(msg()); assert.equal(quoted, 1); db.setSettings({ quote_replies: 'false' }); await engine.handle(msg()); assert.equal(loose, 1);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('backup automático preserva versão publicada e rascunho', async () => {
  const dir = tempDir(); const db = clean(path.join(dir, 'db.sqlite')); const item = db.saveAutomaticMessage({ title: 'Teste', response_text: 'Publicado', trigger: { keywords: ['teste'] }, active: true }); db.saveAutomaticMessageDraft({ title: 'Teste', response_text: 'Rascunho', trigger: { keywords: ['teste novo'] }, active: true }, item.id);
  const manager = new BackupManager({ database: db, backupDir: path.join(dir, 'backups') }); await manager.run('test'); const payload = JSON.parse(fs.readFileSync(manager.list()[0].path)); const saved = payload.automatic_messages[0]; assert.equal(saved.response_text, 'Publicado'); assert.equal(saved.draft.response_text, 'Rascunho'); manager.stop(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
