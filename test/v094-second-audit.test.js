const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync, fork } = require('node:child_process');
const Module = require('node:module');

const { Database } = require('../src/database');
const { CoreIpcServer, CoreIpcClient, MAX_IPC_FRAME_BYTES } = require('../src/unix-ipc');
const { UpdateManager } = require('../src/update-manager');
const { AdminServer, streamFile } = require('../src/admin-server');
const { RecentMessageTracker } = require('../src/message-tracker');
const { AttachmentManager } = require('../src/attachment-manager');
const { copyRegularTree } = require('../src/backup-manager');
const { readAdminJs } = require('./helpers/admin-assets');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'qrcode') return { toDataURL: async () => '' };
  return originalLoad.call(this, request, parent, isMain);
};
const { WhatsAppManager } = require('../src/whatsapp');
Module._load = originalLoad;

function tempDir(prefix = 'hub-v094-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function cleanDb(dir) { const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: false }); db.deleteExampleData(); return db; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function executable(filePath, content) { fs.writeFileSync(filePath, `#!/bin/sh\n${content}\n`, { mode: 0o700 }); }

function deliveryManager(db, socket) {
  const manager = Object.create(WhatsAppManager.prototype);
  Object.assign(manager, {
    socket, status: { state: 'ready' }, db, writeQueue: null,
    circuitBreaker: { beforeRequest: () => ({ allowed: true }), recordSuccess() {}, recordFailure: () => ({}) },
    activeSendStarted: new Map(), activeSendCount: 0, lastSendProgressAt: 0,
    textSendLimiter: { schedule: async task => task() }, mediaSendLimiter: { schedule: async task => task() },
    engine: { performance: { increment() {}, observe() {} } },
    update() {}, scheduleOutboundDrain() {}, consecutiveSendErrors: 0, outboundPausedUntil: 0, pendingLateSends: new Map()
  });
  return manager;
}

test('timeout de envio não reenvia automaticamente e confirmação tardia reconcilia para sent', async () => {
  const dir = tempDir(); const db = cleanDb(dir);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'uma única vez' }, metadata: {} });
  let sends = 0;
  const socket = { sendMessage: async () => { sends += 1; await delay(30); return { key: { id: 'WA-TARDIO' } }; } };
  const manager = deliveryManager(db, socket);
  manager.sendWithTimeout = (...args) => WhatsAppManager.prototype.sendWithTimeout.call(manager, ...args, 5);

  await assert.rejects(() => manager.deliverPersistent(socket, delivery), error => error.code === 'WA_SEND_TIMEOUT' && error.outcomeUnknown === true);
  assert.equal(sends, 1);
  assert.equal(db.getOutboundDelivery(delivery.id).state, 'uncertain');
  assert.equal(db.listDueOutboundDeliveries().length, 0);
  assert.equal(manager.hasPendingLateSend(delivery.id), true);
  await delay(60);
  const reconciled = db.getOutboundDelivery(delivery.id);
  assert.equal(reconciled.state, 'sent');
  assert.equal(reconciled.whatsapp_message_id, 'WA-TARDIO');
  assert.equal(manager.hasPendingLateSend(delivery.id), false);
  assert.equal(sends, 1);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});



test('envio confirmado é reconciliado automaticamente após falha transitória do SQLite', async () => {
  const dir = tempDir(); const db = cleanDb(dir);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'confirmada' }, metadata: {} });
  const socket = {};
  const manager = deliveryManager(db, socket);
  manager.confirmedSendReconcileDelays = [0];
  let deliveredWrites = 0;
  manager.persistentWrite = async (_queueMethod, databaseMethod, args) => {
    if (databaseMethod === 'markOutboundDelivered' && ++deliveredWrites === 1) throw new Error('SQLite temporariamente ocupado');
    return db[databaseMethod](...args);
  };
  manager.sendWithTimeout = async () => ({ key: { id: 'WA-CONFIRMADA' } });
  const result = await manager.deliverPersistent(socket, delivery);
  assert.equal(result.persistenceWarning, true);
  await delay(10);
  const stored = db.getOutboundDelivery(delivery.id);
  assert.equal(stored.state, 'sent');
  assert.equal(stored.whatsapp_message_id, 'WA-CONFIRMADA');
  assert.equal(manager.hasPendingLateSend(delivery.id), false);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('token de reserva recupera claim cujo resultado do worker ficou desconhecido', async () => {
  const dir = tempDir(); const db = cleanDb(dir);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'não perder' }, metadata: {} });
  let sends = 0;
  const socket = {};
  const manager = deliveryManager(db, socket);
  manager.writeQueue = {
    async claimOutbound(id, claimToken) {
      db.claimOutboundDelivery(id, claimToken);
      const error = new Error('resposta do worker perdida');
      error.code = 'DB_WRITER_OUTCOME_UNKNOWN';
      throw error;
    },
    async markOutboundDelivered(id, whatsappId, expectedAttempt) { return db.markOutboundDelivered(id, whatsappId, expectedAttempt); }
  };
  manager.sendWithTimeout = async () => { sends += 1; return { key: { id: 'WA-CLAIM' } }; };
  const result = await manager.deliverPersistent(socket, delivery);
  assert.equal(result.key.id, 'WA-CLAIM');
  assert.equal(sends, 1);
  assert.equal(db.getOutboundDelivery(delivery.id).state, 'sent');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('painel usa assets novos e oferece revisão explícita de entregas incertas', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const app = readAdminJs(root);
  assert.match(html, /app\.css\?v=0\.10\.0/);
  assert.match(html, /app\.js\?v=0\.10\.0/);
  assert.match(app, /\/api\/outbound\/uncertain/);
  assert.match(app, /Reenviar manualmente/);
  assert.match(app, /pendingLateSendCount/);
});

test('duas inicializações IPC não permitem que a perdedora remova o socket ativo', async () => {
  const dir = tempDir(); const socketPath = path.join(dir, 'core.sock');
  const first = new CoreIpcServer({ socketPath, handlers: { ping: async () => ({ pong: true }) } });
  const second = new CoreIpcServer({ socketPath, handlers: { ping: async () => ({ pong: false }) } });
  const starts = await Promise.allSettled([first.start(), second.start()]);
  assert.equal(starts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(starts.filter(item => item.status === 'rejected').length, 1);
  const winner = starts[0].status === 'fulfilled' ? first : second;
  const loser = winner === first ? second : first;
  await loser.close();
  assert.equal(fs.lstatSync(socketPath).isSocket(), true);
  const client = new CoreIpcClient({ socketPath, reconnectMs: 20 });
  await delay(30);
  assert.deepEqual(await client.request('ping', {}, 1000), { pong: winner === first });
  client.close(); await winner.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('IPC encerra resposta acima do limite sem acumular memória indefinidamente', async () => {
  const dir = tempDir(); const socketPath = path.join(dir, 'core.sock');
  const server = new CoreIpcServer({ socketPath, handlers: { huge: async () => 'x'.repeat(MAX_IPC_FRAME_BYTES + 1) } });
  await server.start();
  const client = new CoreIpcClient({ socketPath, reconnectMs: 1000 });
  await delay(25);
  await assert.rejects(() => client.request('huge', {}, 1000), /encerrada|enviar|limite/i);
  client.close(); await server.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('rollback antes do backup não apaga a instalação existente', () => {
  const base = tempDir(); const root = path.join(base, 'root'); const data = path.join(root, 'data'); const workspace = path.join(data, 'workspace'); const source = path.join(workspace, 'source');
  fs.mkdirSync(source, { recursive: true }); fs.writeFileSync(path.join(root, 'VERSION'), '1.0.0\n'); fs.writeFileSync(path.join(root, 'preservar.txt'), 'intacto');
  const bin = path.join(base, 'bin'); fs.mkdirSync(bin);
  executable(path.join(bin, 'systemctl'), 'case "$*" in *" stop "*) exit 1;; *) exit 0;; esac');
  executable(path.join(bin, 'sleep'), 'exit 0');
  const manager = new UpdateManager({ rootDir: root, dataDir: data });
  const script = manager.createApplyScript(source, '1.1.0', workspace);
  const result = spawnSync('/bin/bash', [script], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'preservar.txt'), 'utf8'), 'intacto');
  fs.rmSync(base, { recursive: true, force: true });
});

test('rollback restaura código e node_modules antigos sem depender novamente do npm', () => {
  const base = tempDir(); const root = path.join(base, 'root'); const data = path.join(root, 'data'); const workspace = path.join(data, 'workspace'); const source = path.join(workspace, 'source');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true }); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(root, 'VERSION'), '1.0.0\n'); fs.writeFileSync(path.join(root, 'package.json'), '{}'); fs.writeFileSync(path.join(root, 'codigo-antigo.txt'), 'antigo');
  fs.writeFileSync(path.join(root, 'node_modules', 'dependencia-antiga.txt'), 'funcional');
  fs.writeFileSync(path.join(source, 'VERSION'), '1.1.0\n'); fs.writeFileSync(path.join(source, 'package.json'), '{}'); fs.writeFileSync(path.join(source, 'codigo-novo.txt'), 'novo');
  const bin = path.join(base, 'bin'); fs.mkdirSync(bin);
  executable(path.join(bin, 'systemctl'), 'exit 0'); executable(path.join(bin, 'sleep'), 'exit 0'); executable(path.join(bin, 'npm'), 'exit 42');
  const manager = new UpdateManager({ rootDir: root, dataDir: data });
  const script = manager.createApplyScript(source, '1.1.0', workspace);
  const result = spawnSync('/bin/bash', [script], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), '1.0.0');
  assert.equal(fs.readFileSync(path.join(root, 'codigo-antigo.txt'), 'utf8'), 'antigo');
  assert.equal(fs.existsSync(path.join(root, 'codigo-novo.txt')), false);
  assert.equal(fs.readFileSync(path.join(root, 'node_modules', 'dependencia-antiga.txt'), 'utf8'), 'funcional');
  fs.rmSync(base, { recursive: true, force: true });
});

test('download de arquivo desaparecido ou symlink retorna erro controlado', async t => {
  const dir = tempDir(); const secret = path.join(dir, 'secret.txt'); const link = path.join(dir, 'link.txt'); fs.writeFileSync(secret, 'segredo'); fs.symlinkSync(secret, link);
  const server = http.createServer(async (_req, res) => {
    try { await streamFile(res, link); }
    catch (error) { res.writeHead(error.statusCode || 500); res.end('indisponível'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 404);
});

test('cache de anexos não aceita troca posterior do arquivo por link simbólico', async () => {
  const dir = tempDir(); const manager = new AttachmentManager({ dir });
  const saved = await manager.save(Buffer.from('conteúdo'), { fileName: 'arquivo.txt', mimeType: 'text/plain' });
  const firstPath = await manager.resolve(saved); assert.ok(firstPath);
  const secret = path.join(dir, 'fora.txt'); fs.writeFileSync(secret, 'segredo'); fs.rmSync(firstPath); fs.symlinkSync(secret, firstPath);
  assert.equal(await manager.resolve(saved), null);
  fs.rmSync(dir, { recursive: true, force: true });
});


test('armazenamento por hash rejeita e repara arquivo corrompido do mesmo tamanho', async () => {
  const dir = tempDir(); const manager = new AttachmentManager({ dir });
  const original = Buffer.from('AAAA');
  const saved = await manager.save(original, { fileName: 'arquivo.txt', mimeType: 'text/plain' });
  const storedPath = path.join(dir, saved.stored_name);
  fs.writeFileSync(storedPath, Buffer.from('BBBB'));
  assert.equal(await manager.resolve(saved), null);
  const repaired = await manager.save(original, { fileName: 'arquivo.txt', mimeType: 'text/plain' });
  assert.equal(repaired.stored_name, saved.stored_name);
  assert.equal(fs.readFileSync(storedPath, 'utf8'), 'AAAA');
  assert.equal(await manager.resolve(repaired), storedPath);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('backup copia somente arquivos regulares e ignora links simbólicos', async () => {
  const dir = tempDir(); const source = path.join(dir, 'source'); const destination = path.join(dir, 'dest');
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'normal.txt'), 'ok'); fs.symlinkSync('/etc/passwd', path.join(source, 'externo.txt'));
  await copyRegularTree(source, destination);
  assert.equal(fs.readFileSync(path.join(destination, 'normal.txt'), 'utf8'), 'ok');
  assert.equal(fs.existsSync(path.join(destination, 'externo.txt')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rastreador distingue IDs idênticos de conversas diferentes', () => {
  const tracker = new RecentMessageTracker();
  tracker.remember({ key: { id: 'MESMO-ID', remoteJid: 'grupo-1@g.us' }, message: { conversation: 'um' } });
  tracker.remember({ key: { id: 'MESMO-ID', remoteJid: 'grupo-2@g.us' }, message: { conversation: 'dois' } });
  assert.deepEqual(tracker.getMessage({ id: 'MESMO-ID', remoteJid: 'grupo-1@g.us' }), { conversation: 'um' });
  assert.deepEqual(tracker.getMessage({ id: 'MESMO-ID', remoteJid: 'grupo-2@g.us' }), { conversation: 'dois' });
  assert.equal(tracker.getMessage('MESMO-ID'), undefined);
});




test('exclusividade IPC é adquirida antes de abrir SQLite e criar workers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const lock = source.indexOf('await ipcServer.start()');
  const database = source.indexOf('new Database(config.dbPath)');
  const writer = source.indexOf('new DatabaseWriteQueue');
  const whatsapp = source.indexOf('new WhatsAppManager');
  assert.ok(lock >= 0 && lock < database && lock < writer && lock < whatsapp);
});

test('worker SQLite encerra quando o processo-pai perde o canal IPC', async () => {
  const dir = tempDir(); const dbPath = path.join(dir, 'worker.sqlite');
  const child = fork(path.join(__dirname, '..', 'src', 'database-write-worker.js'), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, HUB_DB_PATH: dbPath, HUB_DB_WRITER: '1', HUB_SKIP_BUNDLED_CONTENT: '1' }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker não iniciou')), 2000);
    child.once('spawn', () => { clearTimeout(timer); resolve(); });
    child.once('error', reject);
  });
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} reject(new Error('worker ficou órfão')); }, 2500);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  child.disconnect();
  assert.equal(await exited, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('worker administrativo também declara encerramento ao perder o pai', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin-task-worker.js'), 'utf8');
  assert.match(source, /process\.once\('disconnect', shutdown\)/);
});

test('Host malformado não escapa do tratamento de erros nem derruba o painel', async () => {
  const admin = Object.create(AdminServer.prototype);
  admin.whatsapp = { getStatus: () => ({ state: 'ready' }) };
  admin.securityHeaders = AdminServer.prototype.securityHeaders;
  const response = {
    headers: {}, status: 0, body: '', headersSent: false, destroyed: false, writableEnded: false,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; this.headersSent = true; Object.assign(this.headers, headers); },
    end(body = '') { this.body += body; this.writableEnded = true; },
    destroy() { this.destroyed = true; }
  };
  await admin.handle({ url: '/health', method: 'GET', headers: { host: '[' }, socket: { remoteAddress: '127.0.0.1' } }, response);
  assert.equal(response.status, 200);
  assert.match(response.body, /"ok":true/);
});

test('login ignora X-Forwarded-For não confiável e limita verificações simultâneas', async t => {
  const publicDir = tempDir(); fs.writeFileSync(path.join(publicDir, 'index.html'), '<html></html>');
  let verifications = 0;
  const database = {
    initializeAdminPassword() {}, getSettings: () => ({ login_max_attempts: 5, login_lock_minutes: 15 }),
    async verifyAdminPasswordAsync() { verifications += 1; await delay(80); return false; }
  };
  const admin = new AdminServer({ config: { adminPassword: 'x', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database, whatsapp: { getStatus: () => ({ state: 'stopped' }) } });
  await admin.start(); t.after(async () => { await admin.stop(); fs.rmSync(publicDir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${admin.server.address().port}/api/login`;
  const first = fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' }, body: JSON.stringify({ password: 'errada' }) });
  await delay(10);
  const second = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' }, body: JSON.stringify({ password: 'errada' }) });
  assert.equal(second.status, 429);
  assert.equal((await first).status, 401);
  assert.equal(verifications, 1);
});

test('login limita tamanho da senha antes do scrypt e limita clientes rastreados', async t => {
  const publicDir = tempDir(); fs.writeFileSync(path.join(publicDir, 'index.html'), '<html></html>');
  let verifications = 0;
  const database = {
    initializeAdminPassword() {}, getSettings: () => ({ login_max_attempts: 5, login_lock_minutes: 15 }),
    async verifyAdminPasswordAsync() { verifications += 1; return false; }
  };
  const admin = new AdminServer({ config: { adminPassword: 'x', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database, whatsapp: { getStatus: () => ({ state: 'stopped' }) } });
  admin.maxTrackedLoginClients = 8;
  for (let index = 0; index < 20; index += 1) {
    admin.failedLogin({ socket: { remoteAddress: `10.0.0.${index}` } });
  }
  assert.ok(admin.loginAttempts.size <= 8);
  await admin.start(); t.after(async () => { await admin.stop(); fs.rmSync(publicDir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${admin.server.address().port}/api/login`;
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'x'.repeat(2000) }) });
  assert.equal(response.status, 400);
  assert.equal(verifications, 0);
});

test('instalador Fedora restaura código, configuração, dependências e serviço após falha do npm', () => {
  const base = tempDir(); const source = path.join(base, 'source'); const home = path.join(base, 'home'); const install = path.join(base, 'install'); const bin = path.join(base, 'bin');
  fs.mkdirSync(path.join(source, 'desktop', 'icons'), { recursive: true }); fs.mkdirSync(path.join(home, '.config', 'systemd', 'user'), { recursive: true }); fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true }); fs.mkdirSync(path.join(home, '.local', 'share', 'applications'), { recursive: true }); fs.mkdirSync(path.join(home, '.config', 'autostart'), { recursive: true }); fs.mkdirSync(path.join(install, 'node_modules'), { recursive: true }); fs.mkdirSync(path.join(install, 'data'), { recursive: true }); fs.mkdirSync(bin);
  fs.copyFileSync(path.join(__dirname, '..', 'install-fedora-gnome.sh'), path.join(source, 'install-fedora-gnome.sh'));
  fs.writeFileSync(path.join(source, 'VERSION'), 'new\n'); fs.writeFileSync(path.join(source, 'package.json'), '{}'); fs.writeFileSync(path.join(source, 'new.txt'), 'novo'); fs.writeFileSync(path.join(source, 'desktop', 'icons', 'hub-whatsapp-bot.svg'), '<svg/>');
  fs.writeFileSync(path.join(install, 'VERSION'), 'old\n'); fs.writeFileSync(path.join(install, 'package.json'), '{}'); fs.writeFileSync(path.join(install, 'old.txt'), 'antigo'); fs.writeFileSync(path.join(install, 'node_modules', 'olddep'), 'funcional'); fs.writeFileSync(path.join(install, '.env'), 'ADMIN_PASSWORD="old"\n');
  const serviceFile = path.join(home, '.config', 'systemd', 'user', 'hub-whatsapp-bot.service'); fs.writeFileSync(serviceFile, 'serviço-antigo\n');
  executable(path.join(bin, 'dnf'), 'exit 0'); executable(path.join(bin, 'sudo'), 'exit 0');
  executable(path.join(bin, 'node'), 'case "$1" in -p) echo 22.13.0;; -e) exit 0;; *) exit 0;; esac');
  executable(path.join(bin, 'npm'), 'exit 42');
  const systemctlLog = path.join(base, 'systemctl.log');
  executable(path.join(bin, 'systemctl'), `echo "$*" >> ${JSON.stringify(systemctlLog)}\ncase "$*" in *"show hub-whatsapp-bot.service"*) echo ${JSON.stringify(install)}; exit 0;; *"is-active --quiet hub-whatsapp-bot.service"*) exit 0;; *) exit 0;; esac`);
  const result = spawnSync('/bin/bash', [path.join(source, 'install-fedora-gnome.sh')], { env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin`, HUB_BOT_INSTALL_DIR: install }, encoding: 'utf8' });
  assert.equal(result.status, 42);
  assert.equal(fs.readFileSync(path.join(install, 'VERSION'), 'utf8').trim(), 'old');
  assert.equal(fs.readFileSync(path.join(install, 'old.txt'), 'utf8'), 'antigo');
  assert.equal(fs.existsSync(path.join(install, 'new.txt')), false);
  assert.equal(fs.readFileSync(path.join(install, 'node_modules', 'olddep'), 'utf8'), 'funcional');
  assert.equal(fs.readFileSync(path.join(install, '.env'), 'utf8'), 'ADMIN_PASSWORD="old"\n');
  assert.equal(fs.readFileSync(serviceFile, 'utf8'), 'serviço-antigo\n');
  assert.match(fs.readFileSync(systemctlLog, 'utf8'), /start hub-whatsapp-bot\.service/);
  fs.rmSync(base, { recursive: true, force: true });
});
