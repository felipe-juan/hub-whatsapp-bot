'use strict';

const GROUP_PREFIX_PATTERN = /^(?:bot|bote|rob[oô]|escravo\s+do\s+juan)(?=$|[\s,.:;!?\-])/iu;

function stripOwnMentionTokens(body, ownMentionNumbers = []) {
  let text = String(body || '');
  for (const number of ownMentionNumbers || []) {
    const digits = String(number || '').replace(/\D/g, '');
    if (!digits) continue;
    text = text.replace(new RegExp(`@${digits}(?=$|\\s|[,.!?;:])`, 'gu'), ' ');
  }
  return text.replace(/\s{2,}/gu, ' ').trim();
}

function stripNamedPrefix(body) {
  const text = String(body || '').trimStart();
  const match = text.match(GROUP_PREFIX_PATTERN);
  if (!match) return null;
  let remainder = text.slice(match[0].length).replace(/^[\s,.:;?\-]+/u, '').trim();
  // Preserva o ponto de exclamação dos comandos administrativos (`bot !status`).
  // Em usos comuns como `bot! qual sala`, o sinal continua sendo apenas pontuação.
  if (/^!(?:ajuda|help|status|pausar|pause|continuar|retomar|resume|backup|reiniciar|restart)\b/iu.test(remainder)) return remainder;
  remainder = remainder.replace(/^!+\s*/u, '').trim();
  return remainder;
}

function resolveGroupActivation(message = {}) {
  const originalBody = String(message.body || '').trim();
  if (!message.isGroup) return { active: true, body: originalBody, mode: 'private' };
  if (message.groupActivated) return { active: true, body: originalBody || 'ajuda', mode: message.groupActivationMode || 'preactivated' };
  if (!originalBody) return { active: false, body: '', mode: '' };

  if (originalBody.startsWith('.')) {
    const body = originalBody.slice(1).trim();
    // Um ponto isolado não é uma consulta. O prefixo só ativa o bot quando
    // existe algum conteúdo depois dele; `.palavra` e `. palavra` continuam
    // equivalentes.
    if (!body) return { active: false, body: '', mode: '' };
    return { active: true, body, mode: 'dot' };
  }

  const prefixed = stripNamedPrefix(originalBody);
  if (prefixed !== null) return { active: true, body: prefixed || 'ajuda', mode: 'name-prefix' };

  if (message.mentionedMe) {
    const body = stripOwnMentionTokens(originalBody, message.ownMentionNumbers || []);
    return { active: true, body: body || 'ajuda', mode: 'mention' };
  }

  return { active: false, body: '', mode: '' };
}

module.exports = { GROUP_PREFIX_PATTERN, stripOwnMentionTokens, stripNamedPrefix, resolveGroupActivation };
