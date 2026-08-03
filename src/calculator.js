const { parseList } = require('./text');

const FALLBACK_CALCULATORS = Object.freeze([
  {
    key: 'final',
    enabled: true,
    command: '!final',
    label: 'Calculadora da prova final',
    config: { approval_average: 7, final_minimum_average: 2.5, final_target: 5 }
  }
]);

function extractGrades(text) {
  const matches = String(text || '').match(/\b(10(?:[.,]0+)?|[0-9](?:[.,][0-9]+)?)\b/g) || [];
  return matches
    .map(value => Number(value.replace(',', '.')))
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 10);
}

function extractNumbers(text) {
  return (String(text || '').match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map(value => Number(value.replace(',', '.')))
    .filter(Number.isFinite);
}

function round(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function formatGrade(value) {
  return round(value).toFixed(2).replace('.', ',').replace(/0$/, '').replace(/,$/, ',0');
}
function formatNumber(value) { return Number.isInteger(round(value)) ? String(round(value)) : String(round(value)).replace('.', ','); }

function classifyMp(mp, config = {}) {
  const approval = Number(config.approval_average ?? 7);
  const minimum = Number(config.final_minimum_average ?? 2.5);
  if (mp >= approval) return { code: 'approved', label: 'Aprovado por média' };
  if (mp >= minimum) return { code: 'final', label: 'Tem direito à prova final' };
  return { code: 'failed', label: 'Reprovado sem direito à final' };
}

function requiredFinalGrade(mp, target = 5) { return 3 * Number(target) - 2 * Number(mp); }

function calculateAverage(grades, config = {}) {
  if (!Array.isArray(grades) || !grades.length) throw new Error('Informe ao menos uma nota.');
  if (!grades.every(value => Number.isFinite(value) && value >= 0 && value <= 10)) throw new Error('As notas devem estar entre 0 e 10.');
  const mp = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  const situation = classifyMp(mp, config);
  const target = Number(config.final_target ?? 5);
  const requiredFinal = situation.code === 'final' ? requiredFinalGrade(mp, target) : null;
  return {
    grades: [...grades],
    mp: round(mp),
    situation,
    target,
    requiredFinal: requiredFinal === null ? null : round(requiredFinal)
  };
}

function calculateFinal(mp, pf, config = {}) {
  if (![mp, pf].every(value => Number.isFinite(value) && value >= 0 && value <= 10)) throw new Error('MP e PF devem estar entre 0 e 10.');
  const target = Number(config.final_target ?? 5);
  const mf = (2 * mp + pf) / 3;
  return { mp: round(mp), pf: round(pf), mf: round(mf), target, approved: mf >= target };
}

// Mantidos como utilitários exportados para compatibilidade da API interna. Eles
// não possuem mais comandos próprios no WhatsApp.
function calculateAttendance(totalClasses, absences, minimumPercent = 75) {
  if (!Number.isFinite(totalClasses) || totalClasses <= 0 || !Number.isFinite(absences) || absences < 0 || absences > totalClasses) throw new Error('Informe total de aulas e faltas válidos.');
  const attended = totalClasses - absences;
  const percent = attended / totalClasses * 100;
  const maximumAbsences = Math.floor(totalClasses * (1 - Number(minimumPercent) / 100) + 1e-9);
  return { totalClasses, absences, attended, percent: round(percent), minimumPercent: Number(minimumPercent), maximumAbsences, remainingAbsences: Math.max(0, maximumAbsences - absences), meetsMinimum: percent + 1e-9 >= Number(minimumPercent) };
}
function calculateHours(completed, required) {
  if (![completed, required].every(Number.isFinite) || completed < 0 || required <= 0) throw new Error('Informe horas concluídas e exigidas válidas.');
  return { completed: round(completed), required: round(required), remaining: round(Math.max(0, required - completed)), percent: round(Math.min(100, completed / required * 100)), complete: completed >= required };
}
function calculateWeightedAverage(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) throw new Error('Informe ao menos um par nota:peso.');
  let weighted = 0; let weights = 0;
  for (const [grade, weight] of pairs) {
    if (!Number.isFinite(grade) || grade < 0 || grade > 10 || !Number.isFinite(weight) || weight <= 0) throw new Error('Notas devem estar entre 0 e 10 e pesos devem ser positivos.');
    weighted += grade * weight; weights += weight;
  }
  return { pairs, totalWeight: round(weights), average: round(weighted / weights) };
}

function normalizeCalculators(calculators) {
  const source = Array.isArray(calculators) && calculators.length ? calculators : FALLBACK_CALCULATORS;
  return source.filter(item => item.enabled !== false && item.key === 'final');
}
function aliases(item = {}) { return parseList(String(item.command || '!final').replace(/\|/g, ',')); }
function commandFor(text, calculators) {
  const raw = String(text || '').trim().toLowerCase();
  return normalizeCalculators(calculators).find(item => aliases(item).some(command => raw === command.toLowerCase() || raw.startsWith(`${command.toLowerCase()} `)));
}
function looksLikeCalculator(text, calculators) { return Boolean(commandFor(text, calculators)); }

function finalHelpText(definition = {}) {
  const config = definition.config || {};
  const approval = Number(config.approval_average ?? 7);
  const minimum = Number(config.final_minimum_average ?? 2.5);
  const target = Number(config.final_target ?? 5);
  const command = aliases(definition)[0] || '!final';
  return [
    '🧮 *Calculadora da prova final*',
    '',
    '*Como usar*',
    `• \`${command} 6,9\` — considera 6,9 como a média de todas as unidades.`,
    `• \`${command} 5,0 6,0 7,0\` — calcula a média das unidades informadas.`,
    '',
    '*Faixas da tabela da final*',
    `• 🟢 ${formatGrade(6)} a ${formatGrade(approval - 0.1)} de média`,
    `• 🔵 ${formatGrade(5)} a ${formatGrade(5.9)} de média`,
    `• 🟡 ${formatGrade(4)} a ${formatGrade(4.9)} de média`,
    `• 🟠 ${formatGrade(3)} a ${formatGrade(3.9)} de média`,
    `• 🔴 ${formatGrade(minimum)} a ${formatGrade(2.9)} de média`,
    '',
    `Média a partir de ${formatGrade(approval)} aprova diretamente. Abaixo de ${formatGrade(minimum)}, não há direito à prova final.`
  ].join('\n');
}

function isCommandHelpRequest(text, definition) {
  const raw = String(text || '').trim().toLowerCase();
  return aliases(definition).some(command => {
    const value = String(command || '').trim().toLowerCase();
    return raw === value || raw === `${value} help` || raw === `${value} ajuda`;
  });
}

function finalRangeEmoji(mp) {
  const value = Number(mp);
  if (value >= 6) return '🟢';
  if (value >= 5) return '🔵';
  if (value >= 4) return '🟡';
  if (value >= 3) return '🟠';
  return '🔴';
}

function formatRequiredFinalResult(result, singleValue = false) {
  const lines = ['🧮 *Calculadora da prova final*', ''];
  const rangeEmoji = finalRangeEmoji(result.mp);
  if (singleValue) {
    lines.push(`${rangeEmoji} Média das unidades informada: *${formatGrade(result.mp)}*`);
  } else {
    lines.push(`Notas das unidades: ${result.grades.map(formatGrade).join(' + ')}`);
    lines.push(`${rangeEmoji} Média das unidades: *${formatGrade(result.mp)}*`);
  }
  lines.push(`Situação: *${result.situation.label}*`);
  if (result.situation.code === 'approved') {
    lines.push('', `Você já alcançou a média mínima ${formatGrade(7)} e não precisa fazer a prova final.`);
  } else if (result.situation.code === 'failed') {
    lines.push('', `Como a MP ficou abaixo de ${formatGrade(2.5)}, não há direito à prova final.`);
  } else {
    lines.push('', `Nota mínima necessária na prova final: *${formatGrade(Math.max(0, result.requiredFinal))}*`);
  }
  return lines.join('\n');
}

function helpText(calculators) {
  const definition = normalizeCalculators(calculators)[0] || FALLBACK_CALCULATORS[0];
  return finalHelpText(definition);
}

function handleCalculator(text, calculators) {
  const selected = commandFor(text, calculators);
  if (!selected) return null;
  if (isCommandHelpRequest(text, selected)) return { type: 'calculator-final-help', topic: selected.label || 'Calculadora da prova final', text: finalHelpText(selected) };
  const grades = extractGrades(text);
  if (!grades.length) return { type: 'calculator-final-help', topic: selected.label || 'Calculadora da prova final', text: finalHelpText(selected) };
  const result = calculateAverage(grades, selected.config || {});
  return {
    type: 'calculator-final',
    topic: selected.label || 'Calculadora da prova final',
    text: formatRequiredFinalResult(result, grades.length === 1)
  };
}

module.exports = {
  extractGrades, extractNumbers, classifyMp, requiredFinalGrade, calculateAverage, calculateFinal,
  calculateAttendance, calculateHours, calculateWeightedAverage, commandFor, looksLikeCalculator,
  handleCalculator, formatGrade, finalRangeEmoji, helpText, finalHelpText, isCommandHelpRequest, FALLBACK_CALCULATORS
};
