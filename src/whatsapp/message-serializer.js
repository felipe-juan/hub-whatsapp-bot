'use strict';
function extractText(message = {}) {
  const payload = message.message || message;
  return String(payload?.conversation || payload?.extendedTextMessage?.text || payload?.imageMessage?.caption || payload?.videoMessage?.caption || payload?.documentMessage?.caption || '').trim();
}
function quotedMessageId(message = {}) {
  return String(message?.message?.extendedTextMessage?.contextInfo?.stanzaId || '');
}
module.exports = { extractText, quotedMessageId };
