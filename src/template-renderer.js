function safeName(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : fallback;
}

function renderTemplate(template, context = {}, now = new Date()) {
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(now);
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
  const values = {
    data: date,
    hora: time,
    nome_do_grupo: safeName(context.groupName, context.isGroup ? 'Grupo' : 'Conversa privada'),
    nome_da_pessoa: safeName(context.senderName, 'Pessoa')
  };
  return String(template || '').replace(/\{\{\s*(data|hora|nome_do_grupo|nome_da_pessoa)\s*\}\}/gi, (_, key) => values[String(key).toLowerCase()] || '');
}

module.exports = { renderTemplate };
