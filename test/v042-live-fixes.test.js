const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { AdminServer } = require('../src/admin-server');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v042-')); }

test('instala mensagens de exemplo removíveis e totalmente editáveis', () => {
  const dir = tempDir(); const file = path.join(dir, 'db.sqlite'); const db = new Database(file);
  assert.equal(db.getStats().exampleCount, 3);
  assert.ok(db.listAutomaticMessages().every(item => item.is_example));
  const engine = new BotEngine(db);
  assert.equal(engine.simulate('professora exemplo', { ignorePermissions: true }).type, 'message');
  assert.equal(engine.simulate('prof exemplo', { ignorePermissions: true }).type, 'message');
  assert.equal(engine.simulate('link de teste', { ignorePermissions: true }).type, 'message');
  const removed = db.deleteExampleData(); assert.ok(removed.deleted_total >= 3); assert.equal(db.getStats().exampleCount, 0);
  db.close(); const reopened = new Database(file); assert.equal(reopened.getStats().exampleCount, 0);
  reopened.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('login fica visualmente isolado e informa o resultado', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'app.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.match(html, /id="app" class="app" hidden/);
  assert.match(html, /id="login-feedback"/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(app, /Senha correta/); assert.match(app, /Senha incorreta|error\.message/);
  for (const emoji of ['🏠', '💬', '🧮', '👥', '📈', '⚙️', '🧾']) assert.match(html, new RegExp(emoji));
});

test('rotas /login e /painel servem somente o shell protegido', async t => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'db.sqlite'));
  const whatsapp = { getStatus: () => ({ state: 'stopped' }) };
  const server = new AdminServer({
    config: { adminPassword: 'senha-teste-segura', sessionHours: 1, publicDir: path.join(__dirname, '..', 'public'), adminPort: 0, adminHost: '127.0.0.1' },
    database: db, whatsapp
  });
  await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.server.address().port}`;
  for (const route of ['/login', '/painel']) {
    const response = await fetch(base + route); assert.equal(response.status, 200); assert.match(await response.text(), /id="login-screen"/);
  }
  assert.equal((await fetch(base + '/api/status')).status, 401);
});

test('conexão usa Baileys por WebSocket e sincroniza grupos automaticamente', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'whatsapp.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['whatsapp-web.js'], undefined);
  assert.equal(pkg.dependencies['@whiskeysockets/baileys'], '7.0.0-rc13');
  assert.match(source, /connection\.update/);
  assert.match(source, /connection === 'open'/);
  assert.match(source, /messages\.upsert/);
  assert.match(source, /groupFetchAllParticipating/);
  assert.match(source, /groups\.upsert/);
  assert.match(source, /syncedGroupCount/);
  assert.doesNotMatch(source, /puppeteer|LocalAuth|runWatchdog/);
});
