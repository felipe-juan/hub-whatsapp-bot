'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const { analyzeUnifiedQuery, mergeQueryState, validateConversationState, looksLikeCompleteRequest } = require('../src/engine/query-model');
const { STATIC_DISCIPLINES } = require('../src/discipline-directory');
const { guidedDisciplineCandidates } = require('../src/engine/guided-discipline-search');
const { LocalPreferenceStore, preferencesFromSubject, applyLocalPreferences } = require('../src/engine/local-preferences');
const { FragmentBuffer, isLikelyFragment } = require('../src/engine/fragment-buffer');
const { resolveAcademicEventLayers, filterScheduleByValidity, PRECEDENCE } = require('../src/academic-precedence');
const { previewLearningImpact, messageVariants } = require('../src/learning-impact');
const { simulateConversation } = require('../src/conversation-simulator');

function harness(seedBundledContent = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0180-'));
  const db = new Database(path.join(dir, 'bot.sqlite'), { seedBundledContent });
  db.setSettings({ cooldown_seconds: '0', contextual_followup_seconds: '300', quoted_context_seconds: '86400', persistent_context_enabled: 'true', recovery_enabled: 'true' });
  const engine = new BotEngine(db);
  return { dir, db, engine, close() { try { engine.close(); } catch {} try { db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); } };
}

function msg(body, replies, options = {}) {
  const sender = options.sender || '5511999999999@s.whatsapp.net';
  const isGroup = Boolean(options.isGroup); const from = isGroup ? '120363000000000000@g.us' : sender;
  return {
    from, author: sender, authorId: sender, fromMe: false, isGroup, body, originalBody: body,
    timestampMs: options.timestampMs || Date.now(), groupActivated: Boolean(options.groupActivated), mentionedMe: Boolean(options.mentionedMe),
    quotedFromMe: Boolean(options.quotedFromMe), quotedMessageId: options.quotedMessageId || '',
    async getChat() { return { isGroup, id: { _serialized: from }, name: isGroup ? 'Grupo BSI' : 'Estudante' }; },
    async sendResponse(payload) { const id = `reply-${replies.length + 1}`; replies.push({ id, text: String(payload?.text || payload || '') }); return { key: { id } }; },
    async react() { return true; }
  };
}

function fixtureEntries(db, period = '2026.2') { return db.listProfessorScheduleEntries({ academicPeriod: period, activeOnly: true }); }

// 1, 2, 11, 12 e 13
test('modelo unificado corrige entidades, aceita múltiplas intenções, negações e alternativas', () => {
  const options = { scheduleEntries: STATIC_DISCIPLINES, teachers: [], allowShortStandalone: true, now: Date.UTC(2026, 7, 4, 15) };
  const multiple = analyzeUnifiedQuery('qual é o professor e a sala de AP?', options);
  assert.deepEqual(multiple.intents, ['room', 'professor']);
  assert.equal(multiple.entities.disciplines[0]?.code, 'AP');

  const disciplineCorrection = analyzeUnifiedQuery('não é AP, é Cálculo', options);
  assert.equal(disciplineCorrection.entities.disciplines[0]?.code, 'CDAC');
  assert.equal(disciplineCorrection.corrections.at(-1)?.field, 'discipline');

  const dateCorrection = analyzeUnifiedQuery('é hoje, não amanhã', options);
  assert.equal(dateCorrection.entities.targetDate?.expression, 'hoje');

  const exclusion = analyzeUnifiedQuery('quero apenas a sala de AP, sem contato', options);
  assert.deepEqual(exclusion.intents, ['room']);
  assert.ok(exclusion.excludedIntents.includes('contact'));
  assert.equal(exclusion.entities.disciplines[0]?.code, 'AP');

  const calculatorExclusion = analyzeUnifiedQuery('não quero a calculadora da final', options);
  assert.ok(calculatorExclusion.excludedIntents.includes('calculator'));
  assert.ok(multiple.alternatives.length >= 2);
});

test('motor responde somente aos vários campos pedidos', () => {
  const h = harness();
  try {
    const result = h.engine.simulate('qual é o professor e a sala de AP?', { isGroup: false, ignorePermissions: true });
    assert.match(result.text, /Professor:/u);
    assert.match(result.text, /Sala:/u);
    assert.doesNotMatch(result.text, /Contato:|Horário:/u);
  } finally { h.close(); }
});

// 3 e 11
test('catálogo permanente independe da oferta e diferencia disciplina sem dados', () => {
  const h = harness();
  try {
    const saved = h.db.saveAcademicDiscipline({ code: 'TST', name: 'Tópicos de Teste', aliases: ['teste permanente'] });
    assert.equal(h.db.getAcademicDiscipline('TST').id, saved.id);
    const result = h.engine.simulate('qual sala de Tópicos de Teste?', { isGroup: false, ignorePermissions: true });
    assert.equal(result.type, 'academic_data_missing');
    assert.match(result.text, /Reconheci a disciplina/u);
    assert.match(result.text, /não há oferta cadastrada/u);
  } finally { h.close(); }
});

// 4
test('busca guiada filtra por semestre, professor e assunto', () => {
  const h = harness();
  try {
    const entries = fixtureEntries(h.db); const teachers = h.db.listTeachers({ activeOnly: true });
    const semester = guidedDisciplineCandidates('é do terceiro semestre', { entries, teachers });
    assert.ok(semester.length > 1);
    assert.ok(semester.every(item => item.semesters.includes(3)));
    const topic = guidedDisciplineCandidates('é uma de banco de dados', { entries, teachers });
    assert.ok(topic.some(item => /Banco de Dados/u.test(item.name)));
  } finally { h.close(); }
});

// 5
test('contexto de reply explícito usa validade maior que o contexto comum', async () => {
  const h = harness(); const replies = [];
  try {
    const message = msg('quem ensina AP?', replies);
    await h.engine.handle(message);
    const quotedKey = h.engine.replyContextKey(message, replies[0].id);
    const conversation = h.engine.conversationContexts.get(h.engine.conversationKey(message));
    const quoted = h.engine.replyContexts.get(quotedKey);
    assert.ok(quoted.expiresAt - quoted.createdAt >= 23 * 60 * 60 * 1000);
    assert.ok(conversation.expiresAt - conversation.createdAt <= 15 * 60 * 1000);
  } finally { h.close(); }
});

// 6 e 23
test('nova solicitação é detectada por classificador único e estado é validado', () => {
  assert.equal(looksLikeCompleteRequest('me passa o contato da biblioteca'), true);
  assert.equal(looksLikeCompleteRequest('queria agora saber sobre estágio'), true);
  assert.equal(validateConversationState({ intents: ['room'], invalidAttempts: 1, discipline: { code: 'AP' } }).valid, true);
  assert.equal(validateConversationState({ intents: 'room', invalidAttempts: -1, discipline: {} }).valid, false);
  const merged = mergeQueryState({ intents: ['room'], discipline: { code: 'AP', name: 'Algoritmo e Programação' } }, analyzeUnifiedQuery('não é AP, é Cálculo', { scheduleEntries: STATIC_DISCIPLINES, allowShortStandalone: true }));
  assert.equal(merged.discipline.code, 'CDAC');
});

// 7, 8, 16, 17 e 18
test('aprendizado negativo é explicado, generalizado, agrupado, simulado e expirável', () => {
  const h = harness();
  try {
    const card = h.db.saveAutomaticMessage({ title: 'Calculadora da final', topic: 'Calculadoras', response_text: 'Use !final.', trigger: { sentences: ['calcular nota final'], negative_examples: [] }, active: true });
    const suggestion = h.db.addNegativeExampleSuggestion({ message_excerpt: 'quando é a final de cálculo?', message_id: card.id, message_title: card.title });
    assert.match(suggestion.explanation.summary, /Calculadora da final/iu);
    assert.deepEqual(suggestion.pattern.negative_terms, ['quando']);
    const impact = previewLearningImpact({ db: h.db, engine: h.engine, type: 'negative', id: suggestion.id, applyPattern: true });
    assert.ok(Array.isArray(impact.variants)); assert.ok(impact.regressions);
    h.db.saveLearningImpactPreview({ suggestion_type: 'negative', suggestion_id: suggestion.id, impact });
    assert.ok(h.db.getLearningImpactPreview('negative', suggestion.id));
    const same = h.db.addNegativeExampleSuggestion({ message_excerpt: 'quando é a final de cálculo?', message_id: card.id, message_title: card.title });
    assert.equal(same.occurrences, 2);
    assert.ok(h.db.listLearningSuggestionGroups().some(group => group.type === 'negative' && group.occurrences >= 2));
    h.db.db.prepare("UPDATE negative_example_suggestions SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(suggestion.id);
    assert.equal(h.db.archiveExpiredLearningSuggestions().archived, 1);
  } finally { h.close(); }
});

// 9 e 19
test('simulador executa conversa completa e pode armazená-la', async () => {
  const h = harness();
  try {
    const simulation = await simulateConversation(h.engine, h.db, ['sala', 'AP']);
    assert.equal(simulation.results.length, 2);
    assert.match(simulation.results[0].replies[0].text, /disciplina/u);
    assert.match(simulation.results[1].replies[0].text, /H204/u);
    const saved = h.db.saveConversationSimulation({ title: 'Sala por complemento', messages: simulation.messages, results: simulation.results, savedAsTest: true });
    assert.equal(saved.saved_as_test, true);
  } finally { h.close(); }
});

test('correção contextual funciona depois de uma resposta normal e preserva a intenção', async () => {
  const h = harness();
  try {
    const corrected = await simulateConversation(h.engine, h.db, ['qual sala de AP?', 'não é AP, é Cálculo']);
    const correctionText = corrected.results[1].replies.map(item => item.text).join('\n');
    assert.match(correctionText, /CDAC/u);
    assert.match(correctionText, /Sala:/u);
    assert.doesNotMatch(correctionText, /\*AP —/u);

    const changedIntent = await simulateConversation(h.engine, h.db, ['qual sala de AP?', 'e o horário?', 'não, quero o contato']);
    const contactText = changedIntent.results[2].replies.map(item => item.text).join('\n');
    assert.match(contactText, /Contato:/u);
    assert.doesNotMatch(contactText, /Encontrei estes assuntos relacionados/u);
  } finally { h.close(); }
});

// 10
test('corpora permanentes foram ampliados e incluem conversas executáveis', () => {
  const messages = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/message-corpus.json'), 'utf8'));
  const conversations = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/conversation-corpus.json'), 'utf8'));
  assert.ok(messages.length >= 250);
  assert.ok(conversations.length >= 100);
  assert.ok(conversations.some(item => Array.isArray(item.messages) && item.messages.length > 1));
  assert.equal(fs.existsSync(path.join(__dirname, '../scripts/run-conversation-corpus.js')), true);
  assert.ok(conversations.every(item => item.messages.every(message => typeof message === 'object' && Array.isArray(message.expect))));
});

// 14
test('preferências locais guardam semestre, disciplina, professor e data sem substituir pergunta nova', () => {
  const store = new LocalPreferenceStore({ ttlMs: 60000 });
  const preferences = preferencesFromSubject({ kind: 'discipline_card', disciplineNames: ['Algoritmo e Programação'], teacherNames: ['Liojes de Oliveira Carneiro'], semester: 1, targetDate: '2026-08-07', dayIndex: 5, intents: ['room'] });
  store.set('u', preferences);
  assert.equal(store.get('u').discipline, 'Algoritmo e Programação');
  const contextual = applyLocalPreferences({ semester: 0, targetDate: null }, store.get('u'), 'e sexta?');
  assert.equal(contextual.semester, 1); assert.equal(contextual.targetDate.iso, '2026-08-07');
  const independent = applyLocalPreferences({ semester: 0, targetDate: null }, store.get('u'), 'qual o contato da biblioteca?');
  assert.equal(independent.localPreferencesApplied, undefined);
});

// 15 e 25
test('fragmentos e variações geradas cobrem escrita natural sem atrasar mensagens completas', async () => {
  assert.equal(isLikelyFragment('qual sala'), true);
  assert.equal(isLikelyFragment('de AP'), true);
  assert.equal(isLikelyFragment('qual sala de AP?'), false);
  const variants = messageVariants('qual sala de AP?');
  assert.ok(variants.includes('QUAL SALA DE AP?'));
  const buffer = new FragmentBuffer({ windowMs: 250 }); const received = [];
  const flush = items => { received.push(items.join(' ')); };
  buffer.push('u', 'qual sala', { flush });
  buffer.push('u', 'de AP', { flush });
  buffer.flushNow('u', flush);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(received, ['qual sala de AP']);
});

// 20
test('métricas são agregadas por intenção e resultado', () => {
  const h = harness();
  try {
    h.db.recordIntentMetric({ context_key: 'u', intent: 'room', outcome: 'direct', attempts: 0, confidence: 0.95 });
    h.db.recordIntentMetric({ context_key: 'u', intent: 'room', outcome: 'clarification', missing_field: 'discipline', attempts: 1, confidence: 0.6 });
    const metrics = h.db.intentMetrics({ days: 1 });
    assert.ok(metrics.some(item => item.intent === 'room' && item.outcome === 'direct'));
    assert.ok(metrics.some(item => item.missing_field === 'discipline'));
  } finally { h.close(); }
});

// 21, 22 e 24
test('pipeline está modularizado e executor de testes isola arquivos', () => {
  for (const file of ['activation-pipeline.js', 'fragment-buffer.js', 'guided-discipline-search.js', 'local-preferences.js', 'query-model.js', 'professor-intent-handler.js', 'sector-intent-handler.js', 'semester-intent-handler.js']) {
    assert.equal(fs.existsSync(path.join(__dirname, '../src/engine', file)), true, file);
  }
  const runner = fs.readFileSync(path.join(__dirname, '../scripts/run-test-group.js'), 'utf8');
  assert.match(runner, /spawnSync|spawn/u);
  assert.match(runner, /test-concurrency[^\n]*1/u);
  assert.match(runner, /HUB_TEST_RUN_ID/u);
});

// 26
test('período acadêmico pode ser preparado, comparado e publicado', () => {
  const h = harness();
  try {
    const previous = fixtureEntries(h.db, '2026.2');
    const sample = previous.slice(0, 2).map((item, index) => ({ ...item, id: undefined, academic_period: '2027.1', room: index ? '' : 'H204' }));
    const preview = h.db.previewAcademicPeriodImport(sample, { period: '2027.1', previousPeriod: '2026.2' });
    assert.equal(preview.period, '2027.1'); assert.equal(preview.incoming, 2); assert.equal(preview.missingRooms.length, 1);
    for (const item of sample) h.db.saveProfessorScheduleEntry(item);
    h.db.saveAcademicPeriod({ period: '2027.1', state: 'draft', entry_count: sample.length, previous_period: '2026.2', summary: preview });
    const published = h.db.publishAcademicPeriod('2027.1', { previous_period: '2026.2' });
    assert.equal(published.state, 'published'); assert.equal(h.db.getSetting('current_academic_period'), '2027.1');
    assert.equal(h.db.getAcademicPeriod('2026.2').state, 'historical');
  } finally { h.close(); }
});

// 27 e 28
test('validade e precedência acadêmica escolhem a exceção correta', () => {
  const entries = [
    { id: 1, discipline_code: 'AP', valid_from: '2026-08-01', valid_until: '2026-08-31', precedence: 100 },
    { id: 2, discipline_code: 'AP', valid_from: '2026-09-01', valid_until: '2026-09-30', precedence: 550 }
  ];
  assert.deepEqual(filterScheduleByValidity(entries, '2026-08-15').map(item => item.id), [1]);
  const resolved = resolveAcademicEventLayers([
    { id: 1, event_type: 'regular', precedence: PRECEDENCE.regular, start_date: '2026-08-04', end_date: '2026-08-04' },
    { id: 2, event_type: 'room_change', precedence: PRECEDENCE.room_change, start_date: '2026-08-04', end_date: '2026-08-04' },
    { id: 3, event_type: 'no_classes', precedence: PRECEDENCE.no_classes, start_date: '2026-08-04', end_date: '2026-08-04' }
  ], { date: '2026-08-04' });
  assert.equal(resolved.winner.id, 3);
  assert.ok(resolved.suppressed.length >= 2);
});

// Painel das melhorias 8, 9, 16, 19, 20, 26 e 27
test('painel expõe simulação, impacto, métricas, ações e gestão acadêmica', () => {
  const server = fs.readFileSync(path.join(__dirname, '../src/admin-server.js'), 'utf8');
  for (const marker of ['learning-impact', '/api/simulator/conversation', '/api/quality/intent-metrics', '/api/diagnostics/', '/api/academic-disciplines', '/api/academic-periods/preview', '/publish']) assert.ok(server.includes(marker), marker);
  const quality = fs.readFileSync(path.join(__dirname, '../public/js/quality.js'), 'utf8');
  assert.match(quality, /Simulador de conversa|intent-metrics/u);
  const academic = fs.readFileSync(path.join(__dirname, '../public/js/academic.js'), 'utf8');
  assert.match(academic, /Catálogo permanente|Publicar período|validade/u);
});
