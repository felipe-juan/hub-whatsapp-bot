'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { FUN_CARDS_V0101 } = require('../src/content/fun');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0103-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { dir, dbPath, db };
}
function close(holder) { try { holder.db?.close(); } catch {} fs.rmSync(holder.dir, { recursive: true, force: true }); }
function cardOf(db) { return db.listAutomaticMessages().find(item => item.title === 'Como passar em Cálculo?'); }

test('v0.10.3 restores an attachment removed by the v0.10.2 package update', () => {
  const holder = temporaryDatabase();
  try {
    const card = cardOf(holder.db);
    const attachment = { stored_name: `${'a'.repeat(64)}.png`, file_name: 'meme.png', mime_type: 'image/png', size_bytes: 1234, kind: 'image', content_hash: 'a'.repeat(64) };
    const snapshot = holder.db.automaticMessageSnapshot({ ...card, attachment });
    holder.db.db.prepare("INSERT INTO automatic_message_history(message_id,action,snapshot_json,created_at) VALUES (?,'package-update',?,?)")
      .run(card.id, JSON.stringify(snapshot), new Date().toISOString());
    holder.db.db.prepare("UPDATE automatic_messages SET attachment_json='{}',customized=0 WHERE id=?").run(card.id);
    holder.db.db.prepare("UPDATE settings SET value='false' WHERE key='fun_cards_v0103_attachment_restored'").run();
    holder.db.close(); holder.db = null;

    holder.db = new Database(holder.dbPath, { seedBundledContent: true });
    const restored = cardOf(holder.db);
    assert.equal(restored.attachment.stored_name, attachment.stored_name);
    assert.equal(restored.customized, true);
    assert.equal(restored.package_snapshot.attachment, null);
    assert.equal(holder.db.getSetting('fun_cards_v0103_attachment_restored'), 'true');
  } finally { close(holder); }
});

test('future package updates preserve administrator attachments even with a legacy snapshot', () => {
  const holder = temporaryDatabase();
  try {
    const card = cardOf(holder.db);
    const attachment = { stored_name: `${'b'.repeat(64)}.jpg`, file_name: 'meme.jpg', mime_type: 'image/jpeg', size_bytes: 4321, kind: 'image', content_hash: 'b'.repeat(64) };
    const legacySnapshot = holder.db.automaticMessageSnapshot({ ...card, attachment });
    holder.db.db.prepare('UPDATE automatic_messages SET attachment_json=?,package_snapshot_json=?,customized=0 WHERE id=?')
      .run(JSON.stringify(attachment), JSON.stringify(legacySnapshot), card.id);
    const definition = FUN_CARDS_V0101.find(item => item.key === 'hub-fun-como-passar-em-calculo');
    const result = holder.db.stagePackageAutomaticMessage(definition.key, { ...definition.message, response_text: `${definition.message.response_text}
Atualização oficial.` });
    assert.equal(result.action, 'updated');
    const updated = cardOf(holder.db);
    assert.equal(updated.attachment.stored_name, attachment.stored_name);
    assert.equal(updated.customized, true);
    assert.equal(updated.package_snapshot.attachment, null);
  } finally { close(holder); }
});
