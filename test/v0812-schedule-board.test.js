'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { evaluateTrigger } = require('../src/trigger-rules');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bot-v0812-'));
  const dbPath = path.join(dir, 'data.sqlite');
  const db = new Database(dbPath, { seedBundledContent: true });
  return { db, dbPath, dir };
}

function scheduleCard(db) {
  return db.listAutomaticMessages().find(item => item.title === 'HUB — Quadro de horários 2026.2');
}

test('v0.8.12 seeds the schedule board card with the supplied SharePoint link', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const card = scheduleCard(db);
    assert.ok(card);
    assert.match(card.response_text, /ifbaedubr-my\.sharepoint\.com/);
    assert.match(card.response_text, /IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y/);
    assert.ok(card.tags.includes('quadro-de-horarios'));
    assert.equal(db.getSetting('schedule_board_v0812_seeded'), 'true');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schedule board triggers are specific and do not react to generic professor schedules', () => {
  const { db, dir } = temporaryDatabase();
  try {
    const card = scheduleCard(db);
    for (const message of [
      'onde encontro o quadro de horários?',
      'qual o horário das turmas?',
      'me manda a planilha de horarios?',
      'onde vejo a grade de aulas?',
      'qual o horário de SI?'
    ]) assert.equal(evaluateTrigger(message, card).matched, true, message);

    for (const message of [
      'qual o horário do Allan?',
      'meu horário mudou',
      'horário',
      'a aula de hoje mudou de sala'
    ]) assert.equal(evaluateTrigger(message, card).matched, false, message);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schedule board card is seeded once and creates no trigger conflict', () => {
  const { db, dbPath, dir } = temporaryDatabase();
  try {
    assert.equal(db.listAutomaticMessages().filter(item => item.title === 'HUB — Quadro de horários 2026.2').length, 1);
    assert.equal(db.getConflictReport().count, 0);
    db.close();
    const reopened = new Database(dbPath, { seedBundledContent: true });
    assert.equal(reopened.listAutomaticMessages().filter(item => item.title === 'HUB — Quadro de horários 2026.2').length, 1);
    assert.equal(reopened.getConflictReport().count, 0);
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
