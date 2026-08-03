const { containsPhrase, normalizeText, tokenize } = require('./text');
const { evaluateTrigger, endsWithQuestionMark, levenshteinWithin } = require('./trigger-rules');
const { implicitQuestionStructure } = require('./semantic-question');

const CONTACT_INTENT = ['email', 'e-mail', 'contato', 'contact', 'como falar', 'falar com', 'entrar em contato'];

function hasQuestionMark(message) { return endsWithQuestionMark(message); }
function looksLikeTeacherQuestion(message) { return (hasQuestionMark(message) || implicitQuestionStructure(message)) && CONTACT_INTENT.some(word => containsPhrase(message, word)); }

function teacherScore(message, teacher) {
  const normalized = normalizeText(message);
  let score = 0;
  const reasons = [];
  const fullName = normalizeText(teacher.name);
  if (containsPhrase(normalized, fullName)) { score += 50; reasons.push(`nome completo: ${teacher.name}`); }
  for (const alias of teacher.aliases || []) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias.length < 3) continue;
    if (containsPhrase(normalized, normalizedAlias)) {
      const points = 20 + tokenize(normalizedAlias).length;
      score += points; reasons.push(`apelido: ${alias}`);
    }
  }
  const messageTokens = tokenize(normalized);
  const meaningfulTokens = tokenize(teacher.name).filter(token => token.length >= 4);
  for (const token of meaningfulTokens) {
    if (containsPhrase(normalized, token)) { score += 3; reasons.push(`parte do nome: ${token}`); continue; }
    const tolerance = token.length >= 7 ? 2 : 1;
    if (messageTokens.some(actual => actual.length >= 4 && levenshteinWithin(actual, token, tolerance))) {
      score += 2; reasons.push(`parte aproximada do nome: ${token}`);
    }
  }
  return { score, reasons: [...new Set(reasons)] };
}

function findTeacherMatchesDetailed(message, teachers, limit = 3) {
  if (!looksLikeTeacherQuestion(message)) return [];
  const scored = teachers
    .filter(teacher => teacher.active !== false)
    .map(teacher => ({ teacher, ...teacherScore(message, teacher) }))
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score || a.teacher.name.localeCompare(b.teacher.name));
  if (!scored.length) return [];
  const best = scored[0].score;
  return scored.filter(item => item.score >= Math.max(3, best - 3)).slice(0, limit);
}

function findTeacherMatches(message, teachers, limit = 3) {
  return findTeacherMatchesDetailed(message, teachers, limit).map(item => item.teacher);
}

function scoreContent(message, item, synonymGroups = []) {
  const evaluated = evaluateTrigger(message, item, synonymGroups);
  return {
    score: evaluated.score + Number(item.priority || 0) / 10,
    matched: evaluated.matched,
    reasons: evaluated.reasons,
    blockedReasons: evaluated.blockedReasons,
    rules: evaluated.rules
  };
}

function legacyTrigger(item = {}) {
  const configured = item.trigger && typeof item.trigger === 'object' && Object.keys(item.trigger).length;
  return configured ? item.trigger : { match_mode: 'any', keywords: item.keywords || [] };
}
function scoreHubLink(message, link, synonymGroups = []) { return scoreContent(message, { ...link, trigger: legacyTrigger(link) }, synonymGroups); }
function scoreFaq(message, faq, synonymGroups = []) { return scoreContent(message, { ...faq, trigger: legacyTrigger(faq) }, synonymGroups); }

function findHubMatchesDetailed(message, links, limit = 2, synonymGroups = []) {
  return links
    .filter(item => item.active !== false && item.published !== false && item.url)
    .map(link => ({ link, ...scoreHubLink(message, link, synonymGroups) }))
    .filter(item => item.matched)
    .sort((a, b) => b.score - a.score || Number(b.link.priority || 0) - Number(a.link.priority || 0) || a.link.title.localeCompare(b.link.title))
    .slice(0, limit);
}

function findHubMatches(message, links, limit = 2, synonymGroups = []) {
  return findHubMatchesDetailed(message, links, limit, synonymGroups).map(item => item.link);
}

function findFaqMatchesDetailed(message, faqs, limit = 2, synonymGroups = []) {
  return faqs
    .filter(item => item.active !== false && item.published !== false && item.answer)
    .map(faq => ({ faq, ...scoreFaq(message, faq, synonymGroups) }))
    .filter(item => item.matched)
    .sort((a, b) => b.score - a.score || Number(b.faq.priority || 0) - Number(a.faq.priority || 0) || a.faq.title.localeCompare(b.faq.title))
    .slice(0, limit);
}

function findContentMatchesDetailed(message, links, faqs, synonymGroups = [], limit = 5) {
  const hub = findHubMatchesDetailed(message, links, limit, synonymGroups).map(match => ({
    kind: 'hub', item: match.link, score: match.score, reasons: match.reasons, blockedReasons: match.blockedReasons
  }));
  const faq = findFaqMatchesDetailed(message, faqs, limit, synonymGroups).map(match => ({
    kind: 'faq', item: match.faq, score: match.score, reasons: match.reasons, blockedReasons: match.blockedReasons
  }));
  return [...hub, ...faq]
    .sort((a, b) => b.score - a.score || Number(b.item.priority || 0) - Number(a.item.priority || 0) || a.item.title.localeCompare(b.item.title))
    .slice(0, limit);
}


function scopeAllowed(scope, isGroup) {
  const value = ['both', 'group', 'private'].includes(scope) ? scope : 'both';
  return value === 'both' || (value === 'group' && isGroup) || (value === 'private' && !isGroup);
}

function evaluateAutomaticMessagesDetailed(message, messages, synonymGroups = [], { isGroup = true } = {}) {
  return messages
    .filter(item => item.active !== false && item.published !== false && item.response_text)
    .map(item => {
      // O título é apenas um nome interno do painel. Somente os gatilhos cadastrados ativam a mensagem.
      const evaluated = scoreContent(message, { ...item, title: '' }, synonymGroups);
      const scopeOk = scopeAllowed(item.scope, Boolean(isGroup));
      return {
        kind: 'message', item,
        ...evaluated,
        matched: Boolean(evaluated.matched && scopeOk),
        blockedReasons: scopeOk ? evaluated.blockedReasons : [...evaluated.blockedReasons, `escopo “${item.scope === 'group' ? 'somente grupos' : 'somente privado'}” não permite esta conversa`],
        scopeAllowed: scopeOk
      };
    });
}

function findAutomaticMessageMatchesDetailed(message, messages, synonymGroups = [], limit = 5, context = {}) {
  return evaluateAutomaticMessagesDetailed(message, messages, synonymGroups, context)
    .filter(match => match.matched)
    .sort((a, b) => b.score - a.score || Number(b.item.priority || 0) - Number(a.item.priority || 0) || a.item.title.localeCompare(b.item.title))
    .slice(0, limit);
}

function detectAmbiguousMatches(detailed, threshold = 1) {
  if (detailed.length < 2) return false;
  return Math.abs(Number(detailed[0].score) - Number(detailed[1].score)) <= Math.max(0, Number(threshold || 0));
}
function detectAmbiguousHubMatches(detailed, threshold = 1) { return detectAmbiguousMatches(detailed, threshold); }

function isHelpCommand(message) {
  const text = normalizeText(message);
  return ['ajuda', 'menu', 'comandos', '!ajuda', '!help', '!hub', 'ajuda hub'].includes(text);
}

module.exports = {
  CONTACT_INTENT,
  findTeacherMatches,
  findTeacherMatchesDetailed,
  findHubMatches,
  findHubMatchesDetailed,
  findFaqMatchesDetailed,
  findContentMatchesDetailed,
  findAutomaticMessageMatchesDetailed,
  evaluateAutomaticMessagesDetailed,
  scopeAllowed,
  detectAmbiguousMatches,
  detectAmbiguousHubMatches,
  hasQuestionMark,
  isHelpCommand,
  looksLikeTeacherQuestion,
  scoreContent,
  scoreHubLink,
  scoreFaq,
  teacherScore
};
