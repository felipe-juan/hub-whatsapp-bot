const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { AtomicRuleStore, loadRuleSnapshotFile } = require('../src/rule-snapshot');
const { ConcurrencyLimiter } = require('../src/concurrency-limiter');
const { CircuitBreaker } = require('../src/circuit-breaker');
const { ConversationQueue } = require('../src/conversation-queue');
const { RecentMessageTracker } = require('../src/message-tracker');
const { RealtimeBus } = require('../src/realtime-bus');
const { PerformanceMetrics } = require('../src/performance-metrics');
const { createMessageAdapter } = require('../src/baileys-adapter');
const { readAdminJs } = require('./helpers/admin-assets');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v091-'));
  return { dir, file: path.join(dir, 'bot.sqlite'), snapshot: path.join(dir, 'rules.snapshot.json') };
}
function message(title, sentence, response = title) {
  return { title, response_text: response, active: true, scope: 'both', trigger: { sentences: [sentence], keywords: [], typo_tolerance: 0 } };
}

test('índice invertido reduz candidatos e mantém validação completa', () => {
  const { dir, file } = tempDb(); const db = new Database(file, { seedBundledContent: false });
  db.saveAutomaticMessage(message('CAENS', 'contato da caens'));
  db.saveAutomaticMessage(message('Allan', 'contato do allan'));
  db.saveAutomaticMessage(message('Fluxograma', 'onde está o fluxograma'));
  const store = new AtomicRuleStore(db);
  const analysis = store.evaluate('qual o contato da caens?', { isGroup: true });
  assert.equal(analysis.find(item => item.item.title === 'CAENS')?.matched, true);
  assert.ok(analysis.candidateStats.candidates < analysis.candidateStats.total);
  assert.ok(store.stats().indexTokenCount >= 3);
  store.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('contrapressão limita concorrência sem descartar tarefas', async () => {
  const limiter = new ConcurrencyLimiter({ maxConcurrent: 2 }); let active = 0; let peak = 0; const done = [];
  const tasks = Array.from({ length: 8 }, (_, index) => limiter.schedule(async () => { active++; peak = Math.max(peak, active); await sleep(15); done.push(index); active--; return index; }));
  const values = await Promise.all(tasks);
  assert.equal(peak, 2); assert.equal(values.length, 8); assert.equal(done.length, 8); assert.equal(limiter.stats().queued, 0);
});

test('circuit breaker abre após falhas e volta por half-open', () => {
  let now = 1000; const breaker = new CircuitBreaker({ failureThreshold: 2, baseCooldownMs: 100, now: () => now });
  breaker.recordFailure(new Error('1')); const opened = breaker.recordFailure(new Error('2'));
  assert.equal(opened.state, 'open'); assert.equal(breaker.beforeRequest().allowed, false);
  now += 1001; assert.equal(breaker.beforeRequest().allowed, true);
  breaker.recordSuccess(); assert.equal(breaker.stats().state, 'closed');
});

test('entrega idempotente reutiliza a mesma linha do SQLite', () => {
  const { dir, file } = tempDb(); const db = new Database(file, { seedBundledContent: false });
  const a = db.enqueueOutboundDelivery('chat', { jid: 'chat', content: { text: 'oi' } }, { idempotencyKey: 'same-key', priority: 100 });
  const b = db.enqueueOutboundDelivery('chat', { jid: 'chat', content: { text: 'oi' } }, { idempotencyKey: 'same-key', priority: 100 });
  assert.equal(a.id, b.id); assert.equal(db.outboundDeliveryStats().pending, 1);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('fila por conversa drena de forma controlada e limpa conversas inativas', async () => {
  const queue = new ConversationQueue(null, { maxConcurrent: 2, inactiveTtlMs: 60_000 });
  const order = [];
  queue.enqueue('A', async () => { await sleep(20); order.push('A1'); });
  queue.enqueue('A', async () => { order.push('A2'); });
  queue.enqueue('B', async () => { order.push('B1'); });
  queue.stopAccepting(); assert.equal(await queue.whenIdle(1000), true);
  assert.ok(order.indexOf('A1') < order.indexOf('A2')); assert.equal(queue.stats().queuedMessages, 0);
  queue.lastActivity.set('old', Date.now() - 120_000); queue.cleanupInactive(); assert.equal(queue.lastActivity.has('old'), false); queue.close();
});

test('estatísticas são gravadas em lote, statements ficam preparados e WAL é mantido', () => {
  const { dir, file } = tempDb(); const db = new Database(file, { seedBundledContent: false });
  assert.ok(db.prepared.insertOutbound); assert.ok(db.prepared.incrementUsage);
  db.setSettings({ usage_statistics_enabled: 'true' });
  const baseline = db.getUsageStats(1).total;
  for (let i = 0; i < 20; i++) db.recordUsage('teste', 'message');
  assert.ok(db.usageBuffer.size > 0); const flushed = db.flushUsageStats(); assert.ok(flushed >= 1);
  assert.equal(db.getUsageStats(1).total, baseline + 20);
  const wal = db.walStatus(); assert.ok(Number.isFinite(wal.estimatedBytes));
  const checkpoint = db.maybeCheckpoint({ force: true, idleMs: 0 }); assert.equal(Boolean(checkpoint.error), false);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('respostas estáticas são pré-renderizadas e snapshot acelera reinicialização', async () => {
  const { dir, file, snapshot } = tempDb(); const db = new Database(file, { seedBundledContent: false });
  db.saveAutomaticMessage(message('Estática', 'mensagem estática', 'texto pronto'));
  const store = new AtomicRuleStore(db, { snapshotPath: snapshot }); await store.persistCurrent();
  const entry = store.snapshot.compiledMessages.find(value => value.item.title === 'Estática'); assert.ok(entry); assert.equal(entry.responsePlan.static, true); assert.equal(entry.responsePlan.text, 'texto pronto');
  const disk = await loadRuleSnapshotFile(snapshot); assert.equal(disk.revision, db.ruleSourceRevision()); assert.ok(disk.source.messages.length);
  store.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('texto tem prioridade e anexos usam caminho sob demanda em vez de buffer', async () => {
  const sent = []; const raw = { key: { id: 'm1', remoteJid: 'chat@s.whatsapp.net' }, message: { conversation: 'x' } };
  const socket = { sendMessage: async (_jid, content) => { sent.push(content); return { key: { id: String(sent.length) } }; } };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  await adapter.sendResponse({ text: 'primeiro', attachmentPath: '/tmp/a.pdf', attachment: { kind: 'document', mime_type: 'application/pdf', file_name: 'a.pdf' } }, true);
  assert.equal(sent.length, 1); assert.equal(sent[0].caption, 'primeiro'); assert.equal(sent[0].document.url, '/tmp/a.pdf'); assert.equal(Buffer.isBuffer(sent[0].document), false);
});

test('paginação integral no servidor devolve cursor e não carrega todos os cartões', () => {
  const { dir, file } = tempDb(); const db = new Database(file, { seedBundledContent: false });
  const baseline = db.listAutomaticMessages().length;
  for (let i = 0; i < 75; i++) db.saveAutomaticMessage(message(`Mensagem ${i}`, `gatilho exclusivo ${i}`));
  const first = db.listAutomaticMessageSummaryPage({ limit: 30, status: 'all' });
  const second = db.listAutomaticMessageSummaryPage({ limit: 30, status: 'all', cursor: first.nextCursor });
  assert.equal(first.items.length, 30); assert.equal(first.total, baseline + 75); assert.ok(first.nextCursor); assert.equal(second.offset, 30);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('eventos em tempo real são agrupados em um único lote', async () => {
  const bus = new RealtimeBus({ batchWindowMs: 10 }); const events = []; bus.subscribe(event => events.push(event));
  bus.publish('whatsapp-status', { value: 1 }); bus.publish('database-change', { value: 2 }); bus.publish('whatsapp-status', { value: 3 });
  await sleep(25); assert.equal(events.length, 1); assert.equal(events[0].type, 'realtime-batch'); assert.equal(events[0].payload.events.length, 2); bus.close();
});

test('métricas calculam p50, p95 e p99 com memória limitada', () => {
  const metrics = new PerformanceMetrics({ maxSamples: 100 }); for (let i = 1; i <= 150; i++) metrics.observe('latency', i);
  const summary = metrics.summary('latency'); assert.equal(summary.count, 100); assert.ok(summary.p50 > 0); assert.ok(summary.p95 >= summary.p50); assert.ok(summary.p99 >= summary.p95);
  const tracker = new RecentMessageTracker({ maxMessages: 100, maxSeen: 100 }); for (let i = 0; i < 300; i++) tracker.remember({ key: { id: `m${i}`, remoteJid: 'g@g.us' }, message: { conversation: 'x' } });
  assert.ok(tracker.stats().cachedMessages <= 100); assert.ok(tracker.stats().seenMessages <= 100);
});

test('painel usa paginação, janela virtual, assets versionados e lotes SSE', () => {
  const root = path.join(__dirname, '..'); const app = readAdminJs(root); const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(app, /paginated:'1'/); assert.match(app, /virtualSlice\(/); assert.match(app, /virtual-spacer/); assert.match(app, /realtime-batch/); assert.match(app, /p95/);
  assert.match(html, /app\.js\?v=0\.10\.7/); assert.match(html, /app\.css\?v=0\.10\.7/);
  assert.ok(fs.existsSync(path.join(root, 'public', 'app.0.9.9.js'))); assert.ok(fs.existsSync(path.join(root, 'public', 'app.0.9.9.css')));
});
