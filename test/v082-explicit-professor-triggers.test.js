const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');
const { SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, SI_DISCIPLINE_ALIASES_2026_2 } = require('../src/si-professors-2026-2');
const { normalizeText } = require('../src/text');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v082-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

test('every bundled professor sentence identifies the professor by name or by one of their disciplines', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
    for (const professor of items) {
      const title = professor.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${professor.name}`;
      const card = db.listAutomaticMessages().find(item => item.title === title);
      assert.ok(card, `missing card ${title}`);
      const aliases = (SI_PROFESSOR_TRIGGER_ALIASES_2026_2[professor.name] || [professor.identifier]).map(normalizeText);
      const disciplines = (professor.classes || []).flatMap(entry => [entry[0], ...(SI_DISCIPLINE_ALIASES_2026_2[entry[0]] || [])]).map(normalizeText);
      assert.ok(card.trigger.sentences.length > 0);
      for (const sentence of card.trigger.sentences) {
        const normalized = normalizeText(sentence);
        const identifiesByName = aliases.some(alias => normalized.includes(alias));
        const identifiesByDiscipline = disciplines.some(discipline => normalized.includes(discipline));
        assert.ok(identifiesByName || identifiesByDiscipline, `${title}: generic sentence: ${sentence}`);
      }
      assert.deepEqual(card.trigger.required_words, []);
    }
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('uncommon surnames and explicit names trigger only the intended professor', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    const bruno = messages.find(item => item.title === 'Professor — Bruno Silvério Costa');
    const paulo = messages.find(item => item.title === 'Professor — Paulo Espinheira Menezes de Melo');
    const luis = messages.find(item => item.title === 'Professor — Luís Paulo da Silva Carvalho');
    const leonardo = messages.find(item => item.title === 'Professor — Leonardo Barreto Campos');
    const thiago = messages.find(item => item.title === 'Professor — Thiago Leonardo Bastos da Silva');

    assert.equal(evaluateTrigger('qual o contato do Silvério?', bruno).matched, true);
    assert.equal(evaluateTrigger('que dia o Bruno está no IFBA?', bruno).matched, true);
    assert.equal(evaluateTrigger('email do Espinheira', paulo).matched, true);
    assert.equal(evaluateTrigger('qual o contato de Luís Paulo?', paulo).matched, false);
    assert.equal(evaluateTrigger('qual o contato de Luís Paulo?', luis).matched, true);
    assert.equal(evaluateTrigger('email do Barreto', leonardo).matched, true);
    assert.equal(evaluateTrigger('email do Thiago Bastos', leonardo).matched, false);
    assert.equal(evaluateTrigger('email do Thiago Bastos', thiago).matched, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.8.2 migrates old generic professor triggers without changing the response', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const card = db.listAutomaticMessages().find(item => item.title === 'Professor — Allan de Sousa Soares');
    const originalResponse = card.response_text;
    const oldTrigger = {
      match_mode: 'all',
      sentences: ['contato', 'ctt', 'email', 'e-mail', 'dia', 'dias', 'quando', 'horário'],
      keywords: [],
      required_words: ['allan'],
      require_question_mark: false,
      typo_tolerance: 1,
      excluded_words: [],
      exact_phrases: [],
      synonym_group_ids: [],
      negative_examples: []
    };
    db.db.prepare('UPDATE automatic_messages SET trigger_json=? WHERE id=?').run(JSON.stringify(oldTrigger), card.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_professors_2026_2_triggers_v082_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = reopened.listAutomaticMessages().find(item => item.title === 'Professor — Allan de Sousa Soares');
    assert.equal(migrated.response_text, originalResponse);
    assert.deepEqual(migrated.trigger.required_words, []);
    assert.ok(migrated.trigger.sentences.some(sentence => normalizeText(sentence).includes('allan')));
    assert.ok(migrated.trigger.sentences.some(sentence => normalizeText(sentence).includes('matematica discreta ii')));
    assert.equal(reopened.getSetting('si_professors_2026_2_triggers_v082_migrated'), 'true');
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
