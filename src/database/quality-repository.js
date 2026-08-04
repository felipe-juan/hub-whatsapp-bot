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
      const now = Date.now(); this.db.prepare('DELETE FROM conversation_contexts WHERE expires_at<=?').run(now - 3600000);
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
    savePendingChoice(contextKey, payload = {}, expiresAt = 0, graceUntil = 0) {
      const now = nowIso();
      this.db.prepare(`INSERT INTO conversation_pending_choices(context_key,payload_json,expires_at,grace_until,created_at,updated_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(context_key) DO UPDATE SET payload_json=excluded.payload_json,expires_at=excluded.expires_at,
        grace_until=excluded.grace_until,updated_at=excluded.updated_at`)
        .run(String(contextKey), JSON.stringify(payload || {}), Number(expiresAt), Number(graceUntil || expiresAt), now, now);
    }
    getPendingChoice(contextKey, { includeGrace = false } = {}) {
      const threshold = Date.now();
      const column = includeGrace ? 'grace_until' : 'expires_at';
      const row = this.db.prepare(`SELECT * FROM conversation_pending_choices WHERE context_key=? AND ${column}>?`).get(String(contextKey), threshold);
      return row ? { ...row, payload: parse(row.payload_json, {}), expires_at: Number(row.expires_at), grace_until: Number(row.grace_until) } : null;
    }
    deletePendingChoice(contextKey) { return this.db.prepare('DELETE FROM conversation_pending_choices WHERE context_key=?').run(String(contextKey)).changes > 0; }
    prunePendingChoices(now = Date.now()) { return this.db.prepare('DELETE FROM conversation_pending_choices WHERE grace_until<=?').run(Number(now)).changes; }

    saveRecoveryState(contextKey, input = {}) {
      const now = nowIso(); const expiresAt = Number(input.expires_at || Date.now() + 600000);
      this.db.prepare(`INSERT INTO conversation_recovery_state(context_key,failures,original_message,last_message,last_intent,payload_json,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(context_key) DO UPDATE SET failures=excluded.failures,original_message=excluded.original_message,
        last_message=excluded.last_message,last_intent=excluded.last_intent,payload_json=excluded.payload_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
        .run(String(contextKey), Number(input.failures || 0), String(input.original_message || '').slice(0,1000), String(input.last_message || '').slice(0,1000),
          String(input.last_intent || ''), JSON.stringify(input.payload || {}), expiresAt, now, now);
    }
    getRecoveryState(contextKey) {
      const row = this.db.prepare('SELECT * FROM conversation_recovery_state WHERE context_key=? AND expires_at>?').get(String(contextKey), Date.now());
      return row ? { ...row, failures: Number(row.failures), expires_at: Number(row.expires_at), payload: parse(row.payload_json, {}) } : null;
    }
    clearRecoveryState(contextKey) { return this.db.prepare('DELETE FROM conversation_recovery_state WHERE context_key=?').run(String(contextKey)).changes > 0; }
    pruneRecoveryStates(now = Date.now()) {
      const rows = this.db.prepare('SELECT * FROM conversation_recovery_state WHERE expires_at<=?').all(Number(now));
      if (!rows.length) return 0;
      const insert = this.db.prepare(`INSERT INTO conversation_recovery_events(context_key,chat_type,original_message,stage,outcome,intent,entity_type,entity_id,option_count,selected_option,messages_to_resolution,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const remove = this.db.prepare('DELETE FROM conversation_recovery_state WHERE context_key=?');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          if (Number(row.failures || 0) > 0) insert.run(String(row.context_key),String(row.context_key).startsWith('group:')?'group':'private',String(row.original_message || '').slice(0,1000),Number(row.failures || 1),'abandoned',String(row.last_intent || ''),'','',0,'',Math.max(1,Number(row.failures || 1)),nowIso());
          remove.run(String(row.context_key));
        }
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      return rows.length;
    }
    recordRecoveryEvent(input = {}) {
      if (this.getSetting && this.getSetting('recovery_metrics_enabled','true') === 'false') return 0;
      const result = this.db.prepare(`INSERT INTO conversation_recovery_events(context_key,chat_type,original_message,stage,outcome,intent,entity_type,entity_id,option_count,selected_option,messages_to_resolution,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(String(input.context_key || ''), String(input.chat_type || 'private'), String(input.original_message || '').slice(0,1000),
          Number(input.stage || 0), String(input.outcome || ''), String(input.intent || ''), String(input.entity_type || ''), String(input.entity_id || ''),
          Number(input.option_count || 0), String(input.selected_option || '').slice(0,300), Number(input.messages_to_resolution || 1), nowIso());
      return Number(result.lastInsertRowid);
    }
    recoveryMetrics({ days = 30 } = {}) {
      const safeDays = Math.max(1, Math.min(365, Number(days || 30)));
      const since = new Date(Date.now() - safeDays * 86400000).toISOString();
      const rows = this.db.prepare(`SELECT outcome,COUNT(*) AS count,AVG(messages_to_resolution) AS avg_messages
        FROM conversation_recovery_events WHERE created_at>=? GROUP BY outcome`).all(since);
      const byOutcome = Object.fromEntries(rows.map(row => [row.outcome, { count: Number(row.count), avg_messages: Number(row.avg_messages || 0) }]));
      const total = rows.reduce((sum,row)=>sum+Number(row.count||0),0);
      const resolved = ['direct','clarification_resolved','suggestion_selected','menu_resolved','reformulation_resolved']
        .reduce((sum,key)=>sum+Number(byOutcome[key]?.count||0),0);
      const topClarifications = this.db.prepare(`SELECT intent,COUNT(*) AS count FROM conversation_recovery_events
        WHERE created_at>=? AND outcome IN ('clarification','clarification_resolved') GROUP BY intent ORDER BY count DESC LIMIT 10`).all(since);
      const rejected = Number(byOutcome.suggestions_rejected?.count || 0);
      const abandoned = Number(byOutcome.abandoned?.count || 0);
      const bucketCount = keys => keys.reduce((sum,key)=>sum+Number(byOutcome[key]?.count||0),0);
      const breakdownCounts = {
        direct: bucketCount(['direct']),
        clarification: bucketCount(['clarification_resolved','reformulation_resolved']),
        suggestion: bucketCount(['suggestion_selected']),
        menu: bucketCount(['menu_resolved']),
        abandonment: abandoned,
      };
      const denominator = Math.max(1, Object.values(breakdownCounts).reduce((sum,value)=>sum+value,0));
      const breakdown = Object.fromEntries(Object.entries(breakdownCounts).map(([key,value])=>[key,{count:value,rate:value/denominator}]));
      return { days: safeDays, since, total, resolved, resolution_rate: total ? resolved/total : 0, by_outcome: byOutcome,
        breakdown, average_messages: total ? rows.reduce((sum,row)=>sum+Number(row.avg_messages||0)*Number(row.count||0),0)/total : 0,
        top_clarifications: topClarifications, suggestions_rejected: rejected, abandoned };
    }

    touchPrivateUserProfile(contextKey, { welcome = false } = {}) {
      const now = nowIso();
      this.db.prepare(`INSERT INTO private_user_profiles(context_key,last_seen_at,welcome_sent_at,created_at,updated_at)
        VALUES (?,?,?,?,?) ON CONFLICT(context_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
        welcome_sent_at=CASE WHEN ? THEN excluded.welcome_sent_at ELSE private_user_profiles.welcome_sent_at END,updated_at=excluded.updated_at`)
        .run(String(contextKey), now, welcome ? now : '', now, now, welcome ? 1 : 0);
    }
    shouldWelcomePrivateUser(contextKey, inactivityDays = 60) {
      const row = this.db.prepare('SELECT * FROM private_user_profiles WHERE context_key=?').get(String(contextKey));
      if (!row || !row.welcome_sent_at) return true;
      const last = new Date(row.last_seen_at || row.welcome_sent_at).getTime();
      return !Number.isFinite(last) || Date.now() - last >= Math.max(1,Number(inactivityDays||60))*86400000;
    }

    getRecentExpiredConversationContext(contextKey, graceMs = 600000) {
      const now = Date.now();
      const row = this.db.prepare('SELECT * FROM conversation_contexts WHERE context_key=? AND expires_at<=? AND expires_at>? ORDER BY updated_at DESC LIMIT 1')
        .get(String(contextKey), now, now - Math.max(1000, Number(graceMs || 600000)));
      return row ? { ...row, payload: parse(row.payload_json, {}), expires_at: Number(row.expires_at) } : null;
    }

    saveCorpusCase(input = {}, id = null) {
      const now = nowIso(); const values=[String(input.message||''),String(input.expected_intent||''),String(input.expected_entity||''),String(input.expected_title||''),input.must_respond===false?0:1,input.active===false?0:1,String(input.source||'manual'),now];
      if(id){this.db.prepare('UPDATE message_corpus SET message=?,expected_intent=?,expected_entity=?,expected_title=?,must_respond=?,active=?,source=?,updated_at=? WHERE id=?').run(...values,Number(id));return Number(id);}
      return Number(this.db.prepare('INSERT INTO message_corpus(message,expected_intent,expected_entity,expected_title,must_respond,active,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(...values.slice(0,7),now,now).lastInsertRowid);
    }
    listCorpusCases({ activeOnly = true } = {}) { return this.db.prepare(`SELECT * FROM message_corpus${activeOnly?' WHERE active=1':''} ORDER BY id`).all().map(r=>({...r,must_respond:Boolean(r.must_respond),active:Boolean(r.active)})); }
  };
};
