const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v081-'));
  const db = new Database(path.join(dir, 'data.sqlite'), { seedBundledContent: true });
  return { db, dir };
}

test('v0.8.1 seeds the 28 SI professors and the pending Meio Ambiente card once', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    const professors = messages.filter(item => item.title.startsWith('Professor — ') || item.title === 'Pendência — Meio Ambiente (Docente Substituto)');
    assert.equal(professors.length, 29);
    assert.ok(professors.some(item => item.title === 'Professor — Alexandro dos Santos Silva'));
    assert.ok(professors.some(item => item.title === 'Professor — Viviane Maria Lélis Carvalho'));
    assert.ok(professors.some(item => item.title === 'Pendência — Meio Ambiente (Docente Substituto)'));
    assert.equal(db.getSetting('si_professors_2026_2_seeded'), 'true');

    db.close();
    const reopened = new Database(path.join(dir, 'data.sqlite'), { seedBundledContent: true });
    assert.equal(reopened.listAutomaticMessages().filter(item => item.title.startsWith('Professor — ') || item.title === 'Pendência — Meio Ambiente (Docente Substituto)').length, 29);
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('professor cards contain institutional emails and complete 2026.2 schedules', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const allan = db.listAutomaticMessages().find(item => item.title === 'Professor — Allan de Sousa Soares');
    assert.ok(allan);
    assert.match(allan.response_text, /allansoares@ifba\.edu\.br/);
    assert.match(allan.response_text, /Matemática Discreta I/);
    assert.match(allan.response_text, /quinta-feira/);
    assert.match(allan.response_text, /Matemática Discreta II/);
    assert.match(allan.response_text, /sexta-feira/);
    assert.deepEqual(allan.tags, []);
    assert.equal(allan.scope, 'both');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('professor triggers answer contact and IFBA-day questions but ignore a bare name', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const messages = db.listAutomaticMessages();
    const alexandro = messages.find(item => item.title === 'Professor — Alexandro dos Santos Silva');
    const allan = messages.find(item => item.title === 'Professor — Allan de Sousa Soares');
    const claudio = messages.find(item => item.title === 'Professor — Cláudio Rodolfo Sousa de Oliveira');
    const leonardo = messages.find(item => item.title === 'Professor — Leonardo Barreto Campos');
    const thiago = messages.find(item => item.title === 'Professor — Thiago Leonardo Bastos da Silva');
    const paulo = messages.find(item => item.title === 'Professor — Paulo Espinheira Menezes de Melo');
    const luisPaulo = messages.find(item => item.title === 'Professor — Luís Paulo da Silva Carvalho');

    assert.equal(evaluateTrigger('Qual é o contato do professor Alexandro?', alexandro).matched, true);
    assert.equal(evaluateTrigger('ctt alexandro', alexandro).matched, true);
    assert.equal(evaluateTrigger('Você tem o e-mail do Alexandro?', alexandro).matched, true);
    assert.equal(evaluateTrigger('Que dia o Allan está no IFBA?', allan).matched, true);
    assert.equal(evaluateTrigger('Quais os horários do Cláudio?', claudio).matched, true);
    assert.equal(evaluateTrigger('Alexandro', alexandro).matched, false);
    assert.equal(evaluateTrigger('Qual é o contato do professor Allan?', alexandro).matched, false);
    assert.equal(evaluateTrigger('Qual o contato de Thiago Leonardo?', leonardo).matched, false);
    assert.equal(evaluateTrigger('Qual o contato de Thiago Leonardo?', thiago).matched, true);
    assert.equal(evaluateTrigger('Qual o contato de Luís Paulo?', paulo).matched, false);
    assert.equal(evaluateTrigger('Qual o contato de Luís Paulo?', luisPaulo).matched, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
