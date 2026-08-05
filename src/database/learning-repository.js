'use strict';

const { normalizeText } = require('../text');
function nowIso() { return new Date().toISOString(); }
function parseJson(value, fallback = []) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function expiryIso(days = 180) { return new Date(Date.now() + Math.max(1, Number(days || 180)) * 86400000).toISOString(); }
function inferNegativePattern(message = '', title = '') {
  const normalized = normalizeText(message); const target = normalizeText(title);
  const termSets = {
    temporal: ['quando','data','dia','prova','calendario'],
    calculation: ['calcular','nota','media','quanto preciso','tirar'],
    location: ['sala','onde','local','bloco','laboratorio'],
    contact: ['contato','email','telefone','whatsapp'],
    identity: ['quem','professor','docente','ministra','ensina']
  };
  const found = Object.fromEntries(Object.entries(termSets).map(([key, terms]) => [key, terms.filter(term => normalized.includes(term))]));
  if (/calculadora|nota final/u.test(target) && found.temporal.length && !found.calculation.length) return { kind: 'contrastive-terms', negative_terms: found.temporal, required_absent_terms: found.calculation, rationale: 'A frase trata de data/prova, não de cálculo de nota.' };
  if (/contato/u.test(target) && found.location.length && !found.contact.length) return { kind: 'contrastive-terms', negative_terms: found.location, required_absent_terms: found.contact, rationale: 'A frase trata de localização, não de contato.' };
  if (/sala|localizacao|localização/u.test(target) && found.contact.length && !found.location.length) return { kind: 'contrastive-terms', negative_terms: found.contact, required_absent_terms: found.location, rationale: 'A frase trata de contato, não de localização.' };
  if (/professor/u.test(target) && found.temporal.length && !found.identity.length) return { kind: 'contrastive-terms', negative_terms: found.temporal, required_absent_terms: found.identity, rationale: 'A frase traz uma referência temporal sem pedir identificação docente.' };
  return {};
}

function explanationForSuggestion({ message = '', title = '', reasons = [] } = {}) {
  return { summary: `A frase foi associada a “${title || 'um card'}”.`, positive_evidence: reasons || [], negative_evidence: [], normalized_message: normalizeText(message) };
}

module.exports = function createLearningRepositoryMixin() {
  return class {
    addUnrecognizedSuggestion(input = {}) {
      const excerpt = String(input.message_excerpt || input.message || '').trim().slice(0, 300);
      const normalized = normalizeText(input.normalized_message || excerpt).slice(0, 300);
      if (!normalized || normalized.length < 3) return null;
      const suggestedId = Number(input.suggested_message_id || 0) || null;
      const existing = this.db.prepare(`SELECT id FROM unrecognized_suggestions
        WHERE normalized_message=? AND state='pending' AND COALESCE(suggested_message_id,0)=COALESCE(?,0)
        ORDER BY id DESC LIMIT 1`).get(normalized, suggestedId);
      const timestamp = nowIso();
      if (existing) {
        this.db.prepare(`UPDATE unrecognized_suggestions SET occurrences=occurrences+1,last_seen_at=?,chat_name=?,confidence=?,reasons_json=? WHERE id=?`)
          .run(timestamp, String(input.chat_name || '').slice(0, 160), Math.max(0, Math.min(1, Number(input.confidence || 0))), JSON.stringify(input.reasons || []), Number(existing.id));
        return this.getUnrecognizedSuggestion(existing.id);
      }
      const result = this.db.prepare(`INSERT INTO unrecognized_suggestions
        (normalized_message,message_excerpt,chat_type,chat_name,suggested_message_id,suggested_title,confidence,reasons_json,state,occurrences,created_at,last_seen_at,reviewed_at,explanation_json,expires_at,archived_at)
        VALUES (?,?,?,?,?,?,?,?,'pending',1,?,?,'',?,?, '')`).run(
        normalized, excerpt, String(input.chat_type || 'private').slice(0, 20), String(input.chat_name || '').slice(0, 160), suggestedId,
        String(input.suggested_title || '').slice(0, 180), Math.max(0, Math.min(1, Number(input.confidence || 0))), JSON.stringify(input.reasons || []), timestamp, timestamp,
        JSON.stringify(explanationForSuggestion({ message: excerpt, title: input.suggested_title, reasons: input.reasons })), expiryIso(this.getSetting?.('learning_suggestion_expiry_days', '180'))
      );
      return this.getUnrecognizedSuggestion(result.lastInsertRowid);
    }

    getUnrecognizedSuggestion(id) {
      const row = this.db.prepare('SELECT * FROM unrecognized_suggestions WHERE id=?').get(Number(id));
      return row ? { ...row, id: Number(row.id), suggested_message_id: row.suggested_message_id ? Number(row.suggested_message_id) : null,
        confidence: Number(row.confidence || 0), occurrences: Number(row.occurrences || 1), reasons: parseJson(row.reasons_json, []), explanation: parseJson(row.explanation_json, {}) } : null;
    }

    listUnrecognizedSuggestions({ state = 'pending', limit = 200 } = {}) {
      const cleanState = ['pending','approved','rejected','all'].includes(String(state)) ? String(state) : 'pending';
      let sql = 'SELECT * FROM unrecognized_suggestions'; const params = [];
      if (cleanState !== 'all') { sql += ' WHERE state=?'; params.push(cleanState); }
      sql += ' ORDER BY last_seen_at DESC,id DESC LIMIT ?'; params.push(Math.max(1, Math.min(1000, Number(limit || 200))));
      return this.db.prepare(sql).all(...params).map(row => ({ ...row, id: Number(row.id), suggested_message_id: row.suggested_message_id ? Number(row.suggested_message_id) : null,
        confidence: Number(row.confidence || 0), occurrences: Number(row.occurrences || 1), reasons: parseJson(row.reasons_json, []), explanation: parseJson(row.explanation_json, {}) }));
    }

    approveUnrecognizedSuggestion(id, options = {}) {
      const suggestion = this.getUnrecognizedSuggestion(id);
      if (!suggestion || suggestion.state !== 'pending') throw new Error('Sugestão pendente não encontrada.');
      if (!suggestion.suggested_message_id) throw new Error('A sugestão não possui um card associado.');
      const current = this.getAutomaticMessage(suggestion.suggested_message_id);
      if (!current) throw new Error('O card sugerido não existe mais.');
      const effective = current.draft || current;
      const trigger = { ...(effective.trigger || {}) };
      trigger.sentences = [...new Set([...(trigger.sentences || []), suggestion.message_excerpt].map(item => String(item || '').trim()).filter(Boolean))];
      const triggerPolicy = { ...(effective.trigger_policy || {}) };
      if (options.apply_pattern && suggestion.pattern?.kind === 'contrastive-terms') {
        triggerPolicy.negative_terms = [...new Set([...(triggerPolicy.negative_terms || []), ...(suggestion.pattern.negative_terms || [])])];
      }
      const saved = this.saveAutomaticMessage({ ...effective, title: effective.title, trigger, trigger_policy: triggerPolicy }, current.id);
      this.db.prepare("UPDATE unrecognized_suggestions SET state='approved',reviewed_at=? WHERE id=?").run(nowIso(), Number(id));
      return { suggestion: this.getUnrecognizedSuggestion(id), message: saved };
    }

    rejectUnrecognizedSuggestion(id) {
      const result = this.db.prepare("UPDATE unrecognized_suggestions SET state='rejected',reviewed_at=? WHERE id=? AND state='pending'").run(nowIso(), Number(id));
      if (!result.changes) throw new Error('Sugestão pendente não encontrada.');
      return this.getUnrecognizedSuggestion(id);
    }


    addNegativeExampleSuggestion(input = {}) {
      const excerpt = String(input.message_excerpt || input.message || '').trim().slice(0, 500);
      const normalized = normalizeText(input.normalized_message || excerpt).slice(0, 500);
      const messageId = Number(input.message_id || 0);
      if (!normalized || normalized.length < 3 || !messageId) return null;
      const existing = this.db.prepare(`SELECT id FROM negative_example_suggestions
        WHERE normalized_message=? AND message_id=? AND state='pending' ORDER BY id DESC LIMIT 1`).get(normalized, messageId);
      const timestamp = nowIso();
      if (existing) {
        this.db.prepare(`UPDATE negative_example_suggestions SET occurrences=occurrences+1,last_seen_at=?,message_title=?,source=?,chat_type=? WHERE id=?`)
          .run(timestamp, String(input.message_title || '').slice(0, 180), String(input.source || 'suggestion_rejected').slice(0, 60), String(input.chat_type || 'private').slice(0, 20), Number(existing.id));
        return this.getNegativeExampleSuggestion(existing.id);
      }
      const result = this.db.prepare(`INSERT INTO negative_example_suggestions
        (normalized_message,message_excerpt,message_id,message_title,source,chat_type,occurrences,state,created_at,last_seen_at,reviewed_at,explanation_json,pattern_json,expires_at,archived_at)
        VALUES (?,?,?,?,?,?,1,'pending',?,?,'',?,?,?, '')`).run(normalized, excerpt, messageId,
          String(input.message_title || '').slice(0, 180), String(input.source || 'suggestion_rejected').slice(0, 60),
          String(input.chat_type || 'private').slice(0, 20), timestamp, timestamp,
          JSON.stringify(explanationForSuggestion({ message: excerpt, title: input.message_title, reasons: ['sugestão rejeitada pelo usuário'] })),
          JSON.stringify(inferNegativePattern(excerpt, input.message_title)), expiryIso(this.getSetting?.('learning_suggestion_expiry_days', '180')));
      return this.getNegativeExampleSuggestion(result.lastInsertRowid);
    }

    getNegativeExampleSuggestion(id) {
      const row = this.db.prepare('SELECT * FROM negative_example_suggestions WHERE id=?').get(Number(id));
      return row ? { ...row, id: Number(row.id), message_id: Number(row.message_id), occurrences: Number(row.occurrences || 1), explanation: parseJson(row.explanation_json, {}), pattern: parseJson(row.pattern_json, {}) } : null;
    }

    listNegativeExampleSuggestions({ state = 'pending', limit = 200 } = {}) {
      const cleanState = ['pending','approved','rejected','all'].includes(String(state)) ? String(state) : 'pending';
      let sql = 'SELECT * FROM negative_example_suggestions'; const params = [];
      if (cleanState !== 'all') { sql += ' WHERE state=?'; params.push(cleanState); }
      sql += ' ORDER BY last_seen_at DESC,id DESC LIMIT ?'; params.push(Math.max(1, Math.min(1000, Number(limit || 200))));
      return this.db.prepare(sql).all(...params).map(row => ({ ...row, id: Number(row.id), message_id: Number(row.message_id), occurrences: Number(row.occurrences || 1), explanation: parseJson(row.explanation_json, {}), pattern: parseJson(row.pattern_json, {}) }));
    }

    approveNegativeExampleSuggestion(id, options = {}) {
      const suggestion = this.getNegativeExampleSuggestion(id);
      if (!suggestion || suggestion.state !== 'pending') throw new Error('Exemplo negativo pendente não encontrado.');
      const current = this.getAutomaticMessage(suggestion.message_id);
      if (!current) throw new Error('O card associado não existe mais.');
      const effective = current.draft || current;
      const trigger = { ...(effective.trigger || {}) };
      trigger.negative_examples = [...new Set([...(trigger.negative_examples || []), suggestion.message_excerpt]
        .map(item => String(item || '').trim()).filter(Boolean))];
      const triggerPolicy = { ...(effective.trigger_policy || {}) };
      if (options.apply_pattern && suggestion.pattern?.kind === 'contrastive-terms') {
        triggerPolicy.negative_terms = [...new Set([...(triggerPolicy.negative_terms || []), ...(suggestion.pattern.negative_terms || [])])];
      }
      let saved = this.saveAutomaticMessage({ ...effective, title: effective.title, trigger }, current.id);
      if (options.apply_pattern && suggestion.pattern?.kind === 'contrastive-terms') saved = this.setAutomaticMessageTriggerPolicy(current.id, triggerPolicy);
      this.db.prepare("UPDATE negative_example_suggestions SET state='approved',reviewed_at=? WHERE id=?").run(nowIso(), Number(id));
      return { suggestion: this.getNegativeExampleSuggestion(id), message: saved };
    }

    rejectNegativeExampleSuggestion(id) {
      const result = this.db.prepare("UPDATE negative_example_suggestions SET state='rejected',reviewed_at=? WHERE id=? AND state='pending'").run(nowIso(), Number(id));
      if (!result.changes) throw new Error('Exemplo negativo pendente não encontrado.');
      return this.getNegativeExampleSuggestion(id);
    }

    addDisciplineAliasSuggestion(input = {}) {
      const alias = String(input.alias || '').trim().slice(0, 160);
      const normalized = normalizeText(alias);
      const disciplineName = String(input.discipline_name || '').trim().slice(0, 180);
      if (!normalized || normalized.length < 2 || !disciplineName) return null;
      const alreadyActive = this.db.prepare('SELECT id FROM discipline_aliases WHERE normalized_alias=? AND discipline_name=? AND active=1')
        .get(normalized, disciplineName);
      if (alreadyActive) return null;
      const existing = this.db.prepare(`SELECT id FROM discipline_alias_suggestions
        WHERE normalized_alias=? AND discipline_name=? AND state='pending' ORDER BY id DESC LIMIT 1`).get(normalized, disciplineName);
      const timestamp = nowIso();
      if (existing) {
        this.db.prepare(`UPDATE discipline_alias_suggestions SET occurrences=occurrences+1,last_seen_at=?,alias=?,discipline_code=?,original_message=?,chat_type=? WHERE id=?`)
          .run(timestamp, alias, String(input.discipline_code || '').slice(0, 30).toUpperCase(), String(input.original_message || '').slice(0, 500),
            String(input.chat_type || 'private').slice(0, 20), Number(existing.id));
        return this.getDisciplineAliasSuggestion(existing.id);
      }
      const result = this.db.prepare(`INSERT INTO discipline_alias_suggestions
        (normalized_alias,alias,discipline_code,discipline_name,original_message,chat_type,occurrences,state,created_at,last_seen_at,reviewed_at,variants_json,confidence,expires_at,archived_at)
        VALUES (?,?,?,?,?,?,1,'pending',?,?,'',?,?,?, '')`).run(normalized, alias, String(input.discipline_code || '').slice(0, 30).toUpperCase(),
          disciplineName, String(input.original_message || '').slice(0, 500), String(input.chat_type || 'private').slice(0, 20), timestamp, timestamp,
          JSON.stringify([alias]), Math.max(0, Math.min(1, Number(input.confidence || 0.8))), expiryIso(this.getSetting?.('learning_suggestion_expiry_days', '180')));
      return this.getDisciplineAliasSuggestion(result.lastInsertRowid);
    }

    getDisciplineAliasSuggestion(id) {
      const row = this.db.prepare('SELECT * FROM discipline_alias_suggestions WHERE id=?').get(Number(id));
      return row ? { ...row, id: Number(row.id), occurrences: Number(row.occurrences || 1), confidence: Number(row.confidence || 0), variants: parseJson(row.variants_json, []) } : null;
    }

    listDisciplineAliasSuggestions({ state = 'pending', limit = 200 } = {}) {
      const cleanState = ['pending','approved','rejected','all'].includes(String(state)) ? String(state) : 'pending';
      let sql = 'SELECT * FROM discipline_alias_suggestions'; const params = [];
      if (cleanState !== 'all') { sql += ' WHERE state=?'; params.push(cleanState); }
      sql += ' ORDER BY last_seen_at DESC,id DESC LIMIT ?'; params.push(Math.max(1, Math.min(1000, Number(limit || 200))));
      return this.db.prepare(sql).all(...params).map(row => ({ ...row, id: Number(row.id), occurrences: Number(row.occurrences || 1), confidence: Number(row.confidence || 0), variants: parseJson(row.variants_json, []) }));
    }

    approveDisciplineAliasSuggestion(id) {
      const suggestion = this.getDisciplineAliasSuggestion(id);
      if (!suggestion || suggestion.state !== 'pending') throw new Error('Alias pendente não encontrado.');
      const timestamp = nowIso();
      this.db.prepare(`INSERT INTO discipline_aliases(normalized_alias,alias,discipline_code,discipline_name,source,active,created_at,updated_at)
        VALUES (?,?,?,?, 'admin-approved',1,?,?)
        ON CONFLICT(normalized_alias,discipline_name) DO UPDATE SET alias=excluded.alias,discipline_code=excluded.discipline_code,active=1,updated_at=excluded.updated_at`)
        .run(suggestion.normalized_alias, suggestion.alias, suggestion.discipline_code, suggestion.discipline_name, timestamp, timestamp);
      this.db.prepare("UPDATE discipline_alias_suggestions SET state='approved',reviewed_at=? WHERE id=?").run(timestamp, Number(id));
      return { suggestion: this.getDisciplineAliasSuggestion(id), alias: this.db.prepare('SELECT * FROM discipline_aliases WHERE normalized_alias=? AND discipline_name=?').get(suggestion.normalized_alias, suggestion.discipline_name) };
    }

    rejectDisciplineAliasSuggestion(id) {
      const result = this.db.prepare("UPDATE discipline_alias_suggestions SET state='rejected',reviewed_at=? WHERE id=? AND state='pending'").run(nowIso(), Number(id));
      if (!result.changes) throw new Error('Alias pendente não encontrado.');
      return this.getDisciplineAliasSuggestion(id);
    }

    listDisciplineAliases({ activeOnly = true } = {}) {
      let sql = 'SELECT * FROM discipline_aliases';
      if (activeOnly) sql += ' WHERE active=1';
      sql += ' ORDER BY discipline_name,alias';
      return this.db.prepare(sql).all().map(row => ({ ...row, id: Number(row.id), active: Boolean(row.active) }));
    }

    listLearningSuggestionGroups({ state = 'pending' } = {}) {
      const groups = new Map();
      const add = (type, item, target, variant) => {
        const stem = normalizeText(variant).replace(/(?:s|es)$/u, '').replace(/\s+/gu, ' ').slice(0, 120);
        const key = `${type}|${normalizeText(target)}|${stem}`;
        if (!groups.has(key)) groups.set(key, { type, target, variants: [], occurrences: 0, suggestion_ids: [], first_seen_at: item.created_at, last_seen_at: item.last_seen_at, confidence_sum: 0 });
        const group = groups.get(key); group.variants.push(variant); group.occurrences += Number(item.occurrences || 1); group.suggestion_ids.push(item.id); group.confidence_sum += Number(item.confidence || 0);
        if (String(item.last_seen_at) > String(group.last_seen_at)) group.last_seen_at = item.last_seen_at;
      };
      for (const item of this.listDisciplineAliasSuggestions({ state, limit: 1000 })) add('discipline_alias', item, [item.discipline_code,item.discipline_name].filter(Boolean).join(' — '), item.alias);
      for (const item of this.listUnrecognizedSuggestions({ state, limit: 1000 })) add('positive', item, item.suggested_title || 'Sem card', item.message_excerpt);
      for (const item of this.listNegativeExampleSuggestions({ state, limit: 1000 })) add('negative', item, item.message_title || `Card #${item.message_id}`, item.message_excerpt);
      return [...groups.values()].map(group => ({ ...group, variants: [...new Set(group.variants)], average_confidence: group.suggestion_ids.length ? group.confidence_sum / group.suggestion_ids.length : 0 })).sort((a, b) => b.occurrences - a.occurrences);
    }

    archiveExpiredLearningSuggestions(now = new Date()) {
      const timestamp = now instanceof Date ? now.toISOString() : String(now || nowIso());
      let archived = 0;
      for (const table of ['unrecognized_suggestions', 'negative_example_suggestions', 'discipline_alias_suggestions']) {
        const exists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) continue;
        archived += Number(this.db.prepare(`UPDATE ${table} SET state='archived',archived_at=? WHERE state='pending' AND expires_at<>'' AND expires_at<?`).run(timestamp, timestamp).changes || 0);
      }
      return { archived };
    }

    saveLearningImpactPreview({ suggestion_type, suggestion_id, impact, ttlMinutes = 30 } = {}) {
      const created = nowIso(); const expires = new Date(Date.now() + Math.max(1, Number(ttlMinutes || 30)) * 60000).toISOString();
      const result = this.db.prepare(`INSERT INTO learning_impact_previews(suggestion_type,suggestion_id,impact_json,created_at,expires_at) VALUES (?,?,?,?,?)`)
        .run(String(suggestion_type || ''), Number(suggestion_id || 0), JSON.stringify(impact || {}), created, expires);
      return { id: Number(result.lastInsertRowid), suggestion_type, suggestion_id: Number(suggestion_id || 0), impact, created_at: created, expires_at: expires };
    }

    getLearningImpactPreview(type, id) {
      const row = this.db.prepare(`SELECT * FROM learning_impact_previews WHERE suggestion_type=? AND suggestion_id=? AND expires_at>? ORDER BY id DESC LIMIT 1`)
        .get(String(type || ''), Number(id || 0), nowIso());
      return row ? { ...row, id: Number(row.id), suggestion_id: Number(row.suggestion_id), impact: parseJson(row.impact_json, {}) } : null;
    }

    listRegressionCases({ activeOnly = false } = {}) {
      let sql = 'SELECT * FROM regression_cases';
      if (activeOnly) sql += ' WHERE active=1';
      sql += ' ORDER BY expectation DESC,id ASC';
      return this.db.prepare(sql).all().map(row => ({ ...row, id: Number(row.id), active: Boolean(row.active) }));
    }

    saveRegressionCase(input = {}, id = null) {
      const phrase = String(input.phrase || '').trim().slice(0, 500);
      if (!phrase) throw new Error('Informe a frase do teste.');
      const expectation = ['respond','ignore'].includes(String(input.expectation)) ? String(input.expectation) : 'respond';
      const expectedTitle = String(input.expected_title || '').trim().slice(0, 240);
      const active = input.active === undefined ? true : Boolean(input.active);
      const timestamp = nowIso(); const normalized = normalizeText(phrase);
      if (id) {
        const result = this.db.prepare('UPDATE regression_cases SET phrase=?,normalized_phrase=?,expectation=?,expected_title=?,active=?,updated_at=? WHERE id=?')
          .run(phrase, normalized, expectation, expectedTitle, active ? 1 : 0, timestamp, Number(id));
        if (!result.changes) throw new Error('Caso de regressão não encontrado.');
      } else {
        id = this.db.prepare('INSERT INTO regression_cases(phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
          .run(phrase, normalized, expectation, expectedTitle, active ? 1 : 0, timestamp, timestamp).lastInsertRowid;
      }
      return this.db.prepare('SELECT * FROM regression_cases WHERE id=?').get(Number(id));
    }

    deleteRegressionCase(id) {
      return { deleted: Number(this.db.prepare('DELETE FROM regression_cases WHERE id=?').run(Number(id)).changes || 0) };
    }

  };
};
