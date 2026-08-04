'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { resolveGroupActivation } = require('../src/group-activation');

function harness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v01510-'));
  process.env.HUB_LOAD_PACKAGED_CONTENT = 'true';
  const db = new Database(path.join(directory, 'bot.sqlite'));
  return { db, engine: new BotEngine(db), close() { db.close(); fs.rmSync(directory, { recursive: true, force: true }); } };
}

test('consultas de sala mantêm apenas a disciplina solicitada', () => {
  const h = harness();
  try {
    const economy = h.engine.simulate('qual é a sala de economia?', { isGroup: false, ignorePermissions: true });
    assert.match(economy.text, /ECO — Economia/u);
    assert.match(economy.text, /Professor:\* Ualace Roberto/u);
    assert.doesNotMatch(economy.text, /Inteligência Artificial/u);

    const ai = h.engine.simulate('qual sala de Bruno na matéria de inteligência artificial?', { isGroup: false, ignorePermissions: true });
    assert.match(ai.text, /IA — Inteligência Artificial/u);
    assert.match(ai.text, /Professor:\* Bruno Silvério/u);
    assert.doesNotMatch(ai.text, /Comércio Eletrônico|Programação Web/u);
  } finally { h.close(); }
});

test('Cálculo identifica o professor de cada sala', () => {
  const h = harness();
  try {
    const result = h.engine.simulate('qual sala de cálculo?', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /Professor:\* Paulo Espinheira[\s\S]*Sala:\* \*H008\*/u);
    assert.match(result.text, /Professor:\* Thiago Leonardo[\s\S]*Sala:\* \*H202\*/u);
  } finally { h.close(); }
});

test('professor e disciplina são cruzados, e ponto isolado não ativa grupo', () => {
  const h = harness();
  try {
    const mismatch = h.engine.simulate('qual sala de Bruno em comércio eletrônico?', { isGroup: false, ignorePermissions: true });
    assert.match(mismatch.text, /Não encontrei \*Bruno Silvério\* como docente/u);
    assert.doesNotMatch(mismatch.text, /Sala:/u);
    assert.equal(resolveGroupActivation({ isGroup: true, body: '.' }).active, false);
    assert.deepEqual(resolveGroupActivation({ isGroup: true, body: '.qual sala de cálculo?' }), {
      active: true, body: 'qual sala de cálculo?', mode: 'dot'
    });
  } finally { h.close(); }
});
