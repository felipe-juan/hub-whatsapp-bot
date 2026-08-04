'use strict';

const { normalizeText } = require('../text');

const STOP = new Set(['a','ao','aos','as','de','da','das','do','dos','e','em','na','nas','no','nos','o','os','para','por','pra','pro','que','um','uma','me','eu','quero','preciso','saber','qual','quais','como','onde','quem']);
function tokens(value) { return normalizeText(value).split(/\s+/u).filter(token => token.length >= 3 && !STOP.has(token)); }
function triggerTerms(item = {}) {
  const trigger = item.trigger || {};
  const policy = item.trigger_policy || {};
  return [item.title, item.topic, ...(trigger.sentences || []), ...(trigger.keywords || []), ...(trigger.exact_phrases || []), ...(policy.related_terms || [])]
    .flatMap(tokens);
}
function unique(array) { return [...new Set(array.filter(Boolean))]; }

function specialEvidence(title, queryTokens) {
  const titleKey = normalizeText(title);
  let delta = 0;
  const has = value => queryTokens.includes(value);
  if (titleKey.includes('calculadora') && titleKey.includes('final')) {
    if (['calcular','nota','media','preciso','tirar'].some(has)) delta += 8;
    if (['quando','data','dia','sala'].some(has)) delta -= 8;
  }
  if (titleKey.includes('calendario') || titleKey.includes('calendário')) {
    if (['quando','data','dia','feriado','prazo'].some(has)) delta += 6;
  }
  if (titleKey.includes('biblioteca')) {
    if (['livro','renovar','emprestimo','devolver','catalografica'].some(has)) delta += 7;
  }
  return delta;
}

function policyThreshold(item = {}, kind = 'suggestion') {
  const policy = item.trigger_policy || {};
  const fallback = kind === 'direct' ? 0.82 : 0.42;
  const value = Number(policy[`${kind}_confidence`] ?? fallback);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function scoreCardRelatedness(message, item = {}) {
  const query = tokens(message); if (!query.length) return { score: 0, confidence: 0, reasons: [] };
  const terms = triggerTerms(item); const termSet = new Set(terms);
  const overlap = query.filter(token => termSet.has(token));
  const policy = item.trigger_policy || {};
  const required = unique(policy.required_terms || []).map(normalizeText);
  const negative = unique([...(policy.negative_terms || []), ...(policy.incompatible_terms || [])]).map(normalizeText);
  if (required.length && !required.every(token => query.includes(token))) return { score: 0, confidence: 0, reasons: ['termo obrigatório ausente'] };
  let score = overlap.length * 5 + specialEvidence(item.title, query);
  const negativeHits = negative.filter(token => query.includes(token));
  score -= negativeHits.length * 7;
  const titleTokens = tokens(item.title);
  score += query.filter(token => titleTokens.includes(token)).length * 3;
  const confidence = Math.max(0, Math.min(0.98, score / Math.max(8, query.length * 7)));
  return { score, confidence, reasons: [overlap.length ? `termos relacionados: ${overlap.join(', ')}` : '', negativeHits.length ? `evidências negativas: ${negativeHits.join(', ')}` : ''].filter(Boolean) };
}

function relatedCardCandidates(message, messages = [], { limit = 3 } = {}) {
  return messages.map(item => ({ item, ...scoreCardRelatedness(message, item) }))
    .filter(result => result.score > 0 && result.confidence >= policyThreshold(result.item, 'suggestion'))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || String(a.item.title).localeCompare(String(b.item.title)))
    .slice(0, Math.max(1, Number(limit || 3)))
    .map(result => ({ kind: 'message', item: result.item, label: result.item.title, score: result.score, confidence: result.confidence, directThreshold: policyThreshold(result.item, 'direct'), reasons: result.reasons }));
}

module.exports = { relatedCardCandidates, scoreCardRelatedness, policyThreshold };
