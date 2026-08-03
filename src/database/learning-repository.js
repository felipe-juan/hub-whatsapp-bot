'use strict';

const { normalizeText } = require('../text');
function nowIso() { return new Date().toISOString(); }
function parseJson(value, fallback = []) { try { return JSON.parse(value); } catch { return fallback; } }

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
        (normalized_message,message_excerpt,chat_type,chat_name,suggested_message_id,suggested_title,confidence,reasons_json,state,occurrences,created_at,last_seen_at,reviewed_at)
        VALUES (?,?,?,?,?,?,?,?,'pending',1,?,?,'')`).run(
        normalized, excerpt, String(input.chat_type || 'private').slice(0, 20), String(input.chat_name || '').slice(0, 160), suggestedId,
        String(input.suggested_title || '').slice(0, 180), Math.max(0, Math.min(1, Number(input.confidence || 0))), JSON.stringify(input.reasons || []), timestamp, timestamp
      );
      return this.getUnrecognizedSuggestion(result.lastInsertRowid);
    }

    getUnrecognizedSuggestion(id) {
      const row = this.db.prepare('SELECT * FROM unrecognized_suggestions WHERE id=?').get(Number(id));
      return row ? { ...row, id: Number(row.id), suggested_message_id: row.suggested_message_id ? Number(row.suggested_message_id) : null,
        confidence: Number(row.confidence || 0), occurrences: Number(row.occurrences || 1), reasons: parseJson(row.reasons_json, []) } : null;
    }

    listUnrecognizedSuggestions({ state = 'pending', limit = 200 } = {}) {
      const cleanState = ['pending','approved','rejected','all'].includes(String(state)) ? String(state) : 'pending';
      let sql = 'SELECT * FROM unrecognized_suggestions'; const params = [];
      if (cleanState !== 'all') { sql += ' WHERE state=?'; params.push(cleanState); }
      sql += ' ORDER BY last_seen_at DESC,id DESC LIMIT ?'; params.push(Math.max(1, Math.min(1000, Number(limit || 200))));
      return this.db.prepare(sql).all(...params).map(row => ({ ...row, id: Number(row.id), suggested_message_id: row.suggested_message_id ? Number(row.suggested_message_id) : null,
        confidence: Number(row.confidence || 0), occurrences: Number(row.occurrences || 1), reasons: parseJson(row.reasons_json, []) }));
    }

    approveUnrecognizedSuggestion(id) {
      const suggestion = this.getUnrecognizedSuggestion(id);
      if (!suggestion || suggestion.state !== 'pending') throw new Error('Sugestão pendente não encontrada.');
      if (!suggestion.suggested_message_id) throw new Error('A sugestão não possui um card associado.');
      const current = this.getAutomaticMessage(suggestion.suggested_message_id);
      if (!current) throw new Error('O card sugerido não existe mais.');
      const effective = current.draft || current;
      const trigger = { ...(effective.trigger || {}) };
      trigger.sentences = [...new Set([...(trigger.sentences || []), suggestion.message_excerpt].map(item => String(item || '').trim()).filter(Boolean))];
      const saved = this.saveAutomaticMessage({ ...effective, title: effective.title, trigger }, current.id);
      this.db.prepare("UPDATE unrecognized_suggestions SET state='approved',reviewed_at=? WHERE id=?").run(nowIso(), Number(id));
      return { suggestion: this.getUnrecognizedSuggestion(id), message: saved };
    }

    rejectUnrecognizedSuggestion(id) {
      const result = this.db.prepare("UPDATE unrecognized_suggestions SET state='rejected',reviewed_at=? WHERE id=? AND state='pending'").run(nowIso(), Number(id));
      if (!result.changes) throw new Error('Sugestão pendente não encontrada.');
      return this.getUnrecognizedSuggestion(id);
    }
  };
};
