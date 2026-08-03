const { normalizeText, containsPhrase } = require('./text');

const BOT_ADDRESS_ALIASES = Object.freeze([
  'bot', 'hub bot', 'escravo do juan', 'escravo do felipe juan',
  'escravo do felipe', 'robo do juan', 'robo do felipe juan',
  'assistente do juan', 'assistente do felipe juan',
  'robo do hub', 'robô do hub', 'assistente do hub', 'hub whatsapp bot'
]);

const THANK_PATTERNS = Object.freeze([
  /\bvlw+\b/u,
  /\bobg(?:d|do|da)?\b/u,
  /\bobrigad[oa]+\b/u,
  /\bbrigad[oa]+\b/u,
  /\bvaleu+\b/u,
  /\btmj\b/u,
  /\bthanks?\b/u,
  /\bthank you\b/u,
  /\bagradeco\b/u,
  /\bgratidao\b/u,
  /\bmandou bem\b/u,
  /\bajudou muito\b/u,
  /\bsalvou(?: demais)?\b/u,
  /\b(?:muito )?bom\b/u,
  /\bperfeito\b/u,
  /\bexcelente\b/u,
  /\b(?:voce|vc) e top\b/u,
  /\btamo junto\b/u,
  /\be nois\b/u,
  /\bshow(?: de bola)?\b/u,
  /\bmassa\b/u,
  /\bbrab[oa]\b/u,
  /\bfoda\b/u,
  /\bbom trabalho\b/u,
  /\bboa(?: bot| robo| assistente)?\b/u,
  /\bsensacional\b/u,
  /\bincrivel\b/u,
  /\bgenial\b/u,
  /\b(?:voce|vc) salvou\b/u
]);

const OFFENSE_PATTERNS = Object.freeze([
  /\bvtnc\b/u,
  /\bvsf\b/u,
  /\bvai tomar no cu\b/u,
  /\bvai se foder\b/u,
  /\bse fode\b/u,
  /\bfilh[oa] da puta\b/u,
  /\bfdp\b/u,
  /\b(?:seu|sua)? ?burro\b/u,
  /\b(?:seu|sua)? ?idiota\b/u,
  /\bimbecil\b/u,
  /\binutil\b/u,
  /\bestupido\b/u,
  /\botario\b/u,
  /\bbabaca\b/u,
  /\barrombado\b/u,
  /\bdesgracado\b/u,
  /\blixo\b/u,
  /\bretardado\b/u,
  /\banta\b/u,
  /\bjumento\b/u,
  /\bincompetente\b/u,
  /\blerd[oa]\b/u,
  /\bporcaria\b/u,
  /\bbosta\b/u,
  /\bvai (?:pra|para a) merda\b/u,
  /\bpau no cu\b/u,
  /\bcuz[aã]o\b/u,
  /\bfilh[oa] de uma puta\b/u
]);

const DECLINE_PATTERNS = Object.freeze([
  /\bnao obrigado\b/u,
  /\bnao obrigada\b/u,
  /\bsem obrigado\b/u
]);

function matchesAny(normalized, patterns) {
  return patterns.some(pattern => pattern.test(normalized));
}

function addressesBot(text) {
  return BOT_ADDRESS_ALIASES.some(alias => containsPhrase(text, alias));
}

function classifySentiment(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (matchesAny(normalized, OFFENSE_PATTERNS)) return { kind: 'offense', emoji: '😔' };
  if (matchesAny(normalized, DECLINE_PATTERNS)) return null;
  if (matchesAny(normalized, THANK_PATTERNS)) return { kind: 'thanks', emoji: '❤️' };
  return null;
}

function classifyBotReaction(message, text = message?.body || '') {
  const sentiment = classifySentiment(text);
  if (!sentiment) return null;
  const repliedToBot = Boolean(message?.quotedFromMe);
  const explicitlyAddressed = !message?.hasQuotedMessage && (Boolean(message?.mentionedMe) || addressesBot(text));
  if (!repliedToBot && !explicitlyAddressed) return null;
  return { ...sentiment, reason: repliedToBot ? 'reply-to-bot' : 'bot-addressed' };
}

module.exports = {
  BOT_ADDRESS_ALIASES,
  THANK_PATTERNS,
  OFFENSE_PATTERNS,
  addressesBot,
  classifySentiment,
  classifyBotReaction
};
