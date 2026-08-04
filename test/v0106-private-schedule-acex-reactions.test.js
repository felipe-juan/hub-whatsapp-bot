'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { classifyBotReaction } = require('../src/reactions');
const { formatDisciplineLabel, formatDisciplineNamesInText } = require('../src/si-professors-2026-2');
const { felipeJuanPhone, formatBrazilianMobile } = require('../src/private-content');
const { classifySemesterScheduleRequest, semesterFromFollowUp } = require('../src/semester-schedule');
const { timestampToMilliseconds, createMessageAdapter } = require('../src/baileys-adapter');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0106-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', quote_replies: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function fakeMessage(body, { from = '120363000000000000@g.us', timestampMs = Date.UTC(2026, 7, 3, 15) } = {}) {
  const replies = [];
  return {
    replies,
    message: {
      fromMe: false, from, author: '5577888888888@s.whatsapp.net', body, timestampMs,
      senderName: 'Pessoa', hasQuotedMessage: false, quotedFromMe: false,
      async react() {}, async reply(text) { replies.push(String(text)); },
      async sendResponse(payload) { replies.push(String(payload.text || '')); },
      async getChat() { return { isGroup: from.endsWith('@g.us'), name: 'Grupo', id: { _serialized: from }, async sendMessage(text) { replies.push(String(text)); } }; }
    }
  };
}

test('contato privado de Felipe Juan só é aplicado quando o arquivo privado existe', () => {
  const holder = temporaryDatabase();
  try {
    const card = holder.db.listAutomaticMessages().find(item => item.title === 'Contato — Felipe Juan');
    assert.ok(card);
    const phone = felipeJuanPhone();
    if (phone) {
      assert.match(card.response_text, /\*Contato\*/u);
      assert.ok(card.response_text.includes(formatBrazilianMobile(phone)));
    } else {
      assert.doesNotMatch(card.response_text, /\*Contato\*/u);
    }
  } finally { holder.close(); }
});

test('ACEX é a sigla exibida e ACE continua aceito somente como alias legado', () => {
  assert.equal(formatDisciplineLabel('Atividades Curriculares de Extensão I'), 'ACEX I - Atividades Curriculares de Extensão I');
  assert.equal(formatDisciplineNamesInText('ACE II - Atividades Curriculares de Extensão II'), 'ACEX II - Atividades Curriculares de Extensão II');
  assert.equal(formatDisciplineNamesInText('ACEX III - Atividades Curriculares de Extensão III'), 'ACEX III - Atividades Curriculares de Extensão III');
});

test('reações reconhecem novas variantes de elogio e ofensa dirigidas ao bot', () => {
  assert.deepEqual(classifyBotReaction({ body: 'bot, toma no cu', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'offense', emoji: '😔', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'escravo do Juan, vai pro caralho', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'offense', emoji: '😔', reason: 'bot-addressed' });
  assert.deepEqual(classifyBotReaction({ body: 'arrasou', hasQuotedMessage: true, quotedFromMe: true }), { kind: 'thanks', emoji: '❤️', reason: 'reply-to-bot' });
  assert.deepEqual(classifyBotReaction({ body: 'bot, você é uma lenda', hasQuotedMessage: false, quotedFromMe: false }), { kind: 'thanks', emoji: '❤️', reason: 'bot-addressed' });
  assert.equal(classifyBotReaction({ body: 'toma no cu', hasQuotedMessage: false, quotedFromMe: false }), null);
});

test('consulta de aulas resolve hoje, amanhã, depois de amanhã e dia da semana', () => {
  const now = Date.UTC(2026, 7, 3, 15); // segunda-feira, 12h em Vitória da Conquista
  const today = classifySemesterScheduleRequest('qual é aula de hoje para o terceiro semestre?', { now });
  assert.equal(today.kind, 'schedule');
  assert.equal(today.semester, 3);
  assert.match(today.text, /\*LPII - Linguagem de Programação II\*\nSala: H108\nProfessor: Alexandro dos Santos Silva/u);
  assert.match(today.text, /\*PE - Probabilidade e Estatística\*\nSala: H214\nProfessor: Carlos André Pereira de Jesus Silva/u);
  assert.doesNotMatch(today.text, /18h|Fonte|2026\.2/u);

  const tomorrow = classifySemesterScheduleRequest('aulas de amanhã do 5º semestre', { now });
  assert.match(tomorrow.text, /PWII - Programação Web II/u);
  const concise = classifySemesterScheduleRequest('amanhã terceiro semestre', { now });
  assert.equal(concise.kind, 'schedule');
  assert.equal(concise.semester, 3);
  const dayAfter = classifySemesterScheduleRequest('depois de amanhã aulas do sexto semestre', { now });
  assert.match(dayAfter.text, /GP - Gestão de Projetos/u);
  const friday = classifySemesterScheduleRequest('o que tem sexta-feira no primeiro semestre?', { now });
  assert.match(friday.text, /IAC - Inglês Aplicado à Computação/u);
});

test('consulta sem semestre pede a informação e aceita resposta curta em seguida', async () => {
  const holder = temporaryDatabase();
  try {
    const engine = new BotEngine(holder.db);
    const first = fakeMessage('qual é a aula de hoje?', { from: '5577999999999@s.whatsapp.net' });
    await engine.handle(first.message);
    assert.match(first.replies[0], /Qual semestre/u);

    const second = fakeMessage('terceiro semestre', { from: '5577999999999@s.whatsapp.net' });
    await engine.handle(second.message);
    assert.match(second.replies[0], /LPII - Linguagem de Programação II/u);
    assert.equal(semesterFromFollowUp('3º semestre'), 3);
    engine.close();
  } finally { holder.close(); }
});

test('adaptador expõe o horário real da mensagem para resolver hoje corretamente', () => {
  const seconds = 1785769200;
  assert.equal(timestampToMilliseconds(seconds), seconds * 1000);
  const raw = {
    key: { remoteJid: '5577999999999@s.whatsapp.net', fromMe: false, id: 'time-1' },
    messageTimestamp: seconds,
    message: { conversation: 'aulas de hoje do terceiro semestre' }
  };
  const adapter = createMessageAdapter({ raw, socket: { user: { id: '5577000000000@s.whatsapp.net' }, sendMessage() {} }, metadataCache: new Map() });
  assert.equal(adapter.timestampMs, seconds * 1000);
});
