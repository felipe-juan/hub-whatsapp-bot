const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');
const { createMessageAdapter } = require('../src/baileys-adapter');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'qrcode') return { toDataURL: async () => 'data:image/png;base64,TEST' };
  return originalLoad.call(this, request, parent, isMain);
};
const { WhatsAppManager } = require('../src/whatsapp');
Module._load = originalLoad;
const { AdminServer } = require('../src/admin-server');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v088-'));
  return { dir, file: path.join(dir, 'bot.sqlite') };
}

test('sentença exata e com conectivo opcional ativam a mesma regra', () => {
  const item = { trigger: { sentences: ['como passar cálculo'], keywords: [] } };
  assert.equal(evaluateTrigger('como passar cálculo', item).matched, true);
  assert.equal(evaluateTrigger('como passar cálculo?', item).matched, true);
  const flexible = evaluateTrigger('como passar em cálculo?', item);
  assert.equal(flexible.matched, true);
  assert.match(flexible.reasons.join(' '), /conectivo opcional/);
  assert.equal(evaluateTrigger('como reprovar em cálculo?', item).matched, false);
});

test('falha de GIF não elimina a resposta textual', async () => {
  const calls = [];
  const raw = { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }, message: { conversation: 'como passar cálculo' }, pushName: 'Teste' };
  const socket = { sendMessage: async (jid, content) => {
    calls.push(content);
    if (content.document) throw new Error('GIF não aceito');
    return { ok: true };
  } };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  const result = await adapter.sendResponse({
    text: 'Resposta principal',
    attachmentPath: '/tmp/teste.gif',
    attachment: { kind: 'image', mime_type: 'image/gif', file_name: 'teste.gif' }
  }, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].document);
  assert.equal(calls[1].text, 'Resposta principal');
  assert.equal(result.attachmentSent, false);
  assert.match(result.attachmentError, /GIF não aceito/);
});

test('mensagens do mesmo evento são processadas em paralelo', async () => {
  let active = 0;
  let peak = 0;
  const engine = { handle: async () => { active += 1; peak = Math.max(peak, active); await sleep(80); active -= 1; } };
  const db = { getSetting: (_key, fallback) => fallback, getSettings: () => ({ max_concurrent_sends: '8' }) };
  const manager = new WhatsAppManager({ config: {}, database: db, engine });
  const socket = {};
  manager.socket = socket;
  manager.generation = 1;
  const event = { type: 'notify', messages: [1,2,3].map(i => ({
    key: { id: `m${i}`, remoteJid: `551100000000${i}@s.whatsapp.net`, fromMe: false },
    messageTimestamp: Math.floor(Date.now()/1000),
    message: { conversation: `mensagem ${i}` }
  })) };
  const started = Date.now();
  await manager.handleMessages(socket, 1, event);
  const elapsed = Date.now() - started;
  assert.ok(peak >= 3, `pico esperado >=3, recebido ${peak}`);
  assert.ok(elapsed < 180, `processamento deveria ser concorrente, levou ${elapsed}ms`);
});

test('três envios podem ocorrer simultaneamente sem intervalo artificial', async () => {
  let active = 0;
  let peak = 0;
  const socket = { sendMessage: async () => { active += 1; peak = Math.max(peak, active); await sleep(80); active -= 1; return { ok: true }; } };
  const db = { getSettings: () => ({ max_concurrent_sends: '8' }) };
  const manager = new WhatsAppManager({ config: {}, database: db, engine: {} });
  manager.socket = socket;
  manager.status.state = 'ready';
  const started = Date.now();
  await Promise.all([
    manager.enqueueSend(socket, 'a@s.whatsapp.net', { text: '1' }),
    manager.enqueueSend(socket, 'b@s.whatsapp.net', { text: '2' }),
    manager.enqueueSend(socket, 'c@s.whatsapp.net', { text: '3' })
  ]);
  const elapsed = Date.now() - started;
  assert.equal(peak, 3);
  assert.ok(elapsed < 180, `envios deveriam ser simultâneos, levaram ${elapsed}ms`);
});

test('migração remove atraso e bloqueios preventivos antigos', () => {
  const { dir, file } = tempDb();
  let db = new Database(file, { seedBundledContent: false });
  db.close();
  const raw = new DatabaseSync(file);
  const set = raw.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  set.run('cooldown_seconds', '20');
  set.run('risk_guard_enabled', 'true');
  set.run('outbound_min_interval_ms', '1800');
  set.run('delivery_v088_migrated', 'false');
  raw.close();
  db = new Database(file, { seedBundledContent: false });
  const settings = db.getSettings();
  assert.equal(settings.cooldown_seconds, '0');
  assert.equal(settings.risk_guard_enabled, 'false');
  assert.equal(settings.outbound_min_interval_ms, '0');
  assert.equal(settings.max_concurrent_sends, '8');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('estado do painel reutiliza verificações pesadas por curto período', () => {
  let statsCalls = 0;
  let analyticsCalls = 0;
  let healthCalls = 0;
  const database = {
    initializeAdminPassword() {},
    getStats() { statsCalls += 1; return {}; },
    getUsageStats() { analyticsCalls += 1; return {}; },
    healthCheck() { healthCalls += 1; return { ok: true }; }
  };
  const server = new AdminServer({
    config: { adminPassword: 'x', sessionHours: 1, publicDir: process.cwd() },
    database,
    whatsapp: { getStatus: () => ({ state: 'ready' }) },
    engine: { getMetrics: () => ({}) }
  });
  server.statusPayload();
  server.statusPayload();
  assert.equal(statsCalls, 1);
  assert.equal(analyticsCalls, 1);
  assert.equal(healthCalls, 1);
  server.server.close();
});
