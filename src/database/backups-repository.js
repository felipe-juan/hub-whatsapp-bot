module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, captionAnalysis, crypto } = deps;
  return class {
  exportData() {
    this.refreshExternalChanges();
    this.db.exec('BEGIN');
    try {
      const payload = {
        format: 'hub-whatsapp-bot-backup', version: 12, exported_at: nowIso(), settings: this.getSettings(),
        teachers: this.listTeachers(), sectors: this.listSectors(),
        professor_schedule_entries: this.listProfessorScheduleEntries({ activeOnly: false }),
        academic_calendar_events: this.listAcademicCalendarEvents({ activeOnly: false }),
        unrecognized_suggestions: this.listUnrecognizedSuggestions({ state: 'all', limit: 1000 }),
        automatic_messages: this.listAutomaticMessages(),
        automatic_message_history: this.db.prepare('SELECT id,message_id,action,snapshot_json,created_at FROM automatic_message_history ORDER BY message_id,id').all()
          .map(row => ({ id: row.id, message_id: row.message_id, action: row.action, snapshot: parseJson(row.snapshot_json, {}), created_at: row.created_at })),
        calculators: this.listCalculators(), groups: this.listGroups(),
        usage_stats: this.db.prepare('SELECT * FROM usage_stats ORDER BY day,topic').all(),
        attachment_files_included: false
      };
      this.db.exec('COMMIT');
      return payload;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  importData(payload) {
    if (!payload || payload.format !== 'hub-whatsapp-bot-backup') throw new Error('Arquivo de backup inválido.');
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM automatic_messages').run(); this.db.prepare('DELETE FROM groups').run(); this.db.prepare('DELETE FROM usage_stats').run();
      this.setSettings(payload.settings || {}, false);
      if (Array.isArray(payload.teachers)) {
        this.db.prepare('DELETE FROM teachers').run();
        for (const teacher of payload.teachers) this.saveTeacher(teacher);
      }
      if (Array.isArray(payload.sectors)) {
        this.db.prepare('DELETE FROM sectors').run();
        for (const sector of payload.sectors) this.saveSector(sector);
      }
      if (Array.isArray(payload.professor_schedule_entries)) {
        this.db.prepare('DELETE FROM professor_schedule_entries').run();
        const findTeacher = this.db.prepare('SELECT id FROM teachers WHERE lower(email)=lower(?) OR lower(name)=lower(?) ORDER BY lower(email)=lower(?) DESC LIMIT 1');
        const scheduleStmt = this.db.prepare(`INSERT INTO professor_schedule_entries(
          teacher_id,professor_name,professor_email,discipline_name,discipline_code,semester_number,semester_label,
          day_of_week,day_label,start_minutes,end_minutes,hours_label,room,academic_period,source_title,source_version,source_date,active,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const entry of payload.professor_schedule_entries) {
          const timestamp = String(entry.updated_at || entry.created_at || nowIso());
          const teacher = findTeacher.get(String(entry.professor_email || ''), String(entry.professor_name || ''), String(entry.professor_email || ''));
          scheduleStmt.run(
            teacher?.id || null, String(entry.professor_name || ''), String(entry.professor_email || ''), String(entry.discipline_name || ''),
            String(entry.discipline_code || ''), Number(entry.semester_number || 0), String(entry.semester_label || ''), Number(entry.day_of_week || 0),
            String(entry.day_label || ''), entry.start_minutes === null || entry.start_minutes === undefined ? null : Number(entry.start_minutes),
            entry.end_minutes === null || entry.end_minutes === undefined ? null : Number(entry.end_minutes), String(entry.hours_label || ''),
            String(entry.room || ''), String(entry.academic_period || ''), String(entry.source_title || ''), String(entry.source_version || ''),
            String(entry.source_date || ''), boolToDb(entry.active !== false), String(entry.created_at || timestamp), timestamp
          );
        }
      }
      if (Array.isArray(payload.academic_calendar_events)) {
        this.db.prepare('DELETE FROM academic_calendar_events').run();
        for (const event of payload.academic_calendar_events) this.saveAcademicCalendarEvent({ ...event, package_key: event.package_key || event.key || '' });
      }
      const importedMessageIds = new Map();
      for (const item of payload.automatic_messages || []) {
        const shouldPublish = item.published !== false; const live = { ...item, draft: undefined, has_draft: undefined };
        const saved = this.saveAutomaticMessageDraft(shouldPublish ? live : (item.draft || live));
        if (shouldPublish) this.publishAutomaticMessage(saved.id);
        if (item.draft && shouldPublish) this.saveAutomaticMessageDraft(item.draft, saved.id);
        if (item.is_example) this.db.prepare('UPDATE automatic_messages SET is_example=1 WHERE id=?').run(saved.id);
        const sourceType = ['hub_package','administrator','teacher_import'].includes(item.source_type) ? item.source_type : 'administrator';
        this.db.prepare(`UPDATE automatic_messages SET source_type=?,package_key=?,package_snapshot_json=?,pending_package_json=?,customized=? WHERE id=?`)
          .run(sourceType, String(item.package_key || ''), item.package_snapshot ? JSON.stringify(item.package_snapshot) : '',
            item.pending_package_update ? JSON.stringify(item.pending_package_update) : '', boolToDb(item.customized !== false), Number(saved.id));
        if (item.id !== undefined && item.id !== null) importedMessageIds.set(Number(item.id), Number(saved.id));
      }
      if (Array.isArray(payload.unrecognized_suggestions)) {
        this.db.prepare('DELETE FROM unrecognized_suggestions').run();
        const suggestionStmt = this.db.prepare(`INSERT INTO unrecognized_suggestions(normalized_message,message_excerpt,chat_type,chat_name,suggested_message_id,suggested_title,confidence,reasons_json,state,occurrences,created_at,last_seen_at,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const item of payload.unrecognized_suggestions) {
          const mappedId = item.suggested_message_id ? (importedMessageIds.get(Number(item.suggested_message_id)) || null) : null;
          suggestionStmt.run(String(item.normalized_message || normalizeText(item.message_excerpt || '')).slice(0,300),String(item.message_excerpt || '').slice(0,300),String(item.chat_type || 'private'),String(item.chat_name || '').slice(0,160),mappedId,String(item.suggested_title || '').slice(0,180),Number(item.confidence || 0),JSON.stringify(item.reasons || parseJson(item.reasons_json || '[]', [])),['pending','approved','rejected'].includes(item.state)?item.state:'pending',Math.max(1,Number(item.occurrences || 1)),String(item.created_at || nowIso()),String(item.last_seen_at || item.created_at || nowIso()),String(item.reviewed_at || ''));
        }
      }
      if (Array.isArray(payload.automatic_message_history)) {
        this.db.prepare('DELETE FROM automatic_message_history').run();
        const historyStmt = this.db.prepare('INSERT INTO automatic_message_history(message_id,action,snapshot_json,created_at) VALUES (?,?,?,?)');
        for (const entry of payload.automatic_message_history) {
          const mappedId = importedMessageIds.get(Number(entry.message_id));
          if (!mappedId || !entry.snapshot || typeof entry.snapshot !== 'object') continue;
          try {
            const snapshot = this.validateAutomaticMessage(entry.snapshot);
            historyStmt.run(mappedId, String(entry.action || 'imported').slice(0, 60), JSON.stringify(snapshot), String(entry.created_at || nowIso()));
          } catch {}
        }
      }
      // Backups antigos continuam aceitos e são convertidos para o modelo único.
      if (!(payload.automatic_messages || []).length) {
        for (const teacher of payload.teachers || []) {
          const saved = this.saveAutomaticMessageDraft({ title: `Contato — ${teacher.name}`, topic: 'Contatos', response_text: `👩‍🏫/👨‍🏫 *${teacher.name}*
📧 ${teacher.email}`, active: teacher.active !== false, priority: 30, trigger: { keywords: [teacher.name, ...(teacher.aliases || [])], require_question_mark: true, regex_pattern: '(?:e-?mail|contato|como\\s+falar|falar\\s+com)', regex_flags: 'iu' } });
          this.publishAutomaticMessage(saved.id);
        }
        for (const legacy of payload.hub_links || []) {
          const item = legacy.draft || legacy; const response = item.response_text || [`📌 *${item.title}*`, item.description ? `_${item.description}_` : '', item.url || ''].filter(Boolean).join('\n');
          const saved = this.saveAutomaticMessageDraft({ title: item.title, topic: item.category || 'HUB Arquivos', response_text: response, trigger: item.trigger || { keywords: item.keywords }, priority: item.priority, active: item.active !== false });
          if (legacy.published !== false) this.publishAutomaticMessage(saved.id);
        }
        for (const legacy of payload.faq_entries || []) {
          const item = legacy.draft || legacy; const saved = this.saveAutomaticMessageDraft({ title: item.title, topic: item.topic || 'Perguntas frequentes', response_text: item.answer, trigger: item.trigger, priority: item.priority, active: item.active !== false });
          if (legacy.published !== false) this.publishAutomaticMessage(saved.id);
        }
      }
      for (const item of payload.calculators || []) if (this.db.prepare('SELECT 1 FROM calculators WHERE key=?').get(item.key)) this.saveCalculator(item.key, item);
      for (const group of payload.groups || []) { this.upsertGroup(group.whatsapp_id, group.name); this.setGroupPermissions(group.whatsapp_id, { ...group, allow_messages: group.allow_messages ?? (group.allow_teachers || group.allow_links || group.allow_faqs) }); }
      const usageStmt = this.db.prepare('INSERT INTO usage_stats(day,topic,match_type,count) VALUES (?,?,?,?)');
      for (const item of payload.usage_stats || []) usageStmt.run(item.day, item.topic, item.match_type, Number(item.count || 0));
      this.db.exec('COMMIT'); this.invalidate('settings', 'activeMessages', 'activeTeachers', 'activeSectors', 'calculators');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    return this.exportData();
  }

  };
};
