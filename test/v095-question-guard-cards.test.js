const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateTrigger, evaluateCompiledTrigger, compileTriggerRules, prepareMessage, endsWithQuestionMark } = require('../src/trigger-rules');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { INSTITUTIONAL_CARDS_V098 } = require('../src/institutional-cards');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v095-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('question guard only considers a question mark at the end', () => {
  assert.equal(endsWithQuestionMark('onde fica?'), true);
  assert.equal(endsWithQuestionMark('onde fica?   '), true);
  assert.equal(endsWithQuestionMark('onde? fica'), false);
  assert.equal(endsWithQuestionMark('onde fica'), false);
});

test('direct short phrases work without ?, but extra text does not', () => {
  const item = { trigger: { sentences: ['calendário acadêmico', 'qual é o contato da caens'], keywords: [] } };
  assert.equal(evaluateTrigger('calendário acadêmico', item).matched, true);
  assert.equal(evaluateTrigger('contato caens', item).matched, true);
  assert.equal(evaluateTrigger('contato da caens', item).matched, true);
  assert.equal(evaluateTrigger('alguma coisa calendário acadêmico', item).matched, false);
  assert.equal(evaluateTrigger('a gente falou do contato da caens', item).matched, false);
  assert.equal(evaluateTrigger('calendário acadêmico? comentário depois', item).matched, false);
});

test('long natural questions with explicit interrogative structure work without final ?', () => {
  const item = { trigger: { sentences: ['qual é o contato da caens'], keywords: [] } };
  assert.equal(evaluateTrigger('você sabe o contato da caens?', item).matched, true);
  assert.equal(evaluateTrigger('alguma coisa sobre o contato da caens?', item).matched, true);
  assert.equal(evaluateTrigger('você sabe o contato da caens', item).matched, true);
  assert.equal(evaluateTrigger('você sabe o contato da caens? obrigado', item).matched, true);
  assert.equal(evaluateTrigger('a gente falou do contato da caens', item).matched, false);
});

test('keyword-only cards use the same safe direct exception', () => {
  const compiled = compileTriggerRules({ keywords: ['contato', 'caens'], match_mode: 'all' });
  assert.equal(evaluateCompiledTrigger(prepareMessage('contato caens'), compiled).matched, true);
  assert.equal(evaluateCompiledTrigger(prepareMessage('contato da caens'), compiled).matched, true);
  assert.equal(evaluateCompiledTrigger(prepareMessage('quero contato da caens'), compiled).matched, false);
  assert.equal(evaluateCompiledTrigger(prepareMessage('quero saber o contato da caens'), compiled).matched, true);
  assert.equal(evaluateCompiledTrigger(prepareMessage('quero contato da caens?'), compiled).matched, true);
  const generic = compileTriggerRules({ keywords: ['contato'], match_mode: 'all' });
  assert.equal(evaluateCompiledTrigger(prepareMessage('contato'), generic).matched, false);
});

test('all canonical IFBA/BSI cards obey direct-vs-long-message policy', () => {
  assert.ok(INSTITUTIONAL_CARDS_V098.length >= 100);
  for (const definition of INSTITUTIONAL_CARDS_V098) {
    const message = definition.message;
    assert.equal(message.trigger.require_question_mark, true, `${message.title}: flag`);
    assert.ok(message.trigger.sentences.length > 0, `${message.title}: sentences`);
    const direct = message.trigger.sentences[0].replace(/\?+\s*$/, '').trim();
    const compiled = compileTriggerRules(message.trigger);
    assert.equal(evaluateCompiledTrigger(prepareMessage(direct), compiled).matched, true, `${message.title}: direct`);
    assert.equal(evaluateCompiledTrigger(prepareMessage(`comentário aleatório antes ${direct}`), compiled).matched, false, `${message.title}: long without ?`);
    assert.equal(evaluateCompiledTrigger(prepareMessage(`por favor ${direct}?`), compiled).matched, true, `${message.title}: long with ?`);
  }
});

test('database bundles all cards and forces guard on old and future cards', () => {
  const holder = tempDb();
  try {
    const all = holder.db.listAutomaticMessages();
    const titles = new Set(INSTITUTIONAL_CARDS_V098.map(item => item.message.title));
    const bundled = all.filter(item => titles.has(item.title));
    assert.equal(bundled.length, INSTITUTIONAL_CARDS_V098.length);
    assert.equal(new Set(bundled.map(item => item.title)).size, INSTITUTIONAL_CARDS_V098.length);
    assert.ok(all.every(item => item.trigger.require_question_mark === true));
    const created = holder.db.saveAutomaticMessage({
      title: 'Teste futuro', response_text: 'ok', active: true,
      trigger: { sentences: ['teste futuro'], require_question_mark: false }
    });
    assert.equal(created.trigger.require_question_mark, true);
  } finally { holder.close(); }
});

test('every bundled old and new card rejects extra text without a final ?', () => {
  const holder = tempDb();
  try {
    const messages = holder.db.listAutomaticMessages().filter(item => item.active && !item.archived);
    assert.ok(messages.length >= 120);
    for (const item of messages) {
      assert.equal(item.trigger.require_question_mark, true, `${item.title}: global flag`);
      const sentence = item.trigger.sentences?.[0];
      if (!sentence) continue;
      const direct = String(sentence).replace(/\?+\s*$/, '').trim();
      assert.equal(evaluateTrigger(`comentário casual antes ${direct}`, item).matched, false, `${item.title}: prefixed without ?`);
    }
  } finally { holder.close(); }
});

test('end-to-end examples choose expected cards', () => {
  const holder = tempDb();
  const engine = new BotEngine(holder.db);
  try {
    const cases = [
      ['calendário acadêmico', true, 'HUB — Calendário Acadêmico'],
      ['alguma coisa calendário acadêmico', false, ''],
      ['alguma coisa calendário acadêmico?', false, ''],
      ['contato caens', true, 'CAENS — contact'],
      ['contato da caens', true, 'CAENS — contact'],
      ['você sabe o contato da caens?', true, 'CAENS — contact'],
      ['você sabe o contato da caens', true, 'CAENS — contact'],
      ['você sabe o contato da caens? obrigado', true, 'CAENS — contact']
    ];
    for (const [body, matched, title] of cases) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, matched, body);
      assert.equal(result.matchedItem, title, body);
    }
  } finally { engine.close(); holder.close(); }
});
