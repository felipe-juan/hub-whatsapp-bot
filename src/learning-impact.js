'use strict';

const { normalizeText } = require('./text');
const { evaluateAutomaticMessagesDetailed } = require('./matcher');
const { analyzeUnifiedQuery } = require('./engine/query-model');

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function removeAccents(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/gu, ''); }

function messageVariants(message = '') {
  const raw = String(message || '').trim();
  const normalized = normalizeText(raw);
  const variants = [raw, normalized, removeAccents(raw), raw.replace(/[?!.]+$/u, ''), raw.toUpperCase(), raw.toLowerCase()];
  const replacements = [
    ['quando', 'qual o dia'], ['qual o dia', 'quando'], ['horário', 'horario'], ['matéria', 'disciplina'],
    ['disciplina', 'matéria'], ['professor', 'docente'], ['contato', 'email']
  ];
  for (const [from, to] of replacements) if (normalizeText(raw).includes(normalizeText(from))) variants.push(raw.replace(new RegExp(from, 'iu'), to));
  return unique(variants.map(value => String(value || '').replace(/\s{2,}/gu, ' ').trim()).filter(value => value.length >= 2)).slice(0, 20);
}

function clonedMessagesWithSentence(messages, messageId, sentence) {
  return messages.map(item => {
    if (Number(item.id) !== Number(messageId)) return item;
    return { ...item, trigger: { ...(item.trigger || {}), sentences: unique([...(item.trigger?.sentences || []), sentence]) } };
  });
}

function clonedMessagesWithNegative(messages, messageId, sentence, pattern = {}, applyPattern = false) {
  return messages.map(item => {
    if (Number(item.id) !== Number(messageId)) return item;
    const next = { ...item, trigger: { ...(item.trigger || {}), negative_examples: unique([...(item.trigger?.negative_examples || []), sentence]) } };
    if (applyPattern && pattern?.negative_terms?.length) next.trigger_policy = { ...(item.trigger_policy || {}), negative_terms: unique([...(item.trigger_policy?.negative_terms || []), ...pattern.negative_terms]) };
    return next;
  });
}

function matchedTitles(text, messages, synonyms) {
  return evaluateAutomaticMessagesDetailed(text, messages, synonyms, { isGroup: false })
    .filter(item => item.matched && !item.item?.observation_mode)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map(item => item.item.title);
}

function previewCardChange({ db, engine, messages, proposedMessages, variants, suggestion }) {
  const synonyms = db.listSynonymGroups({ activeOnly: true });
  const variantResults = variants.map(phrase => {
    const before = matchedTitles(phrase, messages, synonyms);
    const after = matchedTitles(phrase, proposedMessages, synonyms);
    return { phrase, before, after, changed: JSON.stringify(before) !== JSON.stringify(after), target_before: before.includes(suggestion.message_title || suggestion.suggested_title), target_after: after.includes(suggestion.message_title || suggestion.suggested_title) };
  });
  const regressions = (db.listRegressionCases?.({ activeOnly: true }) || []).map(item => {
    const beforeEvaluation = engine.simulate(item.phrase, { isGroup: false, includeDrafts: false });
    const afterTitles = matchedTitles(item.phrase, proposedMessages, synonyms);
    const beforeResponded = Boolean(beforeEvaluation?.matched && beforeEvaluation.type !== 'disambiguation');
    const afterResponded = afterTitles.length > 0;
    const afterTitleOk = !item.expected_title || afterTitles.some(title => normalizeText(title).includes(normalizeText(item.expected_title)));
    const passedAfter = item.expectation === 'ignore' ? !afterResponded : afterResponded && afterTitleOk;
    const passedBefore = item.expectation === 'ignore' ? !beforeResponded : beforeResponded && (!item.expected_title || normalizeText(beforeEvaluation?.matchedItem || '').includes(normalizeText(item.expected_title)));
    return { id: item.id, phrase: item.phrase, passed_before: passedBefore, passed_after: passedAfter, actual_after: afterTitles[0] || 'ignorada' };
  });
  const conflicts = variantResults.filter(item => item.after.length > 1).map(item => ({ phrase: item.phrase, titles: item.after.slice(0, 5) }));
  return {
    variants: variantResults,
    newMatches: variantResults.filter(item => !item.target_before && item.target_after).length,
    removedMatches: variantResults.filter(item => item.target_before && !item.target_after).length,
    conflicts,
    regressions: { total: regressions.length, failed_before: regressions.filter(item => !item.passed_before).length, failed_after: regressions.filter(item => !item.passed_after).length, newly_failed: regressions.filter(item => item.passed_before && !item.passed_after) }
  };
}

function previewLearningImpact({ db, engine, type, id, applyPattern = false } = {}) {
  const messages = db.listAutomaticMessages({ activeOnly: true, cloneResult: false });
  if (type === 'positive') {
    const suggestion = db.getUnrecognizedSuggestion(id);
    if (!suggestion) throw new Error('Sugestão de associação não encontrada.');
    const proposed = clonedMessagesWithSentence(messages, suggestion.suggested_message_id, suggestion.message_excerpt);
    return { type, suggestion, ...previewCardChange({ db, engine, messages, proposedMessages: proposed, variants: messageVariants(suggestion.message_excerpt), suggestion }) };
  }
  if (type === 'negative') {
    const suggestion = db.getNegativeExampleSuggestion(id);
    if (!suggestion) throw new Error('Sugestão negativa não encontrada.');
    const proposed = clonedMessagesWithNegative(messages, suggestion.message_id, suggestion.message_excerpt, suggestion.pattern, applyPattern);
    return { type, suggestion, applyPattern, ...previewCardChange({ db, engine, messages, proposedMessages: proposed, variants: messageVariants(suggestion.message_excerpt), suggestion }) };
  }
  if (type === 'discipline_alias') {
    const suggestion = db.getDisciplineAliasSuggestion(id);
    if (!suggestion) throw new Error('Sugestão de alias não encontrada.');
    const period = db.getSetting('current_academic_period', '2026.2');
    const schedule = db.listProfessorDisciplineDirectory({ academicPeriod: period, activeOnly: true });
    const before = analyzeUnifiedQuery(suggestion.alias, { scheduleEntries: schedule, teachers: db.listTeachers({ activeOnly: true }), allowShortStandalone: true });
    const proposedSources = [...schedule, { discipline_name: suggestion.discipline_name, discipline_code: suggestion.discipline_code, alias: suggestion.alias }];
    const after = analyzeUnifiedQuery(suggestion.alias, { scheduleEntries: proposedSources, teachers: db.listTeachers({ activeOnly: true }), allowShortStandalone: true });
    const collision = after.entities.disciplineCandidates.filter(item => normalizeText(item.name) !== normalizeText(suggestion.discipline_name));
    return { type, suggestion, variants: messageVariants(suggestion.alias), before: before.entities.disciplineCandidates, after: after.entities.disciplineCandidates, conflicts: collision.map(item => ({ title: [item.code, item.name].filter(Boolean).join(' — ') })), regressions: { total: 0, failed_before: 0, failed_after: 0, newly_failed: [] } };
  }
  throw new Error('Tipo de sugestão inválido.');
}

module.exports = { previewLearningImpact, messageVariants };
