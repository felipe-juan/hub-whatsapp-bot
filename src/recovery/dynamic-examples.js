'use strict';
const { normalizeText } = require('../text');
function examplesFor(message = '', now = new Date()) {
  const text = normalizeText(message);
  if (/\bprofessor|professora|docente\b/u.test(text)) return ['contato do professor Juan', 'disciplinas de Amanda', 'em quais dias Ualace dá aula?'];
  if (/\bmatricula|matrícula|requisito|semestre\b/u.test(text)) return ['calendário acadêmico', 'matriz curricular', 'quebra de pré-requisito'];
  if (/\bbiblioteca|livro\b/u.test(text)) return ['contato da Biblioteca', 'como renovar um livro?', 'onde fica a Biblioteca?'];
  const hour = Number(now.getHours());
  if (hour < 18) return ['quais são as aulas de hoje?', 'qual sala do terceiro semestre?', 'quem dá aula hoje?'];
  return ['qual sala de Cálculo?', 'quem ensina Algoritmos?', 'contato da CAENS'];
}
module.exports = { examplesFor };
