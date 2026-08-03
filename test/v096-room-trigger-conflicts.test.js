'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { normalizeText } = require('../src/text');
const { SI_SUPPORT_MESSAGES_V083 } = require('../src/si-support-messages-v083');

const UNSAFE = new Set(['qual sala', 'em qual sala', 'qual é a sala', 'qual e a sala'].map(normalizeText));

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v096-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function hasUnsafe(trigger) {
  return ['keywords', 'sentences', 'exact_phrases', 'required_words']
    .some(field => (trigger?.[field] || []).some(value => UNSAFE.has(normalizeText(value))));
}

test('legacy room seed no longer contains generic room-only phrases', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const definition = db.listAutomaticMessages().find(item => item.title === 'Onde Está o Professor — Salas do IFBA');
    assert.ok(definition);
    assert.equal(hasUnsafe(definition.trigger), false);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.9.6 removes unsafe room triggers from customized live and draft content', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const original = db.listAutomaticMessages().find(item => item.title === 'Onde Está o Professor — Salas do IFBA');
    assert.ok(original);
    const customResponse = `${original.response_text}\n\nObservação personalizada.`;
    const published = db.saveAutomaticMessage({
      ...original,
      response_text: customResponse,
      trigger: {
        ...original.trigger,
        sentences: [...original.trigger.sentences, 'qual sala', 'em qual sala', 'qual é a sala', 'gatilho personalizado professor']
      }
    }, original.id);
    assert.equal(published.customized, true);
    db.saveAutomaticMessageDraft({
      ...published,
      response_text: customResponse,
      trigger: {
        ...published.trigger,
        sentences: [...published.trigger.sentences, 'qual e a sala', 'outro gatilho personalizado professor']
      }
    }, original.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='room_trigger_conflicts_v096_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = reopened.getAutomaticMessage(original.id);
    assert.equal(migrated.response_text, customResponse);
    assert.equal(migrated.customized, true);
    assert.equal(hasUnsafe(migrated.trigger), false);
    assert.equal(hasUnsafe(migrated.draft.trigger), false);
    assert.ok(migrated.trigger.sentences.includes('gatilho personalizado professor'));
    assert.ok(migrated.draft.trigger.sentences.includes('outro gatilho personalizado professor'));
    assert.equal(reopened.getSetting('room_trigger_conflicts_v096_migrated'), 'true');
    assert.equal(reopened.getConflictReport().count, 0);
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('room questions resolve to the specific BSI card and generic room text resolves to none', () => {
  const { db, dir } = temporaryDatabase();
  const engine = new BotEngine(db);
  try {
    const cases = [
      ['qual é a sala?', false, ''],
      ['em qual sala?', false, ''],
      ['qual é a sala da coordenação de bsi?', true, 'CSI — location'],
      ['qual é a sala do laboratório de redes de sistemas de informação?', true, 'BSI — Laboratórios de Redes'],
      ['qual é a sala do miniauditório de sistemas de informação?', true, 'BSI — Miniauditório e Salas dos Professores'],
      ['em qual sala está o professor Allan?', true, 'Professor — Allan de Sousa Soares']
    ];
    for (const [body, matched, title] of cases) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, matched, body);
      assert.equal(result.matchedItem, title, body);
    }
  } finally {
    engine.close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
