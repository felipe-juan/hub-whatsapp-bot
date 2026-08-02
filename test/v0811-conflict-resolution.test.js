'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { findAutomaticMessageMatchesDetailed } = require('../src/matcher');
const { evaluateTrigger, phraseMatch } = require('../src/trigger-rules');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v0811-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function titles(db, message) {
  return findAutomaticMessageMatchesDetailed(message, db.listAutomaticMessages(), [], 10, { isGroup: true })
    .map(item => item.item.title);
}

function first(db, message) { return titles(db, message)[0]; }

test('versioned acronyms and numbered disciplines do not match neighboring versions', () => {
  assert.equal(phraseMatch('ctt de PW II', 'ctt de PW', 1).matched, false);
  assert.equal(phraseMatch('ctt de PWII', 'ctt de PWI', 1).matched, false);
  assert.equal(phraseMatch('ctt de LPII', 'ctt de LPI', 1).matched, false);
  assert.equal(phraseMatch('ctt de TCCI', 'ctt de TCCII', 1).matched, false);
  assert.equal(phraseMatch('ctt de ACE III', 'ctt de ACE I', 1).matched, false);
  assert.equal(phraseMatch('ctt de IAC', 'ctt de IA', 1).matched, false);
});

test('all reported acronym conflicts resolve to exactly one professor', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const cases = new Map([
      ['ctt de PW', 'Professor — Andrique Figueirêdo Amorim'],
      ['ctt de PWI', 'Professor — Bruno Silvério Costa'],
      ['ctt de PWII', 'Professor — Alexandro dos Santos Silva'],
      ['ctt de PW 2', 'Professor — Alexandro dos Santos Silva'],
      ['ctt de LPI', 'Professor — Cláudio Rodolfo Sousa de Oliveira'],
      ['ctt de LPII', 'Professor — Alexandro dos Santos Silva'],
      ['ctt de ACE I', 'Professor — Andrique Figueirêdo Amorim'],
      ['ctt de ACE II', 'Professor — Cláudio Rodolfo Sousa de Oliveira'],
      ['ctt de ACE III', 'Professor — Camilo Alves Carvalho'],
      ['ctt de ACE IV', 'Professor — Pablo Freire Matos'],
      ['ctt de ecommerce', 'Professor — Andrique Figueirêdo Amorim'],
      ['ctt de ECO', 'Professor — Ualace Roberto de Jesus Oliveira'],
      ['ctt de IA', 'Professor — Bruno Silvério Costa'],
      ['ctt de IAC', 'Professor — Polliana Freire dos Anjos de Oliveira'],
      ['ctt de TCCI', 'Professor — Djan Almeida Santos'],
      ['ctt de TCCII', 'Professor — Liojes de Oliveira Carneiro']
    ]);
    for (const [message, expected] of cases) {
      const matches = titles(db, message);
      assert.equal(matches[0], expected, message);
      assert.equal(matches.filter(title => title.startsWith('Professor —')).length, 1, `${message}: ${matches.join(', ')}`);
    }
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('shared calculus discipline uses one combined card and individual names remain available', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const title = 'Disciplina compartilhada — Cálculo Diferencial Aplicado à Computação';
    assert.equal(first(db, 'qual o contato do professor de Cálculo Diferencial Aplicado à Computação?'), title);
    assert.equal(first(db, 'ctt de CDAC'), title);
    const shared = db.listAutomaticMessages().find(item => item.title === title);
    assert.match(shared.response_text, /Paulo Espinheira Menezes de Melo/);
    assert.match(shared.response_text, /Thiago Leonardo Bastos da Silva/);
    assert.match(shared.response_text, /paulomelo@ifba\.edu\.br/);
    assert.match(shared.response_text, /thiago\.silva@ifba\.edu\.br/);
    assert.equal(first(db, 'qual o contato do Espinheira?'), 'Professor — Paulo Espinheira Menezes de Melo');
    assert.equal(first(db, 'qual o contato do Bastos?'), 'Professor — Thiago Leonardo Bastos da Silva');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.8.11 migration removes standalone calculo trigger without changing the custom response or attachment', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const created = db.saveAutomaticMessage({
      title: 'Como passar em Cálculo?',
      response_text: 'Resposta personalizada mantida.',
      scope: 'both', active: true,
      attachment: { stored_name: 'meme.gif', original_name: 'meme.gif', mime_type: 'image/gif' },
      trigger: { match_mode: 'all', sentences: ['calculo'], keywords: ['cálculo'] }
    });
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_conflicts_v0811_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = reopened.getAutomaticMessage(created.id);
    assert.equal(migrated.response_text, 'Resposta personalizada mantida.');
    assert.equal(migrated.attachment.original_name, 'meme.gif');
    assert.equal(evaluateTrigger('ctt de cálculo', migrated).matched, false);
    assert.equal(evaluateTrigger('como passar cálculo?', migrated).matched, true);
    assert.equal(evaluateTrigger('como passar em cálculo?', migrated).matched, true);
    assert.ok(reopened.listAutomaticMessageHistory(migrated.id)
      .some(entry => entry.action === 'v0.8.11-remocao-gatilho-calculo-generico'));
    assert.equal(reopened.getSetting('si_conflicts_v0811_migrated'), 'true');
    assert.equal(reopened.getConflictReport().count, 0);
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bundled database has no unresolved trigger conflicts after v0.8.11', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const started = performance.now();
    assert.deepEqual(db.getConflictReport(), { count: 0, conflicts: [] });
    assert.ok(performance.now() - started < 1500, 'conflict analysis should remain fast');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
