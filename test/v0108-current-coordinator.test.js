'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0108-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('cards da coordenação exibem Pablo Freire Matos como coordenador atual', () => {
  const holder = temporaryDatabase();
  try {
    const cards = holder.db.listAutomaticMessages();
    const coordinator = cards.find(item => item.title === 'BSI — Coordenador Atual');
    const contact = cards.find(item => item.title === 'BSI — Contato da Coordenação');
    assert.ok(coordinator);
    assert.ok(contact);
    assert.match(coordinator.response_text, /Pablo Freire Matos/u);
    assert.match(contact.response_text, /Pablo Freire Matos/u);
    assert.doesNotMatch(coordinator.response_text, /Cláudio Rodolfo/u);
    assert.doesNotMatch(contact.response_text, /Cláudio Rodolfo/u);
  } finally { holder.close(); }
});

test('migração v0.10.8 corrige bancos existentes sem apagar o restante do card', () => {
  const holder = temporaryDatabase();
  try {
    const contact = holder.db.listAutomaticMessages().find(item => item.title === 'BSI — Contato da Coordenação');
    assert.ok(contact);
    holder.db.db.prepare('UPDATE automatic_messages SET response_text=? WHERE id=?').run(
      '*Contato da Coordenação de BSI*\n\n👤 *Coordenador*\nCláudio Rodolfo Sousa de Oliveira\n\n📧 *E-mail*\ncsi.vdc@ifba.edu.br\n\n📍 *Localização*\nSala H410',
      contact.id
    );
    holder.db.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0108_current_bsi_coordinator','false') ON CONFLICT(key) DO UPDATE SET value='false'").run();
    holder.db.invalidate('settings', 'activeMessages');
    holder.db.migrateContentV0108();
    const migrated = holder.db.getAutomaticMessage(contact.id);
    assert.match(migrated.response_text, /Pablo Freire Matos/u);
    assert.match(migrated.response_text, /csi\.vdc@ifba\.edu\.br/u);
    assert.match(migrated.response_text, /Sala H410/u);
  } finally { holder.close(); }
});
