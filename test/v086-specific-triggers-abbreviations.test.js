const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');
const { BotEngine } = require('../src/bot-engine');
const { findAutomaticMessageMatchesDetailed } = require('../src/matcher');
const { tokenize } = require('../src/text');
const { SI_SUPPORT_MESSAGES_V083 } = require('../src/si-support-messages-v083');
const { SI_DISCIPLINE_ALIASES_2026_2 } = require('../src/si-professors-2026-2');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v086-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function card(db, title) {
  return db.listAutomaticMessages().find(item => item.title === title);
}

test('structured coordination understands coordenador and coordenadora without matching casual mentions', () => {
  const { db, dir } = temporaryDatabase(); const engine = new BotEngine(db);
  try {
    for (const body of ['qual o contato do coordenador de bsi?', 'email da coordenadora de sistemas de informação', 'ctt do coordenador do curso de bsi']) {
      const result = engine.evaluate(body, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, body); assert.match(result.matchedItem, /^CSI — (?:contact|email)$/u); assert.match(result.text, /csi\.vdc@ifba\.edu\.br/u);
    }
    assert.equal(engine.evaluate('o coordenador participou da reunião', { isGroup: false, ignorePermissions: true }).matched, false);
  } finally { engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('bundled support triggers allow safe exact shortcuts while rejecting unrelated contexts', () => {
  const { db, dir } = temporaryDatabase();
  try {
    for (const item of SI_SUPPORT_MESSAGES_V083) {
      for (const sentence of item.sentences) {
        assert.ok(tokenize(sentence).length >= 2, `${item.title} contains broad single trigger: ${sentence}`);
      }
    }
    const media = card(db, 'HUB — Média Final e Tabela da Final');
    const fluxograma = card(db, 'HUB — Fluxograma e Matriz de Sistemas de Informação');
    const protocolo = card(db, 'Serviço — Protocolo');
    const calendario = card(db, 'HUB — Calendário Acadêmico');

    assert.equal(evaluateTrigger('tabela', media).matched, false);
    assert.equal(evaluateTrigger('a tabela está na planilha', media).matched, false);
    assert.equal(evaluateTrigger('minha nota final foi oito', media).matched, false);
    assert.equal(evaluateTrigger('matriz', fluxograma).matched, false);
    assert.equal(evaluateTrigger('essa matriz tem determinante zero', fluxograma).matched, false);
    assert.equal(evaluateTrigger('protocolo', protocolo).matched, true);
    assert.equal(evaluateTrigger('o protocolo tcp controla a conexão', protocolo).matched, false);
    assert.equal(evaluateTrigger('calendário', calendario).matched, true);
    assert.equal(evaluateTrigger('marquei a consulta no calendário', calendario).matched, false);

    assert.equal(evaluateTrigger('final', media).matched, true);
    assert.equal(evaluateTrigger('qual a tabela da final?', media).matched, true);
    assert.equal(evaluateTrigger('onde encontro a matriz curricular atual de bsi', fluxograma).matched, true);
    assert.equal(evaluateTrigger('preciso abrir um protocolo?', protocolo).matched, true);
    assert.equal(evaluateTrigger('qual o calendário acadêmico?', calendario).matched, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('common discipline abbreviations and acronyms identify the correct professor', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const engine = new BotEngine(db);
    const first = text => engine.evaluate(text, { isGroup: true, ignorePermissions: true }).matchedItem || undefined;

    assert.equal(first('quem ensina MDI?'), 'Professor — Allan de Sousa Soares');
    assert.equal(first('qual o contato de MDII?'), 'Professor — Allan de Sousa Soares');
    assert.equal(first('email do professor de ADM'), 'Professor — Luana Lima Bittencourt Silva');
    assert.equal(first('horário de IA'), 'Professor — Bruno Silvério Costa');
    assert.equal(first('quem dá IHC?'), 'Professor — Bruno Silvério Costa');
    assert.equal(first('email professor de PWII'), 'Professor — Alexandro dos Santos Silva');
    assert.equal(first('quem ensina PW?'), 'Professor — Andrique Figueirêdo Amorim');
    assert.equal(first('professor de BDII'), 'Professor — Pablo Freire Matos');
    assert.equal(first('horário de OAC'), 'Professor — Leonardo Barreto Campos');
    assert.equal(first('quem ensina TCC1?'), 'Professor — Djan Almeida Santos');
    assert.equal(first('quem ensina SI?'), 'Professor — Stênio Longo Araújo');
    engine.close();
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discipline alias catalogue includes the requested MDI and ADM forms', () => {
  assert.ok(SI_DISCIPLINE_ALIASES_2026_2['Matemática Discreta I'].includes('MDI'));
  assert.ok(SI_DISCIPLINE_ALIASES_2026_2.Administração.includes('ADM'));
  assert.ok(SI_DISCIPLINE_ALIASES_2026_2['Inteligência Artificial'].includes('IA'));
  assert.ok(SI_DISCIPLINE_ALIASES_2026_2['Interface Homem Máquina'].includes('IHC'));
});

test('v0.8.6 migration removes old broad support triggers and adds abbreviations while preserving responses', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    const media = card(db, 'HUB — Média Final e Tabela da Final');
    const allan = card(db, 'Professor — Allan de Sousa Soares');
    const customResponse = `${media.response_text}\n\nTexto personalizado preservado.`;
    const broad = { ...media.trigger, sentences: ['tabela', 'nota final'] };
    db.db.prepare('UPDATE automatic_messages SET response_text=?,trigger_json=? WHERE id=?')
      .run(customResponse, JSON.stringify(broad), media.id);
    db.db.prepare('UPDATE automatic_messages SET trigger_json=? WHERE id=?')
      .run(JSON.stringify({ ...allan.trigger, sentences: ['matemática discreta i'] }), allan.id);
    db.db.prepare("UPDATE settings SET value='false' WHERE key IN ('si_triggers_v086_migrated','content_v0140_precision_performance')").run();
    db.close();

    const reopened = new Database(dbPath, { seedBundledContent: true });
    const migratedMedia = card(reopened, 'HUB — Média Final e Tabela da Final');
    const migratedAllan = card(reopened, 'Professor — Allan de Sousa Soares');
    assert.match(migratedMedia.response_text, /Texto personalizado preservado/);
    assert.equal(evaluateTrigger('tabela', migratedMedia).matched, false);
    assert.equal(evaluateTrigger('qual a tabela da final?', migratedMedia).matched, true);
    assert.equal(migratedAllan.trigger.sentences.some(sentence => /matemática discreta/i.test(sentence)), false);
    const engine = new BotEngine(reopened);
    assert.equal(engine.evaluate('quem ensina MDI?', { isGroup: true, ignorePermissions: true }).matchedItem, 'Professor — Allan de Sousa Soares');
    engine.close();
    assert.ok(reopened.listAutomaticMessageHistory(migratedMedia.id).some(entry => entry.action === 'v0.14.0-gatilhos-estruturados'));
    assert.ok(reopened.listAutomaticMessageHistory(migratedAllan.id).some(entry => entry.action === 'v0.8.6-siglas-e-abreviacoes'));
    assert.equal(reopened.getSetting('si_triggers_v086_migrated'), 'true');
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
