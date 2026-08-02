// Agregador canônico. O conteúdo foi dividido por domínio para reduzir o risco
// de regressões e permitir manutenção independente.
const { CAMPUS_CARDS } = require('./content/campus');
const { SECTOR_CARDS } = require('./content/sectors');
const { BSI_COURSE_CARDS } = require('./content/bsi-course');
const { TCC_CARDS } = require('./content/tcc');
const { INTERNSHIP_CARDS } = require('./content/internship');
const { STUDENT_ASSISTANCE_CARDS } = require('./content/student-assistance');
const { SCHEDULE_BOARD_V0812 } = require('./content/schedule-board');

const INSTITUTIONAL_CARDS_V098 = Object.freeze([
  ...CAMPUS_CARDS,
  ...SECTOR_CARDS,
  ...BSI_COURSE_CARDS,
  ...TCC_CARDS,
  ...INTERNSHIP_CARDS,
  ...STUDENT_ASSISTANCE_CARDS
]);

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
