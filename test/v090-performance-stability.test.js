const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { compileTriggerRules, prepareMessage, evaluateCompiledTrigger } = require('../src/trigger-rules');
const { AtomicRuleStore } = require('../src/rule-snapshot');
const { Database } = require('../src/database');
const { RealtimeBus } = require('../src/realtime-bus');
const { BackupManager } = require('../src/backup-manager');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v090-')); }
function message(title, sentence) {
  return { id: 1, title, response_text: 'ok', active: true, published: true, priority: 10, scope: 'both', trigger: { sentences: [sentence] } };
}

class FakeRulesDb {
  constructor(items) { this.items = items; this.emitter = new EventEmitter(); this.closed = false; }
  listAutomaticMessages() { return this.items; }
  listSynonymGroups() { return []; }
  onChange(listener) { this.emitter.on('change', listener); return () => this.emitter.off('change', listener); }
}

test('regras são pré-compiladas e reutilizam a mensagem normalizada uma única vez', () => {
  const compiled = compileTriggerRules({ sentences: ['Qual o horário da CAENS?'] });
  const prepared = prepareMessage('QUAL O HORARIO DA CAENS?');
  const result = evaluateCompiledTrigger(prepared, compiled);
  assert.equal(result.matched, true);
  assert.ok(Object.isFrozen(compiled));
  assert.ok(Object.isFrozen(prepared));
});

test('snapshot de regras só é trocado depois da compilação completa e mantém o anterior em caso de erro', () => {
  const db = new FakeRulesDb([message('CAENS', 'contato da caens')]);
  const store = new AtomicRuleStore(db);
  const first = store.snapshot;
  db.items = [{ ...message('Inválida', 'teste'), trigger: { regex_pattern: '(', regex_flags: 'iu' } }];
  const afterFailure = store.reload('teste-invalido');
  assert.equal(afterFailure, first);
  assert.equal(store.snapshot, first);
  db.items = [message('CORES', 'contato da cores')];
  const next = store.reload('teste-valido');
  assert.notEqual(next, first);
  assert.equal(next.compiledMessages[0].item.title, 'CORES');
  store.close();
});

test('SQLite usa WAL e possui índices para mensagens, histórico e entregas pendentes', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'bot.sqlite'));
  assert.equal(String(db.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'wal');
  const indexes = new Set(db.db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name));
  for (const name of ['idx_messages_live_order','idx_messages_updated','idx_message_history_created','idx_outbound_state_due','idx_outbound_conversation']) assert.ok(indexes.has(name), name);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('entregas interrompidas sobrevivem ao reinício sem reenvio automático potencialmente duplicado', () => {
  const dir = tempDir(); const file = path.join(dir, 'bot.sqlite');
  let db = new Database(file);
  const delivery = db.enqueueOutboundDelivery('grupo@g.us', { jid: 'grupo@g.us', content: { text: 'resposta' } });
  db.claimOutboundDelivery(delivery.id);
  db.close();
  db = new Database(file);
  assert.equal(db.recoverInterruptedOutboundDeliveries(), 1);
  assert.equal(db.listDueOutboundDeliveries().length, 0);
  const uncertain = db.listUncertainOutboundDeliveries();
  assert.equal(uncertain.length, 1);
  assert.equal(uncertain[0].content.content.text, 'resposta');
  const retry = db.retryUncertainOutboundDelivery(uncertain[0].id, 500);
  assert.equal(retry.state, 'retry');
  db.db.prepare('UPDATE outbound_deliveries SET next_attempt_at=? WHERE id=?').run(new Date(0).toISOString(), retry.id);
  const due = db.listDueOutboundDeliveries();
  assert.equal(due.length, 1);
  db.markOutboundDelivered(due[0].id, 'WA-1');
  assert.equal(db.outboundDeliveryStats().sent, 1);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('resumos de cartões expõem somente metadados do anexo; caminho interno fica sob demanda', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'bot.sqlite')); db.deleteExampleData();
  const saved = db.saveAutomaticMessage({ title: 'Com anexo', response_text: 'texto', active: true, trigger: { sentences: ['anexo teste'] }, attachment: { stored_name: 'segredo.bin', file_name: 'arquivo.pdf', mime_type: 'application/pdf', size_bytes: 100, kind: 'document' } });
  const summary = db.listAutomaticMessageSummaries().find(item => item.id === saved.id);
  assert.equal(summary.attachment.file_name, 'arquivo.pdf');
  assert.equal(Object.hasOwn(summary.attachment, 'stored_name'), false);
  assert.equal(db.getAutomaticMessage(saved.id).attachment.stored_name, 'segredo.bin');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('barramento em tempo real entrega eventos sem polling e mantém histórico limitado', () => {
  const bus = new RealtimeBus({ maxEntries: 20 }); const received = [];
  const unsubscribe = bus.subscribe(event => received.push(event));
  for (let i = 0; i < 25; i += 1) bus.publish('status', { i });
  unsubscribe();
  assert.equal(received.length, 25);
  assert.equal(bus.list({ limit: 100 }).length, 20);
  assert.equal(bus.stats().lastId, 25);
});

test('backup usa operações assíncronas e mantém catálogo em memória', async () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'bot.sqlite'));
  const manager = new BackupManager({ database: db, backupDir: path.join(dir, 'backups') });
  const created = await manager.run('teste-v090');
  assert.ok(created?.name.endsWith('.json'));
  assert.equal(manager.list().length, 1);
  assert.equal((await manager.getFile(created.name)), created.path);
  manager.stop(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('núcleo remove chamadas síncronas de arquivos e isola tarefas administrativas', () => {
  const root = path.join(__dirname, '..');
  for (const name of ['src/config.js','src/database.js','src/index.js','src/whatsapp.js','src/attachment-manager.js','src/backup-manager.js','src/admin-server.js']) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(source, /\b(?:readFileSync|writeFileSync|readdirSync|statSync|rmSync|unlinkSync|renameSync|execSync)\b/, name);
  }
  const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  assert.match(index, /AdminTaskRunner/);
  assert.match(index, /AdminScheduler/);
  assert.match(index, /backup\.json/);
  assert.match(index, /links\.run/);
  const worker = fs.readFileSync(path.join(root, 'src/admin-task-worker.js'), 'utf8');
  for (const task of ['backup.json','backup.full','restore.json','conflicts.calculate','links.run','update.stage','professor.preview']) assert.match(worker, new RegExp(task.replace('.', '\\.')));
});

test('painel usa eventos em tempo real e polling apenas como contingência lenta', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /new EventSource\('\/api\/events'\)/);
  assert.match(source, /60000/);
  assert.doesNotMatch(source, /refreshStatus\(\);\},15000/);
});
