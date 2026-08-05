'use strict';

const { normalizeText } = require('./text');
const {
  SI_PROFESSORS_2026_2,
  SI_DISCIPLINE_CODES_2026_2,
  SI_DISCIPLINE_ALIASES_2026_2,
  formatDisciplineLabel
} = require('./si-professors-2026-2');

function unique(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

const DISCIPLINE_METADATA_2026_2 = Object.freeze({
  'Algoritmo e Programação': Object.freeze({
    speechAliases: ['a p', 'a pe'],
    commonTypos: ['algoritimo', 'algorítimo', 'algoritimos', 'algorítimos', 'algoritimo e programação', 'algoritmos e programacao']
  }),
  'Banco de Dados I': Object.freeze({ speechAliases: ['bê dê um', 'be de um', 'b d um'] }),
  'Banco de Dados II': Object.freeze({ speechAliases: ['bê dê dois', 'be de dois', 'b d dois'] }),
  'Cálculo Diferencial Aplicado à Computação': Object.freeze({
    speechAliases: ['calculo', 'cálculo', 'calculo aplicado'],
    commonTypos: ['calculo diferensial', 'cálculo diferensial']
  }),
  'Inteligência Artificial': Object.freeze({
    speechAliases: ['i a'],
    commonTypos: ['intelijencia artificial', 'inteligencia artifical']
  }),
  'Linguagem de Programação I': Object.freeze({ speechAliases: ['ele pê um', 'ele pe um', 'l p um'] }),
  'Linguagem de Programação II': Object.freeze({ speechAliases: ['ele pê dois', 'ele pe dois', 'l p dois'] }),
  'Matemática Discreta I': Object.freeze({
    speechAliases: ['eme dê um', 'eme de um', 'm d um'],
    commonTypos: ['matematica descrita um', 'matemática descrita um']
  }),
  'Matemática Discreta II': Object.freeze({
    speechAliases: ['eme dê dois', 'eme de dois', 'm d dois'],
    commonTypos: ['matematica descrita dois', 'matemática descrita dois']
  }),
  'Programação Web I': Object.freeze({ speechAliases: ['pê dáblio um', 'pe dablio um', 'p w um'] }),
  'Programação Web II': Object.freeze({ speechAliases: ['pê dáblio dois', 'pe dablio dois', 'p w dois'] }),
  'Trabalho de Conclusão de Curso I': Object.freeze({ speechAliases: ['tê cê cê um', 'te ce ce um'] }),
  'Trabalho de Conclusão de Curso II': Object.freeze({ speechAliases: ['tê cê cê dois', 'te ce ce dois'] }),
  'Probabilidade e Estatística': Object.freeze({ commonTypos: ['probabilidade e estatistica', 'probabilidade estatistica'] }),
  'Programação para Dispositivos Móveis': Object.freeze({ commonTypos: ['programação para dispositivos moveis', 'programacao para dispositivos moveis'] })
});

const DANGEROUS_SHORT_ALIASES = new Set([
  'ap', 'as', 'bi', 'ca', 'ce', 'dc', 'ed', 'es', 'gp', 'ia', 'ma', 'pe', 'pw', 'rc', 'sd', 'si', 'so'
]);

const CONNECTOR_WORDS = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'das', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos']);
const QUERY_STOPWORDS = new Set([
  ...CONNECTOR_WORDS,
  'qual', 'quais', 'que', 'quem', 'onde', 'quando', 'como', 'nome', 'nomes',
  'professor', 'professora', 'professores', 'professoras', 'docente', 'docentes', 'prof', 'profa',
  'sala', 'salas', 'laboratorio', 'laboratorios', 'lab', 'predio', 'bloco', 'andar',
  'dia', 'dias', 'horario', 'horarios', 'hora', 'horas', 'aula', 'aulas',
  'materia', 'materias', 'disciplina', 'disciplinas', 'semestre', 'semestres',
  'contato', 'email', 'telefone', 'whatsapp', 'numero', 'celular',
  'fica', 'ficam', 'sera', 'serao', 'ministrada', 'ministrado', 'ministradas', 'ministrados',
  'leciona', 'lecionada', 'lecionado', 'ensina', 'da', 'dar', 'dara', 'informe', 'informar',
  'me', 'diga', 'mostre', 'passa', 'passe', 'favor'
]);

function generatedSpeechAliases(code = '') {
  const normalizedCode = String(code || '').replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
  if (!normalizedCode || normalizedCode.length > 8) return [];
  const romanToWord = { I: 'um', II: 'dois', III: 'tres', IV: 'quatro' };
  const roman = normalizedCode.match(/(IV|III|II|I)$/u)?.[1] || '';
  const base = roman ? normalizedCode.slice(0, -roman.length) : normalizedCode.replace(/\d+$/u, '');
  const numeric = normalizedCode.slice(base.length);
  const spacedBase = base.split('').join(' ').toLowerCase();
  const aliases = [];
  if (spacedBase) aliases.push(spacedBase);
  if (spacedBase && numeric) {
    const spoken = romanToWord[numeric] || ({ '1': 'um', '2': 'dois', '3': 'tres', '4': 'quatro' }[numeric] || numeric);
    aliases.push(`${spacedBase} ${spoken}`, `${spacedBase} ${numeric}`);
  }
  return unique(aliases);
}

function generatedAliases(name, code) {
  const aliases = [name, code, ...generatedSpeechAliases(code)];
  const normalizedName = normalizeText(name);
  const compactName = normalizedName.split(/\s+/u).filter(word => !CONNECTOR_WORDS.has(word)).join(' ');
  if (compactName && compactName !== normalizedName) aliases.push(compactName);

  const suffix = String(name || '').match(/(?:\s|-)(I|II|III|IV)$/u)?.[1] || '';
  const numberByRoman = { I: '1', II: '2', III: '3', IV: '4' };
  const compactCode = String(code || '').replace(/\s+/gu, '').toUpperCase();
  if (compactCode) {
    aliases.push(compactCode);
    if (suffix && compactCode.endsWith(suffix)) {
      const base = compactCode.slice(0, -suffix.length);
      const number = numberByRoman[suffix];
      aliases.push(`${base}${suffix}`, `${base} ${suffix}`, `${base}${number}`, `${base} ${number}`);
    }
  }

  return unique(aliases);
}

function staticEntries() {
  const owners = new Map();
  for (const teacher of SI_PROFESSORS_2026_2) {
    for (const entry of teacher.classes || []) {
      const name = String(entry[0] || '').trim();
      if (!name) continue;
      if (!owners.has(name)) owners.set(name, new Set());
      owners.get(name).add(teacher.name);
    }
  }
  return [...owners].map(([name, professorNames]) => {
    const code = SI_DISCIPLINE_CODES_2026_2[name] || '';
    const metadata = DISCIPLINE_METADATA_2026_2[name] || {};
    return {
      name,
      code,
      label: formatDisciplineLabel(name),
      aliases: unique([
        ...generatedAliases(name, code),
        ...(SI_DISCIPLINE_ALIASES_2026_2[name] || []),
        ...(metadata.speechAliases || []),
        ...(metadata.commonTypos || [])
      ]),
      speechAliases: unique([...(metadata.speechAliases || []), ...generatedSpeechAliases(code)]),
      commonTypos: unique(metadata.commonTypos || []),
      professorNames: [...professorNames]
    };
  });
}

const STATIC_DISCIPLINE_CATALOG = Object.freeze(staticEntries().map(item => Object.freeze({
  ...item,
  aliases: Object.freeze([...item.aliases]),
  speechAliases: Object.freeze([...item.speechAliases]),
  commonTypos: Object.freeze([...item.commonTypos]),
  professorNames: Object.freeze([...item.professorNames])
})));

function buildDisciplineCatalog(scheduleEntries = []) {
  const byName = new Map(STATIC_DISCIPLINE_CATALOG.map(item => [normalizeText(item.name), {
    ...item,
    aliases: [...item.aliases],
    speechAliases: [...item.speechAliases],
    commonTypos: [...item.commonTypos],
    professorNames: [...item.professorNames]
  }]));

  for (const entry of scheduleEntries || []) {
    const name = String(entry.discipline_name || entry.name || '').trim();
    if (!name) continue;
    const key = normalizeText(name);
    const current = byName.get(key) || {
      name, code: '', label: name, aliases: [], speechAliases: [], commonTypos: [], professorNames: []
    };
    const code = String(entry.discipline_code || entry.code || current.code || SI_DISCIPLINE_CODES_2026_2[name] || '').trim().toUpperCase();
    const metadata = DISCIPLINE_METADATA_2026_2[name] || {};
    current.name = name;
    current.code = code;
    current.label = code ? `${code} - ${name}` : name;
    current.aliases = unique([
      ...current.aliases,
      ...generatedAliases(name, code),
      ...(SI_DISCIPLINE_ALIASES_2026_2[name] || []),
      ...(metadata.speechAliases || []),
      ...(metadata.commonTypos || []),
      ...(Array.isArray(entry.aliases) ? entry.aliases : []),
      entry.alias || ''
    ]);
    current.speechAliases = unique([...current.speechAliases, ...(metadata.speechAliases || []), ...generatedSpeechAliases(code)]);
    current.commonTypos = unique([...current.commonTypos, ...(metadata.commonTypos || [])]);
    current.professorNames = unique([...current.professorNames, String(entry.professor_name || '').trim()]);
    byName.set(key, current);
  }

  const values = [...byName.values()];
  const excludedFirstWords = new Set(['sistemas', 'linguagem', 'programacao', 'seguranca', 'gestao', 'organizacao', 'atividades']);
  const firstWordCounts = new Map();
  for (const item of values) {
    const firstWord = normalizeText(item.name).split(/\s+/u)[0] || '';
    if (firstWord.length < 6 || excludedFirstWords.has(firstWord)) continue;
    firstWordCounts.set(firstWord, Number(firstWordCounts.get(firstWord) || 0) + 1);
  }
  for (const item of values) {
    const firstWord = normalizeText(item.name).split(/\s+/u)[0] || '';
    if (firstWordCounts.get(firstWord) !== 1) continue;
    item.aliases = unique([
      ...item.aliases,
      firstWord,
      firstWord.endsWith('s') ? firstWord.slice(0, -1) : `${firstWord}s`
    ]);
  }

  return values.map(item => ({
    ...item,
    aliases: unique(item.aliases).sort((a, b) => normalizeText(b).length - normalizeText(a).length),
    riskyAliases: unique(item.aliases).filter(alias => isDangerousAlias(alias))
  }));
}

function isDangerousAlias(alias = '') {
  const normalized = normalizeText(alias);
  return normalized.length <= 2 || DANGEROUS_SHORT_ALIASES.has(normalized);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phrasePattern(value) {
  const escaped = escapeRegExp(normalizeText(value)).replace(/\\\s\+/g, '\\s+');
  return new RegExp(`(?:^|\\s)${escaped}(?=$|\\s|[?!,.;:])`, 'u');
}

function aliasAllowed(alias, normalizedText, { allowShortStandalone = false } = {}) {
  const normalizedAlias = normalizeText(alias);
  if (!isDangerousAlias(normalizedAlias)) return true;
  if (allowShortStandalone) return true;
  return normalizedText !== normalizedAlias;
}

function findCatalogMatches(text, scheduleEntries = [], options = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const matches = [];
  const occupied = [];
  const candidates = buildDisciplineCatalog(scheduleEntries)
    .flatMap(item => item.aliases.map(alias => ({ item, alias, normalizedAlias: normalizeText(alias) })))
    .filter(candidate => candidate.normalizedAlias.length >= 2 && aliasAllowed(candidate.alias, normalized, options))
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

  for (const candidate of candidates) {
    const match = phrasePattern(candidate.alias).exec(normalized);
    if (!match) continue;
    const start = match.index + (match[0].startsWith(' ') ? 1 : 0);
    const end = start + candidate.normalizedAlias.length;
    if (occupied.some(range => start < range.end && end > range.start)) continue;
    if (matches.some(existing => normalizeText(existing.name) === normalizeText(candidate.item.name))) continue;
    occupied.push({ start, end });
    matches.push({ ...candidate.item, matchedAlias: candidate.alias, start, end });
  }
  return matches.sort((a, b) => a.start - b.start);
}

function searchKey(value = '') {
  return normalizeText(value).split(/\s+/u).filter(token => token && !CONNECTOR_WORDS.has(token)).join(' ');
}

function extractQueryFragment(text = '') {
  return normalizeText(text).split(/\s+/u).filter(token => token && !QUERY_STOPWORDS.has(token)).join(' ').trim();
}

function findCatalogCandidates(text, scheduleEntries = [], { allowShortStandalone = true } = {}) {
  const fragment = extractQueryFragment(text) || normalizeText(text);
  const key = searchKey(fragment);
  if (key.length < 2) return { fragment, matches: [] };
  const ranked = [];
  for (const item of buildDisciplineCatalog(scheduleEntries)) {
    let bestRank = Number.POSITIVE_INFINITY;
    for (const alias of unique([item.code, item.name, ...(item.aliases || [])])) {
      const aliasKey = searchKey(alias);
      if (!aliasKey || (!allowShortStandalone && isDangerousAlias(aliasKey) && key === aliasKey)) continue;
      if (aliasKey === key) bestRank = Math.min(bestRank, 0);
      else if (aliasKey.startsWith(`${key} `)) bestRank = Math.min(bestRank, 1);
      else if (key.length >= 5 && aliasKey.includes(key)) bestRank = Math.min(bestRank, 2);
    }
    if (Number.isFinite(bestRank)) ranked.push({ ...item, matchedAlias: fragment, candidateRank: bestRank });
  }
  const matches = [...new Map(ranked
    .sort((a, b) => a.candidateRank - b.candidateRank || String(a.name).localeCompare(String(b.name)))
    .map(item => [normalizeText(item.name), item])).values()];
  return { fragment, matches };
}

function canonicalizeDisciplineSpeech(value = '') {
  let text = normalizeText(value);
  const replacements = [];
  for (const item of STATIC_DISCIPLINE_CATALOG) {
    for (const alias of item.speechAliases || []) replacements.push({ alias: normalizeText(alias), replacement: item.code || item.name });
    for (const typo of item.commonTypos || []) replacements.push({ alias: normalizeText(typo), replacement: item.name });
  }
  replacements.sort((a, b) => b.alias.length - a.alias.length);
  for (const item of replacements) {
    if (!item.alias) continue;
    text = text.replace(new RegExp(`(?:^|\\b)${escapeRegExp(item.alias)}(?=\\b|$)`, 'gu'), match => {
      const leading = /^\s/u.test(match) ? ' ' : '';
      return `${leading}${normalizeText(item.replacement)}`;
    });
  }
  return text.replace(/\s{2,}/gu, ' ').trim();
}

function formatDisciplineList(scheduleEntries = [], { limit = 80 } = {}) {
  const items = buildDisciplineCatalog(scheduleEntries)
    .sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name), 'pt-BR'))
    .slice(0, Math.max(1, Number(limit || 80)));
  return ['*Disciplinas cadastradas*', '', ...items.map(item => `• *${item.code || '—'}* — ${item.name}`), '', 'Envie a sigla ou o nome da disciplina.'].join('\n');
}

module.exports = {
  DISCIPLINE_METADATA_2026_2,
  STATIC_DISCIPLINE_CATALOG,
  DANGEROUS_SHORT_ALIASES,
  generatedSpeechAliases,
  buildDisciplineCatalog,
  findCatalogMatches,
  findCatalogCandidates,
  extractQueryFragment,
  isDangerousAlias,
  canonicalizeDisciplineSpeech,
  formatDisciplineList
};
