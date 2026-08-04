'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadCorpus(file = path.resolve(__dirname, '..', 'test', 'fixtures', 'message-corpus.json')) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('O corpus precisa ser uma lista JSON.');
  return parsed;
}
function intentFromEvaluation(result = {}) {
  const type = String(result.type || 'none');
  if (!result.matched) return 'none';
  if (type.includes('attendance')) return 'attendance_confirmation';
  if (type === 'semester_overview') return 'semester_overview';
  if (type.includes('sector')) return type === 'sector' ? 'institutional_full' : type;
  if (type.includes('professor')) return type.includes('field') ? String(result.intent || 'professor_field') : 'professor_full';
  return String(result.intent || type);
}
function summarize(results = []) {
  const total = results.length; const correctResponse = results.filter(r => r.response_correct).length;
  const expectedPositive = results.filter(r => r.expected_respond).length;
  const truePositive = results.filter(r => r.expected_respond && r.actual_respond).length;
  const falsePositive = results.filter(r => !r.expected_respond && r.actual_respond).length;
  const falseNegative = results.filter(r => r.expected_respond && !r.actual_respond).length;
  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 1;
  const recall = expectedPositive ? truePositive / expectedPositive : 1;
  return { total, passed: correctResponse, failed: total - correctResponse, true_positive: truePositive, false_positive: falsePositive, false_negative: falseNegative, precision, recall };
}
async function runCorpus({ corpus, evaluate }) {
  const results=[]; let previous=null;
  for (const item of corpus) {
    if (item.requires_previous) previous = await evaluate(item.requires_previous, null);
    const started=performance.now(); const evaluation=await evaluate(item.message, previous); const elapsed=performance.now()-started;
    const actualRespond=Boolean(evaluation?.matched && evaluation?.text); const expectedRespond=item.must_respond!==false;
    results.push({ ...item, expected_respond:expectedRespond, actual_respond:actualRespond, actual_intent:intentFromEvaluation(evaluation), response_correct:actualRespond===expectedRespond, elapsed_ms:Number(elapsed.toFixed(3)) });
    previous=evaluation;
  }
  return { ...summarize(results), average_ms: results.reduce((s,r)=>s+r.elapsed_ms,0)/Math.max(1,results.length), results };
}
module.exports = { loadCorpus, runCorpus, summarize, intentFromEvaluation };
