function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 6; i += 1) {
    const nested =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message;
    if (!nested) break;
    current = nested;
  }
  return current || {};
}

function extractText(message) {
  const content = unwrapMessage(message);
  const direct = [
    content.conversation,
    content.extendedTextMessage?.text,
    content.imageMessage?.caption,
    content.videoMessage?.caption,
    content.documentMessage?.caption,
    content.buttonsResponseMessage?.selectedDisplayText,
    content.buttonsResponseMessage?.selectedButtonId,
    content.listResponseMessage?.title,
    content.listResponseMessage?.singleSelectReply?.selectedRowId,
    content.templateButtonReplyMessage?.selectedDisplayText,
    content.templateButtonReplyMessage?.selectedId,
    content.interactiveResponseMessage?.body?.text,
    content.pollCreationMessage?.name,
    content.pollCreationMessageV2?.name,
    content.pollCreationMessageV3?.name
  ];
  const found = direct.find(value => typeof value === 'string' && value.trim());
  if (found) return found.trim();

  const paramsJson = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (typeof paramsJson === 'string' && paramsJson.trim()) {
    try {
      const parsed = JSON.parse(paramsJson);
      return String(parsed.title || parsed.id || parsed.selectedId || '').trim();
    } catch {}
  }
  return '';
}



function extractContextInfo(message) {
  const content = unwrapMessage(message);
  return [
    content.extendedTextMessage?.contextInfo,
    content.imageMessage?.contextInfo,
    content.videoMessage?.contextInfo,
    content.documentMessage?.contextInfo,
    content.audioMessage?.contextInfo,
    content.buttonsResponseMessage?.contextInfo,
    content.listResponseMessage?.contextInfo,
    content.templateButtonReplyMessage?.contextInfo,
    content.interactiveResponseMessage?.contextInfo
  ].find(context => context && (context.quotedMessage || context.stanzaId || context.participant || context.remoteJid)) || null;
}

function extractMentionedJids(message) {
  const content = unwrapMessage(message);
  const contexts = [
    content.extendedTextMessage?.contextInfo,
    content.imageMessage?.contextInfo,
    content.videoMessage?.contextInfo,
    content.documentMessage?.contextInfo,
    content.audioMessage?.contextInfo,
    content.buttonsResponseMessage?.contextInfo,
    content.listResponseMessage?.contextInfo,
    content.templateButtonReplyMessage?.contextInfo,
    content.interactiveResponseMessage?.contextInfo
  ].filter(Boolean);
  return [...new Set(contexts.flatMap(context => Array.isArray(context.mentionedJid) ? context.mentionedJid : []))]
    .map(value => String(value || ''))
    .filter(Boolean);
}


function timestampToMilliseconds(value) {
  if (value === undefined || value === null || value === '') return Date.now();
  let number = 0;
  try {
    if (typeof value === 'bigint') number = Number(value);
    else if (typeof value === 'number') number = value;
    else if (typeof value?.toNumber === 'function') number = Number(value.toNumber());
    else if (typeof value?.toString === 'function') number = Number(value.toString());
  } catch {}
  if (!Number.isFinite(number) || number <= 0) return Date.now();
  return number < 1e12 ? number * 1000 : number;
}

function disconnectCode(error) {
  const seen = new Set();
  const queue = [error];
  while (queue.length) {
    const current = queue.shift();
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) continue;
    seen.add(current);
    for (const value of [
      current.statusCode,
      current.output?.statusCode,
      current.output?.payload?.statusCode,
      current.data?.statusCode,
      current.data?.code,
      current.code
    ]) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    for (const nested of [current.cause, current.error, current.data, current.output, current.output?.payload]) {
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  const match = String(error?.message || error || '').match(/(?:code|status|erro(?:r)?)\D{0,12}(\d{3})/i);
  return match ? Number(match[1]) : 0;
}

function cleanAccountNumber(value) {
  return String(value || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function createMessageAdapter({ raw, socket, metadataCache, sendMessage = null }) {
  const remoteJid = String(raw?.key?.remoteJid || '');
  const participant = String(
    raw?.key?.participantPn ||
    raw?.key?.participantAlt ||
    raw?.key?.participant ||
    remoteJid
  );
  const isGroup = remoteJid.endsWith('@g.us');
  const body = extractText(raw?.message);
  const timestampMs = timestampToMilliseconds(raw?.messageTimestamp);
  const mentionedJids = extractMentionedJids(raw?.message);
  const contextInfo = extractContextInfo(raw?.message);
  const ownIds = [socket?.user?.id, socket?.user?.lid].filter(Boolean).map(String);
  const ownNumbers = new Set(ownIds.map(cleanAccountNumber).filter(Boolean));
  const matchesOwnAccount = jid => ownIds.includes(String(jid || '')) || ownNumbers.has(cleanAccountNumber(jid));
  const mentionedMe = mentionedJids.some(matchesOwnAccount);
  const hasQuotedMessage = Boolean(contextInfo?.quotedMessage || contextInfo?.stanzaId);
  const quotedParticipant = String(contextInfo?.participant || contextInfo?.remoteJid || '');
  const quotedFromMe = hasQuotedMessage && (matchesOwnAccount(quotedParticipant) || (!isGroup && !quotedParticipant));

  const groupName = () => metadataCache.get(remoteJid)?.subject || raw?.pushName || 'Grupo sem nome';
  const options = quoted => quoted ? { quoted: raw } : undefined;
  const sourceMessageId = String(raw?.key?.id || '');
  let sendSequence = 0;
  const dispatch = (jid, content, sendOptions, metadata = {}) => {
    const sequence = ++sendSequence;
    const enriched = {
      sourceMessageId,
      sequence,
      priority: Number(metadata.priority || 0),
      kind: String(metadata.kind || 'message'),
      attachment: Boolean(metadata.attachment)
    };
    return sendMessage ? sendMessage(jid, content, sendOptions, enriched) : socket.sendMessage(jid, content, sendOptions);
  };
  const send = async (text, quoted = false) => dispatch(
    remoteJid,
    { text: String(text || '') },
    options(quoted),
    { priority: 100, kind: 'text', attachment: false }
  );
  const react = async emoji => dispatch(
    remoteJid,
    { react: { text: String(emoji || ''), key: raw.key } },
    undefined,
    { priority: 120, kind: 'reaction', attachment: false }
  );
  const sendResponse = async ({ text = '', attachment = null, attachmentPath = null } = {}, quoted = false) => {
    if (!attachment || !attachmentPath) return send(text, quoted);
    const mime = String(attachment.mime_type || 'application/octet-stream');
    const fileName = String(attachment.file_name || 'arquivo');
    const caption = String(text || '');
    const attachmentMeta = { priority: 100, kind: 'response-with-attachment', attachment: true };
    try {
      let content;
      if ((attachment.kind === 'image' || mime.startsWith('image/')) && mime !== 'image/gif') {
        content = { image: { url: attachmentPath }, mimetype: mime, ...(caption ? { caption } : {}) };
      } else if ((attachment.kind === 'audio' || mime.startsWith('audio/')) && !caption) {
        content = { audio: { url: attachmentPath }, mimetype: mime, ptt: false };
      } else {
        // Áudios com texto, GIFs e demais arquivos são enviados como documento,
        // pois o WhatsApp aceita legenda no mesmo balão desse tipo de mídia.
        content = { document: { url: attachmentPath }, mimetype: mime, fileName, ...(caption ? { caption } : {}) };
      }
      const result = await dispatch(remoteJid, content, options(quoted), attachmentMeta);
      return { result, attachmentSent: true, combined: Boolean(caption) };
    } catch (error) {
      // Se a mídia falhar, a informação textual não é perdida. O envio separado
      // só ocorre nesse caminho excepcional de recuperação.
      if (caption) {
        const textResult = await send(caption, quoted);
        return { textResult, attachmentSent: false, attachmentError: error?.message || String(error), fallbackTextSent: true };
      }
      throw error;
    }
  };

  return {
    fromMe: Boolean(raw?.key?.fromMe),
    from: remoteJid,
    author: participant,
    body,
    timestampMs,
    senderName: String(raw?.pushName || cleanAccountNumber(participant) || 'Pessoa'),
    mentionedJids,
    mentionedMe,
    hasQuotedMessage,
    quotedFromMe,
    quotedParticipant,
    raw,
    async react(emoji) { return react(emoji); },
    async reply(text) { return send(text, true); },
    async sendResponse(payload, quoted = true) { return sendResponse(payload, quoted); },
    async getChat() {
      let metadata = metadataCache.get(remoteJid);
      if (isGroup && !metadata) {
        try {
          metadata = await socket.groupMetadata(remoteJid);
          if (metadata) { metadataCache.set(remoteJid, metadata); while (metadataCache.size > 500) metadataCache.delete(metadataCache.keys().next().value); }
        } catch {}
      }
      return {
        isGroup,
        id: { _serialized: remoteJid },
        name: isGroup ? (metadata?.subject || groupName()) : (raw?.pushName || cleanAccountNumber(remoteJid) || 'Conversa privada'),
        async sendMessage(text) { return send(text, false); },
        async sendResponse(payload) { return sendResponse(payload, false); }
      };
    }
  };
}

module.exports = { unwrapMessage, extractText, extractContextInfo, extractMentionedJids, timestampToMilliseconds, disconnectCode, cleanAccountNumber, createMessageAdapter };
