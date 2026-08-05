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
    },

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
    },

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
    },

    migrateContentV0107() {
      if (asBool(this.getSetting('content_v0107_coordination_schedule_titles', 'false'), false)) return;
      const keys = new Set([
        'hub-bsi-aulas-semestre-dia-v0106',
        'hub-bsi-contato-coordenacao-v0107'
      ]);
      for (const definition of INSTITUTIONAL_CARDS_V098.filter(item => keys.has(item.key))) {
        this.stagePackageAutomaticMessage(definition.key, definition.message);
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0107_coordination_schedule_titles','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    },

    migrateContentV0108() {
      if (asBool(this.getSetting('content_v0108_current_bsi_coordinator', 'false'), false)) return;
      const keys = new Set([
        'ifba-bsi-v095-bsi-coordenador-atual',
        'hub-bsi-contato-coordenacao-v0107'
      ]);
      const patchText = (value) => String(value || '')
        .replaceAll('Cláudio Rodolfo Sousa de Oliveira', 'Pablo Freire Matos')
        .replace(/\n\nNomeação indicada na página: Portaria nº 743\/2025\/Reitoria, de 26 de fevereiro de 2025\./gu, '');
      this.db.exec('BEGIN');
      try {
        for (const definition of INSTITUTIONAL_CARDS_V098.filter(item => keys.has(item.key))) {
          this.stagePackageAutomaticMessage(definition.key, definition.message);
          this.invalidate('activeMessages');
          const row = this.db.prepare('SELECT id,response_text,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
            .get(definition.key, definition.message.title, definition.key);
          if (!row) continue;
          const current = this.getAutomaticMessage(row.id);
          let draftJson = row.draft_json || '';
          let packageSnapshotJson = row.package_snapshot_json || '';
          let pendingPackageJson = row.pending_package_json || '';
          for (const [field, value] of [['draft', draftJson], ['package', packageSnapshotJson], ['pending', pendingPackageJson]]) {
            if (!value) continue;
            const object = parseJson(value, null);
            if (!object || typeof object !== 'object') continue;
            object.response_text = patchText(object.response_text);
            const encoded = JSON.stringify(object);
            if (field === 'draft') draftJson = encoded;
            else if (field === 'package') packageSnapshotJson = encoded;
            else pendingPackageJson = encoded;
          }
          const nextResponse = patchText(current?.response_text || definition.message.response_text);
          if (current && (nextResponse !== current.response_text || draftJson !== (row.draft_json || '') || packageSnapshotJson !== (row.package_snapshot_json || '') || pendingPackageJson !== (row.pending_package_json || ''))) {
            this.archiveAutomaticMessage(current, 'v0.10.8-correcao-coordenador-bsi');
            this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,verified_at=?,updated_at=? WHERE id=?')
              .run(nextResponse, draftJson, packageSnapshotJson, pendingPackageJson, '2026-08-03', nowIso(), Number(row.id));
          }
        }
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0108_current_bsi_coordinator','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    },

    migrateContentV0109() {
      if (asBool(this.getSetting('content_v0109_professor_schedule_private_reactions', 'false'), false)) return;
      const items = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
      const select = this.db.prepare('SELECT id,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages WHERE lower(title)=lower(?)');
      const update = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?');
      this.db.exec('BEGIN');
      try {
        for (const item of items) {
          const title = item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`;
          const row = select.get(title);
          if (!row) continue;
          const current = this.getAutomaticMessage(row.id);
          if (!current) continue;
          const sentences = buildSiProfessorTriggerSentences(item);
          const nextTrigger = normalizeTriggerRules({
            ...(current.trigger || {}), match_mode: 'all', sentences, keywords: [], required_words: []
          });
          let draftJson = row.draft_json || '';
          let packageSnapshotJson = row.package_snapshot_json || '';
          let pendingPackageJson = row.pending_package_json || '';
          for (const [field, value] of [['draft', draftJson], ['package', packageSnapshotJson], ['pending', pendingPackageJson]]) {
            if (!value) continue;
            const object = parseJson(value, null);
            if (!object || typeof object !== 'object') continue;
            object.trigger = normalizeTriggerRules({
              ...(object.trigger || current.trigger || {}), match_mode: 'all', sentences, keywords: [], required_words: []
            });
            const encoded = JSON.stringify(object);
            if (field === 'draft') draftJson = encoded;
            else if (field === 'package') packageSnapshotJson = encoded;
            else pendingPackageJson = encoded;
          }
          const changed = JSON.stringify(nextTrigger) !== JSON.stringify(current.trigger || {})
            || draftJson !== (row.draft_json || '')
            || packageSnapshotJson !== (row.package_snapshot_json || '')
            || pendingPackageJson !== (row.pending_package_json || '');
          if (!changed) continue;
          this.archiveAutomaticMessage(current, 'v0.10.9-perguntas-dias-materias-docentes');
          update.run(JSON.stringify(nextTrigger), draftJson, packageSnapshotJson, pendingPackageJson, nowIso(), Number(row.id));
        }
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0109_professor_schedule_private_reactions','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    },

    migrateContentV0110() {
      if (asBool(this.getSetting('content_v0110_structured_schedule_calendar_typos', 'false'), false)) return;
      const professorItems = [...SI_PROFESSORS_2026_2, SI_PENDING_2026_2];
      const records = professorItems.map(item => ({
        name: item.name,
        email: item.email || '',
        academic_period: '2026.2',
        classes: (item.classes || []).map(([discipline, semester, day, hours, room]) => ({ discipline, semester, day, hours, room }))
      }));
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM professor_schedule_entries WHERE academic_period=?').run('2026.2');
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.replaceProfessorScheduleEntries(records, {
        academicPeriod: '2026.2',
        source: {
          file: SI_SCHEDULE_SOURCE_2026_2.file,
          version: SI_SCHEDULE_SOURCE_2026_2.version,
          published_at: SI_SCHEDULE_SOURCE_2026_2.published_at
        }
      });
    
      for (const event of ACADEMIC_CALENDAR_EVENTS_2026) {
        const existing = this.db.prepare('SELECT id FROM academic_calendar_events WHERE package_key=?').get(event.key);
        if (!existing) this.saveAcademicCalendarEvent({ ...event, package_key: event.key, active: true });
      }
    
      const rows = this.db.prepare("SELECT id,title,trigger_json,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages").all();
      const update = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?');
      const acronymPattern = /\b(?:caens|cores|acex)\b/u;
      const professorByTitle = new Map(professorItems.map(item => [normalizeText(item.pending ? 'Pendência — Meio Ambiente (docente substituto)' : `Professor — ${item.name}`), item]));
      for (const row of rows) {
        const liveTrigger = parseJson(row.trigger_json || '{}', {});
        const professorItem = professorByTitle.get(normalizeText(row.title));
        const patchSnapshot = (value, transform) => {
          if (!value) return value || '';
          const object = parseJson(value, null);
          if (!object || typeof object !== 'object') return value;
          if (object.trigger) object.trigger = transform(object.trigger);
          return JSON.stringify(object);
        };
        if (professorItem) {
          const officialSentences = buildSiProfessorTriggerSentences(professorItem);
          const mergeProfessorTrigger = trigger => normalizeTriggerRules({
            ...trigger, typo_tolerance: 0,
            sentences: [...new Set([...(trigger?.sentences || []), ...officialSentences])]
          });
          const trigger = mergeProfessorTrigger(liveTrigger);
          update.run(JSON.stringify(trigger), patchSnapshot(row.draft_json, mergeProfessorTrigger), patchSnapshot(row.package_snapshot_json, mergeProfessorTrigger), patchSnapshot(row.pending_package_json, mergeProfessorTrigger), nowIso(), Number(row.id));
          continue;
        }
        if (!acronymPattern.test(normalizeText(JSON.stringify(liveTrigger)))) continue;
        const acronymTrigger = trigger => normalizeTriggerRules({ ...trigger, typo_tolerance: 1 });
        update.run(JSON.stringify(acronymTrigger(liveTrigger)), patchSnapshot(row.draft_json, acronymTrigger), patchSnapshot(row.package_snapshot_json, acronymTrigger), patchSnapshot(row.pending_package_json, acronymTrigger), nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0110_structured_schedule_calendar_typos','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    }
  };
};
