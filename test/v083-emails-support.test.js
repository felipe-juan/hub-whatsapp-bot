const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { INSTITUTIONAL_CARDS_V098 } = require('../src/institutional-cards');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v083-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

test('bundled professor cards include all supplied emails, including Luana in v0.8.4', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    for (const [title, email] of [
      ['Professor — Allan de Sousa Soares', 'allansoares@ifba.edu.br'],
      ['Professor — Bruno Silvério Costa', 'brunosilverio@ifba.edu.br'],
      ['Professor — Luana Lima Bittencourt Silva', 'luanabittencourt@ifba.edu.br']
    ]) {
      const item = messages.find(message => message.title === title);
      assert.ok(item); assert.match(item.response_text, new RegExp(email.replace('.', '\\.')));
      assert.deepEqual(item.tags, []);
    }
    assert.equal(db.getSetting('si_professors_2026_2_emails_v083_migrated'), 'true');
    assert.equal(db.getSetting('si_professors_2026_2_luana_email_v084_migrated'), 'true');
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('email migration replaces placeholders but preserves a manually filled email', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    const allan = messages.find(item => item.title === 'Professor — Allan de Sousa Soares');
    const bruno = messages.find(item => item.title === 'Professor — Bruno Silvério Costa');
    db.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=? WHERE id=?').run(allan.response_text.replace('allansoares@ifba.edu.br', '[ADICIONAR NO PAINEL]'), JSON.stringify(['professor','email-pendente']), allan.id);
    db.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=? WHERE id=?').run(bruno.response_text.replace('brunosilverio@ifba.edu.br', 'bruno.personalizado@ifba.edu.br'), JSON.stringify(['professor','email-pendente']), bruno.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_professors_2026_2_emails_v083_migrated'").run();
    db.close();
    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migratedAllan = reopened.listAutomaticMessages().find(item => item.title === allan.title);
    const migratedBruno = reopened.listAutomaticMessages().find(item => item.title === bruno.title);
    assert.match(migratedAllan.response_text, /allansoares@ifba\.edu\.br/);
    assert.match(migratedBruno.response_text, /bruno\.personalizado@ifba\.edu\.br/);
    assert.doesNotMatch(migratedBruno.response_text, /brunosilverio@ifba\.edu\.br/);
    reopened.close();
  } finally { try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); }
});

test('canonical institutional cards are seeded exactly once', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const titles = new Set(INSTITUTIONAL_CARDS_V098.map(item => item.message.title));
    const count = () => db.listAutomaticMessages().filter(item => titles.has(item.title)).length;
    assert.equal(count(), INSTITUTIONAL_CARDS_V098.length);
    assert.equal(db.getSetting('institutional_cards_v098_migrated'), 'true');
    db.close();
    const reopened = new Database(dbPath, { seedBundledContent: true });
    assert.equal(reopened.listAutomaticMessages().filter(item => titles.has(item.title)).length, INSTITUTIONAL_CARDS_V098.length);
    reopened.close();
  } finally { try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); }
});

test('structured sectors and retained HUB cards answer natural requests', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    const cases = [
      ['qual o contato do CAPNE?', 'CAPNE — contact'],
      ['whatsapp da CORES', 'CORES — whatsapp'],
      ['como falar com a CAENS?', 'CAENS — contact'],
      ['qual o e-mail da coordenação de bsi?', 'BSI — Contato da coordenação'],
      ['onde encontro a matriz curricular atual de bsi', 'HUB — Fluxograma e matriz de Sistemas de Informação'],
      ['qual a tabela da final?', 'HUB — Média final e tabela da final'],
      ['calendário acadêmico', 'HUB — Calendário acadêmico']
    ];
    for (const [body, title] of cases) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body); assert.equal(result.matchedItem, title, body);
    }
    assert.match(engine.evaluate('qual o contato do CAPNE?', { isGroup: false, ignorePermissions: true }).text, /capne\.vdc@ifba\.edu\.br/);
    assert.doesNotMatch(engine.evaluate('qual o contato do CAPNE?', { isGroup: false, ignorePermissions: true }).text, /5577998447168/);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
