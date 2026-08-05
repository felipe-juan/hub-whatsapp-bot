'use strict';

const crypto = require('node:crypto');

function normalizeSimulationMessages(messages = []) {
  return (Array.isArray(messages) ? messages : String(messages || '').split(/\r?\n/u))
    .map((item, index) => typeof item === 'string' ? { text: item, index } : { ...item, text: String(item.text || item.message || ''), index })
    .filter(item => item.text.trim()).slice(0, 50);
}

async function simulateConversation(engine, database, messages = [], options = {}) {
  const inputs = normalizeSimulationMessages(messages);
  const id = `simulation-${crypto.randomUUID()}@s.whatsapp.net`;
  const outboundIds = [];
  const results = [];
  let lastBotMessageId = '';
  for (const item of inputs) {
    const replies = [];
    const quoted = Number.isInteger(Number(item.reply_to)) && Number(item.reply_to) >= 0 ? outboundIds[Number(item.reply_to)] || '' : '';
    const message = {
      from: id, authorId: id, isGroup: Boolean(options.is_group), body: item.text.trim(), originalBody: item.text.trim(),
      timestampMs: Date.now() + item.index, quotedFromMe: Boolean(quoted), quotedMessageId: quoted,
      mentionedMe: false, groupActivated: true, activationResolved: true, groupActivationMode: 'simulator', simulation: true,
      async getChat() { return { isGroup: Boolean(options.is_group), id: { _serialized: id }, name: options.is_group ? 'Simulação em grupo' : 'Simulação privada' }; },
      async reply(text) { replies.push({ text: String(text || ''), id: `sim-out-${outboundIds.length + 1}` }); return { key: { id: replies.at(-1).id } }; },
      async sendResponse(payload) { const text = typeof payload === 'string' ? payload : payload?.text || ''; replies.push({ text: String(text), id: `sim-out-${outboundIds.length + 1}` }); return { key: { id: replies.at(-1).id } }; },
      async react() { return true; }
    };
    await engine.handle(message);
    if (replies.length) { lastBotMessageId = replies.at(-1).id; outboundIds.push(lastBotMessageId); }
    results.push({ step: item.index + 1, input: item.text.trim(), quoted_message_id: quoted, replies, context: engine.activePromptContext?.(message) || null });
  }
  try {
    const fake = { from: id, authorId: id, isGroup: Boolean(options.is_group) };
    engine.forgetConversationContext?.(fake);
    engine.clearRecoveryState?.(fake);
    engine.localPreferences?.clear?.(engine.conversationKey?.(fake));
    database.deleteConversationContexts?.(engine.conversationKeys?.(fake) || [id]);
  } catch {}
  return { id, messages: inputs, results, lastBotMessageId };
}

module.exports = { normalizeSimulationMessages, simulateConversation };
