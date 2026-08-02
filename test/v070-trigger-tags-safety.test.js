const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluateTrigger } = require('../src/trigger-rules');
const { Database } = require('../src/database');
const { OutboundGuard } = require('../src/outbound-guard');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v070-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

test('sentenças e palavras-chave são canais independentes que podem coexistir', () => {
  const rule = {
    title: 'nome interno que não deve ativar',
    trigger: {
      sentences: ['qual o contato de bruno', 'email do professor bruno'],
      keywords: ['bruno', 'contato', '?'],
      match_mode: 'all'
    }
  };
  assert.equal(evaluateTrigger('Qual o contato de Brúno, por favor?', rule).matched, true, 'a sentença deve ativar');
  assert.equal(evaluateTrigger('BRUNO: você sabe informar o CONTATO?', rule).matched, true, 'o conjunto de palavras deve ativar');
  assert.equal(evaluateTrigger('bruno contato', rule).matched, false, 'faltou o símbolo literal');
  assert.equal(evaluateTrigger('nome interno que não deve ativar', rule).matched, false, 'o nome interno não é gatilho');
});

test('banco descarta tópico e etiquetas legadas do modelo de mensagens', () => {
  const dir = tempDir();
  const db = new Database(path.join(dir, 'test.sqlite'));
  db.deleteExampleData();
  const item = db.saveAutomaticMessage({
    title: 'Regra', topic: 'Documentos', tags: ['#faq'], response_text: 'Resposta',
    trigger: { sentences: ['onde está o documento'] }, active: true
  });
  assert.equal(item.topic, '');
  assert.deepEqual(item.tags, []);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('painel remove pastas, etiquetas e simulador e mantém anexo no editor', () => {
  const root = path.join(__dirname, '..');
  const app = readAdminJs(root);
  assert.match(app, /Sentenças ou trechos/);
  assert.match(app, /Palavras-chave obrigatórias/);
  assert.doesNotMatch(app, /Etiquetas com #|tag-filter|data-bulk="add-tag"/);
  assert.match(app, /Anexo da mensagem \(opcional\)/);
  assert.match(app, /name="attachment_file"/);
  assert.doesNotMatch(app, /Testar uma mensagem|folder-filter|name="folder"|Como combinar/);
});


test('limites conservadores bloqueiam rajadas globais e por pessoa', () => {
  const guard = new OutboundGuard();
  const settings = { risk_guard_enabled: true, max_replies_per_minute: 2, max_replies_per_hour: 10, max_replies_per_user_per_minute: 1 };
  assert.equal(guard.check('pessoa-a', settings, 1000).allowed, true);
  guard.record('pessoa-a', 1000);
  assert.match(guard.check('pessoa-a', settings, 1001).reason, /mesma pessoa/);
  assert.equal(guard.check('pessoa-b', settings, 1001).allowed, true);
  guard.record('pessoa-b', 1001);
  assert.match(guard.check('pessoa-c', settings, 1002).reason, /global/);
});

test('camada WhatsApp filtra destinos não conversacionais e usa concorrência sem descartar perguntas', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'whatsapp.js'), 'utf8');
  assert.match(source, /endsWith\('@g\.us'\)/);
  assert.match(source, /endsWith\('@s\.whatsapp\.net'\)/);
  assert.match(source, /endsWith\('@lid'\)/);
  assert.match(source, /endsWith\('@newsletter'\)/);
  assert.match(source, /ConversationQueue/);
  assert.match(source, /processingQueue\.enqueue/);
  assert.doesNotMatch(source, /fila de envio cheia/);
  assert.match(source, /code === 429/);
  assert.match(source, /code === 403/);
});
