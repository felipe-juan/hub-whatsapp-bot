'use strict';
const { normalizeText } = require('../text');
function nowIso() { return new Date().toISOString(); }
function parse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
module.exports = function createQualityRepositoryMixin() {
  return class {
    saveConversationContext({ context_key, reply_key = '', subject_type, subject_id = '', payload = {}, expires_at }) {
      const now = nowIso();
      this.db.prepare(`INSERT INTO conversation_contexts(context_key,reply_key,subject_type,subject_id,payload_json,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(context_key) DO UPDATE SET reply_key=excluded.reply_key,subject_type=excluded.subject_type,
        subject_id=excluded.subject_id,payload_json=excluded.payload_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
        .run(String(context_key), String(reply_key), String(subject_type), String(subject_id), JSON.stringify(payload || {}), Number(expires_at), now, now);
    }
    getConversationContext(contextKey, replyKey = '') {
      const now = Date.now(); this.db.prepare('DELETE FROM conversation_contexts WHERE expires_at<=?').run(now);
      const row = replyKey
        ? this.db.prepare('SELECT * FROM conversation_contexts WHERE reply_key=? AND expires_at>? ORDER BY updated_at DESC LIMIT 1').get(String(replyKey), now)
        : this.db.prepare('SELECT * FROM conversation_contexts WHERE context_key=? AND expires_at>?').get(String(contextKey), now);
      return row ? { ...row, payload: parse(row.payload_json, {}), expires_at: Number(row.expires_at) } : null;
    }
    deleteConversationContexts(keys = []) {
      const stmt = this.db.prepare('DELETE FROM conversation_contexts WHERE context_key=?');
      for (const key of keys) stmt.run(String(key));
    }
    addTriggerObservation({ message_id = null, message_excerpt = '', chat_type = 'private', reasons = [] }) {
      const normalized = normalizeText(message_excerpt); if (!normalized) return null; const now = nowIso();
      this.db.prepare(`INSERT INTO trigger_observations(message_id,message_excerpt,normalized_message,chat_type,reasons_json,occurrences,first_seen_at,last_seen_at,state)
        VALUES (?,?,?,?,?,1,?,?,'pending') ON CONFLICT(message_id,normalized_message) DO UPDATE SET occurrences=occurrences+1,last_seen_at=excluded.last_seen_at`)
        .run(message_id ? Number(message_id) : null, String(message_excerpt).slice(0,500), normalized, String(chat_type), JSON.stringify(reasons || []), now, now);
      return this.db.prepare('SELECT * FROM trigger_observations WHERE message_id IS ? AND normalized_message=?').get(message_id ? Number(message_id) : null, normalized);
    }
    listTriggerObservations({ state = 'pending', limit = 100 } = {}) {
      return this.db.prepare("SELECT * FROM trigger_observations WHERE (?='' OR state=?) ORDER BY last_seen_at DESC LIMIT ?").all(state, state, Math.min(500, Number(limit || 100)))
        .map(row => ({ ...row, reasons: parse(row.reasons_json, []) }));
    }
    reviewTriggerObservation(id, state = 'reviewed') { return this.db.prepare('UPDATE trigger_observations SET state=? WHERE id=?').run(String(state), Number(id)).changes > 0; }
    addFalsePositiveReport(input = {}) {
      const now = nowIso();
      const result = this.db.prepare(`INSERT INTO false_positive_reports(original_message,matched_message_id,matched_title,response_excerpt,feedback_text,chat_type,state,created_at)
        VALUES (?,?,?,?,?,?,'pending',?)`).run(String(input.original_message || '').slice(0,1000), input.matched_message_id ? Number(input.matched_message_id) : null,
          String(input.matched_title || '').slice(0,300), String(input.response_excerpt || '').slice(0,1000), String(input.feedback_text || '').slice(0,500), String(input.chat_type || 'private'), now);
      return Number(result.lastInsertRowid);
    }
    listFalsePositiveReports({ state = 'pending', limit = 100 } = {}) { return this.db.prepare("SELECT * FROM false_positive_reports WHERE (?='' OR state=?) ORDER BY id DESC LIMIT ?").all(state,state,Math.min(500,Number(limit||100))); }
    reviewFalsePositiveReport(id, state = 'reviewed') { return this.db.prepare('UPDATE false_positive_reports SET state=?,reviewed_at=? WHERE id=?').run(String(state),nowIso(),Number(id)).changes > 0; }
    recordAcademicImport({ academic_period, source_title = '', source_version = '', source_date = '', entry_count = 0, checksum = '' }) {
      return Number(this.db.prepare('INSERT INTO academic_data_imports(academic_period,source_title,source_version,source_date,imported_at,entry_count,checksum) VALUES (?,?,?,?,?,?,?)')
        .run(String(academic_period),String(source_title),String(source_version),String(source_date),nowIso(),Number(entry_count),String(checksum)).lastInsertRowid);
    }
    academicDataStatus() {
      const period = this.getSetting('current_academic_period','2026.2'); const staleDays = Number(this.getSetting('academic_source_stale_days','120'));
      const latest = this.db.prepare('SELECT * FROM academic_data_imports WHERE academic_period=? ORDER BY id DESC LIMIT 1').get(period)
        || this.db.prepare(`SELECT academic_period,source_title,source_version,source_date,MAX(updated_at) AS imported_at,COUNT(*) AS entry_count,'' AS checksum FROM professor_schedule_entries WHERE academic_period=?`).get(period);
      const reference = latest?.source_date || latest?.imported_at || ''; const ageDays = reference ? Math.floor((Date.now() - new Date(reference).getTime())/86400000) : null;
      const staleCards = Number(this.db.prepare("SELECT COUNT(*) AS count FROM automatic_messages WHERE response_text LIKE '%2026.%' AND response_text NOT LIKE ?").get(`%${period}%`)?.count || 0);
      return { academic_period: period, latest: latest || null, age_days: ageDays, stale: ageDays === null || ageDays > staleDays, stale_cards: staleCards, stale_days_limit: staleDays };
    }
    saveCorpusCase(input = {}, id = null) {
      const now = nowIso(); const values=[String(input.message||''),String(input.expected_intent||''),String(input.expected_entity||''),String(input.expected_title||''),input.must_respond===false?0:1,input.active===false?0:1,String(input.source||'manual'),now];
      if(id){this.db.prepare('UPDATE message_corpus SET message=?,expected_intent=?,expected_entity=?,expected_title=?,must_respond=?,active=?,source=?,updated_at=? WHERE id=?').run(...values,Number(id));return Number(id);}
      return Number(this.db.prepare('INSERT INTO message_corpus(message,expected_intent,expected_entity,expected_title,must_respond,active,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(...values.slice(0,7),now,now).lastInsertRowid);
    }
    listCorpusCases({ activeOnly = true } = {}) { return this.db.prepare(`SELECT * FROM message_corpus${activeOnly?' WHERE active=1':''} ORDER BY id`).all().map(r=>({...r,must_respond:Boolean(r.must_respond),active:Boolean(r.active)})); }
  };
};
