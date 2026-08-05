'use strict';

module.exports = function installAcademicHandler(BotEngine, deps) {
  const {
    formatProfessorFullCard,
    formatSemesterOverviewCard,
    formatDisciplineFullCard,
    formatContentResponse,
    formatDisambiguation,
    formatHelpResponse,
    formatUnknownMentionResponse,
    appendFooter,
    appendSourceMetadata,
    isSemesterOverviewRequest,
    findAutomaticMessageMatchesDetailed,
    evaluateAutomaticMessagesDetailed,
    detectAmbiguousMatches,
    isHelpCommand,
    handleCalculator,
    looksLikeCalculator,
    commandFor,
    truncate,
    parseList,
    normalizeText,
    containsPhrase,
    renderTemplate,
    LOCATION_CARD_TITLE,
    classifyProfessorLocationRequest,
    findProfessorDirectoryMatches,
    formatProfessorLocationResponse,
    formatAskProfessorNameResponse,
    formatClassroomResponse,
    formatProfessorDisambiguation,
    classifySectorRequest,
    classifySectorFollowUp,
    formatSectorResponse,
    classifyGuidedFlow,
    formatFlowMenu,
    menuCandidates,
    formatMenu,
    progressiveMenuFor,
    semanticQuestionAssessment,
    implicitQuestionStructure,
    classifyBotReaction,
    addressesBot,
    prepareMessage,
    preferencesFromSubject,
    applyLocalPreferences,
    resolveGroupActivation,
    resolveIncomingActivation,
    applyIncomingActivation,
    recoveryEvaluation,
    broadHelpText,
    categoryCandidates,
    classifyCommonMessage,
    choiceNumber,
    isCancel,
    isNone,
    isListDisciplines,
    isUnknownSubject,
    canonicalSpeechText,
    shouldBlockAttendanceQuestion,
    mergeSlots,
    formatUnderstanding,
    buildQueryFromSlots,
    parseExplicitCorrection,
    looksLikeNewCompleteRequest,
    expectedForSlots,
    analyzeUnifiedQuery,
    mergeQueryState,
    intentLabels,
    guidedDisciplineCandidates,
    guidedPrompt,
    pruneContextMap,
    capCandidates,
    findDisciplineMatches,
    findDisciplineCandidates,
    isDirectDisciplineReference,
    hasDisciplineInformationIntent,
    formatDisciplineList,
    requestedProfessorFields,
    requestedDisciplineFields,
    professorIntentLabel,
    formatProfessorFieldResponse,
    isProfessorPrivatePhoneRequest,
    formatProfessorPhonePrivacyResponse,
    SEMESTER_SCHEDULE_CARD_TITLE,
    classifySemesterScheduleRequest,
    formatSemesterScheduleResponse,
    formatSemesterSchedulePrompt,
    semesterFromFollowUp,
    parseSemester,
    parseTargetDate,
    formatSemesterScheduleDetail,
    scheduleDetailIntent,
    isScheduleStatusConfirmation,
    DEFAULT_TIME_ZONE,
    FAST_GROUP_DOMAIN_PATTERN,
    FAST_GROUP_FOLLOWUP_PATTERN,
    FAST_GROUP_QUESTION_LEAD_PATTERN,
    asBool,
    senderNumber
  } = deps;
  Object.assign(BotEngine.prototype, {
    activeContent({ includeDrafts = false } = {}) {
      let messages = this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false });
      if (includeDrafts) {
        messages = this.db.listAutomaticMessages().map(item => {
          const effective = item.draft || item;
          return { ...item, ...effective, id: item.id, active: Boolean(effective.active), published: true, simulationDraft: Boolean(item.draft) };
        }).filter(item => item.active && item.response_text);
      }
      return { messages };
    },

    professorLocationEvaluation(text, context, settings) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context, settings);
      const enabled = snapshot.messages.some(item => normalizeText(item.title) === normalizeText(LOCATION_CARD_TITLE));
      if (!enabled) return null;
      const teachers = snapshot.teachers;
      const classified = classifyProfessorLocationRequest(text, teachers);
      if (!classified.matched) return null;
      const base = {
        matched: true, candidates: [], conflict: false, redactLog: false,
        topic: 'Localização de professor', analysis: [], reasons: ['consulta estruturada ao cadastro de professores'],
        context: { ...context }
      };
      if (classified.kind === 'ask-name') return {
        ...base, type: 'professor_location_prompt', text: formatAskProfessorNameResponse(),
        signature: 'professor-location:ask-name', matchedItem: LOCATION_CARD_TITLE
      };
      if (classified.kind === 'classroom') return {
        ...base, type: 'professor_classroom', text: formatClassroomResponse(),
        signature: 'professor-location:classroom', matchedItem: 'Sala da aula — orientação'
      };
      const matches = classified.matches || [];
      const staleDays = Math.max(30, Number(settings.professor_room_stale_days || 180));
      if (classified.kind === 'ambiguous') {
        const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
        const pendingCandidates = matches.slice(0, 3).map(({ teacher }) => ({
          kind: 'professor_location',
          item: {
            id: Number(teacher.id), title: teacher.name, topic: 'Localização de professor',
            response_text: formatProfessorLocationResponse(teacher, { staleDays }), attachment: null
          },
          score: 100, reasons: ['nome de professor ambíguo']
        }));
        pendingCandidates.push({ kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação', response_text: '' }, score: 0, reasons: ['saída da lista'] });
        const professorOptionsText = formatProfessorDisambiguation(matches, timeout).replace(/\n\nResponda/u, `\n${pendingCandidates.length}. *Nenhuma dessas*\n\nResponda`);
        return {
          ...base, type: 'disambiguation', text: professorOptionsText,
          signature: pendingCandidates.map(candidate => `professor_location:${candidate.item.id}`).join('|'),
          matchedItem: matches.slice(0, 3).map(item => item.teacher.name).join(', '),
          conflict: true, candidates: pendingCandidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
          pendingCandidates
        };
      }
      const teacher = matches[0]?.teacher;
      if (!teacher) return null;
      return {
        ...base, type: 'professor_location', text: formatProfessorLocationResponse(teacher, { staleDays }),
        signature: `professor-location:${teacher.id}`, matchedItem: `Localização — ${teacher.name}`
      };
    },

    professorAttendanceConfirmation(text, context = {}) {
      const prepared = context.prepared;
      if (prepared?.intent === 'professor-attendance-confirmation') return true;
      const normalized = prepared?.normalized || normalizeText(text);
      if (!normalized) return false;
      const teachers = context.snapshot?.teachers || this.db.listTeachers({ activeOnly: true });
      const exactTeacherMatches = (prepared?.professorMatches || findProfessorDirectoryMatches(normalized, teachers)).filter(match => !match.fuzzy);
      return shouldBlockAttendanceQuestion({ normalized, professorMatches: exactTeacherMatches });
    },

    scheduleStatusConfirmationIgnoredEvaluation(text, context = {}) {
      if (!isScheduleStatusConfirmation(text)) return null;
      return {
        matched: false,
        type: 'none',
        text: '',
        signature: '',
        matchedItem: '',
        redactLog: false,
        reasons: ['confirmação sobre funcionamento normal das aulas não pode ser verificada pelo bot'],
        candidates: [],
        conflict: false,
        blockedBy: 'schedule-status-unverifiable',
        topic: 'Horários de BSI',
        detectedIntent: 'funcionamento não verificável',
        context: { ...context },
        analysis: [],
        suppressPrivateFallback: true
      };
    },

    professorAttendanceIgnoredEvaluation(text, context = {}) {
      if (!this.professorAttendanceConfirmation(text, context)) return null;
      return {
        matched: false,
        type: 'none',
        text: '',
        signature: '',
        matchedItem: '',
        redactLog: false,
        reasons: ['confirmação sobre presença do professor ou realização efetiva da aula não pode ser verificada pelo bot'],
        candidates: [],
        conflict: false,
        blockedBy: 'teacher-attendance-unverifiable',
        topic: 'Horários de BSI',
        detectedIntent: 'presença não verificável',
        context: { ...context },
        analysis: [],
        suppressPrivateFallback: true
      };
    },

    professorPhonePrivacyEvaluation(text, context = {}, options = {}) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context);
      const prepared = context.prepared || prepareMessage(text, {
        now: context.now || Date.now(), teachers: snapshot.teachers,
        scheduleEntries: snapshot.disciplineDirectory, isGroup: context.isGroup
      });
      if (!isProfessorPrivatePhoneRequest(text, {
        professorMatches: prepared.professorMatches || [],
        disciplineMatches: prepared.disciplineMatches || [],
        hasProfessorContext: Boolean(options.hasProfessorContext)
      })) return null;
      const teachers = options.teachers?.length
        ? options.teachers
        : [...new Map((prepared.professorMatches || []).filter(match => !match.fuzzy && match.teacher)
          .map(match => [Number(match.teacher.id || 0) || normalizeText(match.teacher.name), match.teacher])).values()];
      return {
        matched: true,
        type: 'professor_phone_privacy',
        text: formatProfessorPhonePrivacyResponse(teachers),
        signature: `professor-phone-privacy:${teachers.map(item => Number(item.id || 0) || normalizeText(item.name)).join(',') || 'generic'}`,
        matchedItem: 'Privacidade — telefone de professores',
        topic: 'Professores e Disciplinas',
        detectedIntent: 'telefone de professor — dado sensível',
        reasons: ['pedido de número pessoal, telefone ou WhatsApp de professor', 'informação bloqueada por privacidade'],
        candidates: [], conflict: false, redactLog: true, analysis: [], attachment: null,
        context: { ...context }
      };
    },

    disciplineDisplayLabel(discipline = {}) {
      const code = String(discipline.code || '').trim();
      const name = String(discipline.name || '').trim();
      return [code, name].filter(Boolean).join(' — ') || 'Disciplina';
    },

    professorCardIntent(text, prepared = null) {
      const normalized = normalizeText(text);
      if (!normalized) return false;
      if (prepared?.disciplineMatches?.length && isDirectDisciplineReference(text, prepared.disciplineMatches)) return true;
      const topic = /\b(?:contato|ctt|email|e-mail|dia|dias|hora|horas|horario|horarios|materia|materias|disciplina|disciplinas|sala|salas|laboratorio|lab|aula|aulas|professor|professora|docente|onde|quando|semestre|semestres|informacao|informacoes|dados|tudo|ministra|ministro|leciona|ensina|da|nome)\b/u.test(normalized);
      if (!topic) return false;
      const hasExactTeacher = Boolean(prepared?.professorMatches?.some(match => match?.teacher && match.fuzzy !== true));
      const hasDiscipline = Boolean(prepared?.disciplineMatches?.length);
      const reportedSpeech = /\b(?:falei|falou|comentou|comentamos|conversei|conversou|disse|mencionou)\b/u.test(normalized);
      const noisyAcademicFragment = hasExactTeacher && hasDiscipline && !reportedSpeech
        && (/^(?:professor|professora|prof|profa|docente)\b/u.test(normalized)
          || Boolean(prepared?.targetDate?.matched)
          || /\b(?:sala|horario|horarios|dia|aula|aulas)\b/u.test(normalized));
      if (noisyAcademicFragment) return true;
      if (prepared?.disciplineMatches?.length && hasDisciplineInformationIntent(text)) return true;
      // 'Onde fica/encontro o professor' busca o local de atendimento. Já
      // 'qual/em qual sala' e referências explícitas à aula/turma buscam o
      // card docente, que contém as salas das disciplinas.
      const asksOfficeLocation = prepared?.professorMatches?.length
        && /(?:^|\b)(?:onde\s+(?:fica|encontro|acho)|gabinete|local\s+de\s+atendimento|falar\s+com)\b/u.test(normalized)
        && !/\b(?:qual|em\s+qual)\s+sala\b|\bsala\s+(?:da|de)\s+(?:aula|turma)\b/u.test(normalized);
      if (asksOfficeLocation) return false;
      if (/\?\s*$/.test(String(text || '')) || implicitQuestionStructure(text)) return true;
      if (/^(?:contato|ctt|email|e-mail|dia|dias|horario|horarios|sala|laboratorio|lab|onde|quando|qual\s+(?:e\s+)?(?:a\s+)?sala|em\s+qual\s+sala|(?:em\s+)?(?:qual|quais|que)\s+(?:dias?|horarios?|materias?|disciplinas?|semestres?|salas?|laboratorios?))\b/u.test(normalized)) return true;
      return /\b(?:da|dar|dá|ministra|ensina|leciona) aula\b[\s\S]{0,80}\b(?:quais|qual|quando|onde|dias|materias|disciplinas|sala)\b/u.test(String(text || '').toLowerCase());
    },

    professorScheduleEntriesForTarget(entries = [], prepared = null, context = {}) {
      const target = prepared?.targetDate;
      if (!target?.matched) return { entries, targetApplied: false, noClasses: false };
      const requested = new Set(requestedProfessorFields(prepared.raw || ''));
      if (![...requested].some(field => ['day', 'hours', 'room'].includes(field))) return { entries, targetApplied: false, noClasses: false };
      const matching = entries.filter(entry => Number(entry.day_of_week) === Number(target.dayIndex));
      if (!matching.length) return { entries: [], targetApplied: true, noClasses: true };
    
      const now = new Date(Number(context.now || prepared.now || Date.now()));
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: prepared.timeZone || DEFAULT_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });
      const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
      const nowMinutes = Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
      const today = target.expression === 'hoje';
      const ranked = matching.map(entry => {
        const start = Number.isFinite(Number(entry.start_minutes)) ? Number(entry.start_minutes) : Number.POSITIVE_INFINITY;
        const end = Number.isFinite(Number(entry.end_minutes)) ? Number(entry.end_minutes) : start;
        const current = today && start <= nowMinutes && nowMinutes < end;
        const future = today && start > nowMinutes;
        return { entry: { ...entry }, rank: current ? 0 : future ? 1 : today ? 2 : 1, start };
      }).sort((a, b) => a.rank - b.rank || a.start - b.start || String(a.entry.discipline_name).localeCompare(String(b.entry.discipline_name)));
      if (today) {
        const currentIndex = ranked.findIndex(item => item.rank === 0);
        const nextIndex = ranked.findIndex(item => item.rank === 1);
        if (currentIndex >= 0) ranked[currentIndex].entry._schedule_status_label = 'Aula em andamento';
        else if (nextIndex >= 0) ranked[nextIndex].entry._schedule_status_label = 'Próxima aula';
      }
      return { entries: ranked.map(item => item.entry), targetApplied: true, noClasses: false };
    },

    professorNoClassResponse(prepared, teachers = [], disciplines = []) {
      const target = prepared?.targetDate;
      const when = target?.expression || 'nesse dia';
      const discipline = disciplines[0]?.name || disciplines[0]?.code || '';
      const teacher = teachers[0]?.name || '';
      if (discipline) return `Não há aula cadastrada de *${discipline}* ${when}.`;
      if (teacher) return `Não há aula cadastrada de *${teacher}* ${when}.`;
      return `Não há aula cadastrada ${when}.`;
    },

    professorCardEvaluation(text, context = {}) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context);
      const initialPrepared = context.prepared || prepareMessage(text, {
        now: context.now || Date.now(), teachers: snapshot.teachers,
        scheduleEntries: snapshot.disciplineDirectory, isGroup: context.isGroup
      });
      let disciplineMatches = initialPrepared.disciplineMatches?.length
        ? [...initialPrepared.disciplineMatches]
        : findDisciplineMatches(text, snapshot.disciplineDirectory);
      if (!disciplineMatches.length) {
        const resolved = findDisciplineCandidates(text, snapshot.disciplineDirectory);
        const bareReference = normalizeText(text) === normalizeText(resolved.fragment);
        if ((hasDisciplineInformationIntent(text) || bareReference) && resolved.matches.length > 1) {
          return this.disciplineDisambiguationEvaluation(text, resolved.matches, { ...context, snapshot, prepared: initialPrepared }, snapshot.settings || context.settings || {});
        }
        if ((hasDisciplineInformationIntent(text) || bareReference) && resolved.matches.length === 1) disciplineMatches = resolved.matches;
      }
      const prepared = disciplineMatches === initialPrepared.disciplineMatches
        ? initialPrepared
        : { ...initialPrepared, disciplineMatches: Object.freeze([...disciplineMatches]) };
      if (!this.professorCardIntent(text, prepared)) return null;
      let teacherMatches = [...(prepared.professorMatches || [])];
      const explicitTeacherNames = new Set(teacherMatches
        .filter(match => match?.teacher && match.fuzzy !== true)
        .map(match => normalizeText(match.teacher.name))
        .filter(Boolean));
      const sharedCards = [];
      if (disciplineMatches.length) {
        const names = new Set();
        for (const discipline of disciplineMatches) {
          const shared = snapshot.messages.find(item => normalizeText(item.title) === normalizeText(`Disciplina Compartilhada — ${discipline.name}`));
          // O card compartilhado é útil quando a consulta é apenas pela
          // disciplina. Quando há professor explícito, a resposta deve usar a
          // interseção professor + disciplina, sem puxar os demais docentes.
          if (shared?.response_text && !explicitTeacherNames.size) sharedCards.push(shared);
          const entries = this.db.listProfessorScheduleEntries?.({ academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name }) || [];
          for (const entry of entries) {
            const normalizedProfessor = normalizeText(entry.professor_name);
            if (!explicitTeacherNames.size || explicitTeacherNames.has(normalizedProfessor)) names.add(normalizedProfessor);
          }
          if (!explicitTeacherNames.size) {
            for (const name of discipline.professorNames || []) names.add(normalizeText(name));
          }
        }
        if (explicitTeacherNames.size) {
          teacherMatches = teacherMatches.filter(match => match?.teacher && explicitTeacherNames.has(normalizeText(match.teacher.name)));
        } else {
          for (const teacher of snapshot.teachers) if (names.has(normalizeText(teacher.name))) teacherMatches.push({ teacher, fuzzy: false, score: 100 });
        }
      }
      const teachers = [...new Map(teacherMatches.map(match => [Number(match.teacher?.id || 0) || normalizeText(match.teacher?.name), match.teacher])).values()].filter(Boolean);
      if (!teachers.length && !sharedCards.length && disciplineMatches.length) {
        const discipline = disciplineMatches[0];
        const permanent = this.db.getAcademicDiscipline?.(discipline.code || discipline.name);
        if (permanent) {
          const title = this.disciplineDisplayLabel(discipline);
          return { matched:true,type:'academic_data_missing',text:`Reconheci a disciplina *${title}*, mas não há oferta cadastrada para o período *${snapshot.academicPeriod}*.`,signature:`discipline-not-offered:${discipline.code||normalizeText(discipline.name)}:${snapshot.academicPeriod}`,matchedItem:title,topic:'Professores e Disciplinas',detectedIntent:professorIntentLabel(requestedDisciplineFields(text)),reasons:['disciplina reconhecida no catálogo permanente','nenhuma oferta ativa no período atual'],candidates:[],conflict:false,redactLog:false,analysis:[],attachment:null,context:{...context},contextSubject:{kind:'discipline_card',id:discipline.code||normalizeText(discipline.name),title,disciplineNames:[discipline.name],academicPeriod:snapshot.academicPeriod}};
        }
      }
      if (!teachers.length && !sharedCards.length) return null;
      const professorCards = teachers.map(teacher => snapshot.messages.find(item => normalizeText(item.title) === normalizeText(`Professor — ${teacher.name}`)));
      const cards = [...new Map([...sharedCards, ...professorCards]
        .filter(card => card?.response_text)
        .filter(card => !(context.isGroup && (card.scope || 'both') === 'private') && !(!context.isGroup && (card.scope || 'both') === 'group'))
        .map(card => [Number(card.id) || normalizeText(card.title), card])).values()];
      if (!cards.length) return null;
    
      let requestedFields = disciplineMatches.length ? requestedDisciplineFields(text) : requestedProfessorFields(text);
      const normalizedFragmentText = normalizeText(text);
      const noisyTeacherDisciplineFragment = !requestedFields.length && disciplineMatches.length && explicitTeacherNames.size
        && !/\b(?:falei|falou|comentou|comentamos|conversei|conversou|disse|mencionou)\b/u.test(normalizedFragmentText)
        && (/^(?:professor|professora|prof|profa|docente)\b/u.test(normalizedFragmentText)
          || Boolean(prepared.targetDate?.matched)
          || /\b(?:sala|horario|horarios|dia|aula|aulas)\b/u.test(normalizedFragmentText));
      if (noisyTeacherDisciplineFragment) requestedFields = ['professor', 'contact', 'day', 'hours', 'room'];
      if (!requestedFields.length && disciplineMatches.length) {
        const discipline = disciplineMatches[0];
        const entries = this.db.listProfessorScheduleEntries?.({
          academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name
        }) || [];
        const title = this.disciplineDisplayLabel(discipline);
        return {
          matched: true, type: 'message', text: formatDisciplineFullCard({ entries, academicPeriod: snapshot.academicPeriod }),
          signature: `discipline-full:${discipline.code || normalizeText(discipline.name)}`, matchedItem: title,
          topic: 'Professores e Disciplinas', attachment: null, details_text: '', source_url: '', source_title: '', verified_at: '',
          conflict: false, redactLog: false, detectedIntent: 'informações completas',
          reasons: ['disciplina reconhecida por sigla, nome completo ou primeiro termo sem ambiguidade'], candidates: [], analysis: [], context: { ...context },
          contextSubject: { kind: 'discipline_card', id: discipline.code || normalizeText(discipline.name), title,
            referenceText: discipline.code || discipline.name, teacherNames: teachers.map(item => item.name), disciplineNames: [discipline.name] }
        };
      }
      let structuredEntries = [];
      if (requestedFields.length) {
        if (disciplineMatches.length) {
          for (const discipline of disciplineMatches) structuredEntries.push(...(this.db.listProfessorScheduleEntries?.({
            academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name
          }) || []));
          if (explicitTeacherNames.size) {
            structuredEntries = structuredEntries.filter(entry => explicitTeacherNames.has(normalizeText(entry.professor_name)));
          }
        } else {
          for (const teacher of teachers) structuredEntries.push(...(this.db.listProfessorScheduleEntries?.({
            academicPeriod: snapshot.academicPeriod, activeOnly: true, professor: teacher.name
          }) || []).filter(entry => normalizeText(entry.professor_name) === normalizeText(teacher.name)));
        }
      }
    
      if (requestedFields.length && disciplineMatches.length && explicitTeacherNames.size && !structuredEntries.length) {
        const professorNames = teachers.map(item => String(item.name || '').trim()).filter(Boolean);
        const disciplineNames = disciplineMatches.map(item => String(item.code || item.name || '').trim()).filter(Boolean);
        const professorLabel = professorNames.map(name => name.split(/\s+/u).slice(0, 2).join(' ')).join(' e ') || 'Esse professor';
        const disciplineLabel = disciplineNames.join(' e ') || 'essa disciplina';
        const first = cards[0];
        return {
          matched: true, type: 'message',
          text: `Não encontrei *${professorLabel}* como docente de *${disciplineLabel}* no quadro acadêmico atual.`,
          responseItems: null, privateDelivery: false,
          signature: `professor-discipline-mismatch:${[...explicitTeacherNames].join(',')}:${disciplineNames.map(normalizeText).join(',')}`,
          matchedItem: 'Professor e disciplina — combinação não encontrada',
          topic: 'Professores e Disciplinas', attachment: null, details_text: '', source_url: '', source_title: '', verified_at: '',
          conflict: false, redactLog: false, detectedIntent: professorIntentLabel(requestedFields),
          reasons: ['professor e disciplina reconhecidos', 'nenhuma oferta corresponde simultaneamente aos dois'],
          candidates: [], analysis: [], context: { ...context },
          contextSubject: { kind: 'professor_card', id: Number(first?.id || 0), title: first?.title || '', topic: 'Professores e Disciplinas',
            referenceText: disciplineMatches[0]?.code || disciplineMatches[0]?.name || '', teacherNames: professorNames,
            disciplineNames: disciplineMatches.map(item => item.name), details_text: '', source_url: '', source_title: '', verified_at: '' }
        };
      }
    
      const targeted = this.professorScheduleEntriesForTarget(structuredEntries, prepared, context);
      structuredEntries = targeted.entries;
      if (requestedFields.length && targeted.noClasses) {
        const textResponse = this.professorNoClassResponse(prepared, teachers, disciplineMatches);
        const first = cards[0];
        const referenceText = disciplineMatches[0]?.code || disciplineMatches[0]?.name || teachers[0]?.name || '';
        return {
          matched: true, type: 'message', text: textResponse, responseItems: null, privateDelivery: false,
          signature: cards.map(card => `message:${card.id}`).join('|'), matchedItem: cards.map(card => card.title).join(', '),
          topic: 'Professores e Disciplinas', attachment: null, details_text: '', source_url: '', source_title: '', verified_at: '',
          conflict: false, redactLog: false, detectedIntent: professorIntentLabel(requestedFields),
          reasons: ['professor ou disciplina reconhecido', 'consulta limitada ao dia solicitado', 'nenhuma aula cadastrada nesse dia'],
          candidates: cards.map(card => ({ kind: 'message', id: card.id, title: card.title })), analysis: [], context: { ...context },
          contextSubject: { kind: 'professor_card', id: Number(first.id || 0), title: first.title, topic: first.topic || first.title,
            referenceText, teacherNames: teachers.map(item => item.name), disciplineNames: disciplineMatches.map(item => item.name), intents: requestedFields,
            details_text: first.details_text || '', source_url: first.source_url || '', source_title: first.source_title || '', verified_at: first.verified_at || '' }
        };
      }
    
      let responseItems = [];
      let compact = false;
      if (requestedFields.length && disciplineMatches.length) {
        const compactText = formatProfessorFieldResponse({ entries: structuredEntries, teachers, fields: requestedFields });
        if (compactText) {
          compact = true;
          responseItems = [{ text: compactText, attachment: null, source_url: '', source_title: '', verified_at: '',
            matchedItem: cards.map(card => card.title).join(', '), topic: 'Professores e Disciplinas' }];
        }
      } else if (requestedFields.length) {
        responseItems = cards.map(card => {
          const professorName = String(card.title || '').replace(/^Professor\s*[—-]\s*/iu, '').trim();
          const entries = structuredEntries.filter(entry => normalizeText(entry.professor_name) === normalizeText(professorName));
          const cardTeachers = teachers.filter(teacher => normalizeText(teacher.name) === normalizeText(professorName));
          const compactText = formatProfessorFieldResponse({ entries, teachers: cardTeachers, fields: requestedFields });
          return {
            text: compactText || formatProfessorFieldResponse({ entries: [], teachers: cardTeachers, fields: requestedFields }),
            attachment: null, source_url: '', source_title: '', verified_at: '', matchedItem: card.title, topic: card.topic || card.title
          };
        }).filter(item => item.text);
        compact = responseItems.length > 0;
      }
      if (!compact) responseItems = cards.map(card => {
        let generated = '';
        const professorName = String(card.title || '').replace(/^Professor\s*[—-]\s*/iu, '').trim();
        if (/^Professor\s*[—-]/iu.test(String(card.title || ''))) {
          const teacher = teachers.find(item => normalizeText(item.name) === normalizeText(professorName)) || { name: professorName };
          const entries = this.db.listProfessorScheduleEntries?.({ academicPeriod: snapshot.academicPeriod, activeOnly: true, professor: professorName })
            ?.filter(entry => normalizeText(entry.professor_name) === normalizeText(professorName)) || [];
          generated = formatProfessorFullCard({ teacher, entries, academicPeriod: snapshot.academicPeriod });
        } else if (/^Disciplina Compartilhada/iu.test(String(card.title || '')) && disciplineMatches.length) {
          const discipline = disciplineMatches[0];
          const entries = this.db.listProfessorScheduleEntries?.({ academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name }) || [];
          generated = formatDisciplineFullCard({ entries, academicPeriod: snapshot.academicPeriod });
        }
        return { text: generated || card.response_text, attachment: card.attachment || null,
          source_url: generated ? '' : (card.source_url || ''), source_title: generated ? '' : (card.source_title || ''), verified_at: generated ? '' : (card.verified_at || ''),
          matchedItem: card.title, topic: card.topic || card.title };
      });
    
      const first = cards[0];
      const firstText = responseItems[0]?.text || first.response_text;
      const referenceText = disciplineMatches[0]?.code || disciplineMatches[0]?.name || teachers[0]?.name || '';
      const itemCount = responseItems.length;
      return {
        matched: true, type: itemCount > 1 ? 'multi_message' : 'message', text: firstText,
        responseItems: itemCount > 1 ? responseItems : null,
        privateDelivery: Boolean(context.isGroup && itemCount > 1),
        signature: cards.map(card => `message:${card.id}`).join('|'), matchedItem: cards.map(card => card.title).join(', '),
        topic: cards.length > 1 ? 'Professores e Disciplinas' : (first.topic || first.title),
        attachment: compact ? null : (itemCount === 1 ? first.attachment || null : null),
        details_text: compact ? '' : (first.details_text || ''), source_url: compact ? '' : (first.source_url || ''),
        source_title: compact ? '' : (first.source_title || ''), verified_at: compact ? '' : (first.verified_at || ''),
        conflict: false, redactLog: false, detectedIntent: professorIntentLabel(requestedFields),
        reasons: [disciplineMatches.length ? 'disciplina reconhecida por sigla ou nome completo' : 'nome do professor reconhecido',
          ...(compact ? ['resposta focada no pedido com contexto acadêmico útil'] : [])],
        candidates: cards.map(card => ({ kind: 'message', id: card.id, title: card.title })), analysis: [], context: { ...context },
        contextSubject: { kind: 'professor_card', id: Number(first.id || 0), title: first.title, topic: first.topic || first.title,
          referenceText, teacherNames: teachers.map(item => item.name), disciplineNames: disciplineMatches.map(item => item.name), intents: requestedFields,
          details_text: first.details_text || '', source_url: first.source_url || '', source_title: first.source_title || '', verified_at: first.verified_at || '' }
      };
    },

    semesterOverviewEvaluation(text, context = {}) {
      const semester = isSemesterOverviewRequest(text);
      if (!semester) return null;
      const settings = context.settings || context.snapshot?.settings || this.db.getSettings();
      const academicPeriod = String(settings.current_academic_period || '2026.2');
      const entries = this.db.listProfessorScheduleEntries?.({ academicPeriod, semester, activeOnly: true }) || [];
      return { matched: true, type: 'semester_overview', text: formatSemesterOverviewCard({ semester, entries, academicPeriod }),
        signature: `semester-overview:${academicPeriod}:${semester}`, matchedItem: `BSI — Aulas e horários do ${semester}º semestre`,
        topic: 'Horários de BSI', detectedIntent: 'horário', reasons: ['grade do semestre gerada a partir do quadro estruturado'],
        candidates: [], conflict: false, redactLog: false, analysis: [], attachment: null, context: { ...context },
        contextSubject: { kind: 'semester_overview', semester, academicPeriod } };
    },

    semesterScheduleEnabled({ includeDrafts = false, messages = null } = {}) {
      const source = messages || this.activeContent({ includeDrafts }).messages;
      return source.some(item => normalizeText(item.title) === normalizeText(SEMESTER_SCHEDULE_CARD_TITLE));
    },

    semesterScheduleEvaluation(text, context = {}) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context);
      const normalized = normalizeText(String(text || '').trim().replace(/[?]+\s*$/u, '')).trim();
      const asksWeeklySemesterWithoutNumber = /^(?:aulas|horarios|horarios e salas|salas e horarios|grade|grade de horarios|quadro|quadro de horarios|materias|disciplinas)(?: do)? semestre$/u.test(normalized);
      if (asksWeeklySemesterWithoutNumber) {
        return {
          matched: true,
          type: 'semester_overview_prompt',
          text: ['Qual semestre você quer consultar?', '', 'Responda apenas com um número entre `1` e `8`.'].join('\n'),
          signature: 'semester-overview-prompt',
          matchedItem: 'BSI — Aulas e horários por semestre',
          topic: 'Horários de BSI',
          detectedIntent: 'horário',
          reasons: ['consulta da grade semanal sem número do semestre'],
          candidates: [], conflict: false, redactLog: false, analysis: [], attachment: null,
          context: { ...context },
          contextSubject: { kind: 'semester_overview_prompt', title: 'BSI — Aulas e horários por semestre' }
        };
      }
      if (!this.semesterScheduleEnabled({ includeDrafts: Boolean(context.includeDrafts), messages: snapshot.messages })) return null;
      const prepared = context.prepared || prepareMessage(text, { now: context.now || Date.now(), teachers: snapshot.teachers, isGroup: context.isGroup });
      if (['schedule-status-confirmation','schedule-narrative','professor-attendance-confirmation'].includes(prepared.intent)) return null;
      const asksRoomWithoutSubject = /\b(?:onde|sala|local|bloco|predio|prédio)\b/u.test(normalized)
        && !(prepared.disciplineMatches || []).length && !(prepared.professorMatches || []).some(match => match?.teacher && match.fuzzy !== true) && !Number(prepared.semester || 0);
      if (asksRoomWithoutSubject) return null;
      const request = classifySemesterScheduleRequest(text, {
        now: context.now || Date.now(), scheduleEntries: snapshot.scheduleEntries, calendarEvents: snapshot.calendarEvents, academicPeriod: snapshot.academicPeriod
      });
      if (!request) return null;
      const base = { matched: true, candidates: [], conflict: false, redactLog: false, topic: 'Horários de BSI', detectedIntent: 'horário', analysis: [], reasons: ['consulta de aulas por semestre e dia'], context: { ...context }, attachment: null };
      if (request.kind === 'ask-semester') return {
        ...base, type: 'semester_schedule_prompt', text: formatSemesterSchedulePrompt(request.dayIndex, request.date),
        signature: `semester-schedule-prompt:${request.iso}`, matchedItem: SEMESTER_SCHEDULE_CARD_TITLE,
        contextSubject: { kind: 'semester_schedule_prompt', title: SEMESTER_SCHEDULE_CARD_TITLE, targetDate: request.iso, dayIndex: request.dayIndex }
      };
      return {
        ...base, type: 'semester_schedule', text: request.text,
        signature: `semester-schedule:${request.iso}:${request.semester}`,
        matchedItem: `${SEMESTER_SCHEDULE_CARD_TITLE} — ${request.semester}º semestre`,
        contextSubject: { kind: 'semester_schedule', title: SEMESTER_SCHEDULE_CARD_TITLE, targetDate: request.iso, dayIndex: request.dayIndex, semester: request.semester }
      };
    }
  });
};
