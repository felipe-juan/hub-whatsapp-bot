'use strict';

const { RESOURCE_CARDS } = require('../../../content/resources');
const { normalizeText } = require('../../../text');

module.exports = {
  id: '0155-prerequisite-core-terms',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;

    const card = RESOURCE_CARDS.find(item => item.key === 'hub-bsi-quebra-pre-requisito-v0151');
    if (!card) throw new Error('Card canônico de quebra de pré-requisito não encontrado.');
    database.stagePackageAutomaticMessage(card.key, card.message);

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='regression_cases'").get()) {
      const now = new Date().toISOString();
      const insert = db.prepare(`INSERT OR IGNORE INTO regression_cases
        (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?)`);
      for (const phrase of [
        'como faz a quebra de pré requisito?',
        'como faz a quebra de requisito?',
        'como faço a quebra dos requisitos?',
        'onde peço a quebra de pré-requisitos?'
      ]) {
        insert.run(phrase, normalizeText(phrase), 'respond', 'BSI — Quebra de pré-requisito', now, now);
      }
    }
  }
};
