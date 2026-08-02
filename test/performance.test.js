const test = require('node:test');
const assert = require('node:assert/strict');
const { BotEngine } = require('../src/bot-engine');

test('não grava o mesmo grupo no SQLite a cada mensagem', () => {
  let writes = 0;
  const db = { upsertGroup() { writes += 1; } };
  const engine = new BotEngine(db, { groupTouchIntervalSeconds: 600 });

  engine.touchGroup('grupo@g.us', 'Grupo de teste');
  engine.touchGroup('grupo@g.us', 'Grupo de teste');
  engine.touchGroup('grupo@g.us', 'Grupo de teste');

  assert.equal(writes, 1);
});
