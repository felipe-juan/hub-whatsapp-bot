const test = require('node:test');
const assert = require('node:assert/strict');
const { extractGrades, calculateAverage, calculateFinal, handleCalculator } = require('../src/calculator');

test('extrai notas com vírgula', () => {
  assert.deepEqual(extractGrades('!media 5,0 6,5'), [5, 6.5]);
});

test('calcula a nota necessária na final', () => {
  const result = calculateAverage([5, 6]);
  assert.equal(result.mp, 5.5);
  assert.equal(result.requiredFinal, 4);
});

test('classifica aprovação por média', () => {
  const result = calculateAverage([7, 8]);
  assert.equal(result.situation.code, 'approved');
});

test('calcula média final', () => {
  const result = calculateFinal(5.5, 7);
  assert.equal(result.mf, 6);
  assert.equal(result.approved, true);
});

test('gera ajuda específica da média final quando faltam notas', () => {
  assert.equal(handleCalculator('qual a média final?').type, 'calculator-final-help');
});

test('!final sem valores explica a regra completa e mostra exemplo', () => {
  const result = handleCalculator('!final');
  assert.equal(result.type, 'calculator-final-help');
  assert.match(result.text, /MP ≥ 7/);
  assert.match(result.text, /2,5 ≤ MP < 7/);
  assert.match(result.text, /MP < 2,5/);
  assert.match(result.text, /MF = \(MP×2 \+ PF\) ÷ 3/);
  assert.match(result.text, /PF necessária = 15 − \(MP×2\)/);
  assert.match(result.text, /!final 5,75 7,0/);
});

test('!final help mostra a ajuda específica da média final', () => {
  const result = handleCalculator('!final help');
  assert.equal(result.type, 'calculator-final-help');
  assert.match(result.text, /Como funciona a média final/);
  assert.doesNotMatch(result.text, /Calculadoras disponíveis/);
});
