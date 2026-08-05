'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { classifyBotReaction } = require('../src/reactions');
const { resolveGroupActivation } = require('../src/group-activation');
const { findDisciplineMatches, findDisciplineCandidates } = require('../src/discipline-directory');
const { contextualRoutingEvaluation } = require('../src/recovery/recovery-engine');

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0170-'));
  const db = new Database(path.join(dir, 'bot.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', contextual_followup_seconds: '300', persistent_context_enabled: 'true', recovery_enabled: 'true' });
  const engine = new BotEngine(db);
  return { dir, db, engine, close() { try { engine.close(); } catch {} try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); } };
}

function createMessage(body, replies, reactions = [], options = {}) {
  const isGroup = Boolean(options.isGroup);
  const sender = options.sender || '5511999999999@s.whatsapp.net';
  const chatId = isGroup ? '120363000000000000@g.us' : sender;
  return {
    fromMe: false,
    from: chatId,
    author: sender,
    body,
    senderName: 'Estudante',
    timestampMs: options.timestampMs || Date.now(),
    isGroup,
    groupActivated: Boolean(options.groupActivated),
    mentionedMe: Boolean(options.mentionedMe),
    ownMentionNumbers: options.ownMentionNumbers || ['5577999999999'],
    quotedFromMe: Boolean(options.quotedFromMe),
    quotedMessageId: options.quotedMessageId || '',
    async getChat() { return { isGroup, id: { _serialized: chatId }, name: isGroup ? 'Grupo BSI' : 'Estudante' }; },
    async sendResponse(payload) {
      const id = `reply-${replies.length + 1}`;
      replies.push({ id, text: String(payload.text || '') });
      return { key: { id } };
    },
    async react(emoji) { reactions.push(emoji); }
  };
}

function texts(replies) { return replies.map(item => item.text); }

test('catálogo central reconhece aliases, abreviações, fala e protege siglas curtas', () => {
  assert.equal(findDisciplineCandidates('algorítimo', []).matches[0]?.code, 'AP');
  assert.equal(findDisciplineCandidates('eme de dois', []).matches[0]?.code, 'MDII');
  assert.equal(findDisciplineCandidates('BD 2', []).matches[0]?.code, 'BDII');
  assert.equal(findDisciplineMatches('IA', [], { allowShortStandalone: false }).length, 0);
  assert.equal(findDisciplineMatches('sala de IA', [], { allowShortStandalone: false })[0]?.code, 'IA');
  assert.equal(findDisciplineCandidates('IA', [], { allowShortStandalone: true }).matches[0]?.code, 'IA');
});

test('resposta inválida não substitui a consulta original e AP conclui sala', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(createMessage('sala', replies));
    await h.engine.handle(createMessage('qualquer coisa', replies));
    await h.engine.handle(createMessage('AP', replies));
    const output = texts(replies);
    assert.match(output[0], /Intenção: sala/u);
    assert.match(output[1], /Disciplina: não informada/u);
    assert.match(output[2], /AP — Algoritmo e Programação/u);
    assert.match(output[2], /Sala:.*H204/isu);
    assert.doesNotMatch(output[2], /qualquer coisa/u);
  } finally { h.close(); }
});

test('consulta pendente aceita lista, cancelamento, nova pergunta e encerra na terceira falha', async () => {
  const h = harness();
  try {
    let replies = [];
    await h.engine.handle(createMessage('sala', replies));
    await h.engine.handle(createMessage('ver disciplinas', replies));
    assert.match(texts(replies).at(-1), /Disciplinas cadastradas/u);
    await h.engine.handle(createMessage('cancelar', replies));
    assert.match(texts(replies).at(-1), /cancelada/u);

    replies = [];
    await h.engine.handle(createMessage('sala', replies));
    await h.engine.handle(createMessage('qual o contato da biblioteca?', replies));
    assert.match(texts(replies).at(-1), /Biblioteca/u);
    assert.doesNotMatch(texts(replies).at(-1), /sigla ou o nome da disciplina/u);

    replies = [];
    await h.engine.handle(createMessage('sala', replies));
    await h.engine.handle(createMessage('xpto', replies));
    await h.engine.handle(createMessage('nada aqui', replies));
    await h.engine.handle(createMessage('continua inválido', replies));
    assert.match(texts(replies).at(-1), /Encerrei este pedido/u);
  } finally { h.close(); }
});

test('correção explícita altera apenas o campo indicado e preserva o restante', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(createMessage('sala amanhã', replies));
    await h.engine.handle(createMessage('não é sala, quero o horário', replies));
    assert.match(replies.at(-1).text, /Intenção: horário/u);
    assert.match(replies.at(-1).text, /Data: amanhã/u);
    await h.engine.handle(createMessage('AP', replies));
    assert.match(replies.at(-1).text, /AP — Algoritmo e Programação/u);
    assert.match(replies.at(-1).text, /Horário/u);
  } finally { h.close(); }
});

test('terceira falha usa encaminhamento humano contextual', () => {
  const evaluation = contextualRoutingEvaluation('não achei o procedimento da matrícula', { messages: [
    { id: 10, title: 'CORES — Coordenação de Registros Escolares', topic: 'Setores', response_text: 'Contato da CORES' },
    { id: 11, title: 'Coordenação do BSI', topic: 'BSI', response_text: 'Contato da coordenação' },
    { id: 12, title: 'CAENS', topic: 'Assistência estudantil', response_text: 'Contato da CAENS' }
  ] });
  assert.equal(evaluation.type, 'recovery_routing');
  assert.match(evaluation.text, /matrícula e registros/u);
  assert.match(evaluation.text, /CORES/u);
  assert.match(evaluation.text, /Coordenação do BSI/u);
  assert.match(evaluation.text, /CAENS/u);
  assert.match(evaluation.text, /Tentar descrever novamente/u);
});

test('ativadores opcionais são removidos no privado e reply ativa o grupo', () => {
  for (const body of ['sala de AP', '. sala de AP', 'bot sala de AP']) {
    const result = resolveGroupActivation({ isGroup: false, body });
    assert.equal(result.active, true);
    assert.equal(result.body, 'sala de AP');
  }
  const mention = resolveGroupActivation({ isGroup: false, body: 'sala de AP @5577999999999', mentionedMe: true, ownMentionNumbers: ['5577999999999'] });
  assert.equal(mention.body, 'sala de AP');
  const reply = resolveGroupActivation({ isGroup: true, body: 'e a sala?', quotedFromMe: true });
  assert.equal(reply.active, true);
  assert.equal(reply.mode, 'reply-to-bot');
});

test('reply citado tem prioridade sobre o último assunto', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(createMessage('quem ensina AP?', replies));
    const apReplyId = replies.at(-1).id;
    await h.engine.handle(createMessage('quem ensina Cálculo?', replies));
    await h.engine.handle(createMessage('e a sala?', replies, [], { quotedFromMe: true, quotedMessageId: apReplyId }));
    const last = replies.at(-1).text;
    assert.match(last, /AP — Algoritmo e Programação/u);
    assert.match(last, /H204/u);
    assert.doesNotMatch(last, /Cálculo Diferencial/u);
  } finally { h.close(); }
});

test('reply sem prefixo ativa consulta e reações no grupo', async () => {
  const h = harness(); const replies = []; const reactions = [];
  try {
    await h.engine.handle(createMessage('. quem ensina AP?', replies, reactions, { isGroup: true }));
    const replyId = replies.at(-1).id;
    await h.engine.handle(createMessage('e a sala?', replies, reactions, { isGroup: true, quotedFromMe: true, quotedMessageId: replyId }));
    assert.match(replies.at(-1).text, /H204/u);
    await h.engine.handle(createMessage('seu imprestável', replies, reactions, { isGroup: true, quotedFromMe: true, quotedMessageId: replyId }));
    assert.deepEqual(reactions, ['😔']);
  } finally { h.close(); }
});

test('léxico cobre elogios e ofensas pedidos sem reagir a terceiros', () => {
  const groupReply = body => classifyBotReaction({ body, quotedFromMe: true }, body);
  for (const phrase of ['corno', 'burro', 'imprestável', 'fudido']) assert.equal(groupReply(phrase)?.emoji, '😔', phrase);
  for (const phrase of ['obg', 'obrigada', 'bom bot', 'boa garoto']) assert.equal(groupReply(phrase)?.emoji, '❤️', phrase);
  assert.equal(classifyBotReaction({ body: 'João é burro' }, 'João é burro'), null);
  assert.equal(classifyBotReaction({ body: 'essa matéria é fudida' }, 'essa matéria é fudida', { isPrivate: true }), null);
  assert.equal(classifyBotReaction({ body: 'bom dia' }, 'bom dia', { isPrivate: true }), null);
});

test('rejeição cria exemplo negativo revisável e aprovação altera somente o card', () => {
  const h = harness();
  try {
    const card = h.db.saveAutomaticMessage({ title: 'Calculadora da final', topic: 'Calculadoras', response_text: 'Use !final.', trigger: { sentences: ['calcular nota final'], negative_examples: [] }, active: true });
    const suggestion = h.db.addNegativeExampleSuggestion({
      message_excerpt: 'quando é a final de cálculo?',
      message_id: card.id,
      message_title: card.title,
      source: 'suggestion_rejected'
    });
    assert.equal(h.db.getAutomaticMessage(card.id).trigger.negative_examples.includes('quando é a final de cálculo?'), false);
    h.db.approveNegativeExampleSuggestion(suggestion.id);
    assert.equal(h.db.getAutomaticMessage(card.id).trigger.negative_examples.includes('quando é a final de cálculo?'), true);
  } finally { h.close(); }
});

test('alias sugerido só entra no catálogo depois da aprovação', () => {
  const h = harness();
  try {
    const suggestion = h.db.addDisciplineAliasSuggestion({ alias: 'alg prog', discipline_code: 'AP', discipline_name: 'Algoritmo e Programação', original_message: 'sala de alg prog' });
    assert.equal(h.db.listDisciplineAliases().length, 0);
    h.db.approveDisciplineAliasSuggestion(suggestion.id);
    const aliases = h.db.listDisciplineAliases();
    assert.equal(aliases[0].alias, 'alg prog');
    const directory = [...h.db.listProfessorDisciplineDirectory({ academicPeriod: '2026.2' }), ...aliases.map(item => ({ discipline_name: item.discipline_name, discipline_code: item.discipline_code, alias: item.alias }))];
    assert.equal(findDisciplineCandidates('alg prog', directory).matches[0]?.code, 'AP');
  } finally { h.close(); }
});

test('selecionar nenhuma dessas registra associação negativa específica', async () => {
  const h = harness(); const replies = [];
  try {
    const card = h.db.saveAutomaticMessage({ title: 'Calculadora da final', topic: 'Calculadoras', response_text: 'Use !final.', trigger: { sentences: ['calcular nota final'], negative_examples: [] }, active: true });
    const msg = createMessage('não é isso', replies);
    h.engine.rememberPendingChoice(msg, {
      type: 'disambiguation',
      text: 'É a calculadora?',
      pendingCandidates: [
        { kind: 'message', label: card.title, item: card },
        { kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas' } }
      ],
      recoveryMetadata: { stage: 1, outcome: 'suggestions', originalMessage: 'quando é a final de cálculo?' }
    }, h.db.getSettings());
    await h.engine.handle(msg);
    const pending = h.db.listNegativeExampleSuggestions({ state: 'pending' });
    assert.ok(pending.some(item => item.message_id === card.id && item.message_excerpt === 'quando é a final de cálculo?'));
  } finally { h.close(); }
});
