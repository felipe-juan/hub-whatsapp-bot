const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractText, disconnectCode, createMessageAdapter, cleanAccountNumber } = require('../src/baileys-adapter');

test('extrai texto de formatos comuns e mensagens encapsuladas', () => {
  assert.equal(extractText({ conversation: 'olá' }), 'olá');
  assert.equal(extractText({ extendedTextMessage: { text: 'pergunta?' } }), 'pergunta?');
  assert.equal(extractText({ ephemeralMessage: { message: { imageMessage: { caption: 'legenda' } } } }), 'legenda');
  assert.equal(extractText({ listResponseMessage: { singleSelectReply: { selectedRowId: '2' } } }), '2');
});

test('adapta mensagem Baileys à interface esperada pelo motor', async () => {
  const sent = [];
  const socket = {
    async sendMessage(jid, content, options) { sent.push({ jid, content, options }); },
    async groupMetadata(jid) { return { id: jid, subject: 'Grupo de teste' }; }
  };
  const raw = {
    key: { remoteJid: '123@g.us', participantPn: '5511999999999@s.whatsapp.net', fromMe: false },
    pushName: 'Aluno',
    message: { conversation: 'qual o contato?' }
  };
  const adapter = createMessageAdapter({ raw, socket, metadataCache: new Map() });
  assert.equal(adapter.from, '123@g.us');
  assert.equal(adapter.author, '5511999999999@s.whatsapp.net');
  assert.equal(adapter.body, 'qual o contato?');
  const chat = await adapter.getChat();
  assert.equal(chat.isGroup, true);
  assert.equal(chat.name, 'Grupo');
  await adapter.reply('resposta');
  await chat.sendMessage('solta');
  assert.equal(sent.length, 2);
  assert.equal(sent[0].options.quoted, raw);
  assert.equal(sent[1].options, undefined);
});

test('interpreta encerramento e número da conta', () => {
  assert.equal(disconnectCode({ output: { statusCode: 401 } }), 401);
  assert.equal(cleanAccountNumber('5511999999999:12@s.whatsapp.net'), '5511999999999');
});

test('instalador não exige Chromium e usa limites menores', () => {
  const installer = fs.readFileSync(path.join(__dirname, '..', 'install-fedora-gnome.sh'), 'utf8');
  assert.doesNotMatch(installer, /nodejs npm chromium/);
  assert.match(installer, /MemoryHigh=384M/);
  assert.match(installer, /MemoryMax=512M/);
});

test('v0.4.4 usa configuração recomendada e recupera pareamento travado', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'whatsapp.js'), 'utf8');
  assert.match(source, /fetchLatestBaileysVersion/);
  assert.match(source, /makeCacheableSignalKeyStore/);
  assert.match(source, /version,\n\s+auth/);
  assert.match(source, /schedulePairingRestart/);
  assert.match(source, /armConnectionWatchdog/);
  assert.match(source, /credentialsRegistered/);
  assert.doesNotMatch(source, /browser:\s*baileys\.Browsers/);
});

test('interpreta códigos de desconexão profundamente aninhados', () => {
  assert.equal(disconnectCode({ cause: { error: { output: { payload: { statusCode: 515 } } } } }), 515);
  assert.equal(disconnectCode(new Error('stream error code 408')), 408);
});
