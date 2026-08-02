const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Database } = require('../src/database');
const { BackupManager } = require('../src/backup-manager');
const { BotEngine } = require('../src/bot-engine');
const { renderTemplate } = require('../src/template-renderer');
const { readAdminJs } = require('./helpers/admin-assets');

function tempDir(prefix = 'hub-v080-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function message(title, keyword, extra = {}) {
  return {
    title, response_text: `Resposta de ${title}`, active: true, archived: false, scope: 'both',
    tags: [], trigger: { keywords: [keyword], sentences: [] }, ...extra
  };
}

test('variáveis simples são renderizadas sem executar conteúdo arbitrário', () => {
  const result = renderTemplate(
    '{{nome_da_pessoa}} em {{nome_do_grupo}} — {{data}} às {{hora}} — {{desconhecida}}',
    { senderName: 'Bruno', groupName: 'Turma A' },
    new Date('2026-07-30T18:12:00-03:00')
  );
  assert.match(result, /Bruno em Turma A/);
  assert.doesNotMatch(result, /\{\{(?:data|hora|nome_do_grupo|nome_da_pessoa)\}\}/);
  assert.match(result, /\{\{desconhecida\}\}/);
});

test('ordenação, arquivamento e ações em lote preservam histórico', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'db.sqlite')); db.deleteExampleData();
  const a = db.saveAutomaticMessage(message('A', 'a'));
  const b = db.saveAutomaticMessage(message('B', 'b'));
  const c = db.saveAutomaticMessage(message('C', 'c'));

  db.reorderAutomaticMessages([c.id, a.id, b.id]);
  const ordered = db.listAutomaticMessages().filter(item => [a.id,b.id,c.id].includes(item.id));
  assert.deepEqual(ordered.map(item => item.id), [c.id, a.id, b.id]);

  db.bulkAutomaticMessages([a.id, b.id], 'add-tag', '#revisar');
  assert.deepEqual(db.getAutomaticMessage(a.id).tags, ['revisar']);
  db.bulkAutomaticMessages([b.id], 'archive');
  assert.equal(db.getAutomaticMessage(b.id).archived, true);
  assert.equal(db.getAutomaticMessage(b.id).active, false);
  assert.ok(db.listAutomaticMessageHistory(b.id).length >= 1);
  assert.equal(db.listAutomaticMessages({ activeOnly: true }).some(item => item.id === b.id), false);

  db.bulkAutomaticMessages([b.id], 'unarchive');
  assert.equal(db.getAutomaticMessage(b.id).archived, false);
  db.bulkAutomaticMessages([b.id], 'activate');
  assert.equal(db.getAutomaticMessage(b.id).active, true);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('validação avisa sobre gatilho genérico e conflito antes de salvar', () => {
  const dir = tempDir(); const db = new Database(path.join(dir, 'db.sqlite')); db.deleteExampleData();
  const existing = db.saveAutomaticMessage(message('Contato da coordenação', 'contato'));
  const result = db.validateAutomaticMessageRules(message('Outro contato', 'contato'), null);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(item => /genérico/.test(item)));
  assert.ok(result.warnings.some(item => item.includes(existing.title)));
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('proteção contra ciclos ignora números e marcadores cadastrados', () => {
  const fakeDb = { getSettings: () => ({}) };
  const engine = new BotEngine(fakeDb);
  const settings = { ignored_bot_numbers: '5511999999999, 5577999999999', ignored_message_prefixes: '[BOT]|[HUBBOT]' };
  assert.match(engine.cycleBlockReason({ author: '5511999999999@s.whatsapp.net' }, 'olá', settings), /outro número/);
  assert.match(engine.cycleBlockReason({ author: '5511888888888@s.whatsapp.net' }, '[hubbot] resposta', settings), /marcador/);
  assert.equal(engine.cycleBlockReason({ author: '5511888888888@s.whatsapp.net' }, 'pergunta comum', settings), '');
});

test('backup completo inclui banco, exportação e anexos; sessão é opcional', async () => {
  const dir = tempDir(); const dataDir = path.join(dir, 'data'); const backupDir = path.join(dataDir, 'backups');
  const attachmentsDir = path.join(dataDir, 'attachments'); const authDir = path.join(dataDir, '.baileys_auth');
  fs.mkdirSync(attachmentsDir, { recursive: true }); fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(attachmentsDir, 'manual.pdf'), 'pdf'); fs.writeFileSync(path.join(authDir, 'creds.json'), '{}');
  const db = new Database(path.join(dataDir, 'hub-bot.sqlite')); db.deleteExampleData();
  db.saveAutomaticMessage(message('Manual', 'manual'));
  const manager = new BackupManager({ database: db, backupDir, dataDir, attachmentsDir, authDir, rootDir: dir });
  const withoutSession = await manager.createFullZip({ includeSession: false });
  const names1 = execFileSync('unzip', ['-Z1', withoutSession.path], { encoding: 'utf8' });
  assert.match(names1, /hub-bot\.sqlite/); assert.match(names1, /dados-exportados\.json/); assert.match(names1, /attachments\/manual\.pdf/);
  assert.doesNotMatch(names1, /sessao-whatsapp/);
  const withSession = await manager.createFullZip({ includeSession: true });
  const names2 = execFileSync('unzip', ['-Z1', withSession.path], { encoding: 'utf8' });
  assert.match(names2, /sessao-whatsapp\/creds\.json/);
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('painel v0.8 expõe todos os recursos administrativos solicitados', () => {
  const app = readAdminJs(path.join(__dirname, '..'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'admin-server.js'), 'utf8');
  assert.match(html, /id="global-health"/);
  assert.match(app, /Modo simples/); assert.match(app, /Modo técnico/);
  assert.match(app, /Prévia no WhatsApp/); assert.match(app, /validateAutomaticMessageRules|\/api\/messages\/validate/);
  assert.match(app, /draggable="true"/); assert.match(app, /data-bulk="activate"/);
  assert.match(app, /Arquivada/); assert.match(app, /ignored_bot_numbers/); assert.match(app, /ignored_message_prefixes/);
  assert.match(app, /nome_do_grupo/); assert.match(app, /backup\/full/); assert.match(app, /Tela cheia/);
  assert.match(app, /anexo:pdf/); assert.match(app, /dashboard_cards/);
  assert.match(css, /fullscreen-modal/); assert.match(server, /\/api\/messages\/reorder/); assert.match(server, /\/api\/messages\/bulk/);
});
