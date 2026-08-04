'use strict';

const { normalizeText } = require('../text');

const THANKS = /^(?:obrigad[oa]|muito obrigad[oa]|valeu|vlw|agradeco|agradeço|gratid[aã]o)(?:[!. ]*)$/u;
const ACK = /^(?:ok|okay|entendi|beleza|blz|certo|show|tranquilo|ta bom|tá bom|perfeito|massa|kkk+|haha+|rs+)(?:[!. ]*)$/u;
const GREETING = /^(?:oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|opa|salve)(?:[!. ]*)$/u;
const COMMON_CONVERSATION = /(?:^(?:eu\s+)?(?:falei|conversei|comentei|mencionei|discuti|estava\s+falando|tava\s+falando)\b|\bprotocolo\s+tcp\b|\brequisitos?\s+(?:funcionais|nao\s+funcionais|não\s+funcionais|de\s+software)\b)/u;
const CANCEL = /^(?:0|sair|cancelar|cancela|parar|voltar|menu)(?:[!. ]*)$/u;
const NONE = /^(?:nenhuma(?: dessas)?|nenhum(?: desses)?|nenhuma opcao|nenhuma opção|nao e nenhuma|não é nenhuma|outra coisa|outro assunto|ver outras opcoes|ver outras opções)$/u;
const CHOICE_WORDS = Object.freeze({
  um: 1, uma: 1, primeiro: 1, primeira: 1,
  dois: 2, duas: 2, segundo: 2, segunda: 2,
  tres: 3, três: 3, terceiro: 3, terceira: 3,
  quatro: 4, quarto: 4, quarta: 4,
  cinco: 5, quinto: 5, quinta: 5,
  seis: 6, sexto: 6, sexta: 6,
  sete: 7, setimo: 7, sétimo: 7, setima: 7, sétima: 7,
  oito: 8, oitavo: 8, oitava: 8,
  nove: 9, nono: 9, nona: 9
});

const SPEECH_REPLACEMENTS = Object.freeze([
  [/(?:^|\b)(?:wallace|walace)(?=\b|$)/gu, 'ualace'],
  [/(?:^|\b)(?:cressencio|crescensio|crescensio)(?=\b|$)/gu, 'crescencio'],
  [/(?:^|\b)caem(?=\b|$)/gu, 'caens'],
  [/(?:^|\b)coris(?=\b|$)/gu, 'cores'],
  [/(?:^|\b)algoritimo(?=\b|$)/gu, 'algoritmo'],
  [/(?:^|\b)econimia(?=\b|$)/gu, 'economia'],
  [/(?:^|\b)ele\s+pe\s+i(?=\b|$)/gu, 'lpi'],
  [/(?:^|\b)eme\s+de\s+(?:dois|2)(?=\b|$)/gu, 'mdii'],
  [/(?:^|\b)pae(?=\b|$)/gu, 'paae']
]);

function canonicalSpeechText(value) {
  let text = normalizeText(value);
  for (const [pattern, replacement] of SPEECH_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text.replace(/\s{2,}/gu, ' ').trim();
}

function classifyCommonMessage(value) {
  const normalized = canonicalSpeechText(value);
  if (!normalized) return '';
  if (THANKS.test(normalized)) return 'thanks';
  if (ACK.test(normalized)) return 'ack';
  if (GREETING.test(normalized)) return 'greeting';
  if (COMMON_CONVERSATION.test(normalized)) return 'conversation';
  return '';
}

function choiceNumber(value) {
  const normalized = canonicalSpeechText(value).replace(/^(?:opcao|opção|numero|número|a opcao|a opção)\s+/u, '').trim();
  const digit = normalized.match(/^([1-9])$/u);
  if (digit) return Number(digit[1]);
  const compact = normalized.replace(/^(?:a|o)\s+/u, '').replace(/\s+(?:opcao|opção)$/u, '').trim();
  return CHOICE_WORDS[compact] || 0;
}

function isCancel(value) { return CANCEL.test(canonicalSpeechText(value)); }
function isNone(value) { return NONE.test(canonicalSpeechText(value)); }

module.exports = {
  canonicalSpeechText,
  classifyCommonMessage,
  choiceNumber,
  isCancel,
  isNone,
  SPEECH_REPLACEMENTS
};
