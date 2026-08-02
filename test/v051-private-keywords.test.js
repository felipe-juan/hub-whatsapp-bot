const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateTrigger } = require('../src/trigger-rules');
const { findAutomaticMessageMatchesDetailed } = require('../src/matcher');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { createMessageAdapter } = require('../src/baileys-adapter');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v051-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

const combinedRule = {
  title: 'Contato de Bruno',
  trigger: { match_mode: 'all', keywords: ['bruno', 'contato', '?'] }
};

test('todos os gatilhos funcionam em qualquer ordem, sem diferenciar caixa ou acento', () => {
  const first = evaluateTrigger('Você tem o CONTATO do Brúno?', combinedRule);
  assert.equal(first.matched, true);
  assert.match(first.reasons.join(' '), /bruno/i);
  assert.match(first.reasons.join(' '), /contato/i);
  assert.match(first.reasons.join(' '), /\?/);

  const reordered = evaluateTrigger('BRUNO: qual é mesmo o seu contato?', combinedRule);
  assert.equal(reordered.matched, true);

  assert.equal(evaluateTrigger('Você tem o contato do Bruno', combinedRule).matched, false);
  assert.equal(evaluateTrigger('Bruno?', combinedRule).matched, false);
  assert.equal(evaluateTrigger('Contato?', combinedRule).matched, false);
});

test('símbolo isolado pode ser usado como gatilho literal', () => {
  assert.equal(evaluateTrigger('?', { trigger: { match_mode: 'all', keywords: ['?'] } }).matched, true);
  assert.equal(evaluateTrigger('!', { trigger: { match_mode: 'all', keywords: ['?'] } }).matched, false);
});

test('nome interno da automação não ativa a resposta', () => {
  const messages = [{ id: 1, title: 'Contato de Bruno', response_text: 'resposta', active: true, published: true, trigger: { match_mode: 'all', keywords: ['bruno', 'contato', '?'] } }];
  assert.equal(findAutomaticMessageMatchesDetailed('Contato de Bruno', messages).length, 0);
  assert.equal(findAutomaticMessageMatchesDetailed('Qual é o contato do Bruno?', messages).length, 1);
});

test('mensagens automáticas respondem também em conversa privada', () => {
  const dir = tempDir();
  const db = new Database(path.join(dir, 'test.sqlite'));
  db.deleteExampleData();
  db.saveAutomaticMessage({
    title: 'Contato de Bruno',
    response_text: '📧 bruno@example.invalid',
    trigger: { match_mode: 'all', keywords: ['bruno', 'contato', '?'] },
    active: true
  });
  // Mesmo uma configuração antiga não deve voltar a bloquear conversas privadas.
  db.setSettings({ group_only: 'true', group_mode: 'selected' });
  const engine = new BotEngine(db);
  const result = engine.evaluate('Você sabe o contato do Brúno?', { isGroup: false, groupId: '' });
  assert.equal(result.matched, true);
  assert.equal(result.text, '📧 bruno@example.invalid');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('adaptador Baileys identifica e responde conversa privada', async () => {
  const sent = [];
  const socket = { async sendMessage(jid, content, options) { sent.push({ jid, content, options }); } };
  const raw = {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
    pushName: 'Bruno',
    message: { conversation: 'qual o contato do bruno?' }
  };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  const chat = await adapter.getChat();
  assert.equal(chat.isGroup, false);
  assert.equal(chat.name, 'Bruno');
  await adapter.reply('resposta privada');
  assert.equal(sent[0].jid, '5511999999999@s.whatsapp.net');
  assert.deepEqual(sent[0].options, { quoted: raw });
});

test('painel apresenta sentenças e palavras-chave simultâneas e informa respostas privadas', () => {
  const app = readAdminJs(path.join(__dirname, '..'));
  assert.match(app, /Sentenças ou trechos/);
  assert.match(app, /Palavras-chave obrigatórias/);
  assert.match(app, /todas devem aparecer; a ordem não importa/);
  assert.match(app, /ignorando capitalização e acentos/);
  assert.match(app, /O bot responde em grupos e também em conversas privadas/);
  assert.doesNotMatch(app, /Testar uma mensagem|id="sim-type"|id="sim-message"/);
});
