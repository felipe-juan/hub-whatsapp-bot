'use strict';

const { normalizeText } = require('../text');

function parseJson(value, fallback) { try { return JSON.parse(value || ''); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function unique(values = []) { return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]; }

module.exports = function createAcademicRepositoryMixin() {
  return class {
    listAcademicDisciplines({ activeOnly = true } = {}) {
      let sql = 'SELECT * FROM academic_disciplines';
      if (activeOnly) sql += ' WHERE active=1';
      sql += ' ORDER BY name COLLATE NOCASE';
      return this.db.prepare(sql).all().map(row => ({
        ...row, id: Number(row.id), active: Boolean(row.active),
        aliases: parseJson(row.aliases_json, []), speech_aliases: parseJson(row.speech_aliases_json, []), common_typos: parseJson(row.common_typos_json, [])
      }));
    }

    getAcademicDiscipline(idOrCode) {
      const value = String(idOrCode || '').trim();
      const row = /^\d+$/u.test(value)
        ? this.db.prepare('SELECT * FROM academic_disciplines WHERE id=?').get(Number(value))
        : this.db.prepare('SELECT * FROM academic_disciplines WHERE upper(code)=upper(?) OR normalized_name=? ORDER BY active DESC LIMIT 1').get(value, normalizeText(value));
      if (!row) return null;
      return { ...row, id: Number(row.id), active: Boolean(row.active), aliases: parseJson(row.aliases_json, []), speech_aliases: parseJson(row.speech_aliases_json, []), common_typos: parseJson(row.common_typos_json, []) };
    }

    saveAcademicDiscipline(input = {}, id = null) {
      const name = String(input.name || '').trim().slice(0, 180);
      if (!name) throw new Error('Informe o nome oficial da disciplina.');
      const code = String(input.code || '').trim().toUpperCase().slice(0, 30);
      const aliases = unique(input.aliases || []);
      const speech = unique(input.speech_aliases || input.speechAliases || []);
      const typos = unique(input.common_typos || input.commonTypos || []);
      const timestamp = nowIso();
      if (id) {
        const result = this.db.prepare(`UPDATE academic_disciplines SET code=?,name=?,normalized_name=?,aliases_json=?,speech_aliases_json=?,common_typos_json=?,source=?,active=?,updated_at=? WHERE id=?`)
          .run(code, name, normalizeText(name), JSON.stringify(aliases), JSON.stringify(speech), JSON.stringify(typos), String(input.source || 'admin').slice(0, 80), input.active === false ? 0 : 1, timestamp, Number(id));
        if (!result.changes) throw new Error('Disciplina não encontrada.');
      } else {
        id = this.db.prepare(`INSERT INTO academic_disciplines(code,name,normalized_name,aliases_json,speech_aliases_json,common_typos_json,source,active,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_name) DO UPDATE SET code=excluded.code,aliases_json=excluded.aliases_json,speech_aliases_json=excluded.speech_aliases_json,common_typos_json=excluded.common_typos_json,active=excluded.active,updated_at=excluded.updated_at`)
          .run(code, name, normalizeText(name), JSON.stringify(aliases), JSON.stringify(speech), JSON.stringify(typos), String(input.source || 'admin').slice(0, 80), input.active === false ? 0 : 1, timestamp, timestamp).lastInsertRowid;
        const existing = this.db.prepare('SELECT id FROM academic_disciplines WHERE normalized_name=?').get(normalizeText(name));
        id = Number(existing?.id || id);
      }
      this.invalidate?.('settings', 'activeTeachers', 'activeMessages');
      return this.getAcademicDiscipline(id);
    }

    syncAcademicDisciplinesFromSchedule(academicPeriod = '') {
      const rows = this.listProfessorDisciplineDirectory({ academicPeriod, activeOnly: false });
      let changed = 0;
      for (const row of rows) {
        const current = this.getAcademicDiscipline(row.discipline_code || row.discipline_name);
        this.saveAcademicDiscipline({
          ...(current || {}), code: row.discipline_code || current?.code || '', name: row.discipline_name,
          aliases: current?.aliases || [], speech_aliases: current?.speech_aliases || [], common_typos: current?.common_typos || [], source: 'schedule-sync', active: true
        }, current?.id || null);
        changed += 1;
      }
      return { changed };
    }

    listAcademicPeriods() {
      return this.db.prepare('SELECT * FROM academic_periods ORDER BY period DESC').all().map(row => ({ ...row, entry_count: Number(row.entry_count || 0), summary: parseJson(row.summary_json, {}) }));
    }

    getAcademicPeriod(period) {
      const row = this.db.prepare('SELECT * FROM academic_periods WHERE period=?').get(String(period || '').trim());
      return row ? { ...row, entry_count: Number(row.entry_count || 0), summary: parseJson(row.summary_json, {}) } : null;
    }

    saveAcademicPeriod(input = {}) {
      const period = String(input.period || '').trim();
      if (!/^\d{4}\.[12]$/u.test(period)) throw new Error('Período acadêmico inválido. Use o formato 2027.1.');
      const timestamp = nowIso();
      const state = ['draft', 'published', 'historical', 'archived'].includes(String(input.state)) ? String(input.state) : 'draft';
      this.db.prepare(`INSERT INTO academic_periods(period,state,starts_on,ends_on,source_title,source_date,imported_at,published_at,entry_count,previous_period,summary_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(period) DO UPDATE SET state=excluded.state,starts_on=excluded.starts_on,ends_on=excluded.ends_on,source_title=excluded.source_title,source_date=excluded.source_date,imported_at=excluded.imported_at,published_at=excluded.published_at,entry_count=excluded.entry_count,previous_period=excluded.previous_period,summary_json=excluded.summary_json,updated_at=excluded.updated_at`)
        .run(period, state, String(input.starts_on || ''), String(input.ends_on || ''), String(input.source_title || ''), String(input.source_date || ''), String(input.imported_at || timestamp), String(input.published_at || ''), Number(input.entry_count || 0), String(input.previous_period || ''), JSON.stringify(input.summary || {}), timestamp, timestamp);
      return this.getAcademicPeriod(period);
    }

    compareAcademicPeriods(currentPeriod, previousPeriod) {
      const current = this.listProfessorScheduleEntries({ academicPeriod: currentPeriod, activeOnly: false });
      const previous = this.listProfessorScheduleEntries({ academicPeriod: previousPeriod, activeOnly: false });
      const key = item => [normalizeText(item.discipline_code || item.discipline_name), normalizeText(item.professor_name), Number(item.semester_number), Number(item.day_of_week), Number(item.start_minutes)].join('|');
      const currentMap = new Map(current.map(item => [key(item), item]));
      const previousMap = new Map(previous.map(item => [key(item), item]));
      const added = [...currentMap].filter(([value]) => !previousMap.has(value)).map(([, item]) => item);
      const removed = [...previousMap].filter(([value]) => !currentMap.has(value)).map(([, item]) => item);
      const missingCodes = current.filter(item => !String(item.discipline_code || '').trim());
      const missingRooms = current.filter(item => !String(item.room || '').trim());
      const conflicts = [];
      const occupied = new Map();
      for (const item of current) {
        const slot = [Number(item.day_of_week), Number(item.start_minutes), Number(item.end_minutes), normalizeText(item.room)].join('|');
        if (!item.room) continue;
        if (occupied.has(slot) && normalizeText(occupied.get(slot).discipline_name) !== normalizeText(item.discipline_name)) conflicts.push({ first: occupied.get(slot), second: item, type: 'room' });
        else occupied.set(slot, item);
      }
      return { currentPeriod, previousPeriod, totals: { current: current.length, previous: previous.length, added: added.length, removed: removed.length, missingCodes: missingCodes.length, missingRooms: missingRooms.length, conflicts: conflicts.length }, added, removed, missingCodes, missingRooms, conflicts };
    }

    previewAcademicPeriodImport(records = [], { period = '', previousPeriod = '' } = {}) {
      const clean = Array.isArray(records) ? records : [];
      const effectivePeriod = period || clean.find(item => item.academic_period)?.academic_period || '';
      const existing = effectivePeriod ? this.listProfessorScheduleEntries({ academicPeriod: effectivePeriod, activeOnly: false }) : [];
      const previous = previousPeriod ? this.listProfessorScheduleEntries({ academicPeriod: previousPeriod, activeOnly: false }) : [];
      const key = item => [normalizeText(item.discipline_code || item.discipline_name), normalizeText(item.professor_name), Number(item.semester_number), Number(item.day_of_week), Number(item.start_minutes)].join('|');
      const incomingMap = new Map(clean.map(item => [key(item), item]));
      const existingMap = new Map(existing.map(item => [key(item), item]));
      const previousMap = new Map(previous.map(item => [key(item), item]));
      const added = [...incomingMap].filter(([value]) => !existingMap.has(value)).map(([, item]) => item);
      const removed = [...existingMap].filter(([value]) => !incomingMap.has(value)).map(([, item]) => item);
      const historicalAdded = [...incomingMap].filter(([value]) => !previousMap.has(value)).map(([, item]) => item);
      const historicalRemoved = [...previousMap].filter(([value]) => !incomingMap.has(value)).map(([, item]) => item);
      const missingCodes = clean.filter(item => !String(item.discipline_code || '').trim());
      const missingRooms = clean.filter(item => !String(item.room || '').trim());
      const currentProfessorNames = new Set(clean.map(item => normalizeText(item.professor_name)).filter(Boolean));
      const previousProfessorNames = new Set(previous.map(item => normalizeText(item.professor_name)).filter(Boolean));
      const currentDisciplineNames = new Set(clean.map(item => normalizeText(item.discipline_name)).filter(Boolean));
      const previousDisciplineNames = new Set(previous.map(item => normalizeText(item.discipline_name)).filter(Boolean));
      const newProfessors = [...currentProfessorNames].filter(name => !previousProfessorNames.has(name));
      const removedProfessors = [...previousProfessorNames].filter(name => !currentProfessorNames.has(name));
      const newDisciplines = [...currentDisciplineNames].filter(name => !previousDisciplineNames.has(name));
      const removedDisciplines = [...previousDisciplineNames].filter(name => !currentDisciplineNames.has(name));
      const conflicts = [];
      const occupied = new Map();
      for (const item of clean) {
        const room = normalizeText(item.room);
        if (!room) continue;
        const slot = [Number(item.day_of_week), Number(item.start_minutes), Number(item.end_minutes), room].join('|');
        if (occupied.has(slot) && normalizeText(occupied.get(slot).discipline_name) !== normalizeText(item.discipline_name)) conflicts.push({ type: 'room', first: occupied.get(slot), second: item });
        else occupied.set(slot, item);
      }
      const warnings = [];
      if (!effectivePeriod || !/^\d{4}\.[12]$/u.test(effectivePeriod)) warnings.push('Informe um período no formato 2027.1.');
      if (!clean.length) warnings.push('A importação não contém ofertas.');
      if (missingCodes.length) warnings.push(`${missingCodes.length} oferta(s) sem código de disciplina.`);
      if (missingRooms.length) warnings.push(`${missingRooms.length} oferta(s) sem sala.`);
      if (conflicts.length) warnings.push(`${conflicts.length} conflito(s) de sala e horário.`);
      return {
        period: effectivePeriod, previousPeriod, incoming: clean.length, added, removed, missingCodes, missingRooms,
        professors: currentProfessorNames.size, disciplines: currentDisciplineNames.size, conflicts, warnings,
        publishable: Boolean(/^\d{4}\.[12]$/u.test(effectivePeriod) && clean.length && conflicts.length === 0),
        historical: { added: historicalAdded, removed: historicalRemoved, newProfessors, removedProfessors, newDisciplines, removedDisciplines,
          totals: { current: clean.length, previous: previous.length, added: historicalAdded.length, removed: historicalRemoved.length,
            newProfessors: newProfessors.length, removedProfessors: removedProfessors.length, newDisciplines: newDisciplines.length, removedDisciplines: removedDisciplines.length } }
      };
    }

    publishAcademicPeriod(period, input = {}) {
      const current = this.getAcademicPeriod(period) || this.saveAcademicPeriod({ period, state: 'draft' });
      const previousCurrent = String(this.getSetting?.('current_academic_period', '') || '');
      const availableCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM professor_schedule_entries WHERE academic_period=? AND active=1').get(period)?.count || 0);
      if (!availableCount && input.force !== true) throw new Error('Não é possível publicar um período sem ofertas ativas.');
      const timestamp = nowIso();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        if (previousCurrent && previousCurrent !== period) {
          const previousCount = Number(this.db.prepare('SELECT COUNT(*) AS count FROM professor_schedule_entries WHERE academic_period=? AND active=1').get(previousCurrent)?.count || 0);
          this.db.prepare(`INSERT OR IGNORE INTO academic_periods
            (period,state,imported_at,published_at,entry_count,created_at,updated_at)
            VALUES (?, 'published', ?, ?, ?, ?, ?)`)
            .run(previousCurrent, timestamp, timestamp, previousCount, timestamp, timestamp);
          this.db.prepare("UPDATE academic_periods SET state='historical',entry_count=?,updated_at=? WHERE period=?").run(previousCount, timestamp, previousCurrent);
        }
        const count = Number(this.db.prepare('SELECT COUNT(*) AS count FROM professor_schedule_entries WHERE academic_period=? AND active=1').get(period)?.count || 0);
        this.db.prepare("UPDATE academic_periods SET state='published',published_at=?,entry_count=?,previous_period=?,updated_at=? WHERE period=?")
          .run(timestamp, count, input.previous_period || previousCurrent || current.previous_period || '', timestamp, period);
        this.db.prepare(`INSERT INTO settings(key,value) VALUES ('current_academic_period',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(period);
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.syncAcademicDisciplinesFromSchedule(period);
      this.invalidate?.('settings', 'activeTeachers', 'activeMessages');
      return this.getAcademicPeriod(period);
    }

    saveConversationSimulation({ title = '', messages = [], results = [], savedAsTest = false } = {}) {
      const result = this.db.prepare(`INSERT INTO conversation_simulations(title,messages_json,results_json,saved_as_test,created_at) VALUES (?,?,?,?,?)`)
        .run(String(title || '').slice(0, 180), JSON.stringify(messages || []), JSON.stringify(results || []), savedAsTest ? 1 : 0, nowIso());
      return this.getConversationSimulation(result.lastInsertRowid);
    }

    getConversationSimulation(id) {
      const row = this.db.prepare('SELECT * FROM conversation_simulations WHERE id=?').get(Number(id));
      return row ? { ...row, id: Number(row.id), saved_as_test: Boolean(row.saved_as_test), messages: parseJson(row.messages_json, []), results: parseJson(row.results_json, []) } : null;
    }

    listConversationSimulations(limit = 50) {
      return this.db.prepare('SELECT * FROM conversation_simulations ORDER BY id DESC LIMIT ?').all(Math.max(1, Math.min(200, Number(limit || 50))))
        .map(row => ({ ...row, id: Number(row.id), saved_as_test: Boolean(row.saved_as_test), messages: parseJson(row.messages_json, []), results: parseJson(row.results_json, []) }));
    }

    recordIntentMetric(input = {}) {
      this.db.prepare(`INSERT INTO intent_metric_events(context_key,chat_type,intent,outcome,missing_field,attempts,confidence,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(String(input.context_key || ''), String(input.chat_type || 'private'), String(input.intent || ''), String(input.outcome || ''), String(input.missing_field || ''), Number(input.attempts || 0), Number(input.confidence || 0), nowIso());
      return true;
    }

    intentMetrics({ days = 30 } = {}) {
      const cutoff = new Date(Date.now() - Math.max(1, Number(days || 30)) * 86400000).toISOString();
      const rows = this.db.prepare(`SELECT intent,outcome,missing_field,COUNT(*) AS count,AVG(attempts) AS avg_attempts,AVG(confidence) AS avg_confidence
        FROM intent_metric_events WHERE created_at>=? GROUP BY intent,outcome,missing_field ORDER BY count DESC`).all(cutoff);
      return rows.map(row => ({ ...row, count: Number(row.count || 0), avg_attempts: Number(row.avg_attempts || 0), avg_confidence: Number(row.avg_confidence || 0) }));
    }
  };
};
