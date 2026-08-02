const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v084-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

test('v0.8.4 migrates Luana from não encontrado to the institutional email', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const luana = db.listAutomaticMessages().find(item => item.title === 'Professor — Luana Lima Bittencourt Silva');
    const oldResponse = luana.response_text.replace('luanabittencourt@ifba.edu.br', 'não encontrado');
    db.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=? WHERE id=?')
      .run(oldResponse, JSON.stringify(['professor','si','2026-2','email-pendente']), luana.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_professors_2026_2_luana_email_v084_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = reopened.listAutomaticMessages().find(item => item.title === 'Professor — Luana Lima Bittencourt Silva');
    assert.match(migrated.response_text, /luanabittencourt@ifba\.edu\.br/);
    assert.ok(migrated.tags.includes('email'));
    assert.equal(migrated.tags.includes('email-pendente'), false);
    assert.equal(reopened.getSetting('si_professors_2026_2_luana_email_v084_migrated'), 'true');
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.8.4 preserves a manually customized Luana email', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const luana = db.listAutomaticMessages().find(item => item.title === 'Professor — Luana Lima Bittencourt Silva');
    const custom = luana.response_text.replace('luanabittencourt@ifba.edu.br', 'luana.personalizado@ifba.edu.br');
    db.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=? WHERE id=?')
      .run(custom, JSON.stringify(['professor','si','2026-2','email-pendente']), luana.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_professors_2026_2_luana_email_v084_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = reopened.listAutomaticMessages().find(item => item.title === 'Professor — Luana Lima Bittencourt Silva');
    assert.match(migrated.response_text, /luana\.personalizado@ifba\.edu\.br/);
    assert.doesNotMatch(migrated.response_text, /luanabittencourt@ifba\.edu\.br/);
    assert.ok(migrated.tags.includes('email'));
    assert.equal(migrated.tags.includes('email-pendente'), false);
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
