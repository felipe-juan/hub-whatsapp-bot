const { normalizeText, parseList } = require('./text');

const FALLBACK_CALCULATORS = [
  { key: 'average', enabled: true, command: '!media', config: { approval_average: 7, final_minimum_average: 2.5, final_target: 5 } },
  { key: 'final', enabled: true, command: '!final', config: { final_target: 5 } },
  { key: 'attendance', enabled: true, command: '!frequencia', config: { minimum_percent: 75 } },
  { key: 'hours', enabled: true, command: '!horas', config: { default_required_hours: 200 } },
  { key: 'weighted', enabled: true, command: '!mediap', config: {} }
];

function extractGrades(text) {
  const matches = String(text || '').match(/\b(10(?:[.,]0+)?|[0-9](?:[.,][0-9]+)?)\b/g) || [];
  return matches.map(value => Number(value.replace(',', '.'))).filter(value => Number.isFinite(value) && value >= 0 && value <= 10);
}
function extractNumbers(text) {
  return (String(text || '').match(/-?\d+(?:[.,]\d+)?/g) || []).map(value => Number(value.replace(',', '.'))).filter(Number.isFinite);
}
function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function formatGrade(value) { return round(value).toFixed(2).replace('.', ',').replace(/,00$/, ',0'); }
function formatNumber(value) { return Number.isInteger(round(value)) ? String(round(value)) : String(round(value)).replace('.', ','); }

function classifyMp(mp, config = {}) {
  const approval = Number(config.approval_average ?? 7);
  const minimum = Number(config.final_minimum_average ?? 2.5);
  if (mp >= approval) return { code: 'approved', label: 'Aprovado por média' };
  if (mp >= minimum) return { code: 'final', label: 'Prova final' };
  return { code: 'failed', label: 'Reprovado sem direito à final' };
}
function requiredFinalGrade(mp, target = 5) { return (3 * Number(target) - 2 * mp); }
function calculateAverage(grades, config = {}) {
  if (!Array.isArray(grades) || !grades.length) throw new Error('Informe ao menos uma nota.');
  const mp = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  const situation = classifyMp(mp, config);
  const target = Number(config.final_target ?? 5);
  const requiredFinal = situation.code === 'final' ? requiredFinalGrade(mp, target) : null;
  return { grades, mp: round(mp), situation, target, requiredFinal: requiredFinal === null ? null : round(requiredFinal) };
}
function calculateFinal(mp, pf, config = {}) {
  if (![mp, pf].every(value => Number.isFinite(value) && value >= 0 && value <= 10)) throw new Error('MP e PF devem estar entre 0 e 10.');
  const mf = (2 * mp + pf) / 3; const target = Number(config.final_target ?? 5);
  return { mp: round(mp), pf: round(pf), mf: round(mf), target, approved: mf >= target };
}
function calculateAttendance(totalClasses, absences, minimumPercent = 75) {
  if (!Number.isFinite(totalClasses) || totalClasses <= 0 || !Number.isFinite(absences) || absences < 0 || absences > totalClasses) throw new Error('Informe total de aulas e faltas válidos.');
  const attended = totalClasses - absences; const percent = attended / totalClasses * 100;
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

function normalizeCalculators(calculators) { return (Array.isArray(calculators) && calculators.length ? calculators : FALLBACK_CALCULATORS).filter(item => item.enabled !== false); }
function aliases(item) { return parseList(String(item.command || '').replace(/\|/g, ',')); }
function commandFor(text, calculators) {
  const raw = String(text || '').trim().toLowerCase();
  return normalizeCalculators(calculators).find(item => aliases(item).some(command => raw === command.toLowerCase() || raw.startsWith(`${command.toLowerCase()} `)));
}
function looksLikeCalculator(text, calculators) {
  if (commandFor(text, calculators)) return true;
  const value = normalizeText(text);
  return /\b(media|media parcial|media final|nota final|prova final|quanto preciso)\b/.test(value);
}

function formatAverageResult(result) {
  const lines = ['🧮 *Cálculo de média*', '', `Notas: ${result.grades.map(formatGrade).join(' + ')}`, `MP = *${formatGrade(result.mp)}*`, `Situação: *${result.situation.label}*`];
  if (result.requiredFinal !== null) {
    if (result.requiredFinal > 10) lines.push(`Mesmo com nota 10,0, não seria possível alcançar MF ${formatGrade(result.target)}.`);
    else if (result.requiredFinal <= 0) lines.push(`A meta de MF ${formatGrade(result.target)} já está matematicamente garantida.`);
    else lines.push(`Para alcançar MF ${formatGrade(result.target)}, precisa de *${formatGrade(result.requiredFinal)}* na prova final.`);
  }
  lines.push('', '_Fórmulas: MP = soma das notas ÷ quantidade; MF = (2×MP + PF) ÷ 3._'); return lines.join('\n');
}
function formatFinalResult(result) { return ['🧮 *Resultado após a prova final*', '', `MP: ${formatGrade(result.mp)}`, `PF: ${formatGrade(result.pf)}`, `MF = *${formatGrade(result.mf)}*`, `Situação: *${result.approved ? 'Aprovado' : 'Reprovado'}*`, '', '_Fórmula: MF = (MP×2 + PF) ÷ 3._'].join('\n'); }

function finalHelpText(definition = {}) {
  const config = definition.config || {};
  const approval = Number(config.approval_average ?? 7);
  const minimum = Number(config.final_minimum_average ?? 2.5);
  const target = Number(config.final_target ?? 5);
  const command = aliases(definition)[0] || '!final';
  const constant = 3 * target;
  const exampleMp = 5.75;
  const examplePf = 7;
  const exampleMf = calculateFinal(exampleMp, examplePf, config).mf;
  return [
    '🧮 *Como funciona a média final*',
    '',
    '*Regra usada:*',
    `• MP ≥ ${formatNumber(approval)}: aprovado por média.`,
    `• ${formatNumber(minimum)} ≤ MP < ${formatNumber(approval)}: precisa fazer a prova final.`,
    `• MP < ${formatNumber(minimum)}: reprovado sem direito à final.`,
    '',
    '*Depois da prova final:*',
    'MF = (MP×2 + PF) ÷ 3',
    target === 5
      ? 'PF necessária = 15 − (MP×2)'
      : `PF necessária para MF ${formatGrade(target)} = ${formatGrade(constant)} − (MP×2)`,
    '',
    '*Como usar:*',
    `\`${command} MP PF\``,
    '',
    '*Exemplo:*',
    `\`${command} ${formatGrade(exampleMp)} ${formatGrade(examplePf)}\``,
    `MF = (${formatGrade(exampleMp)}×2 + ${formatGrade(examplePf)}) ÷ 3 = *${formatGrade(exampleMf)}*`,
    '',
    `Para calcular primeiro a MP e descobrir a PF necessária, use \`!media suas_notas\`.`
  ].join('\n');
}

function isCommandHelpRequest(text, definition) {
  const raw = String(text || '').trim().toLowerCase();
  return aliases(definition).some(command => {
    const normalizedCommand = String(command || '').trim().toLowerCase();
    return raw === normalizedCommand
      || raw === `${normalizedCommand} help`
      || raw === `${normalizedCommand} ajuda`;
  });
}
function formatAttendance(result) { return ['📊 *Frequência*', '', `Aulas: ${formatNumber(result.totalClasses)}`, `Faltas: ${formatNumber(result.absences)}`, `Frequência: *${formatNumber(result.percent)}%*`, `Mínimo configurado: ${formatNumber(result.minimumPercent)}%`, `Situação: *${result.meetsMinimum ? 'Dentro do mínimo' : 'Abaixo do mínimo'}*`, `Faltas restantes nesta carga horária: *${formatNumber(result.remainingAbsences)}*`, '', '_Use: !frequencia total_de_aulas faltas_atuais_'].join('\n'); }
function formatHours(result) { return ['⏱️ *Horas complementares*', '', `Concluídas: ${formatNumber(result.completed)} h`, `Exigidas: ${formatNumber(result.required)} h`, `Progresso: *${formatNumber(result.percent)}%*`, result.complete ? '*Carga horária concluída.*' : `Restam *${formatNumber(result.remaining)} h*.`, '', '_Use: !horas concluídas exigidas_'].join('\n'); }
function formatWeighted(result) { return ['⚖️ *Média ponderada*', '', `Média = *${formatGrade(result.average)}*`, `Soma dos pesos: ${formatNumber(result.totalWeight)}`, '', '_Use pares nota:peso, por exemplo: !mediap 7:2 8,5:3_'].join('\n'); }

function helpText(calculators) {
  const enabled = new Map(normalizeCalculators(calculators).map(item => [item.key, item]));
  const lines = ['🧮 *Calculadoras disponíveis*', ''];
  if (enabled.has('average')) lines.push(`• \`${aliases(enabled.get('average'))[0] || '!media'} 5,0 6,5\` — média e nota necessária na final.`);
  if (enabled.has('final')) lines.push(`• \`${aliases(enabled.get('final'))[0] || '!final'} 5,75 7,0\` — média após a prova final.`);
  if (enabled.has('attendance')) lines.push(`• \`${aliases(enabled.get('attendance'))[0] || '!frequencia'} 60 8\` — frequência e faltas restantes.`);
  if (enabled.has('hours')) lines.push(`• \`${aliases(enabled.get('hours'))[0] || '!horas'} 135 200\` — progresso de horas complementares.`);
  if (enabled.has('weighted')) lines.push(`• \`${aliases(enabled.get('weighted'))[0] || '!mediap'} 7:2 8,5:3\` — média ponderada.`);
  lines.push('', 'Os valores são usados somente na mensagem atual e não são armazenados.'); return lines.join('\n');
}

function handleCalculator(text, calculators) {
  if (!looksLikeCalculator(text, calculators)) return null;
  const definitions = normalizeCalculators(calculators); const selected = commandFor(text, definitions); const normalized = normalizeText(text);
  let key = selected?.key;
  if (!key) key = normalized.includes('final') ? 'final' : 'average';
  const definition = definitions.find(item => item.key === key);
  if (!definition) return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
  const config = definition.config || {};

  if (key === 'final') {
    if (isCommandHelpRequest(text, definition)) {
      return { type: 'calculator-final-help', topic: definition.label || 'Média final', text: finalHelpText(definition) };
    }
    const grades = extractGrades(text);
    if (grades.length !== 2) {
      return { type: 'calculator-final-help', topic: definition.label || 'Média final', text: finalHelpText(definition) };
    }
    return { type: 'calculator-final', topic: definition.label || 'Média final', text: formatFinalResult(calculateFinal(grades[0], grades[1], config)) };
  }
  if (key === 'average') {
    const grades = extractGrades(text); if (!grades.length) return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
    return { type: 'calculator-average', topic: definition.label || 'Média parcial', text: formatAverageResult(calculateAverage(grades, config)) };
  }
  if (key === 'attendance') {
    const values = extractNumbers(text); if (values.length !== 2) return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
    return { type: 'calculator-attendance', topic: definition.label || 'Frequência', text: formatAttendance(calculateAttendance(values[0], values[1], Number(config.minimum_percent ?? 75))) };
  }
  if (key === 'hours') {
    const values = extractNumbers(text); if (!values.length || values.length > 2) return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
    const required = values[1] ?? Number(config.default_required_hours ?? 200);
    return { type: 'calculator-hours', topic: definition.label || 'Horas complementares', text: formatHours(calculateHours(values[0], required)) };
  }
  if (key === 'weighted') {
    const pairs = [...String(text).matchAll(/(10(?:[.,]0+)?|[0-9](?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)/g)].map(match => [Number(match[1].replace(',', '.')), Number(match[2].replace(',', '.'))]);
    if (!pairs.length) return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
    return { type: 'calculator-weighted', topic: definition.label || 'Média ponderada', text: formatWeighted(calculateWeightedAverage(pairs)) };
  }
  return { type: 'calculator-help', topic: 'Calculadoras', text: helpText(definitions) };
}

module.exports = {
  extractGrades, extractNumbers, classifyMp, calculateAverage, calculateFinal, calculateAttendance, calculateHours, calculateWeightedAverage,
  commandFor, looksLikeCalculator, handleCalculator, formatGrade, helpText, finalHelpText, isCommandHelpRequest, FALLBACK_CALCULATORS
};
