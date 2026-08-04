'use strict';

const { SEMESTER_WEEKLY_CARDS_V0143 } = require('../../../content/semester-weekly-cards');
const { normalizeText } = require('../../../text');

module.exports = {
  id: '0159-semester-direct-triggers',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;

    for (const definition of SEMESTER_WEEKLY_CARDS_V0143) {
      database.stagePackageAutomaticMessage(definition.key, definition.message);
    }

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='regression_cases'").get()) {
      const now = new Date().toISOString();
      const insert = db.prepare(`INSERT OR IGNORE INTO regression_cases
        (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?)`);
      const ordinals = ['primeiro','segundo','terceiro','quarto','quinto','sexto','sétimo','oitavo'];
      const romans = ['i','ii','iii','iv','v','vi','vii','viii'];
      for (let number = 1; number <= 8; number += 1) {
        const title = `BSI — Aulas e horários do ${number}º semestre`;
        for (const phrase of [
          `${ordinals[number - 1]} semestre`,
          `semestre ${number}`,
          `${number}º semestre`,
          `${number}o semestre`,
          `semestre ${romans[number - 1]}`,
          `${romans[number - 1]} semestre`
        ]) insert.run(phrase, normalizeText(phrase), 'respond', title, now, now);
      }
    }
  }
};
