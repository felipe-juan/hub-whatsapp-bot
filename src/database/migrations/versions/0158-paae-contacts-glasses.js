'use strict';

const { STUDENT_ASSISTANCE_CARDS } = require('../../../content/student-assistance');

module.exports = {
  id: '0158-paae-contacts-glasses',
  up(db, database) {
    const seedBundledContent = database.options?.seedBundledContent === true
      || (database.options?.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
    if (!seedBundledContent) return;
    const keys = new Set([
      'ifba-bsi-v095-paae-bolsas-e-auxilios',
      'ifba-bsi-v0157-paae-valores-cronograma'
    ]);
    for (const definition of STUDENT_ASSISTANCE_CARDS.filter(item => keys.has(item.key))) {
      database.stagePackageAutomaticMessage(definition.key, definition.message);
    }
  }
};
