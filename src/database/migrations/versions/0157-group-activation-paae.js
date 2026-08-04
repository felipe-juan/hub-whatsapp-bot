'use strict';

const { STUDENT_ASSISTANCE_CARDS } = require('../../../content/student-assistance');

const KEYS = new Set([
  'ifba-bsi-v095-paae-bolsas-e-auxilios',
  'ifba-bsi-v0157-paae-valores-cronograma'
]);

module.exports = {
  id: '0157-group-activation-paae',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;
    for (const definition of STUDENT_ASSISTANCE_CARDS.filter(item => KEYS.has(item.key))) {
      database.stagePackageAutomaticMessage(definition.key, definition.message);
    }
  }
};
