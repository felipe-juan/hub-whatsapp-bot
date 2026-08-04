'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { resolveGroupActivation } = require('../src/group-activation');

const SOURCE_URL = 'https://ifbaedubr-my.sharepoint.com/:x:/g/personal/rodrigobonfim_ifba_edu_br/IQCqjeOoMcvWQoiikRSUwWOxAZSOwJaih1qWmWFq5Vxa73Y?rtime=aTN-B0Ly3kg';

function harness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v01513-'));
  process.env.HUB_LOAD_PACKAGED_CONTENT = 'true';
  const db = new Database(path.join(directory, 'bot.sqlite'));
  return { db, engine: new BotEngine(db), close() { db.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

test('bote funciona como prefixo de ativação em grupos', () => {
  assert.deepEqual(resolveGroupActivation({ isGroup: true, body: 'Bote, qual sala de economia?' }), {
    active: true, body: 'qual sala de economia?', mode: 'name-prefix'
  });
  assert.deepEqual(resolveGroupActivation({ isGroup: true, body: 'robô qual sala de economia?' }), {
    active: true, body: 'qual sala de economia?', mode: 'name-prefix'
  });
});

test('transcrição fragmentada reconhece Ualace, sábado e Economia', () => {
  const h = harness();
  try {
    const result = h.engine.simulate('professor ualace no ualace no sábado, de econimia', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /ECO — Economia/u);
    assert.match(result.text, /Ualace Roberto/u);
    assert.match(result.text, /@ifba\.edu\.br/u);
    assert.match(result.text, /sábado/u);
    assert.match(result.text, /H202/u);
    assert.doesNotMatch(result.text, /Contabilidade Geral/u);
  } finally { h.close(); }
});

test('mensagem completa da disciplina exibe o link oficial como fonte', () => {
  const h = harness();
  try {
    const result = h.engine.simulate('economia', { isGroup: false, ignorePermissions: true });
    assert.ok(result.text.includes(SOURCE_URL));
    assert.doesNotMatch(result.text, /Horários Docentes 2026/u);
  } finally { h.close(); }
});
