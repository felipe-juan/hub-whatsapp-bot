'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const size = relative => fs.statSync(path.join(root, relative)).size;

test('fachadas centrais permanecem pequenas e delegam para módulos temáticos', () => {
  const limits = {
    'src/bot-engine.js': 50_000,
    'src/database/migrations/legacy.js': 10_000,
    'src/admin-server.js': 35_000,
    'src/whatsapp.js': 15_000,
    'src/content/bsi-course.js': 5_000
  };
  for (const [file, limit] of Object.entries(limits)) {
    assert.ok(size(file) < limit, `${file}: ${size(file)} bytes; limite ${limit}`);
  }
});

test('módulos solicitados do motor e do painel existem e são carregáveis', () => {
  const engineModules = ['academic-handler','card-handler','context-handler','correction-handler','disambiguation-handler','learning-handler','reaction-handler','fallback-handler'];
  const adminModules = ['auth-routes','cards-routes','learning-routes','academic-routes','backup-routes','diagnostics-routes'];
  for (const name of engineModules) assert.equal(typeof require(path.join(root, 'src', 'engine', name)), 'function', name);
  for (const name of adminModules) assert.equal(typeof require(path.join(root, 'src', 'admin', name)), 'function', name);
});

test('métodos públicos continuam disponíveis depois da instalação dos handlers', () => {
  const { BotEngine } = require('../src/bot-engine');
  class WhatsAppManager {}
  for (const name of ['connection-handler','incoming-handler','outbound-handler','lifecycle-handler','group-sync-handler']) require(path.join(root, 'src', 'whatsapp', name))(WhatsAppManager, {});
  for (const method of ['evaluate','simulate','contextualFollowUpEvaluation','pendingEvaluation','professorCardEvaluation','handleContextualReaction','recoveryEvaluationFor']) {
    assert.equal(typeof BotEngine.prototype[method], 'function', `BotEngine.${method}`);
  }
  for (const method of ['start','handleMessages','deliverPersistent','gracefulShutdown','syncGroups']) {
    assert.equal(typeof WhatsAppManager.prototype[method], 'function', `WhatsAppManager.${method}`);
  }
});

test('conteúdo BSI conserva ordem e quantidade após divisão', () => {
  const { BSI_COURSE_CARDS } = require('../src/content/bsi-course');
  assert.equal(BSI_COURSE_CARDS.length, 50);
  assert.equal(BSI_COURSE_CARDS[0].message.title, 'BSI — Duração e prazo de conclusão');
  assert.equal(BSI_COURSE_CARDS.at(-1).message.title, 'BSI — Editais e oportunidades');
  assert.equal(Object.isFrozen(BSI_COURSE_CARDS), true);
});

test('nenhum módulo novo volta a concentrar tamanho excessivo', () => {
  const directories = ['src/engine','src/admin','src/whatsapp','src/database/migrations/legacy','src/content/bsi-course'];
  for (const directory of directories) {
    for (const entry of fs.readdirSync(path.join(root, directory))) {
      if (!entry.endsWith('.js')) continue;
      const file = path.join(directory, entry);
      assert.ok(size(file) < 55_000, `${file} voltou a ficar grande: ${size(file)} bytes`);
    }
  }
});
