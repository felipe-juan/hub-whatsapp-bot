const { normalizeText } = require('./text');

const PROGRESSIVE_MENUS = Object.freeze({
  [normalizeText('BSI — Regulamento de TCC')]: 'tcc',
  [normalizeText('BSI — Como iniciar o TCC I')]: 'tcc',
  [normalizeText('Estágio — Como iniciar')]: 'internship_steps'
});

function progressiveMenuFor(title) { return PROGRESSIVE_MENUS[normalizeText(title)] || ''; }

module.exports = { PROGRESSIVE_MENUS, progressiveMenuFor };
