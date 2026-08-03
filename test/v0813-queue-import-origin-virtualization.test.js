const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConversationQueue } = require('../src/conversation-queue');
const { parseProfessorScheduleFile } = require('../src/professor-schedule-import');
const { Database } = require('../src/database');
const { readAdminJs } = require('./helpers/admin-assets');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0813-'));
  return { dir, file: path.join(dir, 'bot.sqlite') };
}
function message(title, response = 'Resposta oficial') {
  return {
    title,
    response_text: response,
    active: true,
    archived: false,
    scope: 'both',
    tags: ['teste'],
    trigger: { sentences: [`gatilho ${title}`], keywords: [], required_words: [], excluded_words: [], negative_examples: [], synonym_group_ids: [], exact_phrases: [], typo_tolerance: 0, require_question_mark: false }
  };
}

test('fila preserva a ordem dentro da conversa e mantém conversas diferentes em paralelo', async () => {
  const events = [];
  const queue = new ConversationQueue();
  const a1 = queue.enqueue('grupo-a', async () => { events.push('a1-start'); await sleep(60); events.push('a1-end'); });
  const a2 = queue.enqueue('grupo-a', async () => { events.push('a2-start'); await sleep(5); events.push('a2-end'); });
  const b1 = queue.enqueue('grupo-b', async () => { events.push('b1-start'); await sleep(10); events.push('b1-end'); });
  await Promise.all([a1, a2, b1]);
  assert.ok(events.indexOf('a1-end') < events.indexOf('a2-start'), events.join(','));
  assert.ok(events.indexOf('b1-start') < events.indexOf('a1-end'), events.join(','));
  assert.equal(queue.stats().queuedMessages, 0);
  assert.equal(queue.stats().trackedConversations, 0);
});

test('importador lê CSV e XLSX e agrupa várias disciplinas do mesmo professor', () => {
  const csv = Buffer.from('professor;email;disciplina;semestre;dia;horário;período letivo\nProfessor CSV;csv@ifba.edu.br;MDI;1º;quinta;18h30–20h10;2027.1\nProfessor CSV;csv@ifba.edu.br;MDII;2º;sexta;20h20–22h;2027.1\n');
  const parsedCsv = parseProfessorScheduleFile(csv, 'quadro.csv');
  assert.equal(parsedCsv.records.length, 1);
  assert.equal(parsedCsv.records[0].classes.length, 2);
  const xlsx = fs.readFileSync(path.join(__dirname, 'fixtures', 'quadro-docente-v0813.xlsx'));
  const parsedXlsx = parseProfessorScheduleFile(xlsx, 'quadro.xlsx');
  assert.equal(parsedXlsx.records.length, 1);
  assert.equal(parsedXlsx.records[0].name, 'Professora Teste');
  assert.equal(parsedXlsx.records[0].classes.length, 2);
});

test('atualização docente preserva gatilhos personalizados e cria histórico', () => {
  const { dir, file } = tempDb();
  const db = new Database(file, { seedBundledContent: false });
  try {
    const original = db.saveAutomaticMessage({
      title: 'Professor — Docente Teste', response_text: 'Resposta antiga', tags: ['professor'],
      trigger: { sentences: ['meu gatilho exclusivo'], keywords: [], typo_tolerance: 0 }
    });
    const report = db.applyProfessorScheduleImport([{ name: 'Docente Teste', email: 'docente@ifba.edu.br', academic_period: '2027.1', semesters: ['1º semestre'], classes: [{ discipline: 'Disciplina Nova', semester: '1º semestre', day: 'segunda-feira', hours: '18h30–20h10' }] }]);
    assert.equal(report.updated, 1);
    assert.equal(report.preservedTriggers, 1);
    const updated = db.getAutomaticMessage(original.id);
    assert.deepEqual(updated.trigger.sentences, ['meu gatilho exclusivo']);
    assert.match(updated.response_text, /Disciplina Nova/);
    assert.match(updated.response_text, /docente@ifba\.edu\.br/);
    assert.ok(db.listAutomaticMessageHistory(original.id).some(entry => entry.action === 'teacher-schedule-import'));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('conteúdo personalizado do pacote recebe atualização pendente e exige decisão', () => {
  const { dir, file } = tempDb();
  const db = new Database(file, { seedBundledContent: false });
  try {
    const created = db.stagePackageAutomaticMessage('hub-teste', message('Cartão oficial', 'Versão 1'));
    assert.equal(created.action, 'created');
    assert.equal(created.item.source_type, 'hub_package');
    assert.equal(created.item.customized, false);
    db.saveAutomaticMessage({ ...message('Cartão oficial', 'Minha versão'), trigger: created.item.trigger }, created.item.id);
    const custom = db.getAutomaticMessage(created.item.id);
    assert.equal(custom.customized, true);
    const staged = db.stagePackageAutomaticMessage('hub-teste', message('Cartão oficial', 'Versão 2'));
    assert.equal(staged.action, 'pending');
    assert.equal(staged.item.response_text, 'Minha versão');
    assert.equal(staged.item.pending_package_update.response_text, 'Versão 2');
    db.resolvePackageAutomaticMessageUpdate(created.item.id, 'keep');
    assert.equal(db.getAutomaticMessage(created.item.id).response_text, 'Minha versão');
    assert.equal(db.stagePackageAutomaticMessage('hub-teste', message('Cartão oficial', 'Versão 2')).action, 'unchanged');
    db.stagePackageAutomaticMessage('hub-teste', message('Cartão oficial', 'Versão 3'));
    const applied = db.resolvePackageAutomaticMessageUpdate(created.item.id, 'use');
    assert.equal(applied.response_text, 'Versão 3');
    assert.equal(applied.customized, false);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backup restaura origem e estado personalizado de cartões do pacote', () => {
  const first = tempDb(); const second = tempDb();
  const db1 = new Database(first.file, { seedBundledContent: false });
  const db2 = new Database(second.file, { seedBundledContent: false });
  try {
    const item = db1.stagePackageAutomaticMessage('hub-backup', message('Cartão backup', 'Oficial')).item;
    db1.saveAutomaticMessage({ ...message('Cartão backup', 'Personalizado'), trigger: item.trigger }, item.id);
    db2.importData(db1.exportData());
    const restored = db2.listAutomaticMessages().find(value => value.title === 'Cartão Backup');
    assert.equal(restored.source_type, 'hub_package');
    assert.equal(restored.package_key, 'hub-backup');
    assert.equal(restored.customized, true);
    assert.equal(restored.response_text, 'Personalizado');
  } finally {
    db1.close(); db2.close();
    fs.rmSync(first.dir, { recursive: true, force: true }); fs.rmSync(second.dir, { recursive: true, force: true });
  }
});

test('painel oferece cards ou lista, colunas configuráveis e renderização virtualizada', () => {
  const app = readAdminJs(path.join(__dirname, '..'));
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  assert.match(app, /hub-message-view/);
  assert.match(app, /hub-message-columns/);
  assert.match(app, /IntersectionObserver/);
  assert.match(app, /Atualizar quadro docente/);
  assert.match(app, /Comparar conteúdo do pacote/);
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /columns-4/);
  assert.match(css, /view-list/);
});
