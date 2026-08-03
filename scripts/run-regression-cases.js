#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { normalizeText } = require('../src/text');

function databasePath() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const root = path.resolve(__dirname, '..');
  return path.resolve(root, process.env.DATA_DIR || './data', 'hub-bot.sqlite');
}

const db = new Database(databasePath(), { seedBundledContent: false });
const engine = new BotEngine(db);
let failures = 0;
try {
  const cases = db.listRegressionCases({ activeOnly: true });
  if (!cases.length) {
    console.log('Nenhuma frase de regressão ativa; etapa concluída.');
    process.exitCode = 0;
  } else {
    for (const item of cases) {
      const result = engine.simulate(item.phrase, { isGroup: false, includeDrafts: false });
      const responded = Boolean(result?.matched && result.type !== 'disambiguation');
      const titleOk = !item.expected_title || normalizeText(result?.matchedItem || '').includes(normalizeText(item.expected_title));
      const passed = item.expectation === 'ignore' ? !responded : responded && titleOk;
      const symbol = passed ? '✓' : '✗';
      console.log(`${symbol} ${item.phrase} → ${responded ? (result.matchedItem || result.type) : (result.blockedBy || 'ignorada')}`);
      if (!passed) failures += 1;
    }
    console.log(`\n${cases.length - failures}/${cases.length} frase(s) de regressão aprovadas.`);
    if (failures) process.exitCode = 1;
  }
} finally {
  engine.close();
  db.close();
}
