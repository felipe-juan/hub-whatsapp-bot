'use strict';

module.exports = function createMethods(scope) {
  const {
    DEFAULT_SETTINGS,
    DEFAULT_LINKS,
    DEFAULT_CALCULATORS,
    GROUP_FEATURES,
    GROUP_FEATURE_COLUMNS,
    boolToDb,
    asBool,
    parseJson,
    parseJsonList,
    nowIso,
    clone,
    comparableMessageSnapshot,
    messageSnapshotsEqual,
    packageKeyFor,
    triggerTermsOverlap,
    normalizePhone,
    normalizeTag,
    normalizeTags,
    parseList,
    normalizeText,
    normalizeTriggerRules,
    validateRegex,
    SI_PROFESSORS_2026_2,
    SI_PENDING_2026_2,
    SI_PROFESSOR_TRIGGER_ALIASES_2026_2,
    buildSiProfessorTriggerSentences,
    buildSiProfessorNameTriggerSentences,
    buildSiProfessorExactNamePhrases,
    formatDisciplineLabel,
    formatDisciplineNamesInText,
    buildDisciplineTriggerSentences,
    buildSiProfessorResponse,
    buildSharedDisciplineCards2026_2,
    buildProfessorScheduleResponse,
    SI_SUPPORT_MESSAGES_V083,
    SCHEDULE_BOARD_V0812,
    automaticMessagePayload,
    INSTITUTIONAL_CARDS_V098,
    FUN_CARDS_V0101,
    SEMESTER_WEEKLY_CARDS_V0143,
    CAMPUS_CARDS,
    captionAnalysis,
    felipeJuanPhone,
    injectFelipeJuanPhone,
    toPortugueseTitleCase,
    crypto,
    ACADEMIC_CALENDAR_EVENTS_2026,
    SI_SCHEDULE_SOURCE_2026_2,
    RESOURCE_CARDS,
    professorContactValue,
    professorContactReplaceable,
    replaceProfessorContact
  } = scope;
  return {
    migrate() {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS teachers (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
          aliases_json TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sectors (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, acronym TEXT NOT NULL DEFAULT '', aliases_json TEXT NOT NULL DEFAULT '[]',
          email TEXT NOT NULL DEFAULT '', whatsapp TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
          services_json TEXT NOT NULL DEFAULT '[]', source_url TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '',
          verified_at TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hub_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '', keywords_json TEXT NOT NULL DEFAULT '[]', response_text TEXT NOT NULL DEFAULT '',
          priority INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT, whatsapp_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 0, last_seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS message_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, chat_id TEXT NOT NULL DEFAULT '', chat_name TEXT NOT NULL DEFAULT '',
          message_excerpt TEXT NOT NULL DEFAULT '', match_type TEXT NOT NULL DEFAULT '', matched_item TEXT NOT NULL DEFAULT '', reply_excerpt TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS synonym_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, terms_json TEXT NOT NULL DEFAULT '[]',
          active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS faq_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '',
          trigger_json TEXT NOT NULL DEFAULT '{}', priority INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
          published INTEGER NOT NULL DEFAULT 0, published_at TEXT NOT NULL DEFAULT '', draft_json TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calculators (
          key TEXT PRIMARY KEY, label TEXT NOT NULL, command TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1, config_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS automatic_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', response_text TEXT NOT NULL DEFAULT '',
          trigger_json TEXT NOT NULL DEFAULT '{}', priority INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
          published INTEGER NOT NULL DEFAULT 0, published_at TEXT NOT NULL DEFAULT '', draft_json TEXT NOT NULL DEFAULT '',
          is_example INTEGER NOT NULL DEFAULT 0, link_status TEXT NOT NULL DEFAULT 'unchecked', link_checked_at TEXT NOT NULL DEFAULT '',
          link_http_status INTEGER NOT NULL DEFAULT 0, link_error TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT 'both',
          tags_json TEXT NOT NULL DEFAULT '[]', attachment_json TEXT NOT NULL DEFAULT '{}',
          source_type TEXT NOT NULL DEFAULT 'administrator', package_key TEXT NOT NULL DEFAULT '',
          package_snapshot_json TEXT NOT NULL DEFAULT '', pending_package_json TEXT NOT NULL DEFAULT '',
          customized INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS automatic_message_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, action TEXT NOT NULL DEFAULT 'updated',
          snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(message_id) REFERENCES automatic_messages(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS usage_stats (
          day TEXT NOT NULL, topic TEXT NOT NULL, match_type TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(day, topic, match_type)
        );
        CREATE TABLE IF NOT EXISTS outbound_deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL, content_json TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL DEFAULT '',
          last_error TEXT NOT NULL DEFAULT '', whatsapp_message_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS admin_task_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, task_type TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
          progress INTEGER NOT NULL DEFAULT 0, result_json TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS processed_incoming_messages (
          remote_jid TEXT NOT NULL, message_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'processing',
          claimed_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
          PRIMARY KEY(remote_jid,message_id)
        );
        CREATE TABLE IF NOT EXISTS unrecognized_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, normalized_message TEXT NOT NULL, message_excerpt TEXT NOT NULL,
          chat_type TEXT NOT NULL DEFAULT 'private', chat_name TEXT NOT NULL DEFAULT '', suggested_message_id INTEGER,
          suggested_title TEXT NOT NULL DEFAULT '', confidence REAL NOT NULL DEFAULT 0, reasons_json TEXT NOT NULL DEFAULT '[]',
          state TEXT NOT NULL DEFAULT 'pending', occurrences INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL, reviewed_at TEXT NOT NULL DEFAULT '',
          FOREIGN KEY(suggested_message_id) REFERENCES automatic_messages(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS regression_cases (
          id INTEGER PRIMARY KEY AUTOINCREMENT, phrase TEXT NOT NULL, normalized_phrase TEXT NOT NULL,
          expectation TEXT NOT NULL DEFAULT 'respond', expected_title TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(normalized_phrase, expectation, expected_title)
        );
        CREATE INDEX IF NOT EXISTS idx_regression_cases_active ON regression_cases(active,expectation,id);
        CREATE TABLE IF NOT EXISTS admin_auth (
          id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS professor_schedule_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER, professor_name TEXT NOT NULL, professor_email TEXT NOT NULL DEFAULT '',
          discipline_name TEXT NOT NULL, discipline_code TEXT NOT NULL DEFAULT '', semester_number INTEGER NOT NULL, semester_label TEXT NOT NULL DEFAULT '',
          day_of_week INTEGER NOT NULL, day_label TEXT NOT NULL DEFAULT '', start_minutes INTEGER, end_minutes INTEGER, hours_label TEXT NOT NULL DEFAULT '',
          room TEXT NOT NULL DEFAULT '', academic_period TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '', source_version TEXT NOT NULL DEFAULT '',
          source_date TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS change_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL DEFAULT '',
          entity_label TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT 'updated', source TEXT NOT NULL DEFAULT 'painel',
          before_json TEXT NOT NULL DEFAULT 'null', after_json TEXT NOT NULL DEFAULT 'null', created_at TEXT NOT NULL,
          reverted_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS academic_calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, package_key TEXT NOT NULL DEFAULT '', event_type TEXT NOT NULL,
          start_date TEXT NOT NULL, end_date TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', course TEXT NOT NULL DEFAULT 'todos',
          semester_numbers_json TEXT NOT NULL DEFAULT '[]', discipline_code TEXT NOT NULL DEFAULT '', professor_name TEXT NOT NULL DEFAULT '',
          old_room TEXT NOT NULL DEFAULT '', new_room TEXT NOT NULL DEFAULT '', replacement_day_of_week INTEGER, start_minutes INTEGER, end_minutes INTEGER,
          recurrence_type TEXT NOT NULL DEFAULT 'none', recurrence_weekdays_json TEXT NOT NULL DEFAULT '[]', recurrence_interval INTEGER NOT NULL DEFAULT 1,
          source_url TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '', verified_at TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_logs_created_at ON message_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(active);
        CREATE INDEX IF NOT EXISTS idx_sectors_active ON sectors(active,name);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_acronym_unique ON sectors(acronym COLLATE NOCASE) WHERE acronym<>'';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_name_unique ON sectors(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_links_active ON hub_links(active);
        CREATE INDEX IF NOT EXISTS idx_faqs_active ON faq_entries(active,published);
        CREATE INDEX IF NOT EXISTS idx_messages_active ON automatic_messages(active,published);
        CREATE INDEX IF NOT EXISTS idx_message_history_message ON automatic_message_history(message_id,id DESC);
        CREATE INDEX IF NOT EXISTS idx_message_history_created ON automatic_message_history(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_stats(day DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_source ON automatic_messages(source_type,package_key);
        CREATE INDEX IF NOT EXISTS idx_messages_updated ON automatic_messages(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_logs_type_created ON message_logs(match_type,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_outbound_state_due ON outbound_deliveries(state,next_attempt_at,id);
        CREATE INDEX IF NOT EXISTS idx_outbound_conversation ON outbound_deliveries(conversation_id,state,id);
        CREATE INDEX IF NOT EXISTS idx_admin_tasks_state ON admin_task_runs(state,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_processed_incoming_updated ON processed_incoming_messages(updated_at);
        CREATE INDEX IF NOT EXISTS idx_unrecognized_state_seen ON unrecognized_suggestions(state,last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS idx_unrecognized_normalized ON unrecognized_suggestions(normalized_message,state);
        CREATE INDEX IF NOT EXISTS idx_professor_schedule_lookup ON professor_schedule_entries(academic_period,semester_number,day_of_week,active,start_minutes);
        CREATE INDEX IF NOT EXISTS idx_professor_schedule_professor ON professor_schedule_entries(professor_name,academic_period,active);
        CREATE INDEX IF NOT EXISTS idx_academic_calendar_date ON academic_calendar_events(start_date,end_date,active);
        CREATE INDEX IF NOT EXISTS idx_change_history_entity ON change_history(entity_type,entity_id,id DESC);
        CREATE INDEX IF NOT EXISTS idx_change_history_created ON change_history(created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_calendar_package_key ON academic_calendar_events(package_key) WHERE package_key<>'';
      `);
    
      this.ensureColumn('academic_calendar_events', 'recurrence_type', "TEXT NOT NULL DEFAULT 'none'");
      this.ensureColumn('academic_calendar_events', 'recurrence_weekdays_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn('academic_calendar_events', 'recurrence_interval', 'INTEGER NOT NULL DEFAULT 1');
    
      this.ensureColumn('outbound_deliveries', 'idempotency_key', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('outbound_deliveries', 'priority', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('outbound_deliveries', 'source_message_id', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('outbound_deliveries', 'claim_token', "TEXT NOT NULL DEFAULT ''");
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_idempotency ON outbound_deliveries(idempotency_key) WHERE idempotency_key<>'';
        CREATE INDEX IF NOT EXISTS idx_outbound_priority_due ON outbound_deliveries(state,next_attempt_at,priority DESC,id);
      `);
    
      const linkColumnsBefore = this.tableColumns('hub_links');
      const hadPublished = linkColumnsBefore.has('published');
      this.ensureColumn('hub_links', 'published', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('hub_links', 'published_at', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('hub_links', 'draft_json', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('hub_links', 'trigger_json', "TEXT NOT NULL DEFAULT '{}'");
      this.ensureColumn('hub_links', 'link_status', "TEXT NOT NULL DEFAULT 'unchecked'");
      this.ensureColumn('hub_links', 'link_checked_at', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('hub_links', 'link_http_status', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('hub_links', 'link_error', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('hub_links', 'is_example', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('teachers', 'is_example', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('teachers', 'room', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('teachers', 'building', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('teachers', 'room_confirmed_at', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('teachers', 'room_source', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('teachers', 'disciplines_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn('teachers', 'schedule_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn('teachers', 'academic_period', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('faq_entries', 'is_example', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('synonym_groups', 'is_example', 'INTEGER NOT NULL DEFAULT 0');
      if (!hadPublished) this.db.prepare('UPDATE hub_links SET published=1,published_at=COALESCE(NULLIF(updated_at,\'\'),?)').run(nowIso());
      this.db.prepare("UPDATE hub_links SET trigger_json=json_object('match_mode','any','keywords',json(keywords_json)) WHERE trigger_json='' OR trigger_json='{}'").run();
    
    
      this.ensureColumn('automatic_messages', 'scope', "TEXT NOT NULL DEFAULT 'both'");
      this.ensureColumn('automatic_messages', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn('automatic_messages', 'attachment_json', "TEXT NOT NULL DEFAULT '{}'");
      this.ensureColumn('automatic_messages', 'details_text', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'source_url', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'source_title', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'verified_at', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'archived', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('automatic_messages', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('automatic_messages', 'source_type', "TEXT NOT NULL DEFAULT 'administrator'");
      this.ensureColumn('automatic_messages', 'package_key', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'package_snapshot_json', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'pending_package_json', "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn('automatic_messages', 'customized', 'INTEGER NOT NULL DEFAULT 1');
      this.db.prepare("UPDATE automatic_messages SET sort_order=id*10 WHERE sort_order=0").run();
      this.db.prepare("UPDATE automatic_messages SET scope='both' WHERE scope NOT IN ('both','group','private') OR scope IS NULL OR scope='' ").run();
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_live_order ON automatic_messages(published,active,archived,sort_order,priority);
        CREATE INDEX IF NOT EXISTS idx_messages_archive_order ON automatic_messages(archived,sort_order,title);
      `);
    
      this.ensureColumn('groups', 'allow_help', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('groups', 'allow_teachers', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('groups', 'allow_links', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('groups', 'allow_faqs', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('groups', 'allow_calculator', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('groups', 'allow_messages', 'INTEGER NOT NULL DEFAULT 1');
    
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_links_published_active ON hub_links(published,active);
        CREATE INDEX IF NOT EXISTS idx_groups_whatsapp_id ON groups(whatsapp_id);
      `);
    },

    seed() {
      const insertSetting = this.db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);
      // Desde a v0.5.1, mensagens automáticas, ajuda e calculadoras também respondem no privado.
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('group_only','false') ON CONFLICT(key) DO UPDATE SET value='false'").run();
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('allow_private_help','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      // Conteúdos automáticos são criados pelo administrador; não há respostas rígidas pré-definidas.
      const calculatorStmt = this.db.prepare(`INSERT OR IGNORE INTO calculators(key,label,command,description,enabled,config_json,updated_at) VALUES (?,?,?,?,?,?,?)`);
      for (const item of DEFAULT_CALCULATORS) calculatorStmt.run(item.key, item.label, item.command, item.description, boolToDb(item.enabled), JSON.stringify(item.config), nowIso());
      this.migrateLegacyContentToMessages();
      this.seedExampleData();
      const seedBundledContent = this.options.seedBundledContent === true
        || (this.options.seedBundledContent !== false && process.env.HUB_SKIP_BUNDLED_CONTENT !== '1');
      if (seedBundledContent) this.seedSiProfessors2026_2();
      if (seedBundledContent) this.migrateSiProfessorTriggersV082();
      if (seedBundledContent) this.migrateSiProfessorEmailsV083();
      if (seedBundledContent) this.migrateSiProfessorLuanaEmailV084();
      if (seedBundledContent) this.seedSiSupportMessagesV083();
      if (seedBundledContent) this.migrateSiContentV085();
      if (seedBundledContent) this.migrateSiTriggersV086();
      if (seedBundledContent) this.migrateSiSupportTriggersV087();
      if (seedBundledContent) this.migrateSiConflictsV0811();
      if (seedBundledContent) this.seedScheduleBoardV0812();
      this.migrateMessageOrganizationV070();
      if (seedBundledContent) this.migrateContentOriginsV0813();
      if (seedBundledContent) this.migrateSectorFullNamesV0814();
      if (seedBundledContent) this.migrateIfbaBsiCardsV095();
      if (seedBundledContent) this.seedProfessorDirectoryV097();
      if (seedBundledContent) this.migrateInstitutionalCardsV098();
      if (seedBundledContent) this.seedStructuredSectorsV098();
      this.simplifyAutomaticMessagesV0101();
      if (seedBundledContent) this.seedFunCardsV0101();
      if (seedBundledContent) this.seedFunCardsV0102();
      if (seedBundledContent) this.seedFunCardsV0103();
      if (seedBundledContent) this.migrateContentV0104();
      if (seedBundledContent) this.migrateContentV0105();
      if (seedBundledContent) this.migrateContentV0106();
      if (seedBundledContent) this.migrateContentV0107();
      if (seedBundledContent) this.migrateContentV0108();
      if (seedBundledContent) this.migrateContentV0109();
      if (seedBundledContent) this.migrateContentV0110();
      if (seedBundledContent) this.migrateContentV0130();
      if (seedBundledContent) this.migrateContentV0140();
      if (seedBundledContent) this.migrateContentV0142();
      if (seedBundledContent) this.migrateContentV0143();
      if (seedBundledContent) this.migrateContentV0144();
      this.migrateRoomTriggerConflictsV096();
      this.migrateProfessorLocationV097();
      this.migrateQuestionGuardV095();
      this.migrateConversationQueueV0813();
      this.migrateRiskDefaultsV070();
      this.migrateDeliveryV088();
      // Executado por último para restaurar a política exata dos novos cards,
      // depois das conversões de compatibilidade de versões antigas.
      if (seedBundledContent) this.migrateContentV0151();
    },

    migrateLegacyContentToMessages() {
      if (asBool(this.getSetting('automatic_messages_migrated', 'false'), false)) return;
      const existing = Number(this.db.prepare('SELECT COUNT(*) AS count FROM automatic_messages').get().count || 0);
      if (!existing) {
        const hadLegacyExamples = this.listTeachers().some(item => item.is_example) || this.listHubLinks().some(item => item.is_example) || this.listFaqs().some(item => item.is_example);
        for (const teacher of this.listTeachers().filter(item => !item.is_example)) {
          const names = [teacher.name, ...(teacher.aliases || [])].filter(Boolean);
          const saved = this.saveAutomaticMessageDraft({
            title: `Contato — ${teacher.name}`,
            topic: 'Contatos',
            response_text: `👩‍🏫/👨‍🏫 *${teacher.name}*\n📧 ${teacher.email}`,
            priority: 30,
            active: teacher.active,
            trigger: {
              match_mode: 'any', keywords: names, require_question_mark: true,
              regex_pattern: '(?:e-?mail|contato|como\\s+falar|falar\\s+com|entrar\\s+em\\s+contato)', regex_flags: 'iu'
            }
          });
          this.publishAutomaticMessage(saved.id);
        }
        for (const legacy of this.listHubLinks().filter(item => !item.is_example && (item.url || item.response_text || item.active || item.draft))) {
          const item = legacy.draft || legacy;
          const response = item.response_text || [`📌 *${item.title}*`, item.description ? `_${item.description}_` : '', item.url || ''].filter(Boolean).join('\n');
          const saved = this.saveAutomaticMessageDraft({ title: item.title, topic: item.category || 'HUB Arquivos', response_text: response, trigger: item.trigger, priority: item.priority, active: item.active });
          if (legacy.published) this.publishAutomaticMessage(saved.id);
        }
        for (const legacy of this.listFaqs().filter(item => !item.is_example)) {
          const item = legacy.draft || legacy;
          const saved = this.saveAutomaticMessageDraft({ title: item.title, topic: item.topic || 'Perguntas frequentes', response_text: item.answer, trigger: item.trigger, priority: item.priority, active: item.active });
          if (legacy.published) this.publishAutomaticMessage(saved.id);
        }
        if (hadLegacyExamples) this.db.prepare("INSERT INTO settings(key,value) VALUES ('example_data_seeded','false') ON CONFLICT(key) DO UPDATE SET value='false'").run();
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('automatic_messages_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages');
    },

    migrateSiConflictsV0811() {
      if (asBool(this.getSetting('si_conflicts_v0811_migrated', 'false'), false)) return;
      const professorItems = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
      const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
      const updateTrigger = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,updated_at=? WHERE id=?');
      const safeTrigger = (currentTrigger, sentences) => normalizeTriggerRules({
        ...(currentTrigger || {}),
        match_mode: 'all',
        sentences,
        keywords: [],
        required_words: []
      });
    
      this.db.exec('BEGIN');
      try {
        // Remove dos cartões individuais a disciplina que possui dois docentes.
        // Perguntas pelo nome continuam funcionando; perguntas pela disciplina
        // passam a usar um cartão único com os dois contatos.
        for (const item of professorItems) {
          const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
          const row = select.get(title);
          if (!row) continue;
          const current = this.getAutomaticMessage(row.id);
          if (!current) continue;
          const nextTrigger = safeTrigger(current.trigger, buildSiProfessorTriggerSentences(item));
          let draftJson = row.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') {
              draft.trigger = safeTrigger(draft.trigger || current.trigger, buildSiProfessorTriggerSentences(item));
              draftJson = JSON.stringify(draft);
            }
          }
          if (JSON.stringify(nextTrigger) === JSON.stringify(current.trigger || {}) && draftJson === (row.draft_json || '')) continue;
          this.archiveAutomaticMessage(current, 'v0.8.11-conflitos-de-disciplinas');
          updateTrigger.run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
        }
    
        for (const shared of buildSharedDisciplineCards2026_2()) {
          const existingRow = select.get(shared.title);
          const trigger = normalizeTriggerRules({
            match_mode: 'all', sentences: shared.sentences, keywords: [], required_words: [],
            require_question_mark: false, typo_tolerance: 1, excluded_words: [], exact_phrases: [],
            synonym_group_ids: [], negative_examples: []
          });
          if (!existingRow) {
            this.saveAutomaticMessage({
              title: shared.title,
              response_text: shared.response_text,
              priority: 38,
              active: true,
              archived: false,
              scope: 'both',
              tags: shared.tags,
              trigger
            });
            continue;
          }
          const current = this.getAutomaticMessage(existingRow.id);
          if (!current) continue;
          let draftJson = existingRow.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') {
              draft.trigger = trigger;
              draftJson = JSON.stringify(draft);
            }
          }
          if (JSON.stringify(trigger) !== JSON.stringify(current.trigger || {}) || draftJson !== (existingRow.draft_json || '')) {
            this.archiveAutomaticMessage(current, 'v0.8.11-disciplina-compartilhada');
            updateTrigger.run(JSON.stringify(trigger), draftJson, nowIso(), Number(existingRow.id));
          }
        }
    
        // Um cartão criado pelo usuário com o título abaixo tinha um termo
        // isolado “cálculo”, que interceptava qualquer pergunta sobre a disciplina.
        // Mantemos a resposta e o anexo, alterando apenas os gatilhos genéricos.
        const customRows = this.db.prepare('SELECT id,draft_json FROM automatic_messages').all();
        const isPassarCalculo = title => ['como passar em calculo', 'como passar calculo'].includes(normalizeText(title));
        const stripGenericCalculo = triggerInput => {
          const trigger = normalizeTriggerRules(triggerInput || {});
          const keep = value => normalizeText(value) !== 'calculo';
          trigger.sentences = [...new Set(trigger.sentences.filter(keep).concat(['como passar cálculo', 'como passar em cálculo']))];
          trigger.keywords = trigger.keywords.filter(keep);
          trigger.required_words = trigger.required_words.filter(keep);
          trigger.exact_phrases = trigger.exact_phrases.filter(keep);
          trigger.match_mode = 'any';
          return trigger;
        };
        for (const row of customRows) {
          const current = this.getAutomaticMessage(row.id);
          if (!current || !isPassarCalculo(current.title)) continue;
          const nextTrigger = stripGenericCalculo(current.trigger);
          let draftJson = row.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') {
              draft.trigger = stripGenericCalculo(draft.trigger || current.trigger);
              draftJson = JSON.stringify(draft);
            }
          }
          if (JSON.stringify(nextTrigger) === JSON.stringify(current.trigger || {}) && draftJson === (row.draft_json || '')) continue;
          this.archiveAutomaticMessage(current, 'v0.8.11-remocao-gatilho-calculo-generico');
          updateTrigger.run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
        }
    
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_conflicts_v0811_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) {
        try { this.db.exec('ROLLBACK'); } catch {}
        throw error;
      }
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    },

    migrateMessageOrganizationV070() {
      if (asBool(this.getSetting('message_ui_v070_migrated', 'false'), false)) return;
      const migrateTrigger = source => {
        const trigger = source && typeof source === 'object' ? { ...source } : {};
        const keywords = parseList(trigger.keywords);
        const sentences = parseList(trigger.sentences);
        const legacyExact = parseList(trigger.exact_phrases);
        // Regras antigas em modo “qualquer” eram alternativas; no modelo novo elas
        // viram sentenças/trechos independentes. Regras “todas” permanecem palavras-chave.
        if (trigger.match_mode === 'any' && keywords.length) {
          trigger.sentences = [...new Set([...sentences, ...keywords])];
          trigger.keywords = [];
        } else {
          trigger.sentences = [...new Set([...sentences, ...legacyExact])];
          trigger.keywords = keywords;
        }
        trigger.exact_phrases = [];
        trigger.match_mode = 'all';
        return trigger;
      };
      const migrateContent = source => {
        const item = source && typeof source === 'object' ? { ...source } : {};
        item.tags = normalizeTags(item.tags, item.topic || '');
        item.topic = '';
        item.trigger = migrateTrigger(item.trigger || {});
        return item;
      };
      const rows = this.db.prepare('SELECT id,topic,tags_json,trigger_json,draft_json FROM automatic_messages').all();
      const update = this.db.prepare("UPDATE automatic_messages SET topic='',tags_json=?,trigger_json=?,draft_json=?,updated_at=? WHERE id=?");
      for (const row of rows) {
        const live = migrateContent({ topic: row.topic, tags: parseJsonList(row.tags_json), trigger: parseJson(row.trigger_json, {}) });
        const draftRaw = row.draft_json ? parseJson(row.draft_json, null) : null;
        const draft = draftRaw ? migrateContent(draftRaw) : null;
        update.run(JSON.stringify(live.tags), JSON.stringify(live.trigger), draft ? JSON.stringify(draft) : '', nowIso(), Number(row.id));
      }
      const historyRows = this.db.prepare('SELECT id,snapshot_json FROM automatic_message_history').all();
      const updateHistory = this.db.prepare('UPDATE automatic_message_history SET snapshot_json=? WHERE id=?');
      for (const row of historyRows) {
        const snapshot = parseJson(row.snapshot_json, null);
        if (snapshot) updateHistory.run(JSON.stringify(migrateContent(snapshot)), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('message_ui_v070_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages');
    },

    migrateRiskDefaultsV070() {
      if (asBool(this.getSetting('risk_defaults_v070_migrated', 'false'), false)) return;
      // Só troca os valores-padrão antigos. Configurações personalizadas pelo
      // administrador são preservadas integralmente.
      const replacements = {
        outbound_min_interval_ms: ['1200', '1800'],
        max_replies_per_minute: ['12', '8'],
        max_replies_per_hour: ['120', '80'],
        max_replies_per_user_per_minute: ['4', '3']
      };
      const update = this.db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?');
      for (const [key, [oldValue, newValue]] of Object.entries(replacements)) update.run(newValue, key, oldValue);
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('max_outbound_queue','20') ON CONFLICT(key) DO NOTHING").run();
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('risk_defaults_v070_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings');
    },

    migrateDeliveryV088() {
      if (asBool(this.getSetting('delivery_v088_migrated', 'false'), false)) return;
      // A v0.8.8 remove o atraso artificial e os bloqueios preventivos que
      // descartavam perguntas válidas. Duplicatas reais continuam sendo
      // eliminadas pelo identificador da mensagem recebido do WhatsApp.
      const values = {
        cooldown_seconds: '0',
        risk_guard_enabled: 'false',
        outbound_min_interval_ms: '0',
        max_outbound_queue: '200',
        max_concurrent_sends: '8',
    max_concurrent_media_sends: '2',
        delivery_v088_migrated: 'true'
      };
      const stmt = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [key, value] of Object.entries(values)) stmt.run(key, value);
      this.invalidate('settings');
    }
  };
};
