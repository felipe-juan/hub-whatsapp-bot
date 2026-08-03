const { normalizeText, containsPhrase } = require('./text');

const BOT_ADDRESS_ALIASES = Object.freeze([
  'bot', 'hub bot', 'escravo do juan', 'escravo do felipe juan',
  'escravo do felipe', 'robo do juan', 'robo do felipe juan',
  'assistente do juan', 'assistente do felipe juan',
  'robo do hub', 'robô do hub', 'assistente do hub', 'hub whatsapp bot'
]);

const THANK_PATTERNS = Object.freeze([
  /\bvlw+\b/u,
  /\bvlw demais\b/u,
  /\bobg(?:d|do|da)?\b/u,
  /\bobrigad[oa]+\b/u,
  /\bobrigadao\b/u,
  /\bbrigad[oa]+\b/u,
  /\bvaleu+\b/u,
  /\bvaleu demais\b/u,
  /\btmj\b/u,
  /\btamo junto\b/u,
  /\be nois\b/u,
  /\bnois\b/u,
  /\bthanks?\b/u,
  /\bthank you\b/u,
  /\bagradeco\b/u,
  /\bgratidao\b/u,
  /\bmandou bem\b/u,
  /\barrasou\b/u,
  /\bajudou(?: muito| demais)?\b/u,
  /\bsalvou(?: demais| muito| minha vida)?\b/u,
  /\b(?:muito |bom )?bom demais\b/u,
  /\b(?:muito )?bom\b/u,
  /\botim[oa]\b/u,
  /\bperfeito\b/u,
  /\bexcelente\b/u,
  /\bmaravilhos[oa]\b/u,
  /\b(?:voce|vc) e top\b/u,
  /\btop demais\b/u,
  /\bshow(?: de bola)?\b/u,
  /\bmassa\b/u,
  /\bbrab[oa]\b/u,
  /\bmonstro\b/u,
  /\blenda\b/u,
  /\bmito\b/u,
  /\bfoda\b/u,
  /\bbom trabalho\b/u,
  /\bboa(?: bot| robo| assistente)?\b/u,
  /\bsensacional\b/u,
  /\bincrivel\b/u,
  /\bgenial\b/u,
  /\b(?:voce|vc) salvou\b/u,
  /\bte amo\b/u,
  /\bamo (?:voce|vc)\b/u,
  /\bgood bot\b/u,
  /\bnice\b/u
]);

const OFFENSE_PATTERNS = Object.freeze([
  /\bvtnc\b/u,
  /\btnc\b/u,
  /\bvsf\b/u,
  /\btoma no cu\b/u,
  /\btomar no cu\b/u,
  /\bvai toma(?:r)? no cu\b/u,
  /\bvai tomar no olho do cu\b/u,
  /\benfia(?: isso)? no cu\b/u,
  /\bvai se foder\b/u,
  /\bse foder\b/u,
  /\bse fode\b/u,
  /\bfoda se\b/u,
  /\bfilh[oa] da puta\b/u,
  /\bfilh[oa] de uma puta\b/u,
  /\bfdp\b/u,
  /\b(?:seu|sua)? ?burr[oa]\b/u,
  /\b(?:seu|sua)? ?idiota\b/u,
  /\bimbecil\b/u,
  /\binutil\b/u,
  /\bestupid[oa]\b/u,
  /\botari[oa]\b/u,
  /\bbabaca\b/u,
  /\barrombad[oa]\b/u,
  /\bcorno\b/u,
  /\bdesgracad[oa]\b/u,
  /\blixo\b/u,
  /\bretardad[oa]\b/u,
  /\banta\b/u,
  /\banimal\b/u,
  /\bjumento\b/u,
  /\bjegue\b/u,
  /\bmula\b/u,
  /\bincompetente\b/u,
  /\blerd[oa]\b/u,
  /\blesad[oa]\b/u,
  /\bporcaria\b/u,
  /\bbosta\b/u,
  /\bmerda\b/u,
  /\bvai (?:pra|para a|pro) merda\b/u,
  /\bvai pro caralho\b/u,
  /\bpau no cu\b/u,
  /\bcuz[aã]o\b/u,
  /\bnao serve pra nada\b/u,
  /\bpior bot\b/u,
  /\bbot ruim\b/u,
  /\bhorrivel\b/u,
  /\bcala a boca\b/u
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
