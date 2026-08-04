'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database } = require('../src/database');
const { BotEngine } = require('../src/bot-engine');
const {
  SI_PROFESSORS_2026_2,
  buildSiProfessorExactNamePhrases
} = require('../src/si-professors-2026-2');
const { SEMESTER_WEEKLY_CARDS_V0143 } = require('../src/content/semester-weekly-cards');

function temporaryDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-v0144-'));
  const db = new Database(path.join(dir, 'hub.sqlite'), { seedBundledContent: true });
  db.setSettings({ cooldown_seconds: '0', private_context_without_reply: 'true' });
  return { dir, db, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function mockMessage(body, replies, from = '5577999999999@s.whatsapp.net') {
  return {
    fromMe: false, from, author: from, body, senderName: 'Estudante', timestampMs: Date.now(),
    quotedFromMe: false, mentionedMe: false,
    async getChat() { return { isGroup: false, id: { _serialized: from }, name: 'Estudante' }; },
    async sendResponse(payload) { replies.push(String(payload.text || '')); return { key: { id: `reply-${replies.length}` } }; }
  };
}

test('cards semanais aceitam formas diretas numéricas e por extenso', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const cases = [
      ['semestre 1', 1], ['1o semestre', 1], ['1º semestre', 1], ['primeiro semestre', 1],
      ['segundo semestre', 2], ['horários semestre 2', 2], ['horários e salas do semestre 3', 3],
      ['salas e horários do quarto semestre', 4], ['aulas semestre 5', 5],
      ['disciplinas semestre 6', 6], ['matérias do sétimo semestre', 7], ['horários e salas do 8º semestre', 8]
    ];
    for (const [phrase, semester] of cases) {
      const result = engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, phrase);
      assert.match(result.matchedItem, new RegExp(`${semester}º Semestre`, 'iu'), phrase);
      assert.match(result.text, new RegExp(`${semester}º semestre`, 'iu'), phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('consulta semanal sem número pede o semestre e aceita continuação curta', async () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db); const replies = [];
  try {
    const prompt = engine.simulate('horários e salas do semestre', { isGroup: false, ignorePermissions: true });
    assert.equal(prompt.type, 'semester_overview_prompt');
    assert.match(prompt.text, /Qual semestre/u);

    await engine.handle(mockMessage('horários e salas do semestre', replies));
    await engine.handle(mockMessage('3', replies));
    assert.equal(replies.length, 2);
    assert.match(replies[1], /Aulas e horários do 3º semestre/u);
    assert.match(replies[1], /Professor:/u);
    assert.match(replies[1], /Sala:/u);
  } finally { engine.close(); holder.close(); }
});

test('nome isolado de cada professor abre o card completo sem contaminar conversas maiores', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    for (const professor of SI_PROFESSORS_2026_2) {
      const alias = buildSiProfessorExactNamePhrases(professor).find(value => value.split(/\s+/u).length === 1) || professor.name;
      const result = engine.simulate(alias, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, alias);
      assert.equal(result.detectedIntent, 'informações completas', alias);
      assert.match(result.text, new RegExp(professor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), alias);
      assert.match(result.text, /Contato/u, alias);
      assert.match(result.text, /Horários e salas/u, alias);
    }
    for (const phrase of ['falei com Crijina ontem', 'o grupo comentou sobre Crescêncio', 'você conhece o Felipe?']) {
      const result = engine.evaluate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, false, phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('felipe e variações coerentes abrem o card pessoal', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    for (const phrase of ['felipe', 'felipe juan', 'contato do felipe', 'quem fez o bot?', 'quem criou o hub?', 'linktree felipe']) {
      const result = engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, phrase);
      assert.match(result.text, /Felipe Juan/u, phrase);
      assert.match(result.text, /felipe-juan\.github\.io\/hub-arquivos-ifba/u, phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('respostas seletivas usam tópicos, rótulos e sala destacada', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const room = engine.simulate('qual sala de LPI?', { isGroup: false, ignorePermissions: true });
    assert.equal(room.detectedIntent, 'sala');
    assert.match(room.text, /• \*Dia:\* segunda-feira/u);
    assert.match(room.text, /• \*Horário:\* 18h30/u);
    assert.match(room.text, /• \*Sala:\* \*H008\*/u);
    assert.doesNotMatch(room.text, /— 18h30.*— sala/u);

    const days = engine.simulate('em quais dias Amanda dá aula?', { isGroup: false, ignorePermissions: true });
    assert.match(days.text, /\*GGTI — Gestão e Governança de TI\*[\s\S]*• \*Dia:\* segunda-feira[\s\S]*• \*Horário:\*/u);
    assert.doesNotMatch(days.text, /Sala:/u);
  } finally { engine.close(); holder.close(); }
});

test('siglas e termos curtos inequívocos funcionam somente quando isolados', () => {
  const holder = temporaryDatabase(); const engine = new BotEngine(holder.db);
  try {
    const cases = [
      ['caens', /CAENS/u], ['cores', /CORES/u], ['capne', /CAPNE/u], ['biblioteca', /Biblioteca/u],
      ['psicologia', /Psicologia/u], ['final', /Média final/u], ['suap', /SUAP/u], ['ppc', /PPC/u],
      ['fluxograma', /Matriz curricular|Fluxograma|fluxograma/u], ['dasi', /DASI/u], ['btech', /BTech/u], ['acex', /ACEX|Atividades Curriculares/u],
      ['protocolo', /Protocolo|protocolo/u]
    ];
    for (const [phrase, pattern] of cases) {
      const result = engine.simulate(phrase, { isGroup: false, ignorePermissions: true });
      assert.equal(result.matched, true, phrase);
      assert.match(result.text, pattern, phrase);
    }
    for (const phrase of ['a gente falou do final ontem', 'comentaram sobre o ppc na reunião', 'mencionei o protocolo no grupo']) {
      assert.equal(engine.evaluate(phrase, { isGroup: false, ignorePermissions: true }).matched, false, phrase);
    }
  } finally { engine.close(); holder.close(); }
});

test('gatilhos novos não introduzem conflitos no conteúdo empacotado', () => {
  const holder = temporaryDatabase();
  try {
    assert.deepEqual(holder.db.getConflictReport(), { count: 0, conflicts: [] });
    assert.equal(SEMESTER_WEEKLY_CARDS_V0143.length, 8);
  } finally { holder.close(); }
});
