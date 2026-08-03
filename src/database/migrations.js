module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, FUN_CARDS_V0101, captionAnalysis, felipeJuanPhone, injectFelipeJuanPhone, crypto } = deps;

  const professorContactValue = response => {
    const lines = String(response || '').split('\n');
    const legacy = lines.find(line => /^📧 \*E-mail:\*/u.test(line));
    if (legacy) return legacy.replace(/^📧 \*E-mail:\*\s*/u, '').trim();
    const heading = lines.findIndex(line => /^📧 \*Contato\*\s*$/u.test(line.trim()));
    if (heading >= 0) {
      for (let index = heading + 1; index < lines.length; index += 1) {
        const value = lines[index].trim();
        if (value) return value;
      }
    }
    return String(response || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  };
  const professorContactReplaceable = response => {
    const value = professorContactValue(response);
    return !value
      || /\[(?:ADICIONAR|IDENTIFICAR)[^\]]*\]/i.test(value)
      || /^não encontrado$/i.test(value)
      || /^nao encontrado$/i.test(value);
  };
  const replaceProfessorContact = (response, email) => {
    const source = String(response || '');
    if (!email || !professorContactReplaceable(source)) return source;
    const lines = source.split('\n');
    const legacy = lines.findIndex(line => /^📧 \*E-mail:\*/u.test(line));
    if (legacy >= 0) {
      lines[legacy] = `📧 *E-mail:* ${email}`;
      return lines.join('\n');
    }
    const heading = lines.findIndex(line => /^📧 \*Contato\*\s*$/u.test(line.trim()));
    if (heading >= 0) {
      let target = heading + 1;
      while (target < lines.length && !lines[target].trim()) target += 1;
      if (target < lines.length) lines[target] = email;
      else lines.push(email);
      return lines.join('\n');
    }
    return source;
  };
  return class {
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
      CREATE TABLE IF NOT EXISTS admin_auth (
        id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL, updated_at TEXT NOT NULL
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
    `);

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
  }

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
    this.migrateRoomTriggerConflictsV096();
    this.migrateProfessorLocationV097();
    this.migrateQuestionGuardV095();
    this.migrateConversationQueueV0813();
    this.migrateRiskDefaultsV070();
    this.migrateDeliveryV088();
  }

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
  }

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
  }

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
  }

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
  }


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

  bundledAutomaticMessageDefinitionsV0813() {
    const definitions = [];
    for (const item of [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2]) {
      const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
      definitions.push({
        key: `si-2026-2-professor-${packageKeyFor(item.name)}`,
        message: {
          title,
          response_text: buildSiProfessorResponse(item),
          priority: item.pending ? 28 : 35,
          active: true,
          archived: false,
          scope: 'both',
          tags: item.pending
            ? ['professor', 'si', '2026-2', 'horario', 'pendencia']
            : ['professor', 'si', '2026-2', 'contato', 'horario', String(item.email || '').includes('@') ? 'email' : 'email-pendente'],
          trigger: {
            match_mode: 'all', sentences: buildSiProfessorTriggerSentences(item), keywords: [], required_words: [],
            require_question_mark: true, typo_tolerance: 1, excluded_words: Array.isArray(item.excluded) ? item.excluded : [],
            exact_phrases: [], synonym_group_ids: [], negative_examples: []
          }
        }
      });
    }
    for (const item of SI_SUPPORT_MESSAGES_V083) definitions.push({
      key: `si-support-${packageKeyFor(item.title)}`,
      message: automaticMessagePayload(item)
    });
    for (const shared of buildSharedDisciplineCards2026_2()) definitions.push({
      key: `si-shared-${packageKeyFor(shared.discipline)}`,
      message: {
        title: shared.title, response_text: shared.response_text, priority: 38, active: true, archived: false,
        scope: 'both', tags: shared.tags,
        trigger: { match_mode: 'all', sentences: shared.sentences, keywords: [], required_words: [], require_question_mark: true,
          typo_tolerance: 1, excluded_words: [], exact_phrases: [], synonym_group_ids: [], negative_examples: [] }
      }
    });
    definitions.push({ key: 'si-schedule-board-2026-2', message: automaticMessagePayload(SCHEDULE_BOARD_V0812) });
    return definitions;
  }

  migrateContentOriginsV0813() {
    if (asBool(this.getSetting('content_origin_v0813_migrated', 'false'), false)) return;
    const update = this.db.prepare(`UPDATE automatic_messages SET source_type='hub_package',package_key=?,package_snapshot_json=?,pending_package_json='',customized=?,updated_at=? WHERE id=?`);
    this.db.exec('BEGIN');
    try {
      for (const definition of this.bundledAutomaticMessageDefinitionsV0813()) {
        const row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(definition.message.title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const official = this.validateAutomaticMessage(definition.message);
        const officialSnapshot = comparableMessageSnapshot(official);
        const customized = !messageSnapshotsEqual(current, officialSnapshot);
        update.run(definition.key, JSON.stringify(officialSnapshot), boolToDb(customized), nowIso(), Number(row.id));
      }
      this.db.prepare("UPDATE automatic_messages SET source_type='administrator',customized=1 WHERE source_type='' OR source_type IS NULL").run();
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_origin_v0813_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeMessages');
  }

  migrateSectorFullNamesV0814() {
    if (asBool(this.getSetting('sector_full_names_v0814_migrated', 'false'), false)) return;
    const previousTitles = {
      CAPNE: 'Setor — CAPNE',
      CORES: 'Setor — CORES',
      CAENS: 'Setor — CAENS',
      CSI: 'Contato — Coordenação de Sistemas de Informação'
    };
    for (const item of SI_SUPPORT_MESSAGES_V083) {
      const sigla = ['CAPNE', 'CORES', 'CAENS', 'CSI'].find(value => String(item.title || '').includes(value));
      if (!sigla) continue;
      const stableKey = `si-support-${packageKeyFor(previousTitles[sigla])}`;
      this.stagePackageAutomaticMessage(stableKey, automaticMessagePayload(item));
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('sector_full_names_v0814_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }

  migrateIfbaBsiCardsV095() {
    if (asBool(this.getSetting('ifba_bsi_cards_v095_migrated', 'false'), false)) return;
    const unsafeRoomSentences = new Set(['qual sala', 'em qual sala', 'qual é a sala', 'qual e a sala']);
    for (const definition of INSTITUTIONAL_CARDS_V098.filter(item => item.legacyGroup === 'bsi')) {
      const message = clone(definition.message);
      const row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(message.title);
      const current = row ? this.getAutomaticMessage(row.id) : null;
      if (current?.trigger) {
        const oldSentences = (current.trigger.sentences || []).filter(sentence => message.title !== 'Onde está o professor — salas do IFBA' || !unsafeRoomSentences.has(normalizeText(sentence)));
        message.trigger.sentences = [...new Set([...(message.trigger.sentences || []), ...oldSentences])];
        if (!message.trigger.regex_pattern && current.trigger.regex_pattern) {
          message.trigger.regex_pattern = current.trigger.regex_pattern;
          message.trigger.regex_flags = current.trigger.regex_flags || 'iu';
        }
      }
      this.stagePackageAutomaticMessage(definition.key, message);
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('ifba_bsi_cards_v095_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }



  migrateInstitutionalCardsV098() {
    if (asBool(this.getSetting('institutional_cards_v098_migrated', 'false'), false)) return;
    const retiredTitles = new Set([
      'Setor — CORES', 'Setor — CAENS', 'Setor — CAPNE', 'Contato — Coordenação de Sistemas de Informação',
      'Biblioteca — Contato', 'PAAE — Contato do Serviço Social', 'CGTI — Onde pedir suporte técnico',
      'Ingresso — Contato oficial', 'Assistência Estudantil — Onde pedir orientação', 'COTEP — Apoio pedagógico'
    ]);
    const officialTitles = new Set([
      ...INSTITUTIONAL_CARDS_V098.map(definition => String(definition?.message?.title || '').trim().toLocaleLowerCase('pt-BR')),
      ...[...retiredTitles].map(title => String(title).trim().toLocaleLowerCase('pt-BR'))
    ]);
    const extractSource = value => {
      const lines = String(value || '').split('\n'); let sourceUrl = ''; const kept = [];
      for (const line of lines) {
        const match = line.match(/^\s*🔎\s*\*?Fonte oficial:\*?\s*(https?:\/\/\S+)\s*$/i);
        if (match) { sourceUrl = match[1].replace(/[),.;!?]+$/, ''); continue; }
        kept.push(line);
      }
      while (kept.length && !kept.at(-1).trim()) kept.pop();
      return { responseText: kept.join('\n').trim(), sourceUrl };
    };
    this.db.exec('BEGIN');
    try {
      for (const definition of INSTITUTIONAL_CARDS_V098) this.stagePackageAutomaticMessage(definition.key, definition.message);
      const rows = this.db.prepare('SELECT id,response_text,source_url,source_title,verified_at,draft_json,title FROM automatic_messages').all();
      const update = this.db.prepare('UPDATE automatic_messages SET response_text=?,source_url=?,source_title=?,verified_at=?,draft_json=?,updated_at=? WHERE id=?');
      for (const row of rows) {
        const isOfficialCard = officialTitles.has(String(row.title || '').trim().toLocaleLowerCase('pt-BR'));
        const moved = extractSource(row.response_text); let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            const draftMoved = extractSource(draft.response_text);
            draft.response_text = draftMoved.responseText;
            if (!draft.source_url && draftMoved.sourceUrl) draft.source_url = draftMoved.sourceUrl;
            if (isOfficialCard && !draft.source_title && draft.source_url) draft.source_title = 'Página oficial do IFBA';
            if (isOfficialCard && !draft.verified_at && draft.source_url) draft.verified_at = '2026-08-01';
            draftJson = JSON.stringify(draft);
          }
        }
        const sourceUrl = row.source_url || moved.sourceUrl;
        const sourceTitle = row.source_title || (isOfficialCard && sourceUrl ? 'Página oficial do IFBA' : '');
        const verifiedAt = row.verified_at || (isOfficialCard && sourceUrl ? '2026-08-01' : '');
        if (moved.responseText !== row.response_text || sourceUrl !== row.source_url || sourceTitle !== row.source_title || verifiedAt !== row.verified_at || draftJson !== (row.draft_json || '')) {
          update.run(moved.responseText, sourceUrl, sourceTitle, verifiedAt, draftJson, nowIso(), Number(row.id));
        }
      }
      for (const title of retiredTitles) {
        const row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (current) this.archiveAutomaticMessage(current, 'v0.9.8-replaced-by-structured-sector');
        this.db.prepare("UPDATE automatic_messages SET active=0,archived=1,pending_package_json='',updated_at=? WHERE id=?").run(nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('institutional_cards_v098_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeMessages');
  }

  simplifyAutomaticMessagesV0101() {
    if (this.getSetting('automatic_messages_v0101_simplified') === 'true') return;
    const rows = this.db.prepare("SELECT id,draft_json FROM automatic_messages WHERE tags_json<>'[]' OR draft_json<>''").all();
    const update = this.db.prepare("UPDATE automatic_messages SET tags_json='[]',draft_json=?,updated_at=? WHERE id=?");
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        let draftJson = String(row.draft_json || '');
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            delete draft.tags;
            draftJson = JSON.stringify(draft);
          }
        }
        update.run(draftJson, nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('automatic_messages_v0101_simplified','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.invalidate('activeMessages', 'conflictReport');
  }

  seedFunCardsV0101() {
    if (asBool(this.getSetting('fun_cards_v0101_seeded', 'false'), false)) return;
    for (const definition of FUN_CARDS_V0101) {
      const existing = this.listAutomaticMessages().find(item => normalizeText(item.title) === normalizeText(definition.message.title));
      if (!existing) {
        this.stagePackageAutomaticMessage(definition.key, definition.message);
        continue;
      }
      const official = this.validateAutomaticMessage(definition.message);
      this.saveAutomaticMessage({ ...official, attachment: existing.attachment || null }, existing.id);
      const snapshot = comparableMessageSnapshot(official);
      const customized = Boolean(existing.attachment?.stored_name);
      this.db.prepare("UPDATE automatic_messages SET source_type='hub_package',package_key=?,package_snapshot_json=?,pending_package_json='',customized=?,updated_at=? WHERE id=?")
        .run(definition.key, JSON.stringify(snapshot), boolToDb(customized), nowIso(), Number(existing.id));
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('fun_cards_v0101_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages', 'conflictReport');
  }

  seedFunCardsV0102() {
    if (asBool(this.getSetting('fun_cards_v0102_seeded', 'false'), false)) return;
    const official = FUN_CARDS_V0101.find(definition => definition.key === 'hub-fun-como-passar-em-calculo');
    if (!official) throw new Error('Card de Cálculo da v0.10.2 não encontrado.');

    // Atualiza automaticamente instalações não personalizadas. Em cartões
    // personalizados, a atualização oficial continua disponível no painel.
    this.stagePackageAutomaticMessage(official.key, official.message);

    // A correção do gatilho é aplicada mesmo quando a resposta foi
    // personalizada: preservamos texto, anexo e escopo, alterando somente a
    // estrutura necessária para reconhecer perguntas sem “?” final.
    const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
      .get(official.key, official.message.title, official.key);
    if (row) {
      const current = this.getAutomaticMessage(row.id);
      if (current) {
        const nextTrigger = normalizeTriggerRules({
          ...(current.trigger || {}),
          sentences: [...new Set([...(current.trigger?.sentences || []), ...(official.message.trigger.sentences || [])])],
          excluded_words: [...new Set([...(current.trigger?.excluded_words || []), ...(official.message.trigger.excluded_words || [])])],
          require_question_mark: true,
          regex_pattern: official.message.trigger.regex_pattern,
          regex_flags: official.message.trigger.regex_flags || 'iu'
        });
        let draftJson = String(row.draft_json || '');
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.trigger = normalizeTriggerRules({
              ...(draft.trigger || nextTrigger),
              sentences: [...new Set([...(draft.trigger?.sentences || []), ...(official.message.trigger.sentences || [])])],
              excluded_words: [...new Set([...(draft.trigger?.excluded_words || []), ...(official.message.trigger.excluded_words || [])])],
              require_question_mark: true,
              regex_pattern: official.message.trigger.regex_pattern,
              regex_flags: official.message.trigger.regex_flags || 'iu'
            });
            draftJson = JSON.stringify(draft);
          }
        }
        if (JSON.stringify(nextTrigger) !== JSON.stringify(current.trigger || {}) || draftJson !== String(row.draft_json || '')) {
          this.archiveAutomaticMessage(current, 'v0.10.2-perguntas-sem-interrogacao');
          this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,updated_at=? WHERE id=?')
            .run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
        }
      }
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('fun_cards_v0102_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages', 'conflictReport');
  }

  seedFunCardsV0103() {
    if (asBool(this.getSetting('fun_cards_v0103_attachment_restored', 'false'), false)) return;
    const official = FUN_CARDS_V0101.find(definition => definition.key === 'hub-fun-como-passar-em-calculo');
    if (!official) throw new Error('Card de Cálculo da v0.10.3 não encontrado.');
    const row = this.db.prepare('SELECT id FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
      .get(official.key, official.message.title, official.key);
    if (row) {
      const current = this.getAutomaticMessage(row.id);
      if (current) {
        const officialSnapshot = comparableMessageSnapshot(this.validateAutomaticMessage(official.message));
        let recoveredAttachment = null;
        if (!current.attachment?.stored_name) {
          const history = this.db.prepare("SELECT snapshot_json FROM automatic_message_history WHERE message_id=? AND action='package-update' ORDER BY id DESC LIMIT 1")
            .get(Number(current.id));
          const snapshot = parseJson(history?.snapshot_json || '', null);
          if (snapshot?.attachment?.stored_name) recoveredAttachment = snapshot.attachment;
        }
        if (recoveredAttachment) {
          this.archiveAutomaticMessage(current, 'v0.10.3-before-attachment-recovery');
          this.db.prepare("UPDATE automatic_messages SET attachment_json=?,package_snapshot_json=?,pending_package_json='',customized=1,updated_at=? WHERE id=?")
            .run(JSON.stringify(recoveredAttachment), JSON.stringify(officialSnapshot), nowIso(), Number(current.id));
        } else if (current.attachment?.stored_name && current.package_snapshot?.attachment) {
          this.db.prepare("UPDATE automatic_messages SET package_snapshot_json=?,customized=1,updated_at=? WHERE id=?")
            .run(JSON.stringify(officialSnapshot), nowIso(), Number(current.id));
        }
      }
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('fun_cards_v0103_attachment_restored','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }

  migrateContentV0104() {
    const finalDefinition = DEFAULT_CALCULATORS.find(item => item.key === 'final');
    if (!asBool(this.getSetting('calculators_v0104_single_final', 'false'), false)) {
      this.db.exec('BEGIN');
      try {
        this.db.prepare("DELETE FROM calculators WHERE key<>'final'").run();
        this.db.prepare(`INSERT INTO calculators(key,label,command,description,enabled,config_json,updated_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET label=excluded.label,command=excluded.command,description=excluded.description,enabled=excluded.enabled,config_json=excluded.config_json,updated_at=excluded.updated_at`)
          .run(finalDefinition.key, finalDefinition.label, finalDefinition.command, finalDefinition.description, boolToDb(finalDefinition.enabled), JSON.stringify(finalDefinition.config), nowIso());
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('calculators_v0104_single_final','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings');
      this.cache.calculators = null;
    }

    if (!asBool(this.getSetting('content_v0104_seeded', 'false'), false)) {
      const keys = new Set(['si-support-hub-media-final-e-tabela-da-final', 'ifba-bsi-v098-trancamento-curso', 'hub-easter-egg-felipe-juan-v0104', 'hub-comunidade-bar-benjamin-v0104']);
      for (const definition of INSTITUTIONAL_CARDS_V098.filter(item => keys.has(item.key))) {
        this.stagePackageAutomaticMessage(definition.key, definition.message);
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0104_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    }

    if (!asBool(this.getSetting('professor_cards_v0104_rooms', 'false'), false)) {
      const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
      const findEmail = value => {
        const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return match ? match[0] : '';
      };
      for (const item of items) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
        const current = row ? this.getAutomaticMessage(row.id) : null;
        const emailOverride = current && !item.pending ? findEmail(current.response_text) : '';
        const input = {
          ...(current || {}),
          title,
          response_text: buildSiProfessorResponse(item, emailOverride || item.email || ''),
          attachment: current?.attachment || null,
          active: current ? current.active : true,
          archived: false,
          scope: current?.scope || 'both',
          priority: current?.priority ?? (item.pending ? 28 : 35),
          trigger: {
            match_mode: 'all',
            sentences: buildSiProfessorTriggerSentences(item),
            keywords: [], required_words: [], require_question_mark: true,
            typo_tolerance: 1, excluded_words: Array.isArray(item.excluded) ? item.excluded : [],
            exact_phrases: [], synonym_group_ids: [], negative_examples: [], regex_pattern: '', regex_flags: 'iu'
          }
        };
        const saved = current ? this.saveAutomaticMessage(input, current.id) : this.saveAutomaticMessage(input);
        if (current) this.db.prepare("UPDATE automatic_messages SET source_type=CASE WHEN source_type='hub_package' THEN source_type ELSE 'administrator' END,customized=1,updated_at=? WHERE id=?")
          .run(nowIso(), Number(saved.id));
      }
      for (const shared of buildSharedDisciplineCards2026_2()) {
        const row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(shared.title);
        const current = row ? this.getAutomaticMessage(row.id) : null;
        const input = {
          ...(current || {}), title: shared.title, response_text: shared.response_text,
          attachment: current?.attachment || null, active: true, archived: false, scope: current?.scope || 'both',
          priority: current?.priority ?? 38,
          trigger: { match_mode: 'all', sentences: shared.sentences, keywords: [], required_words: [],
            require_question_mark: true, typo_tolerance: 1, excluded_words: [], exact_phrases: [],
            synonym_group_ids: [], negative_examples: [], regex_pattern: '', regex_flags: 'iu' }
        };
        current ? this.saveAutomaticMessage(input, current.id) : this.saveAutomaticMessage(input);
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('professor_cards_v0104_rooms','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    }
  }

  migrateContentV0105() {
    if (asBool(this.getSetting('content_v0105_calculator_reactions_abbreviations', 'false'), false)) return;
    const finalDefinition = DEFAULT_CALCULATORS.find(item => item.key === 'final');
    const juanDefinition = INSTITUTIONAL_CARDS_V098.find(item => item.key === 'hub-easter-egg-felipe-juan-v0104');
    const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
    const findEmail = value => {
      const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0] : '';
    };

    this.db.exec('BEGIN');
    try {
      if (finalDefinition) {
        this.db.prepare(`INSERT INTO calculators(key,label,command,description,enabled,config_json,updated_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET label=excluded.label,command=excluded.command,description=excluded.description,enabled=excluded.enabled,config_json=excluded.config_json,updated_at=excluded.updated_at`)
          .run(finalDefinition.key, finalDefinition.label, finalDefinition.command, finalDefinition.description, boolToDb(finalDefinition.enabled), JSON.stringify(finalDefinition.config), nowIso());
      }

      for (const item of items) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const emailOverride = !item.pending ? findEmail(current.response_text) : '';
        const nextResponse = buildSiProfessorResponse(item, emailOverride || item.email || '');
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            const draftEmail = !item.pending ? findEmail(draft.response_text || current.response_text) : '';
            draft.response_text = buildSiProfessorResponse(item, draftEmail || emailOverride || item.email || '');
            draftJson = JSON.stringify(draft);
          }
        }
        if (nextResponse === current.response_text && draftJson === (row.draft_json || '')) continue;
        this.archiveAutomaticMessage(current, 'v0.10.5-siglas-disciplinas');
        this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,updated_at=? WHERE id=?')
          .run(nextResponse, draftJson, nowIso(), Number(row.id));
      }

      for (const shared of buildSharedDisciplineCards2026_2()) {
        const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)').get(shared.title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') { draft.response_text = shared.response_text; draftJson = JSON.stringify(draft); }
        }
        if (current.response_text === shared.response_text && draftJson === (row.draft_json || '')) continue;
        this.archiveAutomaticMessage(current, 'v0.10.5-siglas-disciplinas-compartilhadas');
        this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,updated_at=? WHERE id=?')
          .run(shared.response_text, draftJson, nowIso(), Number(row.id));
      }

      const allCards = this.db.prepare('SELECT id,response_text,details_text,draft_json FROM automatic_messages').all();
      for (const row of allCards) {
        const nextResponse = formatDisciplineNamesInText(row.response_text || '');
        const nextDetails = formatDisciplineNamesInText(row.details_text || '');
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.response_text = formatDisciplineNamesInText(draft.response_text || '');
            draft.details_text = formatDisciplineNamesInText(draft.details_text || '');
            draftJson = JSON.stringify(draft);
          }
        }
        if (nextResponse === row.response_text && nextDetails === row.details_text && draftJson === (row.draft_json || '')) continue;
        const current = this.getAutomaticMessage(row.id);
        if (current) this.archiveAutomaticMessage(current, 'v0.10.5-siglas-em-todos-os-cards');
        this.db.prepare('UPDATE automatic_messages SET response_text=?,details_text=?,draft_json=?,updated_at=? WHERE id=?')
          .run(nextResponse, nextDetails, draftJson, nowIso(), Number(row.id));
      }

      if (juanDefinition) {
        const row = this.db.prepare('SELECT id,draft_json,package_snapshot_json FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
          .get(juanDefinition.key, juanDefinition.message.title, juanDefinition.key);
        if (row) {
          const current = this.getAutomaticMessage(row.id);
          const nextTrigger = normalizeTriggerRules(juanDefinition.message.trigger);
          let draftJson = row.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') { draft.trigger = nextTrigger; draftJson = JSON.stringify(draft); }
          }
          const packageSnapshot = parseJson(row.package_snapshot_json || '', null);
          if (packageSnapshot && typeof packageSnapshot === 'object') packageSnapshot.trigger = nextTrigger;
          if (current && (JSON.stringify(current.trigger || {}) !== JSON.stringify(nextTrigger) || draftJson !== (row.draft_json || ''))) {
            this.archiveAutomaticMessage(current, 'v0.10.5-gatilhos-felipe-juan');
            this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,updated_at=? WHERE id=?')
              .run(JSON.stringify(nextTrigger), draftJson, JSON.stringify(packageSnapshot || comparableMessageSnapshot(juanDefinition.message)), nowIso(), Number(row.id));
          }
        }
      }

      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0105_calculator_reactions_abbreviations','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }

    this.invalidate('settings', 'activeMessages', 'conflictReport');
    this.cache.calculators = null;
  }

  migrateContentV0106() {
    if (asBool(this.getSetting('content_v0106_private_schedule_acex_reactions', 'false'), false)) return;
    const scheduleDefinition = INSTITUTIONAL_CARDS_V098.find(item => item.key === 'hub-bsi-aulas-semestre-dia-v0106');
    const juanDefinition = INSTITUTIONAL_CARDS_V098.find(item => item.key === 'hub-easter-egg-felipe-juan-v0104');
    const privatePhone = felipeJuanPhone();

    if (scheduleDefinition) this.stagePackageAutomaticMessage(scheduleDefinition.key, scheduleDefinition.message);

    this.db.exec('BEGIN');
    try {
      const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
      const findEmail = value => String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
      for (const item of items) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const email = item.pending ? '' : (findEmail(current.response_text) || item.email || '');
        const nextResponse = buildSiProfessorResponse(item, email);
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            const draftEmail = item.pending ? '' : (findEmail(draft.response_text) || email);
            draft.response_text = buildSiProfessorResponse(item, draftEmail);
            draftJson = JSON.stringify(draft);
          }
        }
        if (nextResponse !== current.response_text || draftJson !== (row.draft_json || '')) {
          this.archiveAutomaticMessage(current, 'v0.10.6-acex-disciplinas');
          this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,updated_at=? WHERE id=?')
            .run(nextResponse, draftJson, nowIso(), Number(row.id));
        }
      }

      for (const shared of buildSharedDisciplineCards2026_2()) {
        const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)').get(shared.title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') { draft.response_text = shared.response_text; draftJson = JSON.stringify(draft); }
        }
        if (current.response_text !== shared.response_text || draftJson !== (row.draft_json || '')) {
          this.archiveAutomaticMessage(current, 'v0.10.6-acex-disciplinas-compartilhadas');
          this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,updated_at=? WHERE id=?')
            .run(shared.response_text, draftJson, nowIso(), Number(row.id));
        }
      }

      const allCards = this.db.prepare('SELECT id,response_text,details_text,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages').all();
      for (const row of allCards) {
        const nextResponse = formatDisciplineNamesInText(row.response_text || '');
        const nextDetails = formatDisciplineNamesInText(row.details_text || '');
        let draftJson = row.draft_json || '';
        let packageSnapshotJson = row.package_snapshot_json || '';
        let pendingPackageJson = row.pending_package_json || '';
        for (const [field, value] of [['draft', draftJson], ['package', packageSnapshotJson], ['pending', pendingPackageJson]]) {
          if (!value) continue;
          const object = parseJson(value, null);
          if (!object || typeof object !== 'object') continue;
          object.response_text = formatDisciplineNamesInText(object.response_text || '');
          object.details_text = formatDisciplineNamesInText(object.details_text || '');
          const encoded = JSON.stringify(object);
          if (field === 'draft') draftJson = encoded;
          else if (field === 'package') packageSnapshotJson = encoded;
          else pendingPackageJson = encoded;
        }
        if (nextResponse === row.response_text && nextDetails === row.details_text && draftJson === (row.draft_json || '') && packageSnapshotJson === (row.package_snapshot_json || '') && pendingPackageJson === (row.pending_package_json || '')) continue;
        const current = this.getAutomaticMessage(row.id);
        if (current) this.archiveAutomaticMessage(current, 'v0.10.6-acex-em-todos-os-cards');
        this.db.prepare('UPDATE automatic_messages SET response_text=?,details_text=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?')
          .run(nextResponse, nextDetails, draftJson, packageSnapshotJson, pendingPackageJson, nowIso(), Number(row.id));
      }

      if (juanDefinition && privatePhone) {
        const row = this.db.prepare('SELECT id,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
          .get(juanDefinition.key, juanDefinition.message.title, juanDefinition.key);
        if (row) {
          const current = this.getAutomaticMessage(row.id);
          const nextResponse = injectFelipeJuanPhone(current?.response_text || juanDefinition.message.response_text, privatePhone);
          let draftJson = row.draft_json || '';
          let packageSnapshotJson = row.package_snapshot_json || '';
          let pendingPackageJson = row.pending_package_json || '';
          for (const [field, value] of [['draft', draftJson], ['package', packageSnapshotJson], ['pending', pendingPackageJson]]) {
            if (!value) continue;
            const object = parseJson(value, null);
            if (!object || typeof object !== 'object') continue;
            object.response_text = injectFelipeJuanPhone(object.response_text || nextResponse, privatePhone);
            const encoded = JSON.stringify(object);
            if (field === 'draft') draftJson = encoded;
            else if (field === 'package') packageSnapshotJson = encoded;
            else pendingPackageJson = encoded;
          }
          if (current && (nextResponse !== current.response_text || draftJson !== (row.draft_json || '') || packageSnapshotJson !== (row.package_snapshot_json || '') || pendingPackageJson !== (row.pending_package_json || ''))) {
            this.archiveAutomaticMessage(current, 'v0.10.6-contato-privado-felipe-juan');
            this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?')
              .run(nextResponse, draftJson, packageSnapshotJson, pendingPackageJson, nowIso(), Number(row.id));
          }
        }
      }

      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0106_private_schedule_acex_reactions','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeMessages', 'conflictReport');
  }

  seedStructuredSectorsV098() {
    if (asBool(this.getSetting('structured_sectors_v098_seeded', 'false'), false)) return;
    const sectors = [
      { acronym: 'CORES', name: 'Coordenação de Registros Escolares', aliases: ['registros escolares','secretaria acadêmica','secretaria academica'], email: 'coresvc@ifba.edu.br', whatsapp: 'https://wa.me/5577999299331', services: ['matrícula e renovação', 'histórico e registros acadêmicos', 'documentos e dados escolares'], source_url: 'https://portal.ifba.edu.br/conquista/ifba-abre-periodo-de-renovacao-de-matricula-para-cursos-tecnicos' },
      { acronym: 'CAENS', name: 'Coordenação de Apoio ao Ensino', aliases: ['apoio ao ensino'], email: 'caens.vdc@ifba.edu.br', whatsapp: 'https://wa.me/5577991318174', location: 'Bloco do CVT, próximo ao Auditório do CVT', services: ['estágio obrigatório e não obrigatório', 'documentos e acompanhamento de estágio', 'oportunidades de estágio'], source_url: 'https://portal.ifba.edu.br/conquista/coordenacao-de-apoio-ao-ensino-caens' },
      { acronym: 'CAPNE', name: 'Coordenação de Atendimento às Pessoas com Necessidades Educacionais Específicas', aliases: ['napnee','acessibilidade','inclusão','inclusao'], email: 'capne.vdc@ifba.edu.br', services: ['acessibilidade e inclusão', 'apoio a estudantes com necessidades educacionais específicas', 'orientação sobre adaptações acadêmicas'], source_url: 'https://portal.ifba.edu.br/conquista/ensino/napnee' },
      { acronym: 'CSI', name: 'Coordenação do Bacharelado em Sistemas de Informação', aliases: ['coordenação de bsi','coordenacao de bsi','coordenação de sistemas de informação','coordenacao de sistemas de informacao','coordenador de bsi','coordenadora de bsi','coordenador de sistemas de informação','coordenadora de sistemas de informação','coordenador de sistemas de informacao','coordenadora de sistemas de informacao','coordenador do curso de bsi','coordenadora do curso de bsi','coordenação do curso de bsi','coordenacao do curso de bsi'], email: 'csi.vdc@ifba.edu.br', phone: '0800 077 0084 — ramal 1261', location: 'Sala H410', services: ['orientação acadêmica do curso', 'PPC, matriz, TCC e estágio de BSI', 'demandas do Colegiado e da Coordenação'], source_url: 'https://portal.ifba.edu.br/conquista/capas-e-paginas-menu-cursos/sistemas-de-informacao' },
      { acronym: 'Biblioteca', name: 'Biblioteca do Campus Vitória da Conquista', aliases: ['biblioteca do ifba','biblioteca vca'], email: 'biblioteca.vdc@ifba.edu.br', phone: '3426-4210 — ramal 2535', location: 'Sala C006', services: ['consulta, empréstimo, renovação e reserva', 'Nada Consta', 'orientação sobre bases e normalização'], source_url: 'https://portal.ifba.edu.br/conquista/ensino/biblioteca' },
      { acronym: 'Serviço Social', name: 'Serviço Social — Assistência Estudantil', aliases: ['assistência estudantil','assistencia estudantil','paae'], email: 'servicosocial.ifba@gmail.com', services: ['PAAE, bolsas e auxílios', 'orientação socioeconômica', 'encaminhamento de demandas de permanência estudantil'], source_url: 'https://portal.ifba.edu.br/conquista/ensino/servico-social-1' },
      { acronym: 'CGTI', name: 'Coordenação de Gestão de Tecnologia da Informação', aliases: ['suporte de informática','suporte de informatica','tecnologia da informação','tecnologia da informacao'], email: 'cgti.conquista@ifba.edu.br', phone: '3426-4210 — ramais 2506 e 2505', services: ['contas institucionais e sistemas', 'rede e equipamentos do campus', 'suporte técnico'], source_url: 'https://portal.ifba.edu.br/conquista/capas-e-paginas-administrativo/cgti-coordenacao-e-gestao-de-ecnologia-da-informacao' },
      { acronym: 'COTEP', name: 'Coordenação Técnico-Pedagógica', aliases: ['apoio pedagógico','apoio pedagogico','pedagogia'], email: 'cotep.ifba@gmail.com', services: ['acompanhamento pedagógico', 'questões de ensino-aprendizagem', 'articulação das áreas pedagógica, psicológica e social'], source_url: 'https://portal.ifba.edu.br/conquista/setor-de-pedagogia' },
      { acronym: 'Ingresso', name: 'Setor de Ingresso — Campus Vitória da Conquista', aliases: ['processo seletivo','sisu ingresso'], email: 'ingresso.conquista@ifba.edu.br', whatsapp: 'https://wa.me/5577998121193', phone: '0800 077 0084', services: ['processos seletivos e chamadas', 'matrícula de ingressantes', 'informações de ingresso'], source_url: 'https://portal.ifba.edu.br/ingresso2026/contato' },
      { acronym: 'Psicologia', name: 'Serviço de Psicologia', aliases: ['psicologia do ifba','psicologia educacional'], email: 'psicologia.vdc@ifba.edu.br', services: ['ações educacionais de bem-estar', 'orientação sobre organização dos estudos', 'formação integral dos estudantes'], source_url: 'https://portal.ifba.edu.br/conquista/setor-de-psicologia' },
      { acronym: 'Nutrição', name: 'Setor de Nutrição e Refeitório Institucional', aliases: ['nutricao','refeitório','refeitorio','alimentação','alimentacao'], services: ['orientações sobre o Refeitório Institucional', 'avisos de atendimento e alimentação', 'encaminhamento de demandas alimentares'], source_url: 'https://portal.ifba.edu.br/conquista/nota-informativa-sobre-o-atendimento-do-refeitorio-institucional' }
    ];
    const existing = this.db.prepare('SELECT id FROM sectors WHERE lower(acronym)=lower(?) OR lower(name)=lower(?) LIMIT 1');
    for (const sector of sectors) {
      const row = existing.get(sector.acronym, sector.name);
      this.saveSector({ ...sector, source_title: 'Página oficial do IFBA', verified_at: '2026-08-01', active: true }, row?.id || null);
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('structured_sectors_v098_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeSectors');
  }

  seedProfessorDirectoryV097() {
    if (asBool(this.getSetting('professor_directory_v097_seeded', 'false'), false)) return;
    const findByEmail = this.db.prepare('SELECT * FROM teachers WHERE lower(email)=lower(?) ORDER BY id LIMIT 1');
    const insert = this.db.prepare(`INSERT INTO teachers(name,email,aliases_json,notes,room,building,room_confirmed_at,room_source,disciplines_json,schedule_json,academic_period,active,is_example,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`);
    const updateStructured = this.db.prepare(`UPDATE teachers SET aliases_json=?,disciplines_json=?,schedule_json=?,academic_period=?,updated_at=? WHERE id=?`);
    this.db.exec('BEGIN');
    try {
      for (const item of SI_PROFESSORS_2026_2) {
        const email = String(item.email || '').trim().toLowerCase();
        if (!email) continue;
        const aliases = [...new Set([...(SI_PROFESSOR_TRIGGER_ALIASES_2026_2[item.name] || []), item.identifier].filter(Boolean))];
        const disciplines = [...new Set((item.classes || []).map(entry => String(entry?.[0] || '').trim()).filter(Boolean))];
        const schedule = (item.classes || []).map(entry => ({
          discipline: String(entry?.[0] || '').trim(), semester: String(entry?.[1] || '').trim(),
          day: String(entry?.[2] || '').trim(), hours: String(entry?.[3] || '').trim(),
          description: String(entry?.[4] || '').trim() ? `Sala: ${String(entry?.[4]).trim()}` : ''
        }));
        const existing = findByEmail.get(email);
        if (!existing) {
          const timestamp = nowIso();
          insert.run(item.name, email, JSON.stringify(aliases), '', '', '', '', '', JSON.stringify(disciplines), JSON.stringify(schedule), '2026.2', 1, timestamp, timestamp);
          continue;
        }
        const mergedAliases = [...new Set([...parseJsonList(existing.aliases_json), ...aliases])];
        const currentDisciplines = parseJsonList(existing.disciplines_json);
        const currentSchedule = parseJson(existing.schedule_json || '[]', []);
        updateStructured.run(
          JSON.stringify(mergedAliases),
          JSON.stringify(currentDisciplines.length ? currentDisciplines : disciplines),
          JSON.stringify(Array.isArray(currentSchedule) && currentSchedule.length ? currentSchedule : schedule),
          String(existing.academic_period || '').trim() || '2026.2',
          nowIso(), Number(existing.id)
        );
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('professor_directory_v097_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeTeachers');
  }

  migrateProfessorLocationV097() {
    if (asBool(this.getSetting('professor_location_v097_migrated', 'false'), false)) return;
    const targetTitle = normalizeText('Onde está o professor — salas do IFBA');
    const responseText = [
      '*Localização de professor*', '',
      'Este cartão consulta o cadastro estruturado de docentes.',
      'Informe o nome do professor ou da professora.', '',
      'Exemplo: `Onde fica o professor Allan?`', '',
      '📍 *Consulta geral de salas:*',
      'https://app.powerbi.com/view?r=eyJrIjoiN2JhMWNmYjMtOWRiNy00OTFlLTg5ODItMWU1ZWZhYzVhNWFjIiwidCI6IjZmZjM3NGY1LWUzZWItNGM2Zi1iN2I1LTUwOTE2NDA5MzdmOCJ9', '',
      'A sala de atendimento pode ser diferente da sala em que ocorre a aula.'
    ].join('\n');
    const trigger = normalizeTriggerRules({
      match_mode: 'all', keywords: [], required_words: [], require_question_mark: true, typo_tolerance: 0,
      sentences: [
        'onde está o professor', 'onde esta o professor', 'onde está a professora', 'onde esta a professora',
        'onde fica o professor', 'onde fica a professora', 'onde fica o docente',
        'onde encontro o professor', 'onde encontro a professora', 'onde encontro o docente',
        'onde está o docente', 'onde esta o docente',
        'sala do professor', 'sala da professora', 'sala do docente',
        'localização do professor', 'localizacao do professor', 'localização da professora', 'localizacao da professora',
        'localização do docente', 'localizacao do docente',
        'consultar sala do professor', 'consultar sala da professora', 'consultar sala do docente'
      ],
      excluded_words: ['coordenação','coordenacao','laboratório','laboratorio','miniauditório','miniauditorio','biblioteca','secretaria','CORES','CAENS','CAPNE','COTEP'],
      exact_phrases: [], synonym_group_ids: [], negative_examples: []
    });
    const rows = this.db.prepare(`SELECT id,title,response_text,trigger_json,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages`).all();
    const update = this.db.prepare(`UPDATE automatic_messages SET response_text=?,trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json='',updated_at=? WHERE id=?`);
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        if (normalizeText(row.title) !== targetTitle) continue;
        const draft = parseJson(row.draft_json || '', null);
        if (draft && typeof draft === 'object') { draft.response_text = responseText; draft.trigger = trigger; }
        const packageSnapshot = parseJson(row.package_snapshot_json || '', null);
        if (packageSnapshot && typeof packageSnapshot === 'object') { packageSnapshot.response_text = responseText; packageSnapshot.trigger = trigger; }
        const current = this.getAutomaticMessage(row.id);
        if (current) this.archiveAutomaticMessage(current, 'v0.9.7-localizacao-docente-estruturada');
        update.run(responseText, JSON.stringify(trigger), draft ? JSON.stringify(draft) : '', packageSnapshot ? JSON.stringify(packageSnapshot) : '', nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('professor_location_v097_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeMessages', 'conflictReport');
  }


  migrateRoomTriggerConflictsV096() {
    if (asBool(this.getSetting('room_trigger_conflicts_v096_migrated', 'false'), false)) return;
    const targetTitle = normalizeText('Onde está o professor — salas do IFBA');
    const unsafe = new Set(['qual sala', 'em qual sala', 'qual é a sala', 'qual e a sala'].map(normalizeText));
    const triggerFields = ['keywords', 'sentences', 'exact_phrases', 'required_words'];
    const sanitizeTrigger = value => {
      const trigger = normalizeTriggerRules(value || {});
      let changed = false;
      for (const field of triggerFields) {
        const before = Array.isArray(trigger[field]) ? trigger[field] : [];
        const after = before.filter(term => !unsafe.has(normalizeText(term)));
        if (after.length !== before.length) changed = true;
        trigger[field] = after;
      }
      return { value: trigger, changed };
    };
    const sanitizeMessage = value => {
      if (!value || typeof value !== 'object') return { value, changed: false };
      const next = clone(value);
      const result = sanitizeTrigger(next.trigger || {});
      next.trigger = result.value;
      return { value: next, changed: result.changed };
    };
    const rows = this.db.prepare(`SELECT id,title,trigger_json,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages`).all();
    const update = this.db.prepare(`UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?`);
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        if (normalizeText(row.title) !== targetTitle) continue;
        const live = sanitizeTrigger(parseJson(row.trigger_json || '{}', {}));
        const draftRaw = parseJson(row.draft_json || '', null);
        const draft = sanitizeMessage(draftRaw);
        const packageRaw = parseJson(row.package_snapshot_json || '', null);
        const packageSnapshot = sanitizeMessage(packageRaw);
        const pendingRaw = parseJson(row.pending_package_json || '', null);
        const pending = sanitizeMessage(pendingRaw);
        if (!live.changed && !draft.changed && !packageSnapshot.changed && !pending.changed) continue;
        update.run(
          JSON.stringify(live.value),
          draftRaw ? JSON.stringify(draft.value) : '',
          packageRaw ? JSON.stringify(packageSnapshot.value) : '',
          pendingRaw ? JSON.stringify(pending.value) : '',
          nowIso(),
          Number(row.id)
        );
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('room_trigger_conflicts_v096_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('settings', 'activeMessages', 'conflictReport');
  }

  migrateQuestionGuardV095() {
    if (asBool(this.getSetting('question_guard_v095_migrated', 'false'), false)) return;
    const rows = this.db.prepare(`SELECT id,trigger_json,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages`).all();
    const guardedTrigger = value => ({ ...normalizeTriggerRules(value || {}), require_question_mark: true });
    const guardedSnapshot = value => {
      const snapshot = value && typeof value === 'object' ? clone(value) : null;
      if (!snapshot) return null;
      snapshot.trigger = guardedTrigger(snapshot.trigger || {});
      return snapshot;
    };
    const update = this.db.prepare(`UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?`);
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const liveTrigger = guardedTrigger(parseJson(row.trigger_json || '{}', {}));
        const draft = parseJson(row.draft_json || '', null);
        if (draft && typeof draft === 'object') draft.trigger = guardedTrigger(draft.trigger || liveTrigger);
        const packageSnapshot = guardedSnapshot(parseJson(row.package_snapshot_json || '', null));
        const pendingSnapshot = guardedSnapshot(parseJson(row.pending_package_json || '', null));
        update.run(
          JSON.stringify(liveTrigger),
          draft ? JSON.stringify(draft) : '',
          packageSnapshot ? JSON.stringify(packageSnapshot) : '',
          pendingSnapshot ? JSON.stringify(pendingSnapshot) : '',
          nowIso(), Number(row.id)
        );
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('question_guard_v095_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }

  migrateConversationQueueV0813() {
    if (asBool(this.getSetting('conversation_queue_v0813_migrated', 'false'), false)) return;
    const stmt = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    stmt.run('delivery_queue_mode', 'per_conversation');
    stmt.run('conversation_queue_v0813_migrated', 'true');
    this.invalidate('settings');
  }

  seedExampleData() {
    if (asBool(this.getSetting('example_data_seeded', 'false'), false)) return;
    const examples = [
      {
        title: '🧪 Exemplo — contato da professora', topic: 'Demonstração', priority: 60, active: true,
        response_text: `🧪 *Professora Exemplo*\n📧 professora.exemplo@exemplo.invalid\n\nEsta mensagem é apenas um modelo e pode ser excluída.`,
        trigger: { sentences: ['professora exemplo', 'profa exemplo', 'prof exemplo'], keywords: [], require_question_mark: false }
      },
      {
        title: '🧪 Exemplo — link de teste', topic: 'Demonstração', priority: 55, active: true,
        response_text: `🧪 *Link de demonstração*\n\nEste é um texto totalmente editável.\n🔗 https://example.com/`,
        trigger: { sentences: ['link de teste', 'link do hub de exemplo'], keywords: [], require_question_mark: false }
      },
      {
        title: '🧪 Exemplo — como testar', topic: 'Demonstração', priority: 50, active: true,
        response_text: '🧪 O bot está recebendo as mensagens. Você pode editar esta resposta por completo ou excluir o modelo.',
        trigger: { sentences: ['como testar o bot', 'como testar o bot?'], keywords: [], require_question_mark: false }
      }
    ];
    for (const example of examples) {
      const item = this.saveAutomaticMessage(example);
      this.db.prepare('UPDATE automatic_messages SET is_example=1 WHERE id=?').run(item.id);
    }
    const day = new Date().toISOString().slice(0, 10);
    this.db.prepare('INSERT INTO usage_stats(day,topic,match_type,count) VALUES (?,?,?,?) ON CONFLICT(day,topic,match_type) DO UPDATE SET count=excluded.count')
      .run(day, '🧪 Demonstração', 'message', 3);
    this.db.prepare('INSERT INTO message_logs(created_at,chat_id,chat_name,message_excerpt,match_type,matched_item,reply_excerpt) VALUES (?,?,?,?,?,?,?)')
      .run(nowIso(), '', '🧪 Grupo de demonstração', 'link de teste', 'example', examples[1].title, examples[1].response_text.slice(0, 240));
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('example_data_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }

  seedSiProfessors2026_2() {
    if (asBool(this.getSetting('si_professors_2026_2_seeded', 'false'), false)) return;

    const responseFor = item => buildSiProfessorResponse(item);
    const saveIfMissing = item => {
      const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
      const exists = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
      if (exists) return false;
      this.saveAutomaticMessage({
        title,
        response_text: responseFor(item),
        priority: item.pending ? 28 : 35,
        active: true,
        archived: false,
        scope: 'both',
        tags: item.pending
          ? ['professor', 'si', '2026-2', 'horario', 'pendencia']
          : [
              'professor', 'si', '2026-2', 'contato', 'horario',
              String(item.email || '').includes('@') ? 'email' : 'email-pendente'
            ],
        trigger: {
          match_mode: 'all',
          sentences: buildSiProfessorTriggerSentences(item),
          keywords: [],
          required_words: [],
          require_question_mark: true,
          typo_tolerance: 1,
          excluded_words: Array.isArray(item.excluded) ? item.excluded : [],
          exact_phrases: [],
          synonym_group_ids: [],
          negative_examples: []
        }
      });
      return true;
    };

    for (const professor of SI_PROFESSORS_2026_2) saveIfMissing(professor);
    saveIfMissing(SI_PENDING_2026_2);
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_professors_2026_2_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }

  migrateSiProfessorTriggersV082() {
    if (asBool(this.getSetting('si_professors_2026_2_triggers_v082_migrated', 'false'), false)) return;
    const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
    const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
    const update = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,updated_at=? WHERE id=?');
    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = select.get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        this.archiveAutomaticMessage(current, 'v0.8.2-gatilhos-explicitos');
        const trigger = normalizeTriggerRules({
          match_mode: 'all',
          sentences: buildSiProfessorTriggerSentences(item),
          keywords: [],
          required_words: [],
          require_question_mark: true,
          typo_tolerance: 1,
          excluded_words: Array.isArray(item.excluded) ? item.excluded : [],
          exact_phrases: [],
          synonym_group_ids: [],
          negative_examples: []
        });
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.trigger = trigger;
            draftJson = JSON.stringify(draft);
          }
        }
        update.run(JSON.stringify(trigger), draftJson, nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_professors_2026_2_triggers_v082_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }

  migrateSiProfessorEmailsV083() {
    if (asBool(this.getSetting('si_professors_2026_2_emails_v083_migrated', 'false'), false)) return;
    const items = SI_PROFESSORS_2026_2.filter(item => !item.pending && item.email);
    const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
    const update = this.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=?,draft_json=?,updated_at=? WHERE id=?');

    const currentEmail = professorContactValue;
    const replaceEmail = replaceProfessorContact;
    const tagsFor = (tags, response, providedEmail) => {
      const set = new Set((Array.isArray(tags) ? tags : []).map(normalizeTag).filter(Boolean));
      const effective = currentEmail(response) || providedEmail || '';
      if (effective.includes('@')) {
        set.delete('email-pendente');
        set.add('email');
      } else {
        set.delete('email');
        set.add('email-pendente');
      }
      return [...set];
    };

    this.db.exec('BEGIN');
    try {
      for (const item of items) {
        const title = `Professor — ${item.name}`;
        const row = select.get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;

        const nextResponse = replaceEmail(current.response_text, item.email);
        const nextTags = tagsFor(current.tags, nextResponse, item.email);
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.response_text = replaceEmail(draft.response_text || current.response_text, item.email);
            draft.tags = tagsFor(draft.tags || current.tags, draft.response_text, item.email);
            draftJson = JSON.stringify(draft);
          }
        }

        const responseChanged = nextResponse !== current.response_text;
        const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(current.tags || []);
        const draftChanged = draftJson !== (row.draft_json || '');
        if (!responseChanged && !tagsChanged && !draftChanged) continue;
        this.archiveAutomaticMessage(current, 'v0.8.3-emails-institucionais');
        update.run(nextResponse, JSON.stringify(nextTags), draftJson, nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_professors_2026_2_emails_v083_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }

  migrateSiProfessorLuanaEmailV084() {
    if (asBool(this.getSetting('si_professors_2026_2_luana_email_v084_migrated', 'false'), false)) return;
    const item = SI_PROFESSORS_2026_2.find(entry => entry.name === 'Luana Lima Bittencourt Silva');
    const title = 'Professor — Luana Lima Bittencourt Silva';
    const row = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)').get(title);

    const currentEmail = professorContactValue;
    const replaceEmail = response => replaceProfessorContact(response, item?.email || '');
    const tagsFor = (tags, response) => {
      const set = new Set((Array.isArray(tags) ? tags : []).map(normalizeTag).filter(Boolean));
      if (currentEmail(response).includes('@')) {
        set.delete('email-pendente');
        set.add('email');
      }
      return [...set];
    };

    this.db.exec('BEGIN');
    try {
      if (row) {
        const current = this.getAutomaticMessage(row.id);
        if (current) {
          const nextResponse = replaceEmail(current.response_text);
          const nextTags = tagsFor(current.tags, nextResponse);
          let draftJson = row.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') {
              draft.response_text = replaceEmail(draft.response_text || current.response_text);
              draft.tags = tagsFor(draft.tags || current.tags, draft.response_text);
              draftJson = JSON.stringify(draft);
            }
          }
          const responseChanged = nextResponse !== current.response_text;
          const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(current.tags || []);
          const draftChanged = draftJson !== (row.draft_json || '');
          if (responseChanged || tagsChanged || draftChanged) {
            this.archiveAutomaticMessage(current, 'v0.8.4-email-luana');
            this.db.prepare('UPDATE automatic_messages SET response_text=?,tags_json=?,draft_json=?,updated_at=? WHERE id=?')
              .run(nextResponse, JSON.stringify(nextTags), draftJson, nowIso(), Number(row.id));
          }
        }
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_professors_2026_2_luana_email_v084_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }

  seedSiSupportMessagesV083() {
    if (asBool(this.getSetting('si_support_messages_v083_seeded', 'false'), false)) return;
    for (const item of SI_SUPPORT_MESSAGES_V083) {
      const exists = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(item.title);
      if (!exists) this.saveAutomaticMessage(automaticMessagePayload(item));
    }
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_support_messages_v083_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }


  migrateSiContentV085() {
    if (asBool(this.getSetting('si_content_v085_migrated', 'false'), false)) return;
    const professorItems = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
    const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
    const update = this.db.prepare('UPDATE automatic_messages SET response_text=?,trigger_json=?,draft_json=?,updated_at=? WHERE id=?');
    const emailFrom = professorContactValue;

    this.db.exec('BEGIN');
    try {
      for (const item of professorItems) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = select.get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const currentEmail = emailFrom(current.response_text);
        const emailOverride = currentEmail && !/^\[(?:ADICIONAR|IDENTIFICAR)/i.test(currentEmail)
          ? currentEmail
          : (item.email || '');
        const nextResponse = buildSiProfessorResponse(item, emailOverride);
        const nextTrigger = normalizeTriggerRules({
          ...(current.trigger || {}),
          match_mode: 'all',
          sentences: buildSiProfessorTriggerSentences(item),
          keywords: [],
          required_words: []
        });
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            const draftEmail = emailFrom(draft.response_text || current.response_text);
            const draftOverride = draftEmail && !/^\[(?:ADICIONAR|IDENTIFICAR)/i.test(draftEmail)
              ? draftEmail
              : emailOverride;
            draft.response_text = buildSiProfessorResponse(item, draftOverride);
            draft.trigger = nextTrigger;
            draftJson = JSON.stringify(draft);
          }
        }
        const changed = nextResponse !== current.response_text
          || JSON.stringify(nextTrigger) !== JSON.stringify(current.trigger || {})
          || draftJson !== (row.draft_json || '');
        if (!changed) continue;
        this.archiveAutomaticMessage(current, 'v0.8.5-textos-e-gatilhos-por-disciplina');
        update.run(nextResponse, JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
      }

      for (const item of SI_SUPPORT_MESSAGES_V083) {
        const row = select.get(item.title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.response_text = item.response_text;
            draftJson = JSON.stringify(draft);
          }
        }
        if (current.response_text === item.response_text && draftJson === (row.draft_json || '')) continue;
        this.archiveAutomaticMessage(current, 'v0.8.5-textos-enxutos');
        this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,updated_at=? WHERE id=?')
          .run(item.response_text, draftJson, nowIso(), Number(row.id));
      }

      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_content_v085_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }


  migrateSiTriggersV086() {
    if (asBool(this.getSetting('si_triggers_v086_migrated', 'false'), false)) return;
    const professorItems = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
    const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
    const update = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,updated_at=? WHERE id=?');
    const triggerFor = (currentTrigger, sentences) => normalizeTriggerRules({
      ...(currentTrigger || {}),
      match_mode: 'all',
      sentences,
      keywords: [],
      required_words: []
    });

    this.db.exec('BEGIN');
    try {
      for (const item of professorItems) {
        const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
        const row = select.get(title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const nextTrigger = triggerFor(current.trigger, buildSiProfessorTriggerSentences(item));
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.trigger = triggerFor(draft.trigger || current.trigger, buildSiProfessorTriggerSentences(item));
            draftJson = JSON.stringify(draft);
          }
        }
        const changed = JSON.stringify(nextTrigger) !== JSON.stringify(current.trigger || {})
          || draftJson !== (row.draft_json || '');
        if (!changed) continue;
        this.archiveAutomaticMessage(current, 'v0.8.6-siglas-e-abreviacoes');
        update.run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
      }

      for (const item of SI_SUPPORT_MESSAGES_V083) {
        const row = select.get(item.title);
        if (!row) continue;
        const current = this.getAutomaticMessage(row.id);
        if (!current) continue;
        const nextTrigger = triggerFor(current.trigger, item.sentences || []);
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') {
            draft.trigger = triggerFor(draft.trigger || current.trigger, item.sentences || []);
            draftJson = JSON.stringify(draft);
          }
        }
        const changed = JSON.stringify(nextTrigger) !== JSON.stringify(current.trigger || {})
          || draftJson !== (row.draft_json || '');
        if (!changed) continue;
        this.archiveAutomaticMessage(current, 'v0.8.6-gatilhos-especificos');
        update.run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
      }

      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_triggers_v086_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }


  migrateSiSupportTriggersV087() {
    if (asBool(this.getSetting('si_support_triggers_v087_migrated', 'false'), false)) return;
    const sectorTitles = new Set(['Setor — CAPNE', 'Setor — CORES', 'Setor — CAENS']);
    const select = this.db.prepare('SELECT id,draft_json FROM automatic_messages WHERE lower(title)=lower(?)');
    const update = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,updated_at=? WHERE id=?');
    this.db.exec('BEGIN');
    try {
      for (const item of SI_SUPPORT_MESSAGES_V083.filter(entry => sectorTitles.has(entry.title))) {
        const row = select.get(item.title); if (!row) continue;
        const current = this.getAutomaticMessage(row.id); if (!current) continue;
        const nextTrigger = normalizeTriggerRules(automaticMessagePayload(item).trigger);
        let draftJson = row.draft_json || '';
        if (draftJson) {
          const draft = parseJson(draftJson, null);
          if (draft && typeof draft === 'object') { draft.trigger = nextTrigger; draftJson = JSON.stringify(draft); }
        }
        if (JSON.stringify(nextTrigger) === JSON.stringify(current.trigger || {}) && draftJson === (row.draft_json || '')) continue;
        this.archiveAutomaticMessage(current, 'v0.8.7-gatilhos-setores-robustos');
        update.run(JSON.stringify(nextTrigger), draftJson, nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_support_triggers_v087_migrated','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    this.invalidate('settings', 'activeMessages');
  }


  seedScheduleBoardV0812() {
    if (asBool(this.getSetting('schedule_board_v0812_seeded', 'false'), false)) return;
    const item = SCHEDULE_BOARD_V0812;
    const exists = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(item.title);
    if (!exists) this.saveAutomaticMessage(automaticMessagePayload(item));
    this.db.prepare("INSERT INTO settings(key,value) VALUES ('schedule_board_v0812_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
    this.invalidate('settings', 'activeMessages');
  }

  deleteExampleData() {
    const counts = {};
    this.db.exec('BEGIN');
    try {
      counts.messages = Number(this.db.prepare('DELETE FROM automatic_messages WHERE is_example=1').run().changes || 0);
      counts.legacy = Number(this.db.prepare('DELETE FROM hub_links WHERE is_example=1').run().changes || 0)
        + Number(this.db.prepare('DELETE FROM faq_entries WHERE is_example=1').run().changes || 0)
        + Number(this.db.prepare('DELETE FROM teachers WHERE is_example=1').run().changes || 0)
        + Number(this.db.prepare('DELETE FROM synonym_groups WHERE is_example=1').run().changes || 0);
      counts.logs = Number(this.db.prepare("DELETE FROM message_logs WHERE match_type='example'").run().changes || 0);
      counts.statistics = Number(this.db.prepare("DELETE FROM usage_stats WHERE topic LIKE '🧪%'").run().changes || 0);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.invalidate('settings', 'activeMessages', 'activeTeachers', 'activeLinks', 'activeFaqs', 'synonyms');
    return { ...counts, deleted_total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  }

  };
};
