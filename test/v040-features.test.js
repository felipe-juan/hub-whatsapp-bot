const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Database } = require('../src/database');
const { evaluateTrigger, validateRegex } = require('../src/trigger-rules');
const { BotEngine } = require('../src/bot-engine');
const { LinkChecker } = require('../src/link-checker');
const { AdminServer } = require('../src/admin-server');
const { handleCalculator } = require('../src/calculator');
const { compareVersions } = require('../src/update-manager');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v040-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function cleanDatabase(file) { const db = new Database(file); db.deleteExampleData(); return db; }

function rules(overrides = {}) {
  return { keywords: ['barema', 'horas complementares'], match_mode: 'any', required_words: [], excluded_words: [], exact_phrases: [], require_question_mark: false, regex_pattern: '', regex_flags: 'i', typo_tolerance: 0, synonym_group_ids: [], negative_examples: [], ...overrides };
}

test('gatilhos avançados combinam todas as palavras, pergunta e exclusões', () => {
  const trigger = rules({ keywords: ['quebra', 'requisito'], match_mode: 'all', require_question_mark: true, required_words: ['curso'], excluded_words: ['ensino médio'] });
  assert.equal(evaluateTrigger('como pedir quebra de requisito no curso?', { title: '', trigger }).matched, true);
  assert.equal(evaluateTrigger('como pedir quebra no curso?', { title: '', trigger }).matched, false);
  assert.equal(evaluateTrigger('quebra de requisito no curso', { title: '', trigger }).matched, true);
  assert.equal(evaluateTrigger('quebra de requisito no curso de ensino médio?', { title: '', trigger }).matched, false);
});

test('frases exatas e expressões regulares são suportadas com proteção básica', () => {
  assert.equal(evaluateTrigger('onde está o calendário?', { trigger: rules({ keywords: [], exact_phrases: ['onde está o calendário?'] }) }).matched, true);
  assert.equal(evaluateTrigger('calendario 2026?', { trigger: rules({ keywords: [], regex_pattern: '^calend[aá]rio\\s+2026\\?$', regex_flags: 'iu' }) }).matched, true);
  assert.throws(() => validateRegex('(.*)+', 'i'), /risco/i);
});

test('sinônimos, erros controlados e exemplos negativos alteram a decisão', () => {
  const synonyms = [{ id: 4, name: 'Contato', terms: ['email', 'e-mail', 'contato'], active: true }];
  const trigger = rules({ keywords: ['calendário'], typo_tolerance: 1, synonym_group_ids: [4], negative_examples: ['não quero o calendário'] });
  assert.equal(evaluateTrigger('onde está o calendàrio?', { trigger }, synonyms).matched, true);
  assert.equal(evaluateTrigger('preciso do contato?', { trigger }, synonyms).matched, true);
  assert.equal(evaluateTrigger('não quero o calendário', { trigger }, synonyms).matched, false);
});

test('mensagem automática usa rascunho/publicação e o mesmo mecanismo avançado', () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  const draft = db.saveAutomaticMessageDraft({ title: 'Prova final', topic: 'Avaliação', response_text: 'A média final é calculada por...', trigger: { keywords: ['prova final'], require_question_mark: true }, active: true });
  assert.equal(db.listAutomaticMessages({ activeOnly: true }).length, 0);
  db.publishAutomaticMessage(draft.id);
  const engine = new BotEngine(db);
  assert.equal(engine.simulate('como funciona a prova final?', { ignorePermissions: true }).type, 'message');
  assert.equal(engine.simulate('prova final', { ignorePermissions: true }).matched, true);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('desambiguação pergunta e aceita escolha numérica temporária', async () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  db.saveAutomaticMessage({ title: 'Matriz curricular', response_text: 'Resposta da matriz', trigger: { keywords: ['matriz'] }, priority: 1, active: true });
  db.saveAutomaticMessage({ title: 'Fluxograma', response_text: 'Resposta do fluxograma', trigger: { keywords: ['matriz'] }, priority: 1, active: true });
  db.setSettings({ cooldown_seconds: '0', log_matched_messages: 'false', disambiguation_threshold: '2' });
  const engine = new BotEngine(db); const replies = [];
  const chat = { isGroup: true, name: 'Grupo', id: { _serialized: 'grupo@g.us' }, sendMessage: async value => replies.push(value) };
  const message = body => ({ fromMe: false, from: 'grupo@g.us', author: '5577999999999@c.us', body, getChat: async () => chat, reply: async value => replies.push(value) });
  await engine.handle(message('onde encontro a matriz?'));
  assert.match(replies[0], /Responda somente com o número/);
  await engine.handle(message('2'));
  assert.match(replies[1], /Resposta da matriz|Resposta do fluxograma/);
  assert.equal(engine.getMetrics().pendingDisambiguations, 0);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('comandos administrativos ignoram não administradores e permitem pausar', async () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  db.setSettings({ admin_numbers: '5577999999999', log_matched_messages: 'false' });
  const engine = new BotEngine(db); const replies = [];
  const chat = { isGroup: true, name: 'Grupo', id: { _serialized: 'grupo@g.us' } };
  const message = (author, body) => ({ fromMe: false, from: 'grupo@g.us', author, body, getChat: async () => chat, reply: async value => replies.push(value) });
  await engine.handle(message('5577888888888@c.us', '!bot pausar'));
  assert.equal(db.getSetting('bot_paused'), 'false');
  await engine.handle(message('5577999999999@c.us', '!bot pausar'));
  assert.equal(db.getSetting('bot_paused'), 'true'); assert.match(replies[0], /pausada/i);
  await engine.handle(message('5577999999999@c.us', '!bot continuar'));
  assert.equal(db.getSetting('bot_paused'), 'false');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('verificador automático classifica URLs presentes nas respostas', async t => {
  const server = http.createServer((req, res) => { res.statusCode = req.url === '/ok' ? 200 : 404; res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite')); const port = server.address().port;
  const ok = db.saveAutomaticMessage({ title: 'OK', response_text: `Acesse http://127.0.0.1:${port}/ok`, trigger: { keywords: ['ok'] }, active: true });
  const bad = db.saveAutomaticMessage({ title: 'Erro', response_text: `Acesse http://127.0.0.1:${port}/bad`, trigger: { keywords: ['erro'] }, active: true });
  const checker = new LinkChecker({ database: db }); const result = await checker.run('test');
  assert.equal(result.checked, 2); assert.equal(db.getAutomaticMessage(ok.id).link_status, 'healthy'); assert.equal(db.getAutomaticMessage(bad.id).link_status, 'broken');
  checker.stop(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('retenção configurável remove registros antigos', () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  db.db.prepare('INSERT INTO message_logs(created_at,chat_id,chat_name,message_excerpt,match_type,matched_item,reply_excerpt) VALUES (?,?,?,?,?,?,?)')
    .run('2020-01-01T00:00:00.000Z', '', '', '', '', '', '');
  db.setSettings({ log_retention_days: '30' });
  assert.equal(db.listLogs().length, 0);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('senha é armazenada com hash e pode ser alterada', () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  db.initializeAdminPassword('senha-inicial-segura'); assert.equal(db.verifyAdminPassword('senha-inicial-segura'), true);
  db.changeAdminPassword('senha-inicial-segura', 'senha-nova-ainda-melhor');
  assert.equal(db.verifyAdminPassword('senha-inicial-segura'), false); assert.equal(db.verifyAdminPassword('senha-nova-ainda-melhor'), true);
  const row = db.db.prepare('SELECT password_hash FROM admin_auth WHERE id=1').get(); assert.notEqual(row.password_hash, 'senha-nova-ainda-melhor');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('painel bloqueia temporariamente após tentativas inválidas', async t => {
  const dir = tempDir(); const publicDir = path.join(dir, 'public'); fs.mkdirSync(publicDir); fs.writeFileSync(path.join(publicDir, 'index.html'), 'ok');
  const db = cleanDatabase(path.join(dir, 'db.sqlite')); db.setSettings({ login_max_attempts: '2', login_lock_minutes: '1' });
  const whatsapp = { getStatus: () => ({ state: 'stopped' }) };
  const admin = new AdminServer({ config: { adminPassword: 'senha-correta', sessionHours: 1, publicDir, adminPort: 0, adminHost: '127.0.0.1' }, database: db, whatsapp });
  await new Promise(resolve => admin.server.listen(0, '127.0.0.1', resolve)); t.after(() => { admin.server.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${admin.server.address().port}`;
  const attempt = password => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal((await attempt('errada')).status, 401); assert.equal((await attempt('errada')).status, 429); assert.equal((await attempt('senha-correta')).status, 429);
});

test('estatísticas anônimas agregam apenas tópico, tipo, dia e contagem', () => {
  const dir = tempDir(); const db = cleanDatabase(path.join(dir, 'db.sqlite'));
  db.recordUsage('Barema', 'hub'); db.recordUsage('Barema', 'hub'); db.recordUsage('Calendário', 'faq');
  const stats = db.getUsageStats(30); assert.equal(stats.total, 3); assert.equal(stats.top.find(item => item.topic === 'Barema').count, 2);
  const columns = db.tableColumns('usage_stats'); assert.deepEqual([...columns].sort(), ['count', 'day', 'match_type', 'topic']);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('comandos antigos de calculadora permanecem desativados', () => {
  const calculators = [
    { key: 'attendance', enabled: true, command: '!freq|!frequencia', label: 'Frequência', config: { minimum_percent: 75 } },
    { key: 'hours', enabled: true, command: '!horas', label: 'Horas', config: { default_required_hours: 200 } },
    { key: 'weighted', enabled: true, command: '!mediap', label: 'Ponderada', config: {} },
    { key: 'final', enabled: true, command: '!final', label: 'Final', config: {} }
  ];
  assert.equal(handleCalculator('!freq 60 8', calculators), null);
  assert.equal(handleCalculator('!horas 150', calculators), null);
  assert.equal(handleCalculator('!mediap 7:2 9:3', calculators), null);
  assert.match(handleCalculator('!final 6,9', calculators).text, /1,2/);
});

test('comparação de versões e interface de atualização estão presentes', () => {
  assert.equal(compareVersions('0.4.0', '0.3.0'), 1); assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = readAdminJs(path.join(__dirname, '..'));
  assert.match(html, /id="update-file"/); assert.match(app, /\/api\/update\/upload/);
});

test('atualizador valida checksums e prepara aplicação com rollback', () => {
  const { execFileSync } = require('node:child_process');
  const crypto = require('node:crypto');
  const { UpdateManager, REQUIRED_CHECKSUM_FILES } = require('../src/update-manager');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-update-ok-'));
  const installed = path.join(base, 'installed'); const data = path.join(installed, 'data'); const incoming = path.join(base, 'hub-whatsapp-bot-v1.1.0');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(incoming, { recursive: true });
  fs.writeFileSync(path.join(installed, 'VERSION'), '1.0.0\n');
  for (const relative of REQUIRED_CHECKSUM_FILES) {
    const target = path.join(incoming, relative); fs.mkdirSync(path.dirname(target), { recursive: true });
    if (relative === 'package.json') fs.writeFileSync(target, JSON.stringify({ name: 'hub-whatsapp-bot', version: '1.1.0' }));
    else if (relative === 'VERSION') fs.writeFileSync(target, '1.1.0\n');
    else fs.writeFileSync(target, `// ${relative}\n`);
  }
  const files = Object.fromEntries(REQUIRED_CHECKSUM_FILES.map(relative => [relative, crypto.createHash('sha256').update(fs.readFileSync(path.join(incoming, relative))).digest('hex')]));
  fs.writeFileSync(path.join(incoming, 'UPDATE_MANIFEST.json'), JSON.stringify({ product: 'hub-whatsapp-bot', version: '1.1.0', minimum_updatable_version: '1.0.0', update_type: 'application-code', files }));
  const zipPath = path.join(base, 'update.zip'); execFileSync('zip', ['-qr', zipPath, path.basename(incoming)], { cwd: base });
  let launched = null;
  const runner = (command, args, options) => {
    if (command === 'systemd-run') { launched = args; return ''; }
    return execFileSync(command, args, options);
  };
  const manager = new UpdateManager({ rootDir: installed, dataDir: data, commandRunner: runner });
  const result = manager.stageAndApply(fs.readFileSync(zipPath), 'update.zip');
  assert.equal(result.targetVersion, '1.1.0'); assert.ok(launched?.includes('--collect'));
  const script = fs.readdirSync(data).find(name => name.startsWith('apply-update-'));
  assert.ok(script); execFileSync('bash', ['-n', path.join(data, script)]);
  assert.match(fs.readFileSync(path.join(data, script), 'utf8'), /rollback/);
  fs.rmSync(base, { recursive: true, force: true });
});

test('atualizador rejeita arquivo alterado depois do manifesto', () => {
  const crypto = require('node:crypto'); const { UpdateManager, REQUIRED_CHECKSUM_FILES } = require('../src/update-manager');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-update-bad-')); const installed = path.join(base, 'installed'); const data = path.join(installed, 'data'); const incoming = path.join(base, 'package');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(incoming, { recursive: true }); fs.writeFileSync(path.join(installed, 'VERSION'), '1.0.0\n');
  for (const relative of REQUIRED_CHECKSUM_FILES) { const target = path.join(incoming, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, relative === 'package.json' ? JSON.stringify({ version: '1.1.0' }) : relative === 'VERSION' ? '1.1.0\n' : 'ok'); }
  const files = Object.fromEntries(REQUIRED_CHECKSUM_FILES.map(relative => [relative, crypto.createHash('sha256').update(fs.readFileSync(path.join(incoming, relative))).digest('hex')]));
  fs.writeFileSync(path.join(incoming, 'UPDATE_MANIFEST.json'), JSON.stringify({ product: 'hub-whatsapp-bot', version: '1.1.0', minimum_updatable_version: '1.0.0', update_type: 'application-code', files }));
  fs.writeFileSync(path.join(incoming, 'src/index.js'), 'alterado');
  const manager = new UpdateManager({ rootDir: installed, dataDir: data });
  assert.throws(() => manager.validateManifest(incoming, JSON.parse(fs.readFileSync(path.join(incoming, 'UPDATE_MANIFEST.json')))), /integridade/);
  fs.rmSync(base, { recursive: true, force: true });
});
