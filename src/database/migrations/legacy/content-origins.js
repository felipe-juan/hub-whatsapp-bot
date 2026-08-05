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
              exact_phrases: buildSiProfessorExactNamePhrases(item), synonym_group_ids: [], negative_examples: []
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
  };
};
