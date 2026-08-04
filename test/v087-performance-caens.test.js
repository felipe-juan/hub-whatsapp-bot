const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { readAdminJs } = require('./helpers/admin-assets');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v087-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function card(db, title) {
  return db.listAutomaticMessages().find(item => item.title === title);
}

test('CAENS accepts common contact formulations and the isolated acronym', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    for (const body of ['qual o contato da CAENS?', 'qual o contato do CAENS?', 'ctt da caens', 'telefone da caens', 'número da caens', 'whats da CAENS', 'como entrar em contato com a CAENS?', 'preciso falar com a caens?']) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body); assert.match(result.matchedItem, /^CAENS —/);
    }
    assert.equal(engine.evaluate('a CAENS participou da reunião', { isGroup: false, ignorePermissions: true }).matched, false);
    assert.equal(engine.evaluate('CAENS', { isGroup: false, ignorePermissions: true }).matched, true);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('message summaries are substantially smaller than complete editor records', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const full = db.listAutomaticMessages();
    const summaries = db.listAutomaticMessageSummaries();
    const fullBytes = Buffer.byteLength(JSON.stringify(full));
    const summaryBytes = Buffer.byteLength(JSON.stringify(summaries));
    assert.equal(summaries.length, full.length);
    assert.ok(summaryBytes < fullBytes * 0.35, `${summaryBytes} should be below 35% of ${fullBytes}`);
    const professor = summaries.find(item => item.title === 'Professor — Allan de Sousa Soares');
    assert.ok(professor.trigger_counts.sentences > professor.trigger.sentences.length);
    assert.ok(professor.response_text.length <= 360);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('conflict report is cached until automatic messages change', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const first = db.getConflictReport();
    const original = db.listAutomaticMessages.bind(db);
    db.listAutomaticMessages = () => { throw new Error('conflict report was recalculated'); };
    assert.deepEqual(db.getConflictReport(), first);
    db.listAutomaticMessages = original;
    db.invalidate('activeMessages');
    assert.equal(db.cache.conflictReport, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('structured CAENS changes survive restart and keep natural recognition', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const caens = db.listSectors().find(item => item.acronym === 'CAENS');
    db.saveSector({ ...caens, notes: 'unused', phone: 'ramal teste', services: [...caens.services, 'Texto local preservado'] }, caens.id);
    db.close();
    const reopened = new Database(dbPath, { seedBundledContent: true }); const engine = new BotEngine(reopened);
    const saved = reopened.listSectors().find(item => item.acronym === 'CAENS');
    assert.equal(saved.phone, 'ramal teste'); assert.ok(saved.services.includes('Texto local preservado'));
    const result = engine.evaluate('como entrar em contato com a caens?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matched, true); assert.equal(result.matchedItem, 'CAENS — contact');
    engine.close(); reopened.close();
  } finally { try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); }
});

test('admin UI loads lightweight summaries and defers conflict analysis', () => {
  const app = readAdminJs(path.join(__dirname, '..'));
  assert.match(app, /\/api\/messages\?summary=1/);
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /Carregar mais/);
  assert.match(app, /messageSnippet\(e\.response_text/);
});
