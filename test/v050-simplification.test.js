const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { AdminServer } = require('../src/admin-server');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v050-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

test('painel usa uma única área de mensagens em vez de professores, links e FAQs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = readAdminJs(path.join(__dirname, '..'));
  assert.match(html, /data-view="messages"/);
  assert.doesNotMatch(html, /data-view="(?:teachers|links|faqs|automation|synonyms)"/);
  assert.match(app, /Resposta completa do bot/);
  assert.match(app, /Resposta completa do bot — curta por padrão/);
  assert.match(app, /Mais detalhes — opcional/);
  assert.match(app, /Salvar mensagem/);
  assert.doesNotMatch(app, /Salvar rascunho/);
});

test('salvar pela API publica imediatamente a resposta completa', async t => {
  const dir = tempDir();
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir); fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>ok</h1>');
  const database = new Database(path.join(dir, 'test.sqlite')); database.deleteExampleData();
  const whatsapp = { getStatus: () => ({ state: 'stopped' }), syncGroups: async () => 0, restart: async () => {}, logout: async () => {} };
  const admin = new AdminServer({ config: { adminPassword: 'segredo', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database, whatsapp });
  await new Promise(resolve => admin.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { admin.server.close(); database.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${admin.server.address().port}`;
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segredo' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const responseText = '📌 Texto exatamente administrado\nhttps://example.com/teste';
  const saved = await fetch(`${base}/api/messages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Teste direto', response_text: responseText, trigger: { keywords: ['teste direto'] }, active: true }) });
  assert.equal(saved.status, 201);
  const item = await saved.json();
  assert.equal(item.published, true);
  assert.equal(item.has_draft, false);
  assert.equal(item.response_text, responseText);
  assert.equal(database.listAutomaticMessages({ activeOnly: true }).find(entry => entry.id === item.id).response_text, responseText);
});

test('grupo de sinônimos usado por mensagem não pode ser apagado acidentalmente', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'test.sqlite')); db.deleteExampleData();
  const group = db.saveSynonymGroup({ name: 'contato', terms: ['contato', 'email'], active: true });
  db.saveAutomaticMessage({ title: 'Contato', response_text: 'Resposta', trigger: { keywords: ['professora'], synonym_group_ids: [group.id] }, active: true });
  assert.throws(() => db.deleteSynonymGroup(group.id), /mensagem automática/);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
