'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0153-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('migração v0.15.3 atualiza os dois links do card canônico sem duplicá-los', () => {
  const holder = temporaryDatabase();
  try {
    const row = holder.db.db.prepare("SELECT id,response_text,package_snapshot_json FROM automatic_messages WHERE package_key='hub-bsi-repositorios-arquivos-v0151'").get();
    assert.ok(row);
    const oldText = String(row.response_text).replace(/https:\/\/drive\.google\.com\/drive\/folders\/1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl/gu, 'https://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA');
    const oldSnapshot = JSON.parse(row.package_snapshot_json);
    oldSnapshot.response_text = oldText;
    holder.db.db.prepare('UPDATE automatic_messages SET response_text=?,package_snapshot_json=?,customized=0 WHERE id=?')
      .run(oldText, JSON.stringify(oldSnapshot), Number(row.id));
    holder.db.db.prepare("DELETE FROM schema_migrations WHERE migration_id='0153-resource-drive-links'").run();
    holder.db.runVersionedMigrations();

    const updated = holder.db.getAutomaticMessage(row.id);
    assert.match(updated.response_text, /1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl/u);
    assert.match(updated.response_text, /1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA/u);
    assert.equal((updated.response_text.match(/1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl/gu) || []).length, 1);
    assert.equal((updated.response_text.match(/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA/gu) || []).length, 1);
  } finally { holder.close(); }
});
