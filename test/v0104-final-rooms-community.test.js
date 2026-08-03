'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const {
  SI_SCHEDULE_SOURCE_2026_2,
  SI_PROFESSORS_2026_2,
  SI_PENDING_2026_2
} = require('../src/si-professors-2026-2');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0104-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('v0.10.4 keeps only the !final calculator', () => {
  const holder = temporaryDatabase();
  try {
    const calculators = holder.db.listCalculators();
    assert.deepEqual(calculators.map(item => item.key), ['final']);
    assert.equal(calculators[0].command, '!final');
  } finally { holder.close(); }
});

test('official trancamento and community cards answer their direct triggers', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const trancamento = engine.evaluate('como trancar o curso', { isGroup: true, ignorePermissions: true });
    assert.equal(trancamento.matchedItem, 'Graduação — Como trancar o curso');
    assert.match(trancamento.text, /no máximo 2 semestres/i);
    assert.match(trancamento.text, /pelo menos 3 disciplinas/i);
    assert.match(trancamento.text, /99929-9331/);

    const felipe = engine.evaluate('felipe juan', { isGroup: true, ignorePermissions: true });
    assert.equal(felipe.matchedItem, 'Contato — Felipe Juan');
    assert.match(felipe.text, /Diretório Acadêmico de Sistemas de Informação/);
    assert.match(felipe.text, /linktr\.ee\/felipojuano/);
    assert.match(felipe.text, /linkedin\.com\/in\/felipe-juan/);

    const bar = engine.evaluate('bar perto do ifba', { isGroup: true, ignorePermissions: true });
    assert.equal(bar.matchedItem, 'Bar perto do IFBA — Bar do Benjamin');
    assert.match(bar.text, /R\. H, 2297–2407/);
    assert.match(bar.text, /rua à esquerda do IFBA/i);
    engine.close();
  } finally { holder.close(); }
});

test('all schedule records contain a classroom and every professor card displays it', () => {
  assert.equal(SI_SCHEDULE_SOURCE_2026_2.sha256, 'ec6000abd72154f3675147a20b74f0ef02eda5fb7bcea59da8b00fa2fad10f16');
  const records = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2]
    .flatMap(item => (item.classes || []).map(entry => ({ item, entry })));
  assert.equal(records.length, SI_SCHEDULE_SOURCE_2026_2.class_professor_records);
  assert.ok(records.every(({ entry }) => String(entry[4] || '').trim()), 'all records must contain a room');

  const holder = temporaryDatabase();
  try {
    const messages = new Map(holder.db.listAutomaticMessages().map(item => [item.title, item]));
    for (const { item, entry } of records) {
      const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
      const card = messages.get(title);
      assert.ok(card, title);
      assert.match(card.response_text, new RegExp(`Sala: \\*${String(entry[4]).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\*`), `${title}: ${entry[0]}`);
    }
  } finally { holder.close(); }
});

test('sala, onde, laboratório and lab variants find professor schedule cards', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const cases = [
      ['qual a sala de matemática discreta ii', 'Professor — Allan de Sousa Soares'],
      ['onde tem matemática discreta ii', 'Professor — Allan de Sousa Soares'],
      ['onde allan', 'Professor — Allan de Sousa Soares'],
      ['laboratório de redes de computadores', 'Professor — Igor Luiz Oliveira de Souza'],
      ['lab de redes de computadores', 'Professor — Igor Luiz Oliveira de Souza']
    ];
    for (const [body, title] of cases) {
      const result = engine.evaluate(body, { isGroup: true, ignorePermissions: true });
      assert.equal(result.matchedItem, title, body);
      assert.match(result.text, /Sala: \*[A-Z0-9]+\*/);
    }
    engine.close();
  } finally { holder.close(); }
});
