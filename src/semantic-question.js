const { normalizeText, tokenize } = require('./text');

const REPORTED_SPEECH = [
  /\b(?:comentou|comentaram|falou|falaram|mencionou|mencionaram|disse|disseram)\b.{0,90}\b(?:sobre|a respeito de|do|da|de)\b/u,
  /\b(?:estava|estavam|estivemos)\s+(?:falando|comentando|discutindo|conversando)\b.{0,90}\b(?:sobre|a respeito de|do|da|de)\b/u,
  /\b(?:vi|viu|vimos|viram|leu|leram)\b.{0,70}\b(?:postagem|publicacao|publicação|aviso|noticia|notícia|mensagem)\b.{0,70}\b(?:sobre|a respeito de)\b/u
];

const DIRECT_REQUEST = /(?:^|\b)(?:qual|quais|onde|como|quando|quem|quanto|quantos|quanta|quantas|que\s+dia|posso|podemos|preciso|precisamos|existe|existem|tem|sabe|sabem|pode|podem|poderia|poderiam|devo|devemos|gostaria\s+de\s+saber|quero\s+saber|queria\s+saber|me\s+(?:diga|informe|mande|manda|envie|mostre|passa|passe)|informe|diga)\b/u;
const EXPLICIT_POLITE_REQUEST = /\b(?:pode|poderia|consegue|conseguiria|alguem|alguém)\b.{0,35}\b(?:informar|dizer|mostrar|explicar|enviar|passar|indicar)\b/u;
const DIRECT_AFTER_REPORT = /\b(?:mas|entao|então|por isso|nesse caso|neste caso|agora)\b[, ]{0,4}(?:qual|quais|onde|como|quando|quem|posso|preciso|existe|tem|pode|poderia)\b/u;
const COVERAGE_IGNORED = new Set(['a','ao','aos','as','da','das','de','do','dos','e','em','na','nas','no','nos','o','os','para','por','pra','pro','que','um','uma','uns','umas','voce','você','voces','vocês','me','porfavor','favor']);

function questionIntent(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (/\b(?:quem|qual professor|qual professora|qual docente)\b.*\b(?:da|dá|ensina|ministra|leciona|professor|professora|docente)\b/u.test(text)
    || /\b(?:quem da|quem ensina|quem ministra|professor de|professora de|docente de)\b/u.test(text)) return 'teacher';
  if (/\b(?:horario|horário|que horas|qual dia|quais dias|quando tem|quando acontece|dia da aula)\b/u.test(text)) return 'schedule';
  if (/\b(?:pre requisito|pré requisito|prerequisito|pré-requisito|requisito para cursar|depende de|preciso cursar antes|bloqueia)\b/u.test(text)) return 'prerequisite';
  if (/\b(?:onde fica|onde encontro|localizacao|localização|qual sala|em qual sala|endereco|endereço)\b/u.test(text)) return 'location';
  if (/\b(?:contato|email|e mail|whatsapp|telefone|ramal|falar com|entrar em contato)\b/u.test(text)) return 'contact';
  if (/\b(?:como|o que fazer|iniciar|comecar|começar|passar para|entregar|solicitar|documentos|defesa|orientador|orientadora|procedimento|passo a passo)\b/u.test(text)) return 'procedure';
  if (/\b(?:posso|pode|preciso|devo|e obrigatorio|é obrigatório|serve|conta como)\b/u.test(text)) return 'eligibility';
  return DIRECT_REQUEST.test(text) ? 'information' : '';
}

function intentsCompatible(triggerValue, messageValue) {
  const triggerIntent = questionIntent(triggerValue);
  const messageIntent = questionIntent(messageValue);
  if (!triggerIntent || !messageIntent || triggerIntent === 'information' || messageIntent === 'information') return true;
  return triggerIntent === messageIntent;
}

function meaningfulTokens(value) {
  return tokenize(value).filter(token => !COVERAGE_IGNORED.has(token));
}

function evidenceCoverage(message, evidence = []) {
  const messageTokens = meaningfulTokens(message);
  if (!messageTokens.length) return 0;
  let best = 0;
  for (const item of evidence) {
    const tokens = meaningfulTokens(item);
    if (!tokens.length) continue;
    const set = new Set(messageTokens);
    const overlap = tokens.filter(token => set.has(token)).length;
    best = Math.max(best, overlap / messageTokens.length);
  }
  return best;
}

function semanticQuestionAssessment(message, evidence = [], { exactConfigured = false } = {}) {
  const raw = String(message?.raw ?? message ?? '').trim();
  const normalized = normalizeText(raw.replace(/[?]+\s*$/u, ''));
  const tokens = meaningfulTokens(normalized);
  if (exactConfigured) return { allowed: true, coverage: 1, reason: 'pergunta coincide integralmente com um gatilho cadastrado' };

  const reported = REPORTED_SPEECH.some(pattern => pattern.test(normalized));
  if (reported && !DIRECT_AFTER_REPORT.test(normalized)) {
    return { allowed: false, coverage: evidenceCoverage(normalized, evidence), reason: 'a frase apenas relata ou menciona o assunto, sem pedir a informação' };
  }

  const coverage = evidenceCoverage(normalized, evidence);
  const hasRequest = DIRECT_REQUEST.test(normalized) || EXPLICIT_POLITE_REQUEST.test(normalized);
  const evidenceTokens = Math.max(0, ...evidence.map(item => meaningfulTokens(item).length));
  const directTopicRequest = coverage >= 0.8 && tokens.length <= Math.max(5, evidenceTokens + 2);
  if (!hasRequest && !directTopicRequest) {
    return { allowed: false, coverage, reason: 'mensagem longa sem intenção interrogativa dirigida à informação' };
  }

  const explicit = EXPLICIT_POLITE_REQUEST.test(normalized) || /^(?:qual|quais|onde|como|quando|quem|posso|preciso|existe|tem|sabe|pode|poderia)\b/u.test(normalized);
  if (tokens.length > 8 && coverage < 0.25 && !explicit) {
    return { allowed: false, coverage, reason: 'o gatilho representa uma parte pequena demais da mensagem' };
  }
  return { allowed: true, coverage, reason: 'pergunta longa com intenção direta e cobertura suficiente' };
}

module.exports = {
  semanticQuestionAssessment,
  questionIntent,
  intentsCompatible,
  evidenceCoverage
};
