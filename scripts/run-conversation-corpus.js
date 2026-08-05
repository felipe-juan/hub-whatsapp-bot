#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { simulateConversation } = require('../src/conversation-simulator');
const { normalizeText } = require('../src/text');

function includesNormalized(haystack, needle) {
  return normalizeText(haystack).includes(normalizeText(needle));
}
function validateStep(spec = {}, result = {}) {
  const replies = (result.replies || []).map(item => String(item.text || '')).filter(Boolean);
  const text = replies.join('\n');
  const errors = [];
  const mustReply = spec.must_reply !== false;
  if (mustReply && !replies.length) errors.push('não respondeu');
  if (!mustReply && replies.length) errors.push('respondeu quando deveria ignorar');
  for (const expected of spec.expect || []) if (!includesNormalized(text, expected)) errors.push(`não contém “${expected}”`);
  if (Array.isArray(spec.expect_any) && spec.expect_any.length && !spec.expect_any.some(value => includesNormalized(text, value))) {
    errors.push(`não contém nenhuma alternativa: ${spec.expect_any.join(' | ')}`);
  }
  for (const forbidden of spec.expect_not || []) if (forbidden && includesNormalized(text, forbidden)) errors.push(`contém indevidamente “${forbidden}”`);
  return { ok: errors.length === 0, errors, text };
}

(async () => {
  const corpusPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'test', 'fixtures', 'conversation-corpus.json');
  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  if (!Array.isArray(corpus)) throw new Error('O corpus de conversas precisa ser uma lista JSON.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-conversation-corpus-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', persistent_context_enabled: 'true', recovery_enabled: 'true', quoted_context_seconds: '86400' });
  const engine = new BotEngine(db);
  const failures = [];
  const categoryTotals = new Map();
  const categoryPassed = new Map();
  try {
    for (const scenario of corpus) {
      const category = String(scenario.category || 'other');
      categoryTotals.set(category, Number(categoryTotals.get(category) || 0) + 1);
      const simulation = await simulateConversation(engine, db, scenario.messages || [], { is_group: Boolean(scenario.is_group) });
      const stepResults = (scenario.messages || []).map((spec, index) => validateStep(typeof spec === 'string' ? { text: spec } : spec, simulation.results[index]));
      const errors = stepResults.flatMap((item, index) => item.errors.map(error => `passo ${index + 1}: ${error}`));
      if (errors.length) failures.push({ title: scenario.title, category, errors, outputs: stepResults.map(item => item.text) });
      else categoryPassed.set(category, Number(categoryPassed.get(category) || 0) + 1);
    }
    const summary = {
      total: corpus.length,
      passed: corpus.length - failures.length,
      failed: failures.length,
      categories: [...categoryTotals].map(([category, total]) => ({ category, total, passed: Number(categoryPassed.get(category) || 0) })),
      failures
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    engine.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
