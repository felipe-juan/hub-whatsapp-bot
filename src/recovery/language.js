'use strict';

const { normalizeText } = require('../text');
const { canonicalizeDisciplineSpeech } = require('../discipline-catalog');

const THANKS = /^(?:obg(?:d|do|da)?|obrigad[oa]|muito obrigad[oa]|valeu|vlw|agradeco|agradeço|gratid[aã]o)(?:[!. ]*)$/u;
const ACK = /^(?:ok|okay|entendi|beleza|blz|certo|show|tranquilo|ta bom|tá bom|perfeito|massa|kkk+|haha+|rs+)(?:[!. ]*)$/u;
const GREETING = /^(?:oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|opa|salve)(?:[!. ]*)$/u;
const COMMON_CONVERSATION = /(?:^(?:eu\s+)?(?:falei|conversei|comentei|mencionei|discuti|estava\s+falando|tava\s+falando)\b|\bprotocolo\s+tcp\b|\brequisitos?\s+(?:funcionais|nao\s+funcionais|não\s+funcionais|de\s+software)\b)/u;
const CANCEL = /^(?:0|sair|cancelar|cancela|parar|voltar|menu|esquecer|esquece|outra pergunta|nova pergunta|mudar de assunto|trocar de assunto)(?:[!. ]*)$/u;
const LIST_DISCIPLINES = /^(?:ver|mostrar|mostre|listar|lista de|ver lista de)?\s*(?:as )?(?:disciplinas|materias|matérias)(?: cadastradas)?(?:[!. ]*)$/u;
const UNKNOWN_SUBJECT = /^(?:(?:nao sei|não sei|nao lembro|não lembro)(?: o nome d[ae]| a| qual)? (?:materia|matéria|disciplina)|nao lembro o nome|não lembro o nome)(?:[!. ]*)$/u;
const NONE = /^(?:nenhuma(?: dessas)?|nenhum(?: desses)?|nenhuma opcao|nenhuma opção|nao e nenhuma|não é nenhuma|nao e isso|não é isso|isso nao|isso não|outra coisa|outro assunto|ver outras opcoes|ver outras opções)$/u;
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
  [/(?:^|\b)pae(?=\b|$)/gu, 'paae']
]);

function canonicalSpeechText(value) {
  let text = canonicalizeDisciplineSpeech(value);
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
function isListDisciplines(value) { return LIST_DISCIPLINES.test(canonicalSpeechText(value)); }
function isUnknownSubject(value) { return UNKNOWN_SUBJECT.test(canonicalSpeechText(value)); }

module.exports = {
  canonicalSpeechText,
  classifyCommonMessage,
  choiceNumber,
  isCancel,
  isNone,
  isListDisciplines,
  isUnknownSubject,
  SPEECH_REPLACEMENTS
};
