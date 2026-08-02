'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { implicitQuestionStructure } = require('../src/semantic-question');
const { evaluateTrigger, compileTriggerRules, evaluateCompiledTrigger, prepareMessage } = require('../src/trigger-rules');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0102-'));
  const dbPath = path.join(dir, 'hub.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { dir, dbPath, db };
}

function close(holder) {
  try { holder.db?.close(); } catch {}
  fs.rmSync(holder.dir, { recursive: true, force: true });
}

test('detects complete implicit questions without accepting casual mentions', () => {
  for (const text of [
    'como passar em cálculo',
    'onde encontro a matriz curricular',
    'qual o contato da caens',
    'quem ensina matemática discreta ii',
    'quando abre o período de matrícula',
    'você sabe o contato da caens',
    'por favor como solicito aproveitamento'
  ]) assert.equal(implicitQuestionStructure(text), true, text);

  for (const text of [
    'como cálculo',
    'onde fica',
    'a gente falou do contato da caens',
    'ontem comentaram sobre como passar em cálculo',
    'quero contato da caens'
  ]) assert.equal(implicitQuestionStructure(text), false, text);
});

test('compiled and non-compiled triggers accept explicit questions without ?', () => {
  const item = { trigger: { sentences: ['qual é o contato da caens'], require_question_mark: true } };
  assert.equal(evaluateTrigger('qual o contato da caens', item).matched, true);
  assert.equal(evaluateTrigger('você sabe o contato da caens', item).matched, true);
  assert.equal(evaluateTrigger('a gente falou do contato da caens', item).matched, false);

  const compiled = compileTriggerRules(item.trigger);
  assert.equal(evaluateCompiledTrigger(prepareMessage('você sabe o contato da caens'), compiled).matched, true);
  assert.equal(evaluateCompiledTrigger(prepareMessage('comentaram sobre o contato da caens'), compiled).matched, false);
});

test('Como passar em Cálculo works with or without final question mark', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    for (const text of [
      'como passar em cálculo',
      'como passar em cálculo?',
      'como eu faço para passar em cálculo',
      'dicas para passar em cálculo',
      'por favor como eu consigo passar em cálculo'
    ]) {
      const result = engine.evaluate(text, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matchedItem, 'Como passar em Cálculo?', text);
      assert.match(result.text, /Depende da sua religião/, text);
    }
    assert.notEqual(engine.evaluate('como passar do tcc i para o tcc ii', { isGroup: false, ignorePermissions: true }).matchedItem, 'Como passar em Cálculo?');
    assert.notEqual(engine.evaluate('ontem comentaram sobre como passar em cálculo', { isGroup: false, ignorePermissions: true }).matchedItem, 'Como passar em Cálculo?');
  } finally { engine.close(); close(holder); }
});

test('v0.10.2 migration fixes an existing v0.10.1 joke trigger without replacing its response or attachment', () => {
  const holder = temporaryDatabase();
  try {
    const card = holder.db.listAutomaticMessages().find(item => item.title === 'Como passar em Cálculo?');
    assert.ok(card);
    const oldTrigger = {
      ...card.trigger,
      sentences: [],
      regex_pattern: '(?:(?:como|dicas?)[^?\\n]{0,120}(?:passar)[^?\\n]{0,100}(?:c[aá]lculo|calculo))[^?\\n]*\\?\\s*$'
    };
    holder.db.db.prepare('UPDATE automatic_messages SET response_text=?,attachment_json=?,trigger_json=? WHERE id=?')
      .run('Resposta personalizada preservada.', JSON.stringify({ original_name: 'meme.gif', stored_name: 'meme.gif', mime_type: 'image/gif' }), JSON.stringify(oldTrigger), card.id);
    holder.db.db.prepare("UPDATE settings SET value='false' WHERE key='fun_cards_v0102_seeded'").run();
    holder.db.close(); holder.db = null;

    const reopened = new Database(holder.dbPath, { seedBundledContent: true });
    holder.db = reopened;
    const migrated = reopened.getAutomaticMessage(card.id);
    assert.equal(migrated.response_text, 'Resposta personalizada preservada.');
    assert.equal(migrated.attachment.original_name, 'meme.gif');
    assert.ok(migrated.trigger.sentences.includes('como passar em cálculo'));
    assert.equal(evaluateTrigger('como passar em cálculo', migrated).matched, true);
    assert.equal(reopened.getSetting('fun_cards_v0102_seeded'), 'true');
  } finally { close(holder); }
});
