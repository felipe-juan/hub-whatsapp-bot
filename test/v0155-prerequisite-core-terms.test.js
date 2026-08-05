'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');

function holder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0155-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  return { db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('quebra e requisito são os termos centrais do card', () => {
  const h = holder(); const engine = new BotEngine(h.db);
  try {
    for (const phrase of [
      'como faz a quebra de pré requisito?',
      'como faz a quebra de requisito?',
      'como faço a quebra dos requisitos?',
      'onde peço a quebra de pré-requisitos?',
      'qual é o procedimento para a quebra desses requisitos?'
    ]) {
      const result = engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, phrase);
      assert.match(result.matchedItem, /Quebra de Pr[eé]-requisito/iu, phrase);
    }
  } finally { engine.close(); h.close(); }
});

test('contextos de requisitos de software continuam excluídos', () => {
  const h = holder(); const engine = new BotEngine(h.db);
  try {
    for (const phrase of [
      'como funciona a quebra de requisitos funcionais?',
      'o que é quebra no levantamento de requisitos?',
      'como corrigir a quebra de requisitos de software?'
    ]) {
      const result = engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
      assert.doesNotMatch(String(result.matchedItem || ''), /Quebra de Pr[eé]-requisito/iu, phrase);
    }
  } finally { engine.close(); h.close(); }
});
