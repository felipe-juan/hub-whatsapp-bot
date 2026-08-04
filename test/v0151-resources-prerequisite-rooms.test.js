'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0151-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function simulate(engine, phrase) {
  return engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
}

test('card de repositórios aceita atalhos diretos e perguntas contextuais', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    const phrases = [
      'repositório', 'arquivos', 'links do drive', 'drive', 'hub arquivos', 'materiais',
      'drive 2025.2', 'drive dos veteranos', 'drive mais atual',
      'qual o repositório?', 'o que tem no repositório?', 'que arquivos existem de BSI?',
      'onde encontro materiais do curso?', 'qual o link do drive?', 'quais são os links úteis de BSI?'
    ];
    for (const phrase of phrases) {
      const result = simulate(engine, phrase);
      assert.equal(result.matched, true, phrase);
      assert.equal(result.matchedItem, 'BSI — Repositórios, Arquivos e Materiais', phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('card de repositórios apresenta todas as fontes informadas', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    const result = simulate(engine, 'repositório');
    assert.match(result.text, /Repositório BSI 2\.0 — Notion/u);
    assert.match(result.text, /https:\/\/app\.notion\.com\/p\/felipejuan\/Reposit-rio-BSI-2-0-2d71fedecab280bfb1d6e2a466724fb4/u);
    assert.match(result.text, /HUB Arquivos IFBA/u);
    assert.match(result.text, /https:\/\/felipe-juan\.github\.io\/hub-arquivos-ifba\//u);
    assert.match(result.text, /Google Drive da turma 2025\.2 — mais atual/u);
    assert.match(result.text, /1º semestre e o 2º semestre/u);
    assert.match(result.text, /1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl/u);
    assert.match(result.text, /Google Drive de veteranos — todos os semestres/u);
    assert.match(result.text, /I ao VI semestre/u);
    assert.match(result.text, /1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA/u);
    assert.equal((result.text.match(/1d7RuJsK8dhAFFu1z45nC6nYTscY8aqSl/gu) || []).length, 1);
    assert.equal((result.text.match(/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA/gu) || []).length, 1);
    assert.match(result.text, /Manual de sobrevivência universitária do DASI/u);
  } finally { engine.close(); holder.close(); }
});

test('termos casuais relacionados a arquivos não geram falso positivo', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    for (const phrase of [
      'meu google drive', 'o drive está cheio', 'arquivos do sistema operacional',
      'repositório institucional do IFBA', 'repositório de TCC'
    ]) {
      const result = simulate(engine, phrase);
      assert.notEqual(result.matchedItem, 'BSI — Repositórios, Arquivos e Materiais', phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('card de quebra de pré-requisito usa texto direto e gatilhos seguros', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    for (const phrase of [
      'quebra de pré-requisito', 'como funciona a quebra de pré-requisito?',
      'como pedir quebra de pré requisito?', 'posso cursar uma disciplina sem o pré requisito?',
      'quem aprova a quebra de pré requisito?'
    ]) {
      const result = simulate(engine, phrase);
      assert.equal(result.matched, true, phrase);
      assert.equal(result.matchedItem, 'BSI — Quebra de Pré-requisito', phrase);
      assert.match(result.text, /protocolo/u, phrase);
      assert.match(result.text, /Colegiado do Curso/u, phrase);
      assert.match(result.text, /aprovação não é automática/u, phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('card de numeração explica bloco, andar e localização das aulas de BSI', () => {
  const holder = temporaryDatabase();
  const engine = new BotEngine(holder.db);
  try {
    for (const phrase of [
      'qual prédio será ministrada a aula?', 'em qual prédio fica a sala?',
      'como funciona a numeração das salas?', 'em que prédio fica H008?',
      'em qual andar ficam os laboratórios de BSI?', 'prédio de BSI'
    ]) {
      const result = simulate(engine, phrase);
      assert.equal(result.matched, true, phrase);
      assert.equal(result.matchedItem, 'Campus — Como Identificar Prédio, Andar e Sala', phrase);
      assert.match(result.text, /B12.*Bloco B/us, phrase);
      assert.match(result.text, /H008.*Bloco H/us, phrase);
      assert.match(result.text, /H40x.*4º andar/us, phrase);
      assert.match(result.text, /As aulas ocorrem no \*Bloco H\*/u, phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('migração substitui card antigo genérico de Drive sem apagar personalizados', () => {
  const holder = temporaryDatabase();
  try {
    const generic = holder.db.saveAutomaticMessage({
      title: 'Links do Drive', response_text: 'Arquivos antigos\nhttps://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA',
      priority: 80, active: true, scope: 'both',
      trigger: { match_mode: 'all', sentences: ['links do drive'], keywords: [], required_words: [], excluded_words: [], exact_phrases: ['drive'], require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [], negative_examples: [] }
    });
    holder.db.db.prepare("UPDATE automatic_messages SET source_type='hub_package',customized=0 WHERE id=?").run(Number(generic.id));
    const customized = holder.db.saveAutomaticMessage({
      title: 'Meu acervo personalizado', response_text: 'Resposta personalizada\nhttps://drive.google.com/drive/folders/1WC7rQ6et4OiSq_4eZ9rLbKqGNeUm37dA',
      priority: 99, active: true, scope: 'both',
      trigger: { match_mode: 'all', sentences: ['meu acervo especial'], keywords: [], required_words: [], excluded_words: [], exact_phrases: ['arquivos'], require_question_mark: true, typo_tolerance: 1, synonym_group_ids: [], negative_examples: [] }
    });
    holder.db.db.prepare("UPDATE automatic_messages SET source_type='hub_package',customized=1 WHERE id=?").run(Number(customized.id));
    holder.db.db.prepare("DELETE FROM schema_migrations WHERE migration_id='0151-resources-prerequisite-rooms'").run();
    holder.db.runVersionedMigrations();

    const retired = holder.db.getAutomaticMessage(generic.id);
    const preserved = holder.db.getAutomaticMessage(customized.id);
    assert.equal(retired.active, false);
    assert.equal(retired.archived, true);
    assert.equal(preserved.response_text.includes('Resposta personalizada'), true);
    assert.equal(preserved.trigger.exact_phrases.includes('arquivos'), false);
    assert.equal(preserved.trigger.sentences.includes('meu acervo especial'), true);
  } finally { holder.close(); }
});
