const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Database } = require('../src/database');
const { DatabaseWriteQueue, databaseWriterError } = require('../src/database-write-queue');
const { AdminServer } = require('../src/admin-server');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'qrcode') return { toDataURL: async () => '' };
  return originalLoad.call(this, request, parent, isMain);
};
const { WhatsAppManager } = require('../src/whatsapp');
Module._load = originalLoad;
const { UpdateManager, REQUIRED_CHECKSUM_FILES, MAX_UPDATE_UNCOMPRESSED_BYTES } = require('../src/update-manager');
const { BackupManager } = require('../src/backup-manager');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');

function tempDir(prefix = 'hub-v093-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function cleanDb(dir) { const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: false }); db.deleteExampleData(); return db; }
function digest(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

function createUpdateTree(base, version = '1.1.0') {
  const installed = path.join(base, 'installed');
  const data = path.join(installed, 'data');
  const incoming = path.join(base, 'incoming');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(incoming, { recursive: true });
  fs.writeFileSync(path.join(installed, 'VERSION'), '1.0.0\n');
  for (const relative of REQUIRED_CHECKSUM_FILES) {
    const target = path.join(incoming, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (relative === 'package.json') fs.writeFileSync(target, JSON.stringify({ name: 'hub-whatsapp-bot', version }));
    else if (relative === 'VERSION') fs.writeFileSync(target, `${version}\n`);
    else fs.writeFileSync(target, `// ${relative}\n`);
  }
  const files = Object.fromEntries(REQUIRED_CHECKSUM_FILES.map(relative => [relative, digest(path.join(incoming, relative))]));
  const manifest = { product: 'hub-whatsapp-bot', version, minimum_updatable_version: '1.0.0', update_type: 'application-code', files };
  fs.writeFileSync(path.join(incoming, 'UPDATE_MANIFEST.json'), JSON.stringify(manifest));
  return { installed, data, incoming, manifest };
}

test('reserva de entrega é atômica e estado enviado não pode ser sobrescrito', () => {
  const dir = tempDir(); const db = cleanDb(dir);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'olá' } });
  const first = db.claimOutboundDelivery(delivery.id);
  const second = db.claimOutboundDelivery(delivery.id);
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(second.attempts, 1);
  const sent = db.markOutboundDelivered(delivery.id, 'WA-1', first.attempts);
  assert.equal(sent.transitioned, true);
  const staleRetry = db.markOutboundRetry(delivery.id, 'falha tardia', 500, first.attempts);
  const staleFailure = db.markOutboundFailed(delivery.id, 'falha tardia', first.attempts);
  assert.equal(staleRetry.transitioned, false);
  assert.equal(staleFailure.transitioned, false);
  assert.equal(db.getOutboundDelivery(delivery.id).state, 'sent');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('duas tentativas simultâneas de entrega geram somente um envio ao WhatsApp', async () => {
  const dir = tempDir(); const db = cleanDb(dir);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'uma vez' }, metadata: {} });
  let sends = 0;
  const socket = {};
  const manager = Object.create(WhatsAppManager.prototype);
  Object.assign(manager, {
    socket, status: { state: 'ready' }, db, writeQueue: null,
    circuitBreaker: { beforeRequest: () => ({ allowed: true }), recordSuccess() {}, recordFailure: () => ({}) },
    activeSendStarted: new Map(), activeSendCount: 0, lastSendProgressAt: 0,
    textSendLimiter: { schedule: async task => task() }, mediaSendLimiter: { schedule: async task => task() },
    engine: { performance: { increment() {}, observe() {} } },
    update() {}, scheduleOutboundDrain() {},
    sendWithTimeout: async () => { sends += 1; await new Promise(resolve => setTimeout(resolve, 20)); return { key: { id: 'WA-1' } }; }
  });
  const results = await Promise.all([
    manager.deliverPersistent(socket, delivery),
    manager.deliverPersistent(socket, delivery)
  ]);
  assert.equal(sends, 1);
  assert.equal(results.some(result => result.inFlight === true), true);
  assert.equal(db.getOutboundDelivery(delivery.id).state, 'sent');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('falha ao registrar o envio não transforma mensagem já enviada em retry', async () => {
  let retries = 0; let failures = 0; let sends = 0;
  const delivery = { id: 7, state: 'pending', attempts: 0, content: { jid: 'grupo@g.us', content: { text: 'enviada' }, metadata: {} } };
  const socket = {};
  const manager = Object.create(WhatsAppManager.prototype);
  Object.assign(manager, {
    socket, status: { state: 'ready' }, writeQueue: null,
    db: {
      claimOutboundDelivery: () => ({ ...delivery, state: 'sending', attempts: 1, claimed: true }),
      markOutboundDelivered: () => { throw new Error('SQLite indisponível'); },
      markOutboundRetry: () => { retries += 1; },
      markOutboundFailed: () => { failures += 1; },
      outboundDeliveryStats: () => ({ sending: 1 })
    },
    circuitBreaker: { beforeRequest: () => ({ allowed: true }), recordSuccess() {}, recordFailure: () => ({}) },
    activeSendStarted: new Map(), activeSendCount: 0, lastSendProgressAt: 0,
    textSendLimiter: { schedule: async task => task() }, mediaSendLimiter: { schedule: async task => task() },
    engine: { performance: { increment() {}, observe() {} } },
    update() {}, scheduleOutboundDrain() {},
    sendWithTimeout: async () => { sends += 1; return { key: { id: 'WA-OK' } }; }
  });
  const result = await manager.deliverPersistent(socket, delivery);
  assert.equal(sends, 1);
  assert.equal(retries, 0);
  assert.equal(failures, 0);
  assert.equal(result.persistenceWarning, true);
});

test('Admin Center não repete mutação quando o resultado do worker é desconhecido', async () => {
  let localCalls = 0;
  const server = Object.create(AdminServer.prototype);
  server.writeQueue = { callDatabase: async () => { throw databaseWriterError('DB_WRITER_OUTCOME_UNKNOWN', 'timeout'); } };
  server.db = { saveTeacher() { localCalls += 1; return {}; } };
  await assert.rejects(() => server.mutateDatabase('saveTeacher', [{}], { reloadRules: false }), error => error.code === 'DB_WRITER_OUTCOME_UNKNOWN');
  assert.equal(localCalls, 0);

  server.writeQueue = { callDatabase: async () => { throw databaseWriterError('DB_WRITER_UNAVAILABLE', 'indisponível'); } };
  server.statusParts = new Map(); server.publish = () => {};
  const result = await server.mutateDatabase('saveTeacher', [{}], { reloadRules: false });
  assert.deepEqual(result, {});
  assert.equal(localCalls, 1);
});

test('watchdog nível 3 força o ciclo completo de reinício', async () => {
  let restarts = 0;
  const manager = Object.create(WhatsAppManager.prototype);
  Object.assign(manager, {
    baileys: { loaded: true }, saveCreds() {}, update() {},
    async restart() { restarts += 1; }
  });
  await manager.recoverHealth(3, 'socket sem progresso');
  assert.equal(restarts, 1);
  assert.equal(manager.baileys, null);
  assert.equal(manager.saveCreds, null);
});

test('atualizador rejeita arquivos que não estejam declarados no manifesto', () => {
  const base = tempDir(); const { installed, data, incoming, manifest } = createUpdateTree(base);
  fs.writeFileSync(path.join(incoming, 'src', 'extra.js'), 'não declarado');
  const manager = new UpdateManager({ rootDir: installed, dataDir: data });
  assert.throws(() => manager.validateManifest(incoming, manifest), /não declarado/i);
  fs.rmSync(base, { recursive: true, force: true });
});

test('atualizador limita o tamanho total depois da descompactação', () => {
  const base = tempDir(); const installed = path.join(base, 'installed'); const data = path.join(installed, 'data');
  fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(installed, 'VERSION'), '1.0.0\n');
  const runner = (_command, args) => args.includes('-t')
    ? `1 file, ${MAX_UPDATE_UNCOMPRESSED_BYTES + 1} bytes uncompressed, 10 bytes compressed: 100%`
    : 'package/file.js\n';
  const manager = new UpdateManager({ rootDir: installed, dataDir: data, commandRunner: runner });
  assert.throws(() => manager.validateEntries('/tmp/falso.zip'), /limites de segurança/i);
  fs.rmSync(base, { recursive: true, force: true });
});

test('cookie malformado não derruba a autenticação do painel', async t => {
  const publicDir = tempDir(); fs.writeFileSync(path.join(publicDir, 'index.html'), '<html></html>');
  const database = { initializeAdminPassword() {}, getSettings: () => ({}), verifyAdminPassword: () => false };
  const whatsapp = { getStatus: () => ({ state: 'stopped' }) };
  const admin = new AdminServer({ config: { adminPassword: 'x', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database, whatsapp });
  await admin.start(); t.after(async () => { await admin.stop(); fs.rmSync(publicDir, { recursive: true, force: true }); });
  const { port } = admin.server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/status`, { headers: { cookie: 'quebrado; hub_admin=%E0%A4%A' } });
  assert.equal(response.status, 401);
});


test('backup completo usa snapshot SQLite consistente com os dados mais recentes', async () => {
  const base = tempDir(); const db = cleanDb(base);
  db.db.exec('PRAGMA wal_autocheckpoint=0');
  const saved = db.saveAutomaticMessage({ title: 'Dado no WAL', response_text: 'presente', active: true, trigger: { sentences: ['dado no wal'] } });
  const backupDir = path.join(base, 'backups');
  const manager = new BackupManager({ database: db, backupDir, dataDir: base, rootDir: base, autoSchedule: false });
  const file = await manager.createFullZip();
  const extracted = path.join(base, 'extraido'); fs.mkdirSync(extracted);
  execFileSync('unzip', ['-q', file.path, '-d', extracted]);
  const snapshot = new DatabaseSync(path.join(extracted, 'hub-bot.sqlite'), { readOnly: true });
  const row = snapshot.prepare('SELECT title FROM automatic_messages WHERE id=?').get(saved.id);
  assert.equal(row.title, 'Dado no WAL');
  snapshot.close(); manager.stop(); db.close(); fs.rmSync(base, { recursive: true, force: true });
});

test('atualizador rejeita links simbólicos antes da extração', () => {
  const base = tempDir(); const packageDir = path.join(base, 'package'); fs.mkdirSync(packageDir);
  fs.symlinkSync('/tmp', path.join(packageDir, 'link'));
  const zipPath = path.join(base, 'symlink.zip');
  execFileSync('zip', ['-qry', '-y', zipPath, 'package'], { cwd: base });
  const installed = path.join(base, 'installed'); const data = path.join(installed, 'data');
  fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(installed, 'VERSION'), '1.0.0\n');
  const manager = new UpdateManager({ rootDir: installed, dataDir: data });
  assert.throws(() => manager.validateEntries(zipPath), /link simbólico|arquivo especial/i);
  fs.rmSync(base, { recursive: true, force: true });
});
