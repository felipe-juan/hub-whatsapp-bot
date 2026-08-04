// Agregador canônico. O conteúdo foi dividido por domínio para reduzir o risco
// de regressões e permitir manutenção independente.
const { CAMPUS_CARDS } = require('./content/campus');
const { SECTOR_CARDS } = require('./content/sectors');
const { BSI_COURSE_CARDS } = require('./content/bsi-course');
const { TCC_CARDS } = require('./content/tcc');
const { INTERNSHIP_CARDS } = require('./content/internship');
const { STUDENT_ASSISTANCE_CARDS } = require('./content/student-assistance');
const { SCHEDULE_BOARD_V0812, SEMESTER_DAY_SCHEDULE_CARD_V0106 } = require('./content/schedule-board');
const { ACADEMIC_LIFE_CARDS } = require('./content/academic-life');
const { COMMUNITY_CARDS } = require('./content/community');
const { formatDisciplineNamesInText } = require('./si-professors-2026-2');
const { toPortugueseTitleCase } = require('./title-case');

const HUB_ARQUIVOS_URL = 'https://felipe-juan.github.io/hub-arquivos-ifba/';
const HUB_RELATED_CARD_KEYS = new Set([
  'ifba-bsi-v095-bsi-pagina-oficial-do-curso',
  'ifba-bsi-v095-bsi-ppc-atual',
  'ifba-bsi-v095-hub-fluxograma-e-matriz-de-sistemas-de-informacao',
  'ifba-bsi-v095-bsi-disciplinas-optativas',
  'ifba-bsi-v095-bsi-ementas-e-bibliografias',
  'ifba-bsi-v095-bsi-pre-requisitos-das-disciplinas',
  'ifba-bsi-v095-bsi-equivalencia-entre-matrizes',
  'ifba-bsi-v095-bsi-migracao-curricular',
  'ifba-bsi-v095-bsi-regulamentos-especificos',
  'ifba-bsi-v095-bsi-atividades-complementares-da-matriz-atual',
  'ifba-bsi-v095-bsi-atividades-complementares-de-matrizes-anteriores'
]);
function appendHubReference(key, value) {
  const text = String(value || '').trim();
  if (!HUB_RELATED_CARD_KEYS.has(key) || text.includes('felipe-juan.github.io/hub-arquivos-ifba')) return text;
  return `${text}

🌐 *HUB Arquivos IFBA*
${HUB_ARQUIVOS_URL}`.trim();
}

const INSTITUTIONAL_CARDS_V098 = Object.freeze([
  ...CAMPUS_CARDS,
  ...SECTOR_CARDS,
  ...BSI_COURSE_CARDS,
  ...TCC_CARDS,
  ...INTERNSHIP_CARDS,
  ...STUDENT_ASSISTANCE_CARDS,
  ...ACADEMIC_LIFE_CARDS,
  SEMESTER_DAY_SCHEDULE_CARD_V0106,
  ...COMMUNITY_CARDS
].map(definition => ({
  ...definition,
  message: {
    ...definition.message,
    title: toPortugueseTitleCase(definition.message?.title || ''),
    response_text: formatDisciplineNamesInText(appendHubReference(definition.key, definition.message?.response_text || '')),
    details_text: formatDisciplineNamesInText(appendHubReference(definition.key, definition.message?.details_text || ''))
  }
})));

function automaticMessagePayload(item) {
  return {
    title: item.title, response_text: item.response_text, details_text: item.details_text || '',
    source_url: item.source_url || '', source_title: item.source_title || '', verified_at: item.verified_at || '',
    priority: Number(item.priority || 40), active: item.active !== false, archived: Boolean(item.archived),
    scope: item.scope || 'both', attachment: item.attachment || null,
    trigger: item.trigger || { match_mode: 'all', sentences: item.sentences || [], keywords: [], required_words: [], require_question_mark: true, typo_tolerance: 1, excluded_words: [], exact_phrases: [], synonym_group_ids: [], negative_examples: [], regex_pattern: item.regex_pattern || '', regex_flags: 'iu' }
  };
}

module.exports = { INSTITUTIONAL_CARDS_V098, SCHEDULE_BOARD_V0812, automaticMessagePayload };
