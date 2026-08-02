const { normalizeText, containsPhrase } = require('./text');
const { implicitQuestionStructure } = require('./semantic-question');

const SECTOR_CARD_TITLE = 'Consulta estruturada — setores do IFBA';
const SECTOR_INTENTS = Object.freeze({
  email: ['email', 'e mail'],
  whatsapp: ['whatsapp', 'whats', 'zap'],
  phone: ['telefone', 'fone', 'ramal', 'numero', 'número'],
  location: ['onde fica', 'onde encontro', 'localizacao', 'localização', 'sala', 'endereco', 'endereço'],
  services: ['o que resolve', 'o que faz', 'servicos', 'serviços', 'para que serve', 'atende', 'responsavel', 'responsável'],
  source: ['fonte', 'origem da informacao', 'origem da informação', 'confirmado onde'],
  contact: ['contato', 'ctt', 'falar com', 'entrar em contato', 'atendimento']
});

const NON_PHYSICAL_RESOURCE_TERMS = Object.freeze([
  'edital', 'editais', 'inscricao', 'inscrição', 'resultado', 'resultados', 'documento', 'documentos',
  'formulario', 'formulário', 'formularios', 'formulários', 'regulamento', 'regulamentos', 'pagina', 'página',
  'site', 'link', 'lista', 'listas', 'aviso', 'avisos', 'comunicado', 'comunicados', 'calendario', 'calendário',
  'horario', 'horário', 'horarios', 'horários', 'informacao', 'informação', 'informacoes', 'informações'
]);

function stripQuestion(value) {
  return normalizeText(String(value || '').trim().replace(/[?]+\s*$/, '')).trim();
}
function aliasList(sector) {
  return [...new Set([sector.acronym, sector.name, ...(sector.aliases || [])].map(normalizeText).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
}
function findSector(text, sectors = []) {
  const normalized = normalizeText(text);
  const matches = [];
  for (const sector of sectors) {
    const alias = aliasList(sector).find(value => containsPhrase(normalized, value));
    if (alias) matches.push({ sector, alias });
  }
  matches.sort((a, b) => b.alias.length - a.alias.length || String(a.sector.name).localeCompare(String(b.sector.name)));
  return matches;
}
function detectIntent(text) {
  const normalized = normalizeText(text);
  for (const [intent, phrases] of Object.entries(SECTOR_INTENTS)) {
    if (phrases.some(value => containsPhrase(normalized, normalizeText(value)))) return intent;
  }
  return '';
}
function directPhrasesFor(sector) {
  const phrases = new Set();
  for (const alias of aliasList(sector)) {
    const articles = ['', 'da ', 'do ', 'de ', 'a ', 'o '];
    for (const article of articles) {
      phrases.add(`contato ${article}${alias}`.trim());
      phrases.add(`email ${article}${alias}`.trim());
      phrases.add(`e mail ${article}${alias}`.trim());
      phrases.add(`whatsapp ${article}${alias}`.trim());
      phrases.add(`whats ${article}${alias}`.trim());
      phrases.add(`zap ${article}${alias}`.trim());
      phrases.add(`telefone ${article}${alias}`.trim());
      phrases.add(`fone ${article}${alias}`.trim());
      phrases.add(`numero ${article}${alias}`.trim());
      phrases.add(`ramal ${article}${alias}`.trim());
      phrases.add(`ctt ${article}${alias}`.trim());
      phrases.add(`onde fica ${article}${alias}`.trim());
      phrases.add(`localizacao ${article}${alias}`.trim());
      phrases.add(`servicos ${article}${alias}`.trim());
    }
    phrases.add(`falar com ${alias}`);
    phrases.add(`o que ${alias} resolve`);
    phrases.add(`o que ${alias} faz`);
  }
  return phrases;
}
function classifySectorRequest(text, sectors = []) {
  const raw = String(text || '').trim();
  const hasFinalQuestion = /\?\s*$/.test(raw);
  const hasQuestionStructure = hasFinalQuestion || implicitQuestionStructure(raw);
  const clean = stripQuestion(raw);
  const matches = findSector(clean, sectors);
  if (!matches.length) return { matched: false };
  const best = matches[0];
  const intent = detectIntent(clean);
  if (!intent) return { matched: false };
  const asksForNonPhysicalResource = intent === 'location'
    && NON_PHYSICAL_RESOURCE_TERMS.some(value => containsPhrase(clean, normalizeText(value)));
  if (asksForNonPhysicalResource) return { matched: false, deferredToCards: true };
  if (!hasQuestionStructure && !directPhrasesFor(best.sector).has(clean)) return { matched: false };
  return { matched: true, intent, sector: best.sector, alias: best.alias, ambiguous: matches.filter(item => item.alias.length === best.alias.length).length > 1 };
}
function classifySectorFollowUp(text) {
  const raw = String(text || '').trim();
  const hasFinalQuestion = /\?\s*$/.test(raw);
  const hasQuestionStructure = hasFinalQuestion || implicitQuestionStructure(raw);
  const clean = stripQuestion(raw).replace(/^(?:e|mas|entao|então)\s+/, '').trim();
  const intent = detectIntent(clean);
  if (!intent) return '';
  const allowedDirect = new Set(['contato', 'ctt', 'email', 'e mail', 'whatsapp', 'whats', 'zap', 'telefone', 'fone', 'numero', 'ramal', 'onde fica', 'localizacao', 'servicos', 'o que resolve', 'o que faz', 'fonte', 'mais detalhes']);
  return hasQuestionStructure || allowedDirect.has(clean) ? intent : '';
}
function line(label, value) { return value ? `${label} ${value}` : ''; }
function formatSectorResponse(sector, intent = 'contact', { includeSource = false } = {}) {
  const title = `🏢 *${sector.acronym ? `${sector.acronym} — ` : ''}${sector.name}*`;
  const services = Array.isArray(sector.services) ? sector.services.filter(Boolean) : [];
  const contacts = [line('📧', sector.email), line('📱', sector.whatsapp), line('☎️', sector.phone)].filter(Boolean);
  let body = [];
  if (intent === 'email') body = sector.email ? [line('📧', sector.email)] : ['Não há e-mail confirmado na base.'];
  else if (intent === 'whatsapp') body = sector.whatsapp ? [line('📱', sector.whatsapp)] : ['Não há WhatsApp confirmado na base.'];
  else if (intent === 'phone') body = sector.phone ? [line('☎️', sector.phone)] : ['Não há telefone confirmado na base.'];
  else if (intent === 'location') body = sector.location ? [line('📍', sector.location)] : ['Não há localização confirmada na base.', ...(sector.email ? [`📧 Confirme diretamente: ${sector.email}`] : [])];
  else if (intent === 'services') body = services.length ? ['*O que o setor atende:*', ...services.map(value => `• ${value}`)] : ['Os serviços do setor ainda não foram detalhados na base.'];
  else if (intent === 'source') body = [sector.source_title || 'Fonte oficial', sector.source_url || 'Link não cadastrado.', sector.verified_at ? `Verificado em: ${sector.verified_at.split('-').reverse().join('/')}` : 'Data de verificação não cadastrada.'];
  else body = [...contacts, ...(sector.location ? [line('📍', sector.location)] : []), ...(services.length ? ['', `Atende principalmente: ${services.slice(0, 3).join('; ')}.`] : [])];
  if (includeSource && intent !== 'source' && sector.source_url) body.push('', `🔎 ${sector.source_url}`);
  return [title, '', ...body].filter((value, index, all) => value !== '' || (index > 0 && all[index - 1] !== '')).join('\n').trim();
}

module.exports = { SECTOR_CARD_TITLE, SECTOR_INTENTS, NON_PHYSICAL_RESOURCE_TERMS, classifySectorRequest, classifySectorFollowUp, formatSectorResponse, aliasList };
