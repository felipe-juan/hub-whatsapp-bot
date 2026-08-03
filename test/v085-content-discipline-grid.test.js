const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');
const { findAutomaticMessageMatchesDetailed } = require('../src/matcher');
const { readAdminJs } = require('./helpers/admin-assets');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v085-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function card(db, title) {
  return db.listAutomaticMessages().find(item => item.title === title);
}

test('professor replies are readable, grouped by topic and include every classroom', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const allan = card(db, 'Professor — Allan de Sousa Soares');
    assert.ok(allan);
    assert.equal((allan.response_text.match(/📧/gu) || []).length, 1);
    assert.equal((allan.response_text.match(/📚/gu) || []).length, 1);
    assert.equal((allan.response_text.match(/🗓️/gu) || []).length, 1);
    assert.doesNotMatch(allan.response_text, /👨‍🏫|👩‍🏫|🎓|📍|⚠️/u);
    assert.match(allan.response_text, /📧 \*Contato\*/);
    assert.match(allan.response_text, /📚 \*Semestres\*/);
    assert.match(allan.response_text, /🗓️ \*Horários e salas — 2026\.2\*/);
    assert.match(allan.response_text, /Matemática Discreta I[\s\S]*Sala: \*H204\*/);
    assert.match(allan.response_text, /Matemática Discreta II[\s\S]*Sala: \*H008\*/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('canonical support cards stay concise and structured sectors expose useful locators', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const titles = ['Serviço — Protocolo', 'Onde está o professor — salas do IFBA', 'HUB — Fluxograma e matriz de Sistemas de Informação', 'HUB — Média final e tabela da final', 'HUB — Calendário acadêmico'];
    for (const title of titles) {
      const item = card(db, title); assert.ok(item, `missing ${title}`);
      assert.doesNotMatch(item.response_text, /♿|🎓|🧑‍🎓|📝|🏫|🧭|📊/u);
    }
    const capne = db.listSectors().find(item => item.acronym === 'CAPNE');
    assert.ok(capne); assert.match(capne.email, /capne\.vdc@ifba\.edu\.br/);
    assert.match(card(db, 'Serviço — Protocolo').response_text, /🔗/);
    assert.match(card(db, 'HUB — Calendário acadêmico').response_text, /📅/);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('discipline questions find the professor even when the name is unknown', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const bruno = card(db, 'Professor — Bruno Silvério Costa');
    const allan = card(db, 'Professor — Allan de Sousa Soares');
    const camilo = card(db, 'Professor — Camilo Alves Carvalho');
    assert.equal(evaluateTrigger('qual o contato do professor de Inteligência Artificial?', bruno).matched, true);
    assert.equal(evaluateTrigger('email do professor de Matemática Discreta II', allan).matched, true);
    assert.equal(evaluateTrigger('que dia tem Sistemas Operacionais?', camilo).matched, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the most specific discipline wins and shared disciplines use one combined card', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    const web = findAutomaticMessageMatchesDetailed(
      'qual o contato do professor de Programação Web II?', messages, [], 5, { isGroup: true }
    );
    assert.equal(web[0].item.title, 'Professor — Alexandro dos Santos Silva');
    assert.ok(web[0].score > (web.find(item => item.item.title === 'Professor — Andrique Figueirêdo Amorim')?.score || 0));

    const calculo = findAutomaticMessageMatchesDetailed(
      'qual o contato do professor de Cálculo Diferencial Aplicado à Computação?', messages, [], 5, { isGroup: true }
    );
    assert.equal(calculo[0].item.title, 'Disciplina compartilhada — Cálculo Diferencial Aplicado à Computação');
    assert.equal(calculo.some(item => item.item.title.includes('Paulo Espinheira')), false);
    assert.equal(calculo.some(item => item.item.title.includes('Thiago Leonardo')), false);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('final grade card mentions the WhatsApp calculator and help command', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const media = card(db, 'HUB — Média final e tabela da final');
    assert.match(media.response_text, /!final 6,9/);
    assert.match(media.response_text, /!final 5,0 6,0 7,0/);
    assert.match(media.response_text, /!final help/);
    assert.match(media.response_text, /#media-final/);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v0.8.5 migration preserves a custom professor email and stores the previous version', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const bruno = card(db, 'Professor — Bruno Silvério Costa');
    const oldStyle = bruno.response_text
      .replace('*Bruno Silvério Costa*', '👨‍🏫/👩‍🏫 *Bruno Silvério Costa*')
      .replace('*Semestre(s):*', '🎓 *Semestre(s):*')
      .replace('*Dias no IFBA:*', '📍 *Dias no IFBA:*')
      .replace('brunosilverio@ifba.edu.br', 'bruno.custom@ifba.edu.br');
    db.db.prepare('UPDATE automatic_messages SET response_text=? WHERE id=?').run(oldStyle, bruno.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key='si_content_v085_migrated'").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migrated = card(reopened, 'Professor — Bruno Silvério Costa');
    assert.match(migrated.response_text, /bruno\.custom@ifba\.edu\.br/);
    assert.doesNotMatch(migrated.response_text, /👨‍🏫|👩‍🏫|🎓|📍/u);
    assert.ok(reopened.listAutomaticMessageHistory(migrated.id).some(entry => entry.action === 'v0.8.5-textos-e-gatilhos-por-disciplina'));
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('admin message cards use a two-column desktop grid and one column on narrower screens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  const js = readAdminJs(path.join(__dirname, '..'));
  assert.match(css, /\.messages-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1180px\)\{\.messages-grid\{grid-template-columns:1fr\}\}/);
  assert.match(js, /id="messages-box" class="messages-grid top-gap"/);
});
