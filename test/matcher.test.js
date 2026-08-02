const test = require('node:test');
const assert = require('node:assert/strict');
const { findHubMatches, findTeacherMatches, looksLikeTeacherQuestion } = require('../src/matcher');

const teachers = [{ id: 1, name: 'João da Silva', email: 'joao@ifba.edu.br', aliases: ['professor joão', 'joão'], active: true }];
const links = [{ id: 1, title: 'Calendário Acadêmico', url: 'https://example.org', keywords: ['calendário', 'sábado letivo'], active: true, priority: 5 }];

test('encontra professor quando há pergunta, intenção de contato e identificação', () => {
  assert.equal(findTeacherMatches('qual o contato do professor joao?', teachers)[0].email, 'joao@ifba.edu.br');
  assert.equal(findTeacherMatches('qual o e-mail do joão?', teachers)[0].email, 'joao@ifba.edu.br');
});

test('aceita pergunta completa sem ? e mantém frases nominais genéricas bloqueadas', () => {
  assert.equal(looksLikeTeacherQuestion('qual o contato do professor joao'), true);
  assert.equal(findTeacherMatches('qual o contato do professor joao', teachers)[0].email, 'joao@ifba.edu.br');
  assert.equal(findTeacherMatches('email do joao', teachers).length, 0);
});

test('ponto de interrogação sozinho não ativa consulta de professor', () => {
  assert.equal(findTeacherMatches('gostei da aula do professor joao?', teachers).length, 0);
  assert.equal(findTeacherMatches('o professor joao veio hoje?', teachers).length, 0);
});

test('encontra link ignorando acentos', () => {
  assert.equal(findHubMatches('onde vejo o calendario?', links)[0].id, 1);
});
