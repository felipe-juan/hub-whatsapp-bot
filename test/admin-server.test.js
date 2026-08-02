const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { AdminServer } = require('../src/admin-server');

test('painel exige login e permite consultar status após autenticação', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-admin-'));
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<h1>ok</h1>');

  const database = new Database(path.join(dir, 'test.sqlite'));
  const whatsapp = {
    getStatus: () => ({ state: 'stopped' }),
    syncGroups: async () => 0,
    restart: async () => {},
    logout: async () => {}
  };
  const config = {
    adminPassword: 'segredo',
    sessionHours: 1,
    publicDir,
    adminPort: 0,
    adminHost: '127.0.0.1'
  };
  const admin = new AdminServer({ config, database, whatsapp });
  await new Promise(resolve => admin.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    admin.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = admin.server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const denied = await fetch(`${base}/api/status`);
  assert.equal(denied.status, 401);

  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'segredo' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const status = await fetch(`${base}/api/status`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const payload = await status.json();
  assert.equal(payload.whatsapp.state, 'stopped');
});
