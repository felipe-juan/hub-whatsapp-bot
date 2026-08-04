'use strict';

const { RESOURCE_CARDS } = require('../../../content/resources');
const { normalizeText } = require('../../../text');

module.exports = {
  id: '0153-resource-drive-links',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;

    const repositoryCard = RESOURCE_CARDS.find(item => item.key === 'hub-bsi-repositorios-arquivos-v0151');
    if (!repositoryCard) throw new Error('Card canônico de repositórios não encontrado.');
    database.stagePackageAutomaticMessage(repositoryCard.key, repositoryCard.message);

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='regression_cases'").get()) {
      const timestamp = new Date().toISOString();
      const insert = db.prepare(`INSERT OR IGNORE INTO regression_cases
        (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?)`);
      for (const phrase of ['drive 2025.2', 'drive dos veteranos', 'qual é o drive mais atual de BSI?']) {
        insert.run(phrase, normalizeText(phrase), 'respond', 'BSI — Repositórios, arquivos e materiais', timestamp, timestamp);
      }
    }
  }
};
