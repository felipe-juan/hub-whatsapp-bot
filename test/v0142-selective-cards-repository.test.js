'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0142-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('consultas docentes retornam apenas os campos solicitados', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const room = engine.simulate('qual sala de LPI?', { isGroup: false, ignorePermissions: true });
    assert.equal(room.matched, true);
    assert.match(room.text, /LPI — Linguagem de Programação I/u);
    assert.match(room.text, /sala H008/u);
    assert.doesNotMatch(room.text, /claudiorodolfo@/u);
    assert.doesNotMatch(room.text, /Estruturas de Dados|ACEX II/u);

    const hours = engine.simulate('qual horário de LPI?', { isGroup: false, ignorePermissions: true });
    assert.match(hours.text, /segunda-feira/u);
    assert.match(hours.text, /18h30/u);
    assert.doesNotMatch(hours.text, /sala H008/u);

    const semester = engine.simulate('LPI é de qual semestre?', { isGroup: false, ignorePermissions: true });
    assert.match(semester.text, /2º semestre/u);
    assert.doesNotMatch(semester.text, /claudiorodolfo@|H008/u);

    const professor = engine.simulate('quem dá LPI?', { isGroup: false, ignorePermissions: true });
    assert.match(professor.text, /Cláudio Rodolfo Sousa de Oliveira/u);
    assert.doesNotMatch(professor.text, /H008|18h30/u);
  } finally { engine.close(); holder.close(); }
});

test('consulta com mais de um campo combina somente os dados pedidos', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const result = engine.simulate('sala e dia de aula de LPII', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /segunda-feira/u);
    assert.match(result.text, /sala H108/u);
    assert.doesNotMatch(result.text, /alexandrossilva@|Programação Web II/u);
  } finally { engine.close(); holder.close(); }
});

test('confirmação sobre presença de Crescêncio continua sem acionar card', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    for (const phrase of ['Crescêncio dá aula hoje?', 'Crescêncio tem aula hoje?', 'Crescêncio dará aula amanhã?']) {
      const result = engine.simulate(phrase, { isGroup: true });
      assert.equal(result.matched, false, phrase);
      assert.equal(result.blockedBy, 'teacher-attendance-unverifiable', phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('cards documentais relacionados incluem o HUB Arquivos IFBA', () => {
  const holder = temporaryDatabase();
  try {
    for (const title of ['BSI — PPC Atual', 'HUB — Fluxograma e Matriz de Sistemas de Informação', 'BSI — Regulamentos Específicos']) {
      const card = holder.db.listAutomaticMessages().find(item => item.title === title);
      assert.ok(card, title);
      assert.match(card.response_text, /https:\/\/felipe-juan\.github\.io\/hub-arquivos-ifba\//u, title);
    }
  } finally { holder.close(); }
});

test('migração adiciona repositório ao card existente de links do Drive', () => {
  const holder = temporaryDatabase();
  try {
    const card = holder.db.saveAutomaticMessage({
      title: 'Links do Drive', response_text: 'Arquivos\nhttps://drive.google.com/drive/folders/exemplo',
      priority: 80, active: true, scope: 'both',
      trigger: { match_mode: 'all', sentences: ['links do drive'], keywords: [], required_words: [], excluded_words: [], exact_phrases: [], require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [], negative_examples: [] }
    });
    holder.db.db.prepare("UPDATE settings SET value='false' WHERE key='content_v0142_selective_cards_and_repository'").run();
    holder.db.invalidate('settings');
    holder.db.migrateContentV0142();
    const updated = holder.db.getAutomaticMessage(card.id);
    assert.ok(updated.trigger.exact_phrases.includes('repositório'));
    const engine = new BotEngine(holder.db);
    const result = engine.simulate('repositório', { isGroup: false, ignorePermissions: true });
    assert.equal(result.matchedItem, 'Links do Drive');
    engine.close();
  } finally { holder.close(); }
});
