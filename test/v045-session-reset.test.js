const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'qrcode') return { toDataURL: async () => 'data:image/png;base64,TEST' };
  return originalLoad.call(this, request, parent, isMain);
};
const { WhatsAppManager } = require('../src/whatsapp');
Module._load = originalLoad;

test('remover sessão apaga credenciais e inicia automaticamente um novo cliente', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-wa-reset-'));
  const authDir = path.join(root, '.baileys_auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'creds.json'), '{"registered":true}');

  const manager = new WhatsAppManager({
    config: { authDir, legacyAuthDir: path.join(root, '.legacy') },
    database: { getSetting: () => 'true' },
    engine: {}
  });

  let closedWithLogout = false;
  let starts = 0;
  manager.closeSocket = async ({ logout } = {}) => { closedWithLogout = Boolean(logout); manager.socket = null; };
  manager.start = async () => {
    starts += 1;
    assert.equal(manager.manualStop, false);
    manager.update({ state: 'qr', message: 'Leia o novo QR code', qrDataUrl: 'data:image/png;base64,TEST' });
  };

  await manager.logout();

  assert.equal(closedWithLogout, true);
  assert.equal(starts, 1);
  assert.equal(manager.status.state, 'qr');
  assert.equal(manager.status.credentialsRegistered, false);
  assert.equal(fs.existsSync(path.join(authDir, 'creds.json')), false);
  assert.equal(fs.existsSync(authDir), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('interface informa que remover sessão também gera um novo QR', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /Remover a sessão e gerar um novo QR code/i);
  assert.match(source, /Sessão removida/i);
});
