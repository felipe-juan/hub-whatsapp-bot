const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { AtomicRuleStore } = require('../src/rule-snapshot');
const { TokenAhoCorasick } = require('../src/aho-corasick');
const { BitSet } = require('../src/bitset');
const { LruCache } = require('../src/lru-cache');
const { validateRegex } = require('../src/trigger-rules');
const { AttachmentManager } = require('../src/attachment-manager');
const { DatabaseWriteQueue } = require('../src/database-write-queue');
const { CoreIpcServer, CoreIpcClient } = require('../src/unix-ipc');

function tempDir(prefix = 'hub-v092-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function cleanDb(dir) { const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: false }); db.deleteExampleData(); return db; }
function message(title, sentence, priority = 0) {
  return { id: title, title, response_text: title, scope: 'both', active: true, priority, trigger: { sentences: [sentence], keywords: [], required_words: [], excluded_words: [], exact_phrases: [], match_mode: 'all', require_question_mark: false, regex_pattern: '', regex_flags: 'i', typo_tolerance: 0, synonym_group_ids: [], negative_examples: [] } };
}

test('Aho-Corasick localiza várias sentenças em uma única passagem por tokens', () => {
  const aho = new TokenAhoCorasick([
    { tokens: ['contato'], payload: 'contato' },
    { tokens: ['contato', 'da', 'caens'], payload: 'frase' },
    { tokens: ['caens'], payload: 'caens' }
  ]);
  const found = aho.search(['qual', 'o', 'contato', 'da', 'caens']).map(item => item.payload);
  assert.deepEqual(found.sort(), ['caens', 'contato', 'frase']);
  assert.equal(aho.stats().patterns, 3);
});

test('IDs numéricos e bitsets cruzam candidatos sem criar conjuntos de objetos', () => {
  const caens = new BitSet(64).set(4).set(18).set(27);
  const contato = new BitSet(64).set(4).set(8).set(12).set(18);
  assert.deepEqual(caens.clone().and(contato).toIndexes(), [4, 18]);
  assert.equal(caens.count(), 3);
});

test('cache LRU é limitado, expira e o snapshot o invalida ao trocar regras', async () => {
  const cache = new LruCache({ maxEntries: 10, ttlMs: 20 });
  for (let index = 0; index < 20; index += 1) cache.set(`k${index}`, index);
  assert.equal(cache.stats().size, 10); assert.ok(cache.stats().evictions >= 10);
  cache.set('ttl', 1); await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(cache.get('ttl'), undefined);

  let source = { messages: [message('CAENS', 'qual o contato da caens')], synonymGroups: [] };
  const db = { closed: false, listAutomaticMessages: () => source.messages, listSynonymGroups: () => [], ruleSourceRevision: () => String(source.messages.length), onChange: () => () => {} };
  const store = new AtomicRuleStore(db);
  store.evaluate('qual o contato da caens', { isGroup: true });
  store.evaluate('qual o contato da caens', { isGroup: true });
  assert.ok(store.stats().cache.hits >= 1);
  source = { messages: [message('CAENS', 'qual o contato da caens'), message('CORES', 'qual o contato da cores')], synonymGroups: [] };
  store.reload('teste');
  assert.equal(store.stats().cache.size, 0); store.close();
});

test('caminho exato e interrupção antecipada preservam a regra mais específica', () => {
  const source = { messages: [message('Genérica', 'contato'), message('CAENS', 'qual o contato da caens', 10)], synonymGroups: [] };
  const db = { closed: false, listAutomaticMessages: () => source.messages, listSynonymGroups: () => [], ruleSourceRevision: () => '1', onChange: () => () => {} };
  const store = new AtomicRuleStore(db);
  const results = store.evaluate('qual o contato da caens', { isGroup: true, ambiguityThreshold: 1 });
  assert.equal(results.filter(item => item.matched).sort((a, b) => b.score - a.score)[0].item.title, 'CAENS');
  assert.equal(results.candidateStats.earlyExit, true);
  store.close();
});

test('regex de administrador usa sintaxe segura e recusa padrões de risco', () => {
  assert.equal(validateRegex('^calend[aá]rio\\s+2026\\?$', 'iu').test('Calendário 2026?'), true);
  assert.throws(() => validateRegex('(a+)+$', 'i'), /risco/i);
  assert.throws(() => validateRegex('(.*)+', 'i'), /risco/i);
  assert.throws(() => validateRegex('(a)\\1', 'i'), /RE2/i);
});

test('anexos iguais compartilham armazenamento por SHA-256', async () => {
  const dir = tempDir(); const manager = new AttachmentManager({ dir }); const body = Buffer.from('mesmo arquivo');
  const first = await manager.save(body, { fileName: 'primeiro.pdf', mimeType: 'application/pdf' });
  const second = await manager.save(body, { fileName: 'outro-nome.pdf', mimeType: 'application/pdf' });
  assert.equal(first.stored_name, second.stored_name); assert.equal(first.content_hash, second.content_hash); assert.equal(second.deduplicated, true);
  assert.equal(fs.readdirSync(dir).filter(name => !name.startsWith('.')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('processo exclusivo de escrita executa mutações, lotes e manutenção SQLite', async () => {
  const dir = tempDir(); const db = cleanDb(dir); const queue = new DatabaseWriteQueue({ dbPath: db.dbPath });
  const saved = await queue.callDatabase('saveTeacher', [{ name: 'Teste Writer', email: 'writer@ifba.edu.br', active: true }]);
  assert.equal(saved.name, 'Teste Writer');
  queue.addLog({ chatId: 'g', chatName: 'Grupo', message: 'm', matchType: 'message', matchedItem: 'x', reply: 'r' });
  queue.recordUsage('CAENS', 'message'); await queue.flush();
  const maintenance = await queue.optimize({ force: true, analyze: true });
  db.refreshExternalChanges(); assert.ok(db.listTeachers().some(item => item.name === 'Teste Writer'));
  assert.ok(maintenance.optimizedAt); assert.equal(db.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  await queue.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('socket Unix transporta RPC local e eventos sem HTTP', async () => {
  const dir = tempDir(); const socketPath = path.join(dir, 'core.sock');
  const server = new CoreIpcServer({ socketPath, handlers: { soma: ({ a, b }) => a + b } }); await server.start();
  const client = new CoreIpcClient({ socketPath, reconnectMs: 20 });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('IPC não conectou')), 1000); client.once('ready', () => { clearTimeout(timer); resolve(); }); });
  assert.equal(await client.request('soma', { a: 2, b: 3 }), 5);
  client.close(); await server.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('núcleo e workers recebem prioridades diferentes no Fedora', () => {
  const root = path.join(__dirname, '..');
  const installer = fs.readFileSync(path.join(root, 'install-fedora-gnome.sh'), 'utf8');
  const adminRunner = fs.readFileSync(path.join(root, 'src', 'admin-task-runner.js'), 'utf8');
  const writer = fs.readFileSync(path.join(root, 'src', 'database-write-queue.js'), 'utf8');
  assert.match(installer, /Nice=0/); assert.match(installer, /CPUWeight=100/); assert.match(installer, /IOWeight=100/);
  assert.match(adminRunner, /setPriority\(worker\.pid, 10\)/); assert.match(writer, /setPriority\(worker\.pid, 0\)/);
});

test('Admin Center usa o escritor dedicado e assets modulares da versão atual', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'src', 'admin-server.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(server, /mutateDatabase\(/); assert.match(server, /writeQueue\.callDatabase/);
  assert.match(server, /database\.optimize/); assert.match(html, /app\.js\?v=0\.11\.0/); assert.match(html, /app\.css\?v=0\.11\.0/); assert.match(html, /js\/cards\.js\?v=0\.11\.0/);
});
