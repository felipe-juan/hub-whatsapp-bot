function appendFooter(text, footer) { return footer ? `${text}\n\n${footer}` : text; }

function formatVerifiedDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function appendSourceMetadata(text, metadata = {}) {
  const body = String(text || '').trim();
  const sourceUrl = String(metadata.source_url || metadata.sourceUrl || '').trim();
  if (!sourceUrl) return body;
  const sourceTitle = String(metadata.source_title || metadata.sourceTitle || '').trim() || 'Fonte oficial';
  const verifiedAt = formatVerifiedDate(metadata.verified_at || metadata.verifiedAt || '');
  const urlAlreadyVisible = body.includes(sourceUrl);
  const lines = [`*Fonte:* ${sourceTitle}`];
  if (!urlAlreadyVisible) lines.push(sourceUrl);
  else lines.push('_Link oficial informado na resposta acima._');
  if (verifiedAt) lines.push(`*Verificada em:* ${verifiedAt}`);
  return `${body}\n\n${lines.join('\n')}`.trim();
}

function formatTeacherResponse(matches, footer = '') {
  if (matches.length === 1) {
    const item = matches[0];
    return appendFooter(`Contato encontrado:\n\n*${item.name}*\n${item.email}`, footer);
  }
  const body = matches.map(item => `• *${item.name}* — ${item.email}`).join('\n');
  return appendFooter(`Encontrei mais de um contato possível:\n\n${body}\n\nTente usar o nome completo para uma resposta mais precisa.`, footer);
}

function formatSingleHub(item) {
  if (item.response_text) return item.response_text;
  const description = item.description ? `\n_${item.description}_` : '';
  return `*${item.title}*${description}\n${item.url}`;
}
function formatHubResponse(matches, footer = '') {
  const intro = matches.length === 1 ? 'Achei este conteúdo no HUB Arquivos:' : 'Achei estes conteúdos no HUB Arquivos:';
  return appendFooter(`${intro}\n\n${matches.map(formatSingleHub).join('\n\n')}`, footer);
}
function formatFaqResponse(faq, footer = '') { return appendFooter(`*${faq.title}*\n\n${faq.answer}`, footer); }
function formatContentResponse(candidate) { return String(candidate?.item?.response_text || ''); }

function formatDisambiguation(candidates, timeoutSeconds = 120, footer = '') {
  const list = candidates.slice(0, 3).map((candidate, index) => `${index + 1}. *${candidate.item.title}*`).join('\n');
  return appendFooter(`Encontrei mais de uma possibilidade:\n\n${list}\n\nResponda somente com o número desejado em até ${Math.ceil(timeoutSeconds / 60)} min.`, footer);
}


function formatUnknownMentionResponse(settings = {}) {
  return appendFooter([
    'Não identifiquei nenhum comando nessa mensagem.',
    '',
    'Exemplos:',
    '• Professor: `Qual o contato do professor Allan?`',
    '• Setor: `Qual o contato da CAENS?`',
    '• Informação institucional: `Onde encontro o fluxograma do curso?`'
  ].join('\n'), settings.reply_footer);
}

function formatHelpResponse(settings, calculators = []) {
  const hub = settings.hub_base_url ? `\nHUB: ${settings.hub_base_url}` : '';
  return appendFooter([
    `Olá! Eu sou o *${settings.bot_name || 'HUB Bot'}*.`, '', 'Posso ajudar com:',
    'mensagens automáticas configuradas pelo administrador',
    'cálculo da nota necessária na prova final', '',
    'Exemplos:',
    '• escreva um dos gatilhos cadastrados',
    '• !final 6,9',
    '• !final 5,0 6,0 7,0',
    hub
  ].filter(Boolean).join('\n'), settings.reply_footer);
}

module.exports = {
  appendFooter, appendSourceMetadata, formatTeacherResponse, formatHubResponse, formatFaqResponse, formatContentResponse,
  formatDisambiguation, formatHelpResponse, formatUnknownMentionResponse, formatSingleHub
};
