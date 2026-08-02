// Compatibilidade com integrações anteriores. A fonte única passou a ser institutional-cards.js.
const { INSTITUTIONAL_CARDS_V098 } = require('./institutional-cards');
const IFBA_BSI_CARDS_V095 = Object.freeze(
  INSTITUTIONAL_CARDS_V098.filter(item => item.legacyGroup === 'bsi').map(item => ({ key: item.key, message: item.message }))
);
module.exports = { IFBA_BSI_CARDS_V095 };
