// Compatibilidade com integrações anteriores. A fonte única passou a ser institutional-cards.js.
const { INSTITUTIONAL_CARDS_V098, SCHEDULE_BOARD_V0812, automaticMessagePayload } = require('./institutional-cards');
const LEGACY_TITLES = new Set([
  'Setor — CAPNE', 'Setor — CORES', 'Setor — CAENS', 'Serviço — Protocolo',
  'Contato — Coordenação de Sistemas de Informação', 'Onde está o professor — salas do IFBA',
  'HUB — Fluxograma e matriz de Sistemas de Informação', 'HUB — Média final e tabela da final',
  'HUB — Calendário acadêmico'
]);
function legacyShape(message) {
  return {
    title: message.title,
    priority: Number(message.priority || 40),
    sentences: message.trigger?.sentences || [],
    regex_pattern: message.trigger?.regex_pattern || '',
    response_text: message.response_text,
    details_text: message.details_text || '',
    source_url: message.source_url || '',
    source_title: message.source_title || '',
    verified_at: message.verified_at || ''
  };
}
const SI_SUPPORT_MESSAGES_V083 = Object.freeze(
  INSTITUTIONAL_CARDS_V098.filter(item => LEGACY_TITLES.has(item.message.title)).map(item => legacyShape(item.message))
);
module.exports = { SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload };
