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
    migrateContentV0130() {
      if (asBool(this.getSetting('content_v0130_management_and_triggers', 'false'), false)) return;
      const title = 'BSI — Contato da coordenação';
      const row = this.db.prepare('SELECT id,trigger_json,draft_json,package_snapshot_json,pending_package_json FROM automatic_messages WHERE lower(title)=lower(?) ORDER BY id LIMIT 1').get(title);
      const coordinatorSentences = [
        'contato coordenador', 'contato do coordenador', 'contato da coordenação', 'contato coordenação',
        'qual o contato do coordenador', 'qual é o contato do coordenador', 'qual e o contato do coordenador',
        'qual o contato da coordenação', 'qual é o contato da coordenação', 'qual e o contato da coordenação',
        'email do coordenador', 'e-mail do coordenador', 'email da coordenação', 'e-mail da coordenação',
        'telefone do coordenador', 'telefone da coordenação', 'ramal do coordenador', 'ramal da coordenação',
        'como falar com o coordenador', 'como falar com a coordenação', 'como entrar em contato com o coordenador',
        'como entrar em contato com a coordenação', 'contato do coordenador de bsi', 'contato da coordenação de bsi',
        'contato do coordenador de sistemas de informação', 'contato da coordenação de sistemas de informação',
        'contato csi', 'coordenação bsi contato'
      ];
      if (row) {
        const merge = value => {
          const object = value && typeof value === 'object' ? value : {};
          return normalizeTriggerRules({
            ...object,
            sentences: [...new Set([...(object.sentences || []), ...coordinatorSentences])],
            typo_tolerance: Math.min(1, Number(object.typo_tolerance ?? 1)),
            require_question_mark: true
          });
        };
        const live = merge(parseJson(row.trigger_json || '{}', {}));
        const patchSnapshot = value => {
          if (!value) return value || '';
          const object = parseJson(value, null);
          if (!object || typeof object !== 'object') return value;
          object.trigger = merge(object.trigger || live);
          return JSON.stringify(object);
        };
        this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?')
          .run(JSON.stringify(live), patchSnapshot(row.draft_json), patchSnapshot(row.package_snapshot_json), patchSnapshot(row.pending_package_json), nowIso(), Number(row.id));
      }
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0130_management_and_triggers','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'conflictReport');
    },

    migrateContentV0140() {
      if (asBool(this.getSetting('content_v0140_precision_performance', 'false'), false)) return;
      const timestamp = nowIso();
      const rows = this.db.prepare('SELECT id,title,draft_json,package_snapshot_json,pending_package_json,trigger_json,response_text FROM automatic_messages').all();
      const patchObjectTitle = value => {
        if (!value) return value || '';
        const object = parseJson(value, null);
        if (!object || typeof object !== 'object') return value;
        if (object.title) object.title = toPortugueseTitleCase(object.title);
        return JSON.stringify(object);
      };
      const update = this.db.prepare('UPDATE automatic_messages SET title=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?');
      const updateTriggerResponse = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,response_text=?,updated_at=? WHERE id=?');
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          update.run(toPortugueseTitleCase(row.title), patchObjectTitle(row.draft_json), patchObjectTitle(row.package_snapshot_json), patchObjectTitle(row.pending_package_json), timestamp, Number(row.id));
        }
        this.db.prepare("UPDATE calculators SET label='Calculadora de Prova Final',description='Com uma nota, usa a média informada; com várias, calcula a média das unidades e a nota mínima da prova final.',updated_at=? WHERE key='final'").run(timestamp);
    
        // Repara gatilhos genéricos herdados da antiga tabela da final sem
        // apagar frases específicas adicionadas pelo administrador. A fonte
        // canônica passa a ser o cartão atual do pacote.
        const mediaDefinition = (CAMPUS_CARDS || []).find(item => item.key === 'si-support-hub-media-final-e-tabela-da-final')?.message;
        const mediaRow = this.db.prepare("SELECT id,trigger_json FROM automatic_messages WHERE lower(title)=lower('HUB — Média Final e Tabela da Final') ORDER BY id LIMIT 1").get();
        if (mediaDefinition && mediaRow) {
          const currentMedia = this.getAutomaticMessage(mediaRow.id);
          const currentTrigger = normalizeTriggerRules(parseJson(mediaRow.trigger_json || '{}', {}));
          const canonicalTrigger = normalizeTriggerRules(mediaDefinition.trigger || {});
          const unsafe = new Set(['tabela', 'nota final'].map(normalizeText));
          const customSafe = (currentTrigger.sentences || []).filter(sentence => !unsafe.has(normalizeText(sentence)));
          const repaired = normalizeTriggerRules({
            ...currentTrigger,
            ...canonicalTrigger,
            sentences: [...new Set([...(canonicalTrigger.sentences || []), ...customSafe])]
          });
          if (JSON.stringify(repaired) !== JSON.stringify(currentTrigger)) {
            if (currentMedia) this.archiveAutomaticMessage(currentMedia, 'v0.14.0-gatilhos-estruturados');
            this.db.prepare('UPDATE automatic_messages SET trigger_json=?,updated_at=? WHERE id=?').run(JSON.stringify(repaired), timestamp, Number(mediaRow.id));
          }
        }
    
        const juan = this.db.prepare("SELECT id,trigger_json,response_text FROM automatic_messages WHERE lower(title)=lower('Contato — Felipe Juan') ORDER BY id LIMIT 1").get();
        if (juan) {
          const trigger = normalizeTriggerRules(parseJson(juan.trigger_json || '{}', {}));
          trigger.sentences = [...new Set(['felipe', ...(trigger.sentences || [])])];
          trigger.exact_phrases = [...new Set(['juan','felipe', ...(trigger.exact_phrases || [])])];
          let response = String(juan.response_text || '')
            .replace('*Projeto para o curso*', '*Projeto para o Curso*')
            .replace('*Para conhecer meus hobbies*', '*Para Conhecer Meus Hobbies*');
          if (!response.includes('felipe-juan.github.io/hub-arquivos-ifba')) {
            response = response.replace(/\n\n🎮 \*Para conhecer meus hobbies\*/u, '\n\n🌐 *Projeto para o Curso*\nhttps://felipe-juan.github.io/hub-arquivos-ifba/\n\n🎮 *Para Conhecer Meus Hobbies*');
          }
          updateTriggerResponse.run(JSON.stringify(trigger), response, timestamp, Number(juan.id));
        }
    
        for (const professor of SI_PROFESSORS_2026_2) {
          const row = this.db.prepare('SELECT id,trigger_json FROM automatic_messages WHERE lower(title)=lower(?) ORDER BY id LIMIT 1').get(`Professor — ${professor.name}`);
          if (!row) continue;
          const trigger = normalizeTriggerRules(parseJson(row.trigger_json || '{}', {}));
          const generatedDiscipline = new Set((professor.classes || []).flatMap(entry => buildDisciplineTriggerSentences(entry[0])).map(normalizeText));
          trigger.sentences = (trigger.sentences || []).filter(sentence => !generatedDiscipline.has(normalizeText(sentence)));
          trigger.sentences = [...new Set([...buildSiProfessorNameTriggerSentences(professor), ...trigger.sentences])];
          this.db.prepare('UPDATE automatic_messages SET trigger_json=?,updated_at=? WHERE id=?').run(JSON.stringify(trigger), timestamp, Number(row.id));
        }
    
        const seedRegression = this.db.prepare(`INSERT OR IGNORE INTO regression_cases(phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`);
        const cases = [
          ['quais aulas tem hoje no terceiro semestre','respond','BSI — Aulas por Semestre e Dia'],
          ['qual sala de Pablo','respond','Professor — Pablo Freire Matos'],
          ['vai ter aula hoje normal','ignore',''],
          ['hoje tem aula de Pablo?','ignore',''],
          ['a aula de hoje foi boa','ignore',''],
          ['hoje não teremos aula','ignore','']
        ];
        for (const [phrase, expectation, expectedTitle] of cases) seedRegression.run(phrase, normalizeText(phrase), expectation, expectedTitle, timestamp, timestamp);
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0140_precision_performance','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings', 'activeMessages', 'messageSummaries', 'conflictReport', 'calculators');
    },

    migrateContentV0142() {
      if (asBool(this.getSetting('content_v0142_selective_cards_and_repository', 'false'), false)) return;
      const timestamp = nowIso();
      const hubUrl = 'https://felipe-juan.github.io/hub-arquivos-ifba/';
      const relatedTitles = new Set([
        'BSI — Página Oficial do Curso',
        'BSI — PPC Atual',
        'HUB — Fluxograma e Matriz de Sistemas de Informação',
        'BSI — Disciplinas Optativas',
        'BSI — Ementas e Bibliografias',
        'BSI — Pré-Requisitos das Disciplinas',
        'BSI — Equivalência entre Matrizes',
        'BSI — Migração Curricular',
        'BSI — Regulamentos Específicos',
        'BSI — Atividades Complementares da Matriz Atual',
        'BSI — Atividades Complementares de Matrizes Anteriores'
      ].map(normalizeText));
      const addHub = value => {
        const text = String(value || '').trim();
        if (!text || text.includes('felipe-juan.github.io/hub-arquivos-ifba')) return text;
        return `${text}\n\n🌐 *HUB Arquivos IFBA*\n${hubUrl}`.trim();
      };
      const patchJsonResponse = (value, transform) => {
        if (!value) return value || '';
        const object = parseJson(value, null);
        if (!object || typeof object !== 'object') return value;
        if (typeof object.response_text === 'string') object.response_text = transform(object.response_text);
        return JSON.stringify(object);
      };
      const addRepositoryTrigger = triggerInput => {
        const trigger = normalizeTriggerRules(triggerInput || {});
        // “repositório” é um atalho exato: funciona quando ocupa a mensagem
        // inteira, sem colidir com perguntas sobre o repositório institucional.
        const direct = new Set(['repositorio']);
        trigger.sentences = (trigger.sentences || []).filter(value => !direct.has(normalizeText(value)));
        trigger.exact_phrases = [...new Set([...(trigger.exact_phrases || []), 'repositório', 'repositorio'])];
        return trigger;
      };
      const driveScore = row => {
        const title = normalizeText(row.title || '');
        const response = normalizeText(row.response_text || '');
        let score = Number(row.priority || 0);
        if (title.includes('drive')) score += 200;
        if (title.includes('link')) score += 80;
        if (title.includes('repositorio')) score += 60;
        if (String(row.response_text || '').includes('drive.google.com')) score += 50;
        if (response.includes('google drive')) score += 30;
        return score;
      };
    
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const rows = this.db.prepare('SELECT id,title,response_text,trigger_json,draft_json,package_snapshot_json,pending_package_json,priority FROM automatic_messages').all();
        const updateHub = this.db.prepare('UPDATE automatic_messages SET response_text=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?');
        for (const row of rows) {
          if (!relatedTitles.has(normalizeText(row.title))) continue;
          const next = addHub(row.response_text);
          const draft = patchJsonResponse(row.draft_json, addHub);
          const snapshot = patchJsonResponse(row.package_snapshot_json, addHub);
          const pending = patchJsonResponse(row.pending_package_json, addHub);
          if (next === row.response_text && draft === (row.draft_json || '') && snapshot === (row.package_snapshot_json || '') && pending === (row.pending_package_json || '')) continue;
          const current = this.getAutomaticMessage(row.id);
          if (current) this.archiveAutomaticMessage(current, 'v0.14.2-link-hub-relacionado');
          updateHub.run(next, draft, snapshot, pending, timestamp, Number(row.id));
        }
    
        const driveCandidates = rows.filter(row => {
          const title = normalizeText(row.title || '');
          const response = String(row.response_text || '');
          return response.includes('drive.google.com') || title.includes('drive') || title.includes('links do drive');
        }).sort((a, b) => driveScore(b) - driveScore(a));
        const drive = driveCandidates[0];
        if (drive) {
          const current = this.getAutomaticMessage(drive.id);
          const trigger = addRepositoryTrigger(parseJson(drive.trigger_json || '{}', {}));
          const patchTriggerJson = value => {
            if (!value) return value || '';
            const object = parseJson(value, null);
            if (!object || typeof object !== 'object') return value;
            object.trigger = addRepositoryTrigger(object.trigger || trigger);
            return JSON.stringify(object);
          };
          if (current) this.archiveAutomaticMessage(current, 'v0.14.2-gatilho-repositorio-drive');
          this.db.prepare('UPDATE automatic_messages SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?')
            .run(JSON.stringify(trigger), patchTriggerJson(drive.draft_json), patchTriggerJson(drive.package_snapshot_json), patchTriggerJson(drive.pending_package_json), timestamp, Number(drive.id));
        }
    
        const legacyRows = this.db.prepare('SELECT id,title,url,response_text,keywords_json,trigger_json,draft_json,priority FROM hub_links').all();
        const legacyDrive = legacyRows.filter(row => String(row.url || '').includes('drive.google.com') || String(row.response_text || '').includes('drive.google.com') || normalizeText(row.title || '').includes('drive'))
          .sort((a, b) => driveScore(b) - driveScore(a))[0];
        if (legacyDrive) {
          const trigger = addRepositoryTrigger(parseJson(legacyDrive.trigger_json || '{}', {}));
          const keywords = [...new Set([...parseJsonList(legacyDrive.keywords_json || '[]'), 'repositório', 'repositorio'])];
          let draft = legacyDrive.draft_json || '';
          if (draft) {
            const object = parseJson(draft, null);
            if (object && typeof object === 'object') {
              object.trigger = addRepositoryTrigger(object.trigger || trigger);
              object.keywords = [...new Set([...(Array.isArray(object.keywords) ? object.keywords : []), 'repositório', 'repositorio'])];
              draft = JSON.stringify(object);
            }
          }
          this.db.prepare('UPDATE hub_links SET keywords_json=?,trigger_json=?,draft_json=?,updated_at=? WHERE id=?')
            .run(JSON.stringify(keywords), JSON.stringify(trigger), draft, timestamp, Number(legacyDrive.id));
        }
    
        const seedRegression = this.db.prepare(`INSERT OR IGNORE INTO regression_cases(phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`);
        seedRegression.run('Crescêncio dá aula hoje?', normalizeText('Crescêncio dá aula hoje?'), 'ignore', '', timestamp, timestamp);
        seedRegression.run('Crescêncio tem aula hoje?', normalizeText('Crescêncio tem aula hoje?'), 'ignore', '', timestamp, timestamp);
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0142_selective_cards_and_repository','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings', 'activeMessages', 'activeLinks', 'conflictReport');
    },

    migrateContentV0143() {
      if (asBool(this.getSetting('content_v0143_semester_cards_context_intents', 'false'), false)) return;
      const timestamp = nowIso();
      for (const definition of SEMESTER_WEEKLY_CARDS_V0143) {
        this.stagePackageAutomaticMessage(definition.key, definition.message);
      }
    
      // Reduz apenas emojis decorativos dos cards oficiais ainda não
      // personalizados. Avisos funcionais, como ⚠️, são preservados.
      const decorative = /^\s*(?:(?:📚|📅|🗓️|👤|📧|📱|☎️|📍|🏢|🌐|🔎|✅|☑️|➡️|🔗|💡|📌|📄|🎓|🧑‍🏫)\s*)+/u;
      const reduceEmojis = value => String(value || '').split('\n').map(line => line.replace(decorative, '')).join('\n');
      const patchSnapshot = value => {
        if (!value) return value || '';
        const object = parseJson(value, null);
        if (!object || typeof object !== 'object') return value;
        if (typeof object.response_text === 'string') object.response_text = reduceEmojis(object.response_text);
        if (typeof object.details_text === 'string') object.details_text = reduceEmojis(object.details_text);
        return JSON.stringify(object);
      };
      const rows = this.db.prepare("SELECT id,response_text,details_text,package_snapshot_json,pending_package_json FROM automatic_messages WHERE source_type='hub_package' AND customized=0").all();
      const update = this.db.prepare('UPDATE automatic_messages SET response_text=?,details_text=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?');
      for (const row of rows) {
        const response = reduceEmojis(row.response_text);
        const details = reduceEmojis(row.details_text);
        const snapshot = patchSnapshot(row.package_snapshot_json);
        const pending = patchSnapshot(row.pending_package_json);
        if (response === row.response_text && details === row.details_text && snapshot === (row.package_snapshot_json || '') && pending === (row.pending_package_json || '')) continue;
        update.run(response, details, snapshot, pending, timestamp, Number(row.id));
      }
    
      const seedRegression = this.db.prepare(`INSERT OR IGNORE INTO regression_cases(phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`);
      seedRegression.run('em quais dias Amanda dá aula?', normalizeText('em quais dias Amanda dá aula?'), 'match', 'Professor — Amanda Ferraz de Oliveira Passos', timestamp, timestamp);
      seedRegression.run('quais aulas do 3º semestre?', normalizeText('quais aulas do 3º semestre?'), 'match', 'BSI — Aulas e horários do 3º semestre', timestamp, timestamp);
      seedRegression.run('qual é o e-mail da CAENS?', normalizeText('qual é o e-mail da CAENS?'), 'match', 'CAENS', timestamp, timestamp);
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0143_semester_cards_context_intents','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'messageSummaries', 'conflictReport');
    },

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
    },

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
            room: String(entry?.[4] || '').trim(),
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
    },

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
    },

    migrateContentV0144() {
      if (asBool(this.getSetting('content_v0144_direct_short_triggers', 'false'), false)) return;
      const timestamp = nowIso();
      const select = this.db.prepare(`SELECT id,title,trigger_json,draft_json,package_snapshot_json,pending_package_json
        FROM automatic_messages WHERE lower(title)=lower(?) ORDER BY id LIMIT 1`);
      const update = this.db.prepare(`UPDATE automatic_messages
        SET trigger_json=?,draft_json=?,package_snapshot_json=?,pending_package_json=?,updated_at=? WHERE id=?`);
    
      const mergeTrigger = (input, exactPhrases = [], sentences = []) => {
        const trigger = normalizeTriggerRules(input || {});
        trigger.sentences = [...new Set([...(sentences || []), ...(trigger.sentences || [])])];
        trigger.exact_phrases = [...new Set([...(exactPhrases || []), ...(trigger.exact_phrases || [])])];
        return trigger;
      };
      const patchSnapshot = (value, exactPhrases, sentences, fallbackTrigger) => {
        if (!value) return value || '';
        const object = parseJson(value, null);
        if (!object || typeof object !== 'object') return value;
        object.trigger = mergeTrigger(object.trigger || fallbackTrigger, exactPhrases, sentences);
        return JSON.stringify(object);
      };
      const patchMessage = (title, exactPhrases = [], sentences = [], removeSentences = []) => {
        const row = select.get(title);
        if (!row) return false;
        const live = mergeTrigger(parseJson(row.trigger_json || '{}', {}), exactPhrases, sentences);
        const removed = new Set((removeSentences || []).map(normalizeText));
        if (removed.size) live.sentences = live.sentences.filter(value => !removed.has(normalizeText(value)));
        const patchValue = value => {
          const patched = patchSnapshot(value, exactPhrases, sentences, live);
          if (!patched || !removed.size) return patched;
          const object = parseJson(patched, null);
          if (!object || typeof object !== 'object') return patched;
          object.trigger = normalizeTriggerRules(object.trigger || live);
          object.trigger.sentences = object.trigger.sentences.filter(value => !removed.has(normalizeText(value)));
          return JSON.stringify(object);
        };
        update.run(
          JSON.stringify(live),
          patchValue(row.draft_json),
          patchValue(row.package_snapshot_json),
          patchValue(row.pending_package_json),
          timestamp,
          Number(row.id)
        );
        return true;
      };
    
      this.db.exec('BEGIN IMMEDIATE');
      try {
        // O nome isolado funciona apenas como frase exata. Em mensagens maiores,
        // o nome continua exigindo uma intenção coerente, evitando falsos positivos.
        for (const professor of SI_PROFESSORS_2026_2) {
          patchMessage(
            `Professor — ${professor.name}`,
            buildSiProfessorExactNamePhrases(professor),
            buildSiProfessorNameTriggerSentences(professor)
          );
        }
    
        // Atualiza o cartão pessoal inclusive em bancos já existentes.
        const juanDefinition = INSTITUTIONAL_CARDS_V098.find(item => item.key === 'hub-easter-egg-felipe-juan-v0104');
        if (juanDefinition) {
          const canonical = normalizeTriggerRules(juanDefinition.message.trigger || {});
          patchMessage('Contato — Felipe Juan', canonical.exact_phrases, canonical.sentences, ['juan', 'felipe', 'felipe juan', 'felipo juano']);
        }
    
        // Formas diretas e completas para os oito semestres.
        for (const definition of SEMESTER_WEEKLY_CARDS_V0143) {
          const trigger = normalizeTriggerRules(definition.message.trigger || {});
          patchMessage(definition.message.title, trigger.exact_phrases, trigger.sentences);
        }
    
        // Atalhos curtos inequívocos. Eles só funcionam quando a mensagem inteira
        // é o termo cadastrado; não capturam o termo dentro de uma conversa.
        const directCards = new Map([
          ['HUB — Média final e tabela da final', ['final']],
          ['HUB — Calendário acadêmico', ['calendário', 'calendario']],
          ['SUAP — Acessar o sistema', ['suap']],
          ['Serviço — Protocolo', ['protocolo']],
          ['BSI — PPC atual', ['ppc']],
          ['HUB — Fluxograma e matriz de Sistemas de Informação', ['fluxograma', 'matriz curricular', 'matriz de bsi']],
          ['BSI — Diretório Acadêmico DASI', ['dasi']],
          ['BSI — Empresa Júnior BTech', ['btech']],
          ['BSI — Atividades Curriculares de Extensão', ['acex']]
        ]);
        for (const [title, exactPhrases] of directCards) patchMessage(title, exactPhrases);
    
        const seedRegression = this.db.prepare(`INSERT OR IGNORE INTO regression_cases
          (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`);
        for (const [phrase, title] of [
          ['felipe', 'Contato — Felipe Juan'],
          ['quem fez o bot?', 'Contato — Felipe Juan'],
          ['crijina', 'Professor — Crijina Chagas Flores'],
          ['crescencio', 'Professor — Crescêncio Rodrigues Lima Neto'],
          ['claudio', 'Professor — Cláudio Rodolfo Sousa de Oliveira'],
          ['semestre 1', 'BSI — Aulas e horários do 1º semestre'],
          ['1o semestre', 'BSI — Aulas e horários do 1º semestre'],
          ['segundo semestre', 'BSI — Aulas e horários do 2º semestre'],
          ['horários semestre 2', 'BSI — Aulas e horários do 2º semestre'],
          ['horários e salas do 3º semestre', 'BSI — Aulas e horários do 3º semestre'],
          ['caens', 'CAENS'],
          ['final', 'HUB — Média final e tabela da final'],
          ['protocolo', 'Serviço — Protocolo'],
          ['ppc', 'BSI — PPC atual'],
          ['dasi', 'BSI — Diretório Acadêmico DASI']
        ]) seedRegression.run(phrase, normalizeText(phrase), 'respond', title, timestamp, timestamp);
    
        this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0144_direct_short_triggers','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      this.invalidate('settings', 'activeMessages', 'messageSummaries', 'activeSectors', 'conflictReport');
    },

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
    },

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
    },

    migrateContentV0151() {
      if (asBool(this.getSetting('content_v0151_resources_prerequisite_rooms', 'false'), false)) return;
      const timestamp = nowIso();
      const select = this.db.prepare('SELECT id,source_type,customized FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1');
      const restoreTrigger = this.db.prepare('UPDATE automatic_messages SET trigger_json=?,customized=0,updated_at=? WHERE id=?');
      const normalizedSet = values => [...new Set((values || []).map(normalizeText).filter(Boolean))].sort();
      const sameSet = (first, second) => JSON.stringify(normalizedSet(first)) === JSON.stringify(normalizedSet(second));
      const legacyExactConversion = (currentInput, officialInput) => {
        const current = normalizeTriggerRules(currentInput || {});
        const official = normalizeTriggerRules(officialInput || {});
        const directRepository = new Set(['repositorio']);
        const expectedSentences = [...official.sentences, ...official.exact_phrases]
          .filter(value => !directRepository.has(normalizeText(value)));
        const currentExact = normalizedSet(current.exact_phrases);
        const allowedExact = normalizedSet(official.exact_phrases.filter(value => directRepository.has(normalizeText(value))));
        return sameSet(current.sentences, expectedSentences)
          && JSON.stringify(currentExact) === JSON.stringify(allowedExact)
          && sameSet(current.keywords, official.keywords)
          && sameSet(current.required_words, official.required_words)
          && sameSet(current.excluded_words, official.excluded_words)
          && sameSet(current.negative_examples, official.negative_examples)
          && sameSet(current.synonym_group_ids, official.synonym_group_ids)
          && current.match_mode === official.match_mode
          && current.require_question_mark === official.require_question_mark
          && current.regex_pattern === official.regex_pattern
          && current.regex_flags === official.regex_flags
          && Number(current.typo_tolerance || 0) === Number(official.typo_tolerance || 0);
      };
      for (const definition of RESOURCE_CARDS) {
        this.stagePackageAutomaticMessage(definition.key, definition.message);
        const row = select.get(definition.key, toPortugueseTitleCase(definition.message.title), definition.key);
        if (!row || row.source_type !== 'hub_package') continue;
        const official = this.validateAutomaticMessage(definition.message);
        const current = this.getAutomaticMessage(Number(row.id));
        // Em instalações novas, migrações legadas podem converter frases exatas
        // em sentenças e marcar artificialmente o card como personalizado.
        // Só restaura quando o gatilho corresponde exatamente a essa conversão.
        if (!Number(row.customized || 0) || legacyExactConversion(current?.trigger, official.trigger)) {
          restoreTrigger.run(JSON.stringify(official.trigger), timestamp, Number(row.id));
        }
      }
      const insert = this.db.prepare(`INSERT OR IGNORE INTO regression_cases
        (phrase,normalized_phrase,expectation,expected_title,active,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?)`);
      for (const [phrase, expectation, title] of [
        ['repositório', 'respond', 'BSI — Repositórios, Arquivos e Materiais'],
        ['arquivos', 'respond', 'BSI — Repositórios, Arquivos e Materiais'],
        ['drive', 'respond', 'BSI — Repositórios, Arquivos e Materiais'],
        ['como funciona a quebra de pré-requisito?', 'respond', 'BSI — Quebra de Pré-requisito'],
        ['qual prédio será ministrada a aula?', 'respond', 'Campus — Como Identificar Prédio, Andar e Sala'],
        ['repositório institucional do IFBA', 'ignore', '']
      ]) insert.run(phrase, normalizeText(phrase), expectation, title, timestamp, timestamp);
      this.db.prepare("INSERT INTO settings(key,value) VALUES ('content_v0151_resources_prerequisite_rooms','true') ON CONFLICT(key) DO UPDATE SET value='true'").run();
      this.invalidate('settings', 'activeMessages', 'messageSummaries', 'conflictReport');
    }
  };
};
