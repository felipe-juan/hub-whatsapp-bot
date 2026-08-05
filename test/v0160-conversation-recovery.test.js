'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { relatedCardCandidates } = require('../src/recovery/card-search');
const { canonicalSpeechText, choiceNumber } = require('../src/recovery/language');

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0160-'));
  const db = new Database(path.join(dir, 'bot.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', contextual_followup_seconds: '300', persistent_context_enabled: 'true', recovery_enabled: 'true' });
  const engine = new BotEngine(db);
  return { dir, db, engine, close() { try { engine.close(); } catch {} try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); } };
}

function message(body, replies, { from = '5511999999999@s.whatsapp.net', isGroup = false, activated = false, mentionedMe = false, timestampMs = Date.now() } = {}) {
  const chatId = isGroup ? '120363000000000000@g.us' : from;
  return {
    fromMe: false, from: chatId, author: from, body, senderName: 'Estudante', timestampMs,
    isGroup, groupActivated: activated, mentionedMe, quotedFromMe: false,
    async getChat() { return { isGroup, id: { _serialized: chatId }, name: isGroup ? 'Grupo BSI' : 'Estudante' }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { key: { id: `reply-${replies.length}` } }; }
  };
}

test('recupera pergunta de sala perguntando apenas a disciplina ausente', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('preciso saber onde é a aula amanhã', replies));
    assert.equal(replies.length, 1);
    assert.match(replies[0], /De qual disciplina.*sala.*amanhã/iu);
    await h.engine.handle(message('cálculo', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[1], /Cálculo Diferencial/u);
    assert.match(replies[1], /Não há aula cadastrada.*Cálculo.*amanhã/iu);
  } finally { h.close(); }
});

test('contato do professor pede somente o nome ausente', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('contato do professor', replies));
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Qual é o nome do professor/u);
  } finally { h.close(); }
});

test('tem aula hoje pergunta apenas o semestre e preserva hoje', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('tem aula hoje?', replies, { timestampMs: Date.UTC(2026, 7, 4, 15, 0) }));
    assert.match(replies[0], /qual semestre/iu);
    await h.engine.handle(message('3', replies, { timestampMs: Date.UTC(2026, 7, 4, 15, 0) }));
    assert.match(replies[1], /3º Semestre/u);
  } finally { h.close(); }
});

test('última disciplina respondida sustenta continuação normal', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('quem ensina Algoritmos?', replies));
    await h.engine.handle(message('e a sala?', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[0], /Liojes de Oliveira/u);
    assert.match(replies[1], /Sala/u);
    assert.match(replies[1], /Algoritmo/u);
  } finally { h.close(); }
});

test('agradecimento não abre menu e encerra contexto', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('contato da biblioteca', replies));
    await h.engine.handle(message('obrigado', replies));
    assert.match(replies.at(-1), /Por nada/u);
    assert.doesNotMatch(replies.at(-1), /Aulas, salas/u);
  } finally { h.close(); }
});

test('falhas sucessivas ampliam a recuperação sem repetir a mesma mensagem', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('xyzzy qqq', replies));
    assert.match(replies[0], /sala de uma disciplina/u);
    await h.engine.handle(message('nenhuma dessas', replies));
    assert.match(replies[1], /Aulas, salas e horários/u);
    await h.engine.handle(message('8', replies));
    assert.match(replies[2], /Descreva em uma frase curta/u);
  } finally { h.close(); }
});

test('seleção de sugestão registra aprendizado assistido', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('preciso falar com alguém da bibioteca', replies));
    if (/Encontrei|Acho que/u.test(replies[0])) {
      await h.engine.handle(message('1', replies));
      const suggestions = h.db.listUnrecognizedSuggestions({ state: 'all', limit: 50 });
      assert.ok(suggestions.some(item => /bibioteca/u.test(item.message_excerpt)));
    } else {
      assert.match(replies[0], /Biblioteca/u);
    }
  } finally { h.close(); }
});

test('evidências negativas separam calculadora e data da final', () => {
  const messages = [
    { id: 1, title: 'Calculadora da final', topic: 'Calculadoras', response_text: 'calc', trigger_policy: { related_terms: ['final'], direct_confidence: 0.8 } },
    { id: 2, title: 'Calendário acadêmico', topic: 'Calendário', response_text: 'data', trigger_policy: { related_terms: ['final'], direct_confidence: 0.8 } }
  ];
  const calc = relatedCardCandidates('como calcular minha nota final?', messages, { limit: 2 });
  const date = relatedCardCandidates('quando é a final de cálculo?', messages, { limit: 2 });
  assert.match(calc[0].item.title, /Calculadora/u);
  assert.match(date[0].item.title, /Calendário/u);
});

test('aliases fonéticos e escolhas faladas são normalizados', () => {
  assert.equal(canonicalSpeechText('contato do Wallace'), 'contato do ualace');
  assert.equal(canonicalSpeechText('contato da caem'), 'contato da caens');
  assert.equal(canonicalSpeechText('algorítimo'), 'algoritmo e programacao');
  assert.equal(choiceNumber('a primeira opção'), 1);
  assert.equal(choiceNumber('opção dois'), 2);
});

test('grupos só recuperam quando explicitamente ativados', async () => {
  const h = harness(); const silent = []; const active = [];
  try {
    await h.engine.handle(message('preciso saber uma sala', silent, { isGroup: true }));
    assert.equal(silent.length, 0);
    await h.engine.handle(message('preciso saber uma sala', active, { isGroup: true, activated: true }));
    assert.equal(active.length, 1);
    assert.match(active[0], /De qual disciplina/u);
  } finally { h.close(); }
});

test('contexto recém-expirado pode ser retomado', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('qual sala de LPI?', replies));
    const key = h.engine.conversationKey(message('', []));
    const current = h.engine.conversationContexts.get(key);
    current.expiresAt = Date.now() - 1000;
    h.engine.conversationContexts.delete(key);
    h.db.saveConversationContext({ context_key: key, subject_type: current.kind, subject_id: current.id || current.title || '', payload: current, expires_at: current.expiresAt });
    await h.engine.handle(message('e o horário?', replies));
    assert.match(replies.at(-1), /LPI/u);
    assert.match(replies.at(-1), /Horário/u);
  } finally { h.close(); }
});

test('métricas de recuperação são expostas', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('contato do professor', replies));
    await h.engine.handle(message('Crescêncio', replies));
    const metrics = h.db.recoveryMetrics({ days: 30 });
    assert.ok(metrics.total >= 1);
    assert.ok(metrics.resolved >= 1);
    assert.ok(Number.isFinite(metrics.average_messages));
  } finally { h.close(); }
});

test('exceção de sala registra responsável, fonte e expira automaticamente', () => {
  const h = harness();
  try {
    const event = h.db.saveAcademicCalendarEvent({
      event_type: 'room_change', start_date: '2099-08-05', end_date: '2099-08-05', title: 'Mudança de sala',
      course: 'bsi', discipline_code: 'AP', old_room: 'H008', new_room: 'H015', source_title: 'Coordenação do BSI',
      source_url: 'https://example.invalid/fonte', responsible: 'Administrador', active: true
    });
    assert.equal(event.responsible, 'Administrador');
    h.db.db.prepare('UPDATE academic_calendar_events SET end_date=?,active=1 WHERE id=?').run('2000-01-01', event.id);
    h.db.listAcademicCalendarEvents({ activeOnly: true });
    const expired = h.db.listAcademicCalendarEvents({ activeOnly: false }).find(item => item.id === event.id);
    assert.equal(expired.active, false);
  } finally { h.close(); }
});

test('reformulação resolvida gera sugestão de aprendizado sem publicar gatilho', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('onde pego o papel que prova que estudo aqui?', replies));
    assert.ok(replies.length >= 1);
    await h.engine.handle(message('onde encontro comprovante de matrícula?', replies));
    assert.match(replies.at(-1), /Documentos acadêmicos no SUAP/u);
    const suggestions = h.db.listUnrecognizedSuggestions({ state: 'all', limit: 100 });
    assert.ok(suggestions.some(item => /papel que prova que estudo/u.test(item.message_excerpt)
      && /SUAP — Documentos e histórico/iu.test(item.suggested_title)));
  } finally { h.close(); }
});

test('mensagem inicial privada aparece na saudação e o editor expõe política de recuperação', async () => {
  const h = harness(); const replies = [];
  try {
    await h.engine.handle(message('oi', replies));
    assert.match(replies[0], /salas e horários/u);
    assert.match(replies[0], /Digite `menu`/u);
    const cards = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cards.js'), 'utf8');
    assert.match(cards, /Termos e formas relacionadas/u);
    assert.match(cards, /direct_confidence/u);
    assert.match(cards, /suggestion_confidence/u);
    assert.match(cards, /negative_terms/u);
    assert.match(cards, /incompatible_terms/u);
  } finally { h.close(); }
});
