'use strict';

const { normalizeText } = require('../text');
const { parseSemester } = require('../semester-schedule');
const { findTeacherMatches } = require('../professor-location');

const TOPIC_TERMS = Object.freeze({
  programacao: ['programacao', 'algoritmo', 'codigo', 'web', 'mobile', 'linguagem'],
  dados: ['dados', 'banco', 'estatistica', 'probabilidade'],
  matematica: ['matematica', 'calculo', 'discreta', 'algebra'],
  redes: ['rede', 'redes', 'seguranca', 'sistemas distribuidos'],
  gestao: ['gestao', 'administracao', 'empreendedorismo', 'projeto'],
  software: ['software', 'engenharia', 'requisitos', 'analise', 'modelagem']
});

function topicTokens(text = '') {
  const normalized = normalizeText(text);
  const tokens = new Set(normalized.split(/\s+/u).filter(token => token.length >= 4));
  for (const [topic, aliases] of Object.entries(TOPIC_TERMS)) if (aliases.some(alias => normalized.includes(alias))) tokens.add(topic);
  return tokens;
}

function guidedDisciplineCandidates(text = '', { entries = [], teachers = [], limit = 9 } = {}) {
  const normalized = normalizeText(text);
  const semester = parseSemester(normalized);
  const teacherMatches = findTeacherMatches(normalized, teachers).filter(item => item?.teacher && item.fuzzy !== true);
  const professorNames = new Set(teacherMatches.map(item => normalizeText(item.teacher.name)));
  const topics = topicTokens(normalized);
  const byDiscipline = new Map();
  for (const entry of entries || []) {
    if (semester && Number(entry.semester_number) !== Number(semester)) continue;
    if (professorNames.size && !professorNames.has(normalizeText(entry.professor_name))) continue;
    const haystack = normalizeText(`${entry.discipline_code || ''} ${entry.discipline_name || ''}`);
    let topicScore = 0;
    for (const token of topics) if (haystack.includes(token) || (TOPIC_TERMS[token] || []).some(alias => haystack.includes(alias))) topicScore += 1;
    if (topics.size && !semester && !professorNames.size && topicScore === 0) continue;
    const key = normalizeText(entry.discipline_code || entry.discipline_name);
    if (!byDiscipline.has(key)) byDiscipline.set(key, {
      code: entry.discipline_code || '', name: entry.discipline_name || '', label: [entry.discipline_code, entry.discipline_name].filter(Boolean).join(' — '),
      semesters: new Set(), professors: new Set(), score: 0
    });
    const item = byDiscipline.get(key);
    item.semesters.add(Number(entry.semester_number));
    item.professors.add(entry.professor_name);
    item.score = Math.max(item.score, (semester ? 3 : 0) + (professorNames.size ? 3 : 0) + topicScore);
  }
  return [...byDiscipline.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, Math.max(1, Number(limit || 9)))
    .map(item => ({ ...item, semesters: [...item.semesters].sort((a, b) => a - b), professors: [...item.professors].sort() }));
}

function guidedPrompt() {
  return [
    'Sem problema. Posso descobrir a disciplina com mais uma pista.', '',
    'Informe apenas uma destas opções:',
    '• o semestre, como “3º semestre”;',
    '• o nome do professor;',
    '• o assunto, como “programação”, “banco de dados” ou “redes”.', '',
    'Você também pode escrever “ver disciplinas” ou “cancelar”.'
  ].join('\n');
}

module.exports = { guidedDisciplineCandidates, guidedPrompt, topicTokens };
