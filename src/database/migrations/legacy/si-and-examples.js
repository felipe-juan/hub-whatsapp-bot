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
    migrateConversationQueueV0813() {
      if (asBool(this.getSetting('conversation_queue_v0813_migrated', 'false'), false)) return;
      const stmt = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      stmt.run('delivery_queue_mode', 'per_conversation');
      stmt.run('conversation_queue_v0813_migrated', 'true');
      this.invalidate('settings');
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    seedSiSupportMessagesV083() {
      if (asBool(this.getSetting('si_support_messages_v083_seeded', 'false'), false)) return;
      for (const item of SI_SUPPORT_MESSAGES_V083) {
        const exists = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(item.title);
        if (!exists) this.saveAutomaticMessage(automaticMessagePayload(item));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('si_support_messages_v083_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages');
    },

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
    },

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
    },

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
    },

    seedScheduleBoardV0812() {
      if (asBool(this.getSetting('schedule_board_v0812_seeded', 'false'), false)) return;
      const item = SCHEDULE_BOARD_V0812;
      const exists = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(item.title);
      if (!exists) this.saveAutomaticMessage(automaticMessagePayload(item));
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('schedule_board_v0812_seeded','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages');
    },

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
