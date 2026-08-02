const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { evaluateTrigger } = require('../src/trigger-rules');
const { captionAnalysis } = require('../src/caption-policy');
const { INSTITUTIONAL_CARDS_V098 } = require('../src/institutional-cards');
const { spawnSync } = require('node:child_process');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0100-'));
  const db = new Database(path.join(dir, 'db.sqlite'), { seedBundledContent: true });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function messageFactory(replies, body, conversation = 'grupo@g.us') {
  const chat = { isGroup: true, name: 'Grupo BSI', id: { _serialized: conversation }, sendMessage: async value => replies.push(value) };
  return { fromMe: false, from: conversation, author: '5577999999999@c.us', body, getChat: async () => chat, reply: async value => replies.push(value) };
}

test('reported speech does not activate institutional cards, but direct questions do', () => {
  const holder = tempDb();
  try {
    const engine = new BotEngine(holder.db);
    for (const body of [
      'O professor comentou sobre o calendário acadêmico?',
      'Vocês estavam falando do contato da CAENS?',
      'Você viu a postagem sobre como pedir segunda chamada?',
      'A turma estava discutindo sobre como iniciar o TCC I?'
    ]) assert.equal(engine.evaluate(body, { isGroup: true, ignorePermissions: true }).matched, false, body);
    assert.equal(engine.evaluate('Onde encontro o calendário acadêmico?', { isGroup: true, ignorePermissions: true }).matched, true);
    assert.equal(engine.evaluate('Você sabe o contato da CAENS?', { isGroup: true, ignorePermissions: true }).matched, true);
  } finally { holder.close(); }
});

test('TCC intents are separated between teacher, procedure, schedule and prerequisites', () => {
  const holder = tempDb();
  try {
    const engine = new BotEngine(holder.db);
    assert.equal(engine.evaluate('Como iniciar o TCC I de BSI?', { isGroup: true, ignorePermissions: true }).matchedItem, 'BSI — Como iniciar o TCC I');
    assert.match(engine.evaluate('Quem ministra TCC I?', { isGroup: true, ignorePermissions: true }).matchedItem, /^Professor —/);
    assert.match(engine.evaluate('Qual o horário de TCC I?', { isGroup: true, ignorePermissions: true }).matchedItem, /^Professor —/);
    assert.equal(engine.evaluate('Qual é o pré-requisito de TCC I?', { isGroup: true, ignorePermissions: true }).matchedItem, 'BSI — Pré-requisitos das disciplinas');
    assert.equal(engine.evaluate('Como passar do TCC I para o TCC II?', { isGroup: true, ignorePermissions: true }).matchedItem, 'BSI — Passagem do TCC I para o TCC II');
  } finally { holder.close(); }
});

test('hierarchical help menu opens the requested academic submenu', async () => {
  const holder = tempDb(); const engine = new BotEngine(holder.db); const replies = [];
  try {
    await engine.handle(messageFactory(replies, 'ajuda'));
    assert.match(String(replies[0]), /1\. Professores e horários/);
    assert.match(String(replies[0]), /3\. TCC, estágio e atividades acadêmicas/);
    await engine.handle(messageFactory(replies, '3'));
    assert.match(String(replies[1]), /1\. TCC/);
    assert.match(String(replies[1]), /2\. Estágio/);
    assert.match(String(replies[1]), /3\. ACEX/);
  } finally { engine.close(); holder.close(); }
});

test('ambiguous contextual schedule follow-up asks the user to confirm the theme', async () => {
  const holder = tempDb(); const engine = new BotEngine(holder.db); const replies = [];
  try {
    await engine.handle(messageFactory(replies, 'contato da CAENS'));
    await engine.handle(messageFactory(replies, 'e o horário?'));
    assert.match(String(replies.at(-1)), /horário de atendimento da CAENS/i);
    assert.match(String(replies.at(-1)), /horário de uma disciplina ou turma de BSI/i);
    const metrics = engine.getMetrics();
    assert.ok(metrics.conversationContexts >= 1);
  } finally { engine.close(); holder.close(); }
});

test('progressive TCC response stays short and offers guided next steps', () => {
  const holder = tempDb();
  try {
    const engine = new BotEngine(holder.db);
    const result = engine.evaluate('Como iniciar o TCC I de BSI?', { isGroup: true, ignorePermissions: true });
    assert.match(result.text, /Como começar/);
    assert.match(result.text, /Escolher orientador/);
    assert.ok(result.text.length < 1800);
  } finally { holder.close(); }
});

test('caption policy reports source size and blocks unsafe attachment captions', () => {
  const safe = captionAnalysis({ response_text: 'Resposta curta', source_title: 'Fonte oficial', source_url: 'https://example.invalid', verified_at: '2026-08-01', attachment: { stored_name: 'a.pdf' } });
  assert.equal(safe.status, 'safe');
  assert.ok(safe.sourceCharacters > 0);
  const blocked = captionAnalysis({ response_text: 'x'.repeat(1100), attachment: { stored_name: 'a.pdf' } });
  assert.equal(blocked.status, 'blocked');
});

test('database and content are split into focused modules', () => {
  const root = path.join(__dirname, '..');
  for (const file of ['connection.js','migrations.js','cards-repository.js','sectors-repository.js','professors-repository.js','deliveries-repository.js','backups-repository.js']) {
    assert.equal(fs.existsSync(path.join(root, 'src', 'database', file)), true, file);
  }
  for (const file of ['campus.js','sectors.js','bsi-course.js','tcc.js','internship.js','student-assistance.js']) assert.equal(fs.existsSync(path.join(root, 'src', 'content', file)), true, file);
  for (const file of ['cards.js','sectors.js','professors.js','diagnostics.js','updates.js']) assert.equal(fs.existsSync(path.join(root, 'public', 'js', file)), true, file);
  assert.ok(fs.statSync(path.join(root, 'src', 'database.js')).size < 70000);
  assert.ok(fs.statSync(path.join(root, 'src', 'institutional-cards.js')).size < 10000);
  assert.ok(fs.statSync(path.join(root, 'public', 'app.js')).size < 40000);
  assert.equal(INSTITUTIONAL_CARDS_V098.length, 108);
});

test('historical immutable assets are limited to the immediately previous release', () => {
  const publicDir = path.join(__dirname, '..', 'public');
  const historical = fs.readdirSync(publicDir).filter(name => /^app\.0\..+\.(?:js|css)$/.test(name)).sort();
  assert.deepEqual(historical, ['app.0.9.9.css', 'app.0.9.9.js']);
});

test('installer generates a lockfile, verifies it and installs with npm ci', () => {
  const root = path.join(__dirname, '..');
  const installer = fs.readFileSync(path.join(root, 'install-fedora-gnome.sh'), 'utf8');
  const updater = fs.readFileSync(path.join(root, 'src', 'update-manager.js'), 'utf8');
  assert.match(installer, /npm install --package-lock-only/);
  assert.match(installer, /verify-package-lock\.js/);
  assert.match(installer, /npm ci --ignore-scripts/);
  assert.match(updater, /npm install --package-lock-only/);
  assert.match(updater, /npm ci --ignore-scripts/);
  assert.match(installer, /package-lock\.previous/);
  assert.match(installer, /check-installed-dependencies\.js/);
  assert.match(updater, /OLD_LOCKFILE/);
  assert.match(updater, /check-installed-dependencies\.js/);
});

test('offline dependency fallback validates a previously installed exact tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v100-deps-'));
  try {
    const dependencies = { alpha: '1.2.3', '@scope/beta': '4.5.6' };
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    for (const [name, version] of Object.entries(dependencies)) {
      const folder = path.join(root, 'node_modules', ...name.split('/'));
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name, version }));
    }
    const script = path.join(__dirname, '..', 'scripts', 'check-installed-dependencies.js');
    const ok = spawnSync(process.execPath, [script], { env: { ...process.env, HUB_PROJECT_ROOT: root }, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    fs.writeFileSync(path.join(root, 'node_modules', 'alpha', 'package.json'), JSON.stringify({ name: 'alpha', version: '9.9.9' }));
    const bad = spawnSync(process.execPath, [script], { env: { ...process.env, HUB_PROJECT_ROOT: root }, encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
