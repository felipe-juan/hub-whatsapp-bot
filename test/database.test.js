const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
function cleanDatabase(file) { const db = new Database(file); db.deleteExampleData(); return db; }

test('salva e recupera mensagem automática no SQLite local', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-')); const db = cleanDatabase(path.join(dir, 'test.sqlite'));
  const saved = db.saveAutomaticMessage({ title: 'Contato de Maria', topic: 'Contato', response_text: '📧 maria@ifba.edu.br', trigger: { keywords: ['professora maria'] }, active: true });
  assert.ok(saved.id); assert.equal(db.listAutomaticMessages({ activeOnly: true })[0].response_text, '📧 maria@ifba.edu.br');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('exporta e restaura backup do modelo unificado', () => {
  const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-a-')); const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-b-'));
  const first = cleanDatabase(path.join(firstDir, 'first.sqlite'));
  first.saveAutomaticMessage({ title: 'Teste', topic: 'Geral', response_text: 'Resposta completa', trigger: { keywords: ['teste'] }, active: true });
  first.setSettings({ bot_name: 'Bot Teste' }); const backup = first.exportData();
  const second = cleanDatabase(path.join(secondDir, 'second.sqlite')); second.importData(backup);
  assert.equal(second.getSetting('bot_name'), 'Bot Teste'); assert.equal(second.listAutomaticMessages({ activeOnly: true })[0].response_text, 'Resposta completa');
  first.close(); second.close(); fs.rmSync(firstDir, { recursive: true, force: true }); fs.rmSync(secondDir, { recursive: true, force: true });
});

test('invalida cache de mensagens após alterações administrativas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-cache-')); const db = cleanDatabase(path.join(dir, 'cache.sqlite'));
  assert.equal(db.listAutomaticMessages({ activeOnly: true }).length, 0);
  db.saveAutomaticMessage({ title: 'Teste', response_text: 'Texto', trigger: { keywords: ['teste'] }, active: true });
  assert.equal(db.listAutomaticMessages({ activeOnly: true }).length, 1);
  db.setSettings({ bot_name: 'Bot Econômico' }); assert.equal(db.getSetting('bot_name'), 'Bot Econômico');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
