'use strict';
const { extractText } = require('./message-serializer');
function normalizeIncoming(raw = {}) { return { raw, id: raw?.key?.id || '', chatId: raw?.key?.remoteJid || '', fromMe: Boolean(raw?.key?.fromMe), text: extractText(raw) }; }
module.exports = { normalizeIncoming };
