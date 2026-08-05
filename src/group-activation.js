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
  if (/^!(?:ajuda|help|status|pausar|pause|continuar|retomar|resume|backup|reiniciar|restart)\b/iu.test(remainder)) return remainder;
  remainder = remainder.replace(/^!+\s*/u, '').trim();
  return remainder;
}

function normalizeOptionalActivation(body, message = {}) {
  const originalBody = String(body || '').trim();
  if (!originalBody) return { body: '', mode: '' };
  if (originalBody.startsWith('.')) {
    const remainder = originalBody.slice(1).trim();
    if (remainder) return { body: remainder, mode: 'dot' };
  }
  const prefixed = stripNamedPrefix(originalBody);
  if (prefixed !== null) return { body: prefixed || 'ajuda', mode: 'name-prefix' };
  if (message.mentionedMe) {
    const remainder = stripOwnMentionTokens(originalBody, message.ownMentionNumbers || []);
    return { body: remainder || 'ajuda', mode: 'mention' };
  }
  return { body: originalBody, mode: '' };
}

function resolveGroupActivation(message = {}) {
  const originalBody = String(message.body || '').trim();
  if (!message.isGroup) {
    const normalized = normalizeOptionalActivation(originalBody, message);
    return { active: true, body: normalized.body, mode: normalized.mode || 'private' };
  }
  if (message.groupActivated) return { active: true, body: originalBody || 'ajuda', mode: message.groupActivationMode || 'preactivated' };
  if (!originalBody) return { active: false, body: '', mode: '' };

  const normalized = normalizeOptionalActivation(originalBody, message);
  if (normalized.mode) return { active: true, body: normalized.body, mode: normalized.mode };

  if (message.quotedFromMe) {
    return { active: true, body: originalBody, mode: 'reply-to-bot' };
  }

  return { active: false, body: '', mode: '' };
}

module.exports = {
  GROUP_PREFIX_PATTERN,
  stripOwnMentionTokens,
  stripNamedPrefix,
  normalizeOptionalActivation,
  resolveGroupActivation
};
