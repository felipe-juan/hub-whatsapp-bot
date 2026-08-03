'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { createMessageAdapter } = require('../src/baileys-adapter');

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const { handleCalculator, finalRangeEmoji } = require('../src/calculator');
const { classifyBotReaction } = require('../src/reactions');
const {
  SI_PROFESSORS_2026_2,
  SI_PENDING_2026_2,
  SI_DISCIPLINE_CODES_2026_2,
  formatDisciplineLabel,
  formatDisciplineNamesInText,
  buildSiProfessorResponse,
  buildSharedDisciplineCards2026_2
} = require('../src/si-professors-2026-2');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0105-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakeMessage(body, { isGroup = true, hasQuotedMessage = false, quotedFromMe = false } = {}) {
  const reactions = []; const replies = [];
  const from = isGroup ? '120363000000000000@g.us' : '5577999999999@s.whatsapp.net';
  return {
    reactions, replies,
    message: {
      fromMe: false, from, author: isGroup ? '5577888888888@s.whatsapp.net' : from,
      body, senderName: 'Pessoa', hasQuotedMessage, quotedFromMe,
      async react(emoji) { reactions.push(emoji); },
      async reply(text) { replies.push(String(text)); },
      async sendResponse(payload) { replies.push(String(payload.text || '')); },
      async getChat() { return { isGroup, name: isGroup ? 'Grupo' : 'Privado', id: { _serialized: from }, async sendMessage(text) { replies.push(String(text)); } }; }
    }
  };
}

test('calculadora exibe apenas a nota mínima e a cor da faixa, sem MF', () => {
  const green = handleCalculator('!final 6,9');
  const blue = handleCalculator('!final 5,5');
  const yellow = handleCalculator('!final 4,5');
  const orange = handleCalculator('!final 3,5');
  const red = handleCalculator('!final 2,5');
  assert.match(green.text, /🟢.*6,9/s);
  assert.match(blue.text, /🔵.*5,5/s);
  assert.match(yellow.text, /🟡.*4,5/s);
  assert.match(orange.text, /🟠.*3,5/s);
  assert.match(red.text, /🔴.*2,5/s);
  for (const result of [green, blue, yellow, orange, red]) {
    assert.match(result.text, /Nota mínima necessária na prova final/);
    assert.doesNotMatch(result.text, /\bMF\b|média final|\(2×/i);
  }
  assert.equal(finalRangeEmoji(6), '🟢');
  assert.equal(finalRangeEmoji(5), '🔵');
  assert.equal(finalRangeEmoji(4), '🟡');
  assert.equal(finalRangeEmoji(3), '🟠');
  assert.equal(finalRangeEmoji(2.5), '🔴');
});

test('card de Felipe Juan aceita Juan, contato e perguntas sobre o criador', () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    for (const body of ['juan', 'qual contato do juan', 'contato do felipe juan', 'quem é o seu criador', 'quem te criou', 'quem criou o bot']) {
      const result = engine.evaluate(body, { isGroup: true, ignorePermissions: true });
      assert.equal(result.matchedItem, 'Contato — Felipe Juan', body);
    }
    engine.close();
  } finally { holder.close(); }
});

test('todas as disciplinas dos cards docentes usam sigla e nome completo', () => {
  const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
  for (const item of items) {
    const response = buildSiProfessorResponse(item);
    for (const [discipline] of item.classes || []) {
      assert.ok(SI_DISCIPLINE_CODES_2026_2[discipline], `sigla ausente: ${discipline}`);
      assert.match(response, new RegExp(`\\*${escapeRegex(formatDisciplineLabel(discipline))}\\*`));
    }
  }
  for (const shared of buildSharedDisciplineCards2026_2()) {
    assert.match(shared.response_text, /^\*[A-Z0-9 ]+ - .+\*/);
  }
  assert.equal(formatDisciplineLabel('Linguagem de Programação I'), 'LPI - Linguagem de Programação I');
  assert.equal(formatDisciplineNamesInText('Linguagem de Programação I'), 'LPI - Linguagem de Programação I');
  assert.equal(formatDisciplineNamesInText('LPI - Linguagem de Programação I'), 'LPI - Linguagem de Programação I');

  const holder = temporaryDatabase();
  try {
    for (const card of holder.db.listAutomaticMessages()) {
      const response = String(card.response_text || '');
      const details = String(card.details_text || '');
      assert.equal(formatDisciplineNamesInText(response), response, `${card.title}: resposta contém disciplina sem sigla`);
      assert.equal(formatDisciplineNamesInText(details), details, `${card.title}: detalhes contêm disciplina sem sigla`);
    }
  } finally { holder.close(); }
});

test('classificador reage somente quando agradecimento ou ofensa é dirigido ao bot', () => {
  assert.deepEqual(classifyBotReaction({ body: 'vlw', hasQuotedMessage: true, quotedFromMe: true }), { kind: 'thanks', emoji: '❤️', reason: 'reply-to-bot' });
  assert.equal(classifyBotReaction({ body: 'vlw', hasQuotedMessage: false, quotedFromMe: false }), null);
  assert.equal(classifyBotReaction({ body: 'não, obrigado bot', hasQuotedMessage: false, quotedFromMe: false }), null);
  assert.deepEqual(classifyBotReaction({ body: 'obrigado bot', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'thanks', emoji: '❤️', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'obrigado', mentionedMe: true, hasQuotedMessage: false, quotedFromMe: false }), { kind: 'thanks', emoji: '❤️', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'escravo do juan vtnc', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'offense', emoji: '😔', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'tamo junto, escravo do Juan', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'thanks', emoji: '❤️', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'bot vai pra merda', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'offense', emoji: '😔', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'boa', hasQuotedMessage: true, quotedFromMe: true }), { kind: 'thanks', emoji: '❤️', reason: 'reply-to-bot' });
  assert.equal(classifyBotReaction({ body: 'vtnc', hasQuotedMessage: false, quotedFromMe: false }), null);
  assert.equal(classifyBotReaction({ body: 'obrigado', hasQuotedMessage: true, quotedFromMe: false }), null);
});

test('motor envia somente a reação e não uma resposta de texto', async () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const thanks = fakeMessage('vlw', { hasQuotedMessage: true, quotedFromMe: true });
    await engine.handle(thanks.message);
    assert.deepEqual(thanks.reactions, ['❤️']);
    assert.deepEqual(thanks.replies, []);

    const offense = fakeMessage('bot, seu burro');
    await engine.handle(offense.message);
    assert.deepEqual(offense.reactions, ['😔']);
    assert.deepEqual(offense.replies, []);
    engine.close();
  } finally { holder.close(); }
});

test('adaptador reconhece reply ao bot e envia reação na mensagem recebida', async () => {
  const sent = [];
  const socket = {
    user: { id: '5577991112222:12@s.whatsapp.net' },
    async sendMessage(jid, content, options) { sent.push({ jid, content, options }); return { ok: true }; }
  };
  const raw = {
    key: { remoteJid: '120363000000000000@g.us', participant: '5577888888888@s.whatsapp.net', fromMe: false, id: 'incoming-1' },
    message: { extendedTextMessage: { text: 'obrigado', contextInfo: {
      stanzaId: 'bot-message-1', participant: '5577991112222@s.whatsapp.net', quotedMessage: { conversation: 'resposta do bot' }
    } } }
  };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  assert.equal(adapter.hasQuotedMessage, true);
  assert.equal(adapter.quotedFromMe, true);
  await adapter.react('❤️');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content.react.text, '❤️');
  assert.equal(sent[0].content.react.key, raw.key);
});
