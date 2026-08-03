const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractGrades,
  calculateAverage,
  calculateFinal,
  handleCalculator,
  looksLikeCalculator
} = require('../src/calculator');

test('extrai notas com vírgula', () => {
  assert.deepEqual(extractGrades('!final 5,0 6,5'), [5, 6.5]);
});

test('calcula a nota necessária na final conforme a fórmula do IFBA', () => {
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

test('somente o comando !final ativa a calculadora', () => {
  assert.equal(handleCalculator('qual a média final?'), null);
  assert.equal(handleCalculator('!media 5 6'), null);
  assert.equal(handleCalculator('!frequencia 60 8'), null);
  assert.equal(looksLikeCalculator('!final 6,9'), true);
  assert.equal(looksLikeCalculator('!media 6,9'), false);
});

test('!final sem valores explica a regra completa e os dois modos de uso', () => {
  const result = handleCalculator('!final');
  assert.equal(result.type, 'calculator-final-help');
  assert.match(result.text, /🟢 6,0 a 6,9/);
  assert.match(result.text, /🔵 5,0 a 5,9/);
  assert.match(result.text, /🟡 4,0 a 4,9/);
  assert.match(result.text, /🟠 3,0 a 3,9/);
  assert.match(result.text, /🔴 2,5 a 2,9/);
  assert.doesNotMatch(result.text, /MF =/);
  assert.match(result.text, /!final 6,9/);
  assert.match(result.text, /!final 5,0 6,0 7,0/);
});

test('um valor é tratado como a média das unidades e informa a PF mínima', () => {
  const result = handleCalculator('!final 6,9');
  assert.equal(result.type, 'calculator-final');
  assert.match(result.text, /🟢 Média das unidades informada: \*6,9\*/);
  assert.match(result.text, /Nota mínima necessária na prova final: \*1,2\*/);
});

test('mais de um valor é primeiro convertido em média das unidades', () => {
  const result = handleCalculator('!final 5 6 7');
  assert.equal(result.type, 'calculator-final');
  assert.match(result.text, /🟢 Média das unidades: \*6,0\*/);
  assert.match(result.text, /Nota mínima necessária na prova final: \*3,0\*/);
});

test('!final help mostra apenas a ajuda da prova final', () => {
  const result = handleCalculator('!final help');
  assert.equal(result.type, 'calculator-final-help');
  assert.match(result.text, /Calculadora da prova final/);
  assert.doesNotMatch(result.text, /média final|MF =/i);
  assert.doesNotMatch(result.text, /Calculadoras disponíveis/);
});
