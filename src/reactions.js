'use strict';

const { normalizeText, containsPhrase } = require('./text');
const {
  THANK_PATTERNS,
  PRAISE_PATTERNS,
  OFFENSE_PATTERNS,
  DECLINE_PATTERNS,
  NON_BOT_TARGET_PATTERNS
} = require('./language/bot-sentiment-lexicon');

const BOT_ADDRESS_ALIASES = Object.freeze([
  'bot', 'bote', 'hub bot', 'escravo do juan', 'escravo do felipe juan',
  'escravo do felipe', 'robo do juan', 'robô do juan', 'robo do felipe juan',
  'assistente do juan', 'assistente do felipe juan',
  'robo do hub', 'robô do hub', 'assistente do hub', 'hub whatsapp bot'
]);

function matchesAny(normalized, patterns) {
  return patterns.some(pattern => pattern.test(normalized));
}

function addressesBot(text) {
  return BOT_ADDRESS_ALIASES.some(alias => containsPhrase(text, alias));
}

function classifySentiment(text) {
  const normalized = normalizeText(text);
  if (!normalized || matchesAny(normalized, DECLINE_PATTERNS)) return null;
  if (matchesAny(normalized, OFFENSE_PATTERNS)) return { kind: 'offense', emoji: '😔' };
  if (matchesAny(normalized, THANK_PATTERNS) || matchesAny(normalized, PRAISE_PATTERNS)) return { kind: 'thanks', emoji: '❤️' };
  return null;
}

function clearlyDirectedInPrivate(text, sentiment) {
  const normalized = normalizeText(text);
  if (!normalized || !sentiment) return false;
  if (addressesBot(normalized) || /\b(?:voce|você|vc|tu)\b/u.test(normalized)) return true;
  if (NON_BOT_TARGET_PATTERNS.some(pattern => pattern.test(normalized))) return false;
  const tokenCount = normalized.split(/\s+/u).filter(Boolean).length;
  if (sentiment.kind === 'thanks') return tokenCount <= 5;
  return tokenCount <= 4;
}

function classifyBotReaction(message, text = message?.body || '', { isPrivate = false } = {}) {
  const repliedToBot = Boolean(message?.quotedFromMe);
  const explicitlyAddressed = Boolean(message?.mentionedMe) || addressesBot(text);
  let sentiment = classifySentiment(text);
  if (!sentiment && (repliedToBot || explicitlyAddressed) && /^(?:boa|bom)[!. ]*$/u.test(normalizeText(text))) {
    sentiment = { kind: 'thanks', emoji: '❤️' };
  }
  if (!sentiment) return null;
  if (isPrivate) {
    if (!repliedToBot && !explicitlyAddressed && !clearlyDirectedInPrivate(text, sentiment)) return null;
    return { ...sentiment, reason: repliedToBot ? 'reply-to-bot' : explicitlyAddressed ? 'bot-addressed' : 'private-conversation' };
  }
  if (!repliedToBot && !explicitlyAddressed) return null;
  return { ...sentiment, reason: repliedToBot ? 'reply-to-bot' : 'bot-addressed' };
}

module.exports = {
  BOT_ADDRESS_ALIASES,
  THANK_PATTERNS,
  PRAISE_PATTERNS,
  OFFENSE_PATTERNS,
  addressesBot,
  classifySentiment,
  classifyBotReaction,
  clearlyDirectedInPrivate
};
