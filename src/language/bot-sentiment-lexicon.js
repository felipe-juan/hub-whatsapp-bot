'use strict';

const THANK_PATTERNS = Object.freeze([
  /\bvlw+\b/u,
  /\bobg(?:d|do|da)?\b/u,
  /\bobrigad[oa]+\b/u,
  /\bobrigad[aã]o\b/u,
  /\bbrigad[oa]+\b/u,
  /\bvaleu+(?: demais)?\b/u,
  /\btmj\b/u,
  /\btamo junto\b/u,
  /\b(?:e|é) nois\b/u,
  /\bthanks?\b/u,
  /\bthank you\b/u,
  /\bagrade[cç]o\b/u,
  /\bgratid[aã]o\b/u
]);

const PRAISE_PATTERNS = Object.freeze([
  /\bbom bot\b/u,
  /\bbot muito bom\b/u,
  /\bboa[, ]+(?:garoto|garota|bot|rob[oô]|assistente)\b/u,
  /\bboa resposta\b/u,
  /\bresposta (?:muito )?boa\b/u,
  /\bmandou bem(?: bot)?\b/u,
  /\barrasou(?: bot)?\b/u,
  /\bajudou(?: muito| demais)?\b/u,
  /\bsalvou(?: demais| muito| minha vida)?\b/u,
  /\b(?:muito )?bom demais\b/u,
  /\b[oó]tim[oa]\b/u,
  /\bperfeito\b/u,
  /\bexcelente\b/u,
  /\bmaravilhos[oa]\b/u,
  /\b(?:voce|você|vc) (?:e|é) top\b/u,
  /\btop demais\b/u,
  /\bshow(?: de bola)?\b/u,
  /\bmassa\b/u,
  /\bbrab[oa]\b/u,
  /\bmonstro\b/u,
  /\blenda\b/u,
  /\bmito\b/u,
  /\bbom trabalho\b/u,
  /\bsensacional\b/u,
  /\bincr[ií]vel\b/u,
  /\bgenial\b/u,
  /\b(?:voce|você|vc) salvou\b/u,
  /\bte amo\b/u,
  /\bamo (?:voce|você|vc)\b/u,
  /\bgood bot\b/u,
  /\bnice bot\b/u
]);

const OFFENSE_PATTERNS = Object.freeze([
  /\bvtnc\b/u,
  /\btnc\b/u,
  /\bvsf\b/u,
  /\btoma(?:r)? no cu\b/u,
  /\bvai toma(?:r)? no cu\b/u,
  /\bvai tomar no olho do cu\b/u,
  /\benfia(?: isso)? no cu\b/u,
  /\bvai se foder\b/u,
  /\bse foder\b/u,
  /\bse fode\b/u,
  /\bfoda[- ]?se\b/u,
  /\bfilh[oa] da puta\b/u,
  /\bfilh[oa] de uma puta\b/u,
  /\bfdp\b/u,
  /\b(?:seu|sua)?\s*burr[oa]\b/u,
  /\b(?:seu|sua)?\s*idiota\b/u,
  /\bimbecil\b/u,
  /\bin[uú]til\b/u,
  /\bimprest[aá]vel\b/u,
  /\bfudid[oa]\b/u,
  /\best[uú]pid[oa]\b/u,
  /\bot[aá]ri[oa]\b/u,
  /\bbabaca\b/u,
  /\barrombad[oa]\b/u,
  /\bcorn[oa]\b/u,
  /\bdesgra[cç]ad[oa]\b/u,
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
  /\bn[aã]o serve pra nada\b/u,
  /\bpior bot\b/u,
  /\bbot ruim\b/u,
  /\bhorr[ií]vel\b/u,
  /\bcala a boca\b/u,
  /\bchato pra caralho\b/u,
  /\bbot de merda\b/u,
  /\brob[oô] de merda\b/u
]);

const DECLINE_PATTERNS = Object.freeze([
  /\bn[aã]o[, ]+obrigad[oa]\b/u,
  /\bsem obrigado\b/u,
  /\bdispenso[, ]+obrigad[oa]\b/u
]);

const NON_BOT_TARGET_PATTERNS = Object.freeze([
  /\b(?:essa|esta|a) (?:materia|matéria|disciplina|aula|prova|atividade|quest[aã]o|resposta|situa[cç][aã]o)\b/u,
  /\b(?:esse|este|o) (?:professor|aluno|colega|sistema|site|aplicativo|celular|computador)\b/u,
  /\b(?:joao|joão|maria|pedro|paulo|felipe|allan|amanda) (?:e|é|foi|est[aá])\b/u
]);

module.exports = {
  THANK_PATTERNS,
  PRAISE_PATTERNS,
  OFFENSE_PATTERNS,
  DECLINE_PATTERNS,
  NON_BOT_TARGET_PATTERNS
};
