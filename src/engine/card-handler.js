'use strict';

module.exports = function installCardHandler(BotEngine, deps) {
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
    sectorEvaluation(text, context, settings) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context, settings);
      const sectors = snapshot.sectors;
      const classified = classifySectorRequest(text, sectors);
      if (!classified.matched || !classified.sector) return null;
      const sector = classified.sector; const intent = classified.intent || 'contact';
      // Todos os setores usam o diretório estruturado para que a resposta
      // contenha somente o campo solicitado, sem abrir o card institucional inteiro.
      if (/\?\s*$/.test(String(text || '')) || implicitQuestionStructure(text)) {
        const intentLabel = intent === 'location' ? 'onde fica' : intent === 'services' ? 'o que resolve' : intent === 'source' ? 'qual a fonte' : 'contato';
        const semantic = semanticQuestionAssessment(text, [`${intentLabel} ${sector.acronym || sector.name}`, sector.name, sector.acronym || '']);
        if (!semantic.allowed) return null;
      }
      return {
        matched: true, type: 'sector', text: formatSectorResponse(sector, intent), signature: `sector:${sector.id}:${intent}`,
        matchedItem: `${sector.acronym || sector.name} — ${intent}`, topic: 'Setores do IFBA', attachment: null,
        source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '',
        sourceAlreadyShown: true,
        detectedIntent: ({ email: 'e-mail', whatsapp: 'WhatsApp', phone: 'telefone', location: 'localização', services: 'serviços', source: 'fonte', contact: 'contato' })[intent] || 'contato',
        reasons: ['consulta estruturada ao cadastro de setores'], candidates: [], conflict: false, redactLog: false,
        context: { ...context }, analysis: [], contextSubject: { kind: 'sector', id: Number(sector.id), title: sector.name,
          source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '' }
      };
    },

    guidedFlowEvaluation(text, context, settings) {
      const flow = classifyGuidedFlow(text);
      if (!flow) return null;
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context, settings);
      const messages = snapshot.messages;
      const byTitle = new Map(messages.map(item => [normalizeText(item.title), item]));
      const candidates = flow.options.map(([label, title]) => {
        const item = byTitle.get(normalizeText(title));
        if (!item) return null;
        return { kind: 'message', item: { ...item, topic: item.topic || item.title }, score: 100, reasons: [`opção do roteiro ${flow.key}`], label,
          contextSubject: { kind: 'message', id: Number(item.id), title: item.title, topic: item.topic || item.title,
            details_text: item.details_text || '', source_url: item.source_url || '', source_title: item.source_title || '', verified_at: item.verified_at || '' } };
      }).filter(Boolean).slice(0, 5);
      if (!candidates.length) return null;
      candidates.push({ kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação', response_text: '' }, score: 0, reasons: ['saída da lista'] });
      const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
      return {
        matched: true, type: 'disambiguation', text: formatFlowMenu({ ...flow, options: candidates.map(candidate => [candidate.label, candidate.item.title]) }, timeout),
        signature: `flow:${flow.key}`, matchedItem: `Roteiro — ${flow.title}`, topic: flow.title, attachment: null,
        reasons: ['roteiro orientado solicitado'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
        conflict: true, redactLog: false, context: { ...context }, analysis: [], pendingCandidates: candidates
      };
    },

    menuEvaluation(menuKey, context, settings) {
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context, settings);
      const messages = snapshot.messages;
      const candidates = menuCandidates(menuKey, messages);
      if (!candidates.length) return null;
      const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
      return {
        matched: true, type: 'disambiguation', text: formatMenu(menuKey, candidates, timeout),
        signature: `menu:${menuKey}`, matchedItem: `Menu — ${menuKey}`, topic: 'Ajuda', attachment: null,
        reasons: ['menu contextual solicitado'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
        conflict: true, redactLog: false, context: { ...context }, analysis: [], pendingCandidates: candidates
      };
    },

    progressiveMenuEvaluation(evaluation, item, settings) {
      const menuKey = progressiveMenuFor(item?.title || evaluation?.matchedItem || '');
      if (!menuKey) return evaluation;
      const candidates = menuCandidates(menuKey, evaluation?.context?.snapshot?.messages || this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false }));
      if (!candidates.length) return evaluation;
      const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
      const menuText = formatMenu(menuKey, candidates, timeout);
      return { ...evaluation, text: `${String(evaluation.text || '').trim()}
    
    ${menuText}`.trim(), pendingCandidates: candidates };
    },

    evaluate(body, context = {}) {
      const text = String(body || '').trim();
      const settings = context.snapshot?.settings || context.settings || this.db.getSettings();
      const baseSnapshot = context.snapshot || this.buildMessageSnapshot(null, context, settings);
      const prepared = context.prepared || prepareMessage(text, {
        now: context.now || Date.now(), teachers: baseSnapshot.teachers,
        scheduleEntries: baseSnapshot.disciplineDirectory,
        isGroup: Boolean(context.isGroup), hasReply: Boolean(context.hasReply),
        mentionedMe: Boolean(context.mentionedMe)
      });
      const snapshot = context.snapshot || this.scopeMessageSnapshot(baseSnapshot, prepared);
      context = { ...context, settings, prepared, snapshot };
      const result = {
        matched: false, type: 'none', text: '', signature: '', matchedItem: '', redactLog: false,
        reasons: [], candidates: [], conflict: false, blockedBy: '', topic: '', context: { ...context }, analysis: [],
        queryModel: prepared.queryModel || null,
        alternatives: prepared.queryModel?.alternatives || [],
        evidence: prepared.queryModel?.evidence || []
      };
      if (!text) return result;
    
      if (prepared.intent === 'professor-attendance-confirmation') {
        const ignored = this.professorAttendanceIgnoredEvaluation(text, context);
        if (ignored) return ignored;
      }
      if (prepared.intent === 'schedule-status-confirmation' || prepared.intent === 'schedule-narrative') {
        const ignored = this.scheduleStatusConfirmationIgnoredEvaluation(text, context);
        if (ignored) return ignored;
      }
    
      if (isHelpCommand(text)) {
        if (!this.featureAllowed(context, 'help', settings)) return { ...result, blockedBy: 'group-help-disabled', reasons: ['ajuda desativada neste grupo'] };
        return this.menuEvaluation('root', context, settings)
          || { ...result, matched: true, type: 'help', text: formatHelpResponse(settings, snapshot.calculators), signature: 'help', matchedItem: 'Ajuda', topic: 'Ajuda', reasons: ['comando de ajuda reconhecido'] };
      }
    
      const calculators = snapshot.calculators;
      const explicitCalculatorCommand = Boolean(commandFor(text, calculators));
      const numericCalculatorRequest = looksLikeCalculator(text, calculators) && /\d/.test(text);
      if (asBool(settings.calculator_enabled, true) && (explicitCalculatorCommand || numericCalculatorRequest)) {
        if (!this.featureAllowed(context, 'calculator', settings)) return { ...result, blockedBy: 'group-calculator-disabled', reasons: ['calculadoras desativadas neste grupo'] };
        const calculation = handleCalculator(text, calculators);
        if (calculation) return {
          ...result, matched: true, type: calculation.type, text: appendFooter(calculation.text, settings.reply_footer),
          signature: calculation.type, matchedItem: calculation.topic || 'Calculadora', topic: calculation.topic || 'Calculadoras', redactLog: true,
          reasons: ['comando ou expressão de cálculo reconhecida']
        };
      }
    
      if (!asBool(settings.automatic_messages_enabled, true)) return { ...result, blockedBy: 'messages-disabled', reasons: ['mensagens automáticas desativadas'] };
      if (!this.featureAllowed(context, 'messages', settings)) return { ...result, blockedBy: 'group-messages-disabled', reasons: ['mensagens automáticas desativadas neste grupo'] };
    
      const professorPhonePrivacy = this.professorPhonePrivacyEvaluation(text, context);
      if (professorPhonePrivacy) return { ...result, ...professorPhonePrivacy };
    
      // Uma correspondência docente exata ou uma disciplina reconhecida tem
      // prioridade sobre a pergunta genérica por semestre. Correspondências
      // apenas aproximadas ficam depois, evitando confundir “amanhã” com Amanda.
      const strongProfessorReference = Boolean(prepared.disciplineMatches?.length)
        || Boolean(prepared.professorMatches?.some(match => !match.fuzzy));
      const explicitFacilityReference = /\b(?:miniauditorio|miniauditório)\b/iu.test(text)
        || /\blaborat[oó]rio\s+de\s+redes(?:\s+de)?\s+(?:bsi|sistemas\s+de\s+informa[cç][aã]o)\b/iu.test(text);
      if (strongProfessorReference && !explicitFacilityReference) {
        const professorCard = this.professorCardEvaluation(text, context);
        if (professorCard) return { ...result, ...professorCard };
      }
    
      const semesterOverview = this.semesterOverviewEvaluation(text, context);
      if (semesterOverview) return { ...result, ...semesterOverview };
    
      const semesterSchedule = this.semesterScheduleEvaluation(text, context);
      if (semesterSchedule) return { ...result, ...semesterSchedule };
    
      const sector = this.sectorEvaluation(text, context, settings);
      if (sector) return { ...result, ...sector };
    
      const guidedFlow = this.guidedFlowEvaluation(text, context, settings);
      if (guidedFlow) return { ...result, ...guidedFlow };
    
      if (!strongProfessorReference) {
        const professorCard = this.professorCardEvaluation(text, context);
        if (professorCard) return { ...result, ...professorCard };
      }
    
      const professorLocation = this.professorLocationEvaluation(text, context, settings);
      if (professorLocation) return { ...result, ...professorLocation };
    
      let analysis;
      const finishTriggerEvaluation = this.performance.timer('trigger_evaluation_ms');
      if (context.includeDrafts) {
        const synonymGroups = this.db.listSynonymGroups({ activeOnly: true });
        analysis = evaluateAutomaticMessagesDetailed(text, snapshot.messages, synonymGroups, { isGroup: Boolean(context.isGroup) });
      } else {
        analysis = this.ruleStore.evaluate(text, { isGroup: Boolean(context.isGroup), ambiguityThreshold: Math.max(0, Number(settings.disambiguation_threshold || 1)) });
      }
      finishTriggerEvaluation();
      const candidateStats = analysis.candidateStats || { candidates: analysis.length, total: analysis.length, skipped: 0 };
      this.performance.observe('trigger_candidates', candidateStats.candidates);
      const observed = analysis.filter(item => item.matched && item.item?.observation_mode);
      for (const item of observed) {
        try { this.db.addTriggerObservation?.({ message_id: item.item.id, message_excerpt: text,
          chat_type: context.isGroup ? 'group' : 'private', reasons: item.reasons || [] }); } catch {}
      }
      const candidates = analysis.filter(item => item.matched && !item.item?.observation_mode)
        .sort((a, b) => b.score - a.score || Number(a.item.sort_order || 0) - Number(b.item.sort_order || 0) || Number(b.item.priority || 0) - Number(a.item.priority || 0) || a.item.title.localeCompare(b.item.title))
        .slice(0, 5);
      result.analysis = analysis.map(item => ({
        id: item.item.id, title: item.item.title, matched: item.matched, score: item.score,
        scope: item.item.scope || 'both', keywordMatched: item.keywordMatched || 0, keywordTotal: item.keywordTotal || 0, reasons: item.reasons, blockedReasons: item.blockedReasons
      }));
      result.candidateStats = candidateStats;
      if (!candidates.length) { result.reasons = ['nenhuma regra satisfeita']; return result; }
    
      const threshold = Math.max(0, Number(settings.disambiguation_threshold || 1));
      const conflict = detectAmbiguousMatches(candidates, threshold);
      const candidatePayload = candidates.map(candidate => ({
        kind: 'message', id: candidate.item.id, title: candidate.item.title, score: candidate.score,
        reasons: candidate.reasons, topic: candidate.item.topic || candidate.item.title,
        simulationDraft: Boolean(candidate.item.simulationDraft), attachment: candidate.item.attachment || null, details_text: candidate.item.details_text || '', source_url: candidate.item.source_url || '', source_title: candidate.item.source_title || '', verified_at: candidate.item.verified_at || ''
      }));
    
      if (conflict && asBool(settings.disambiguation_enabled, true)) {
        const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
        const pendingWithNone = [...candidates.slice(0, 3), { kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação', response_text: '' }, score: 0, reasons: ['saída da lista'] }];
        const disambiguationText = `Encontrei mais de uma possibilidade:\n\n${pendingWithNone.map((candidate,index)=>`${index+1}. *${candidate.item.title}*`).join('\n')}\n\nResponda somente com o número desejado em até ${Math.ceil(timeout / 60)} min.`;
        return {
          ...result, matched: true, type: 'disambiguation', text: disambiguationText,
          signature: candidates.slice(0, 3).map(candidate => `message:${candidate.item.id}`).join('|'),
          matchedItem: candidates.slice(0, 3).map(candidate => candidate.item.title).join(', '), topic: 'Desambiguação',
          reasons: candidates.slice(0, 3).flatMap(candidate => candidate.reasons), candidates: candidatePayload, conflict: true,
          pendingCandidates: pendingWithNone
        };
      }
    
      const selected = candidates[0];
      const selectedEvaluation = {
        ...result, matched: true, type: 'message', text: selected.responsePlan?.text ?? selected.item.response_text,
        signature: `message:${selected.item.id}`, matchedItem: selected.item.title,
        topic: selected.item.topic || selected.item.title, attachment: selected.item.attachment || null,
        detectedIntent: /^BSI — Aulas e horários do/iu.test(String(selected.item.title || '')) ? 'horário' : 'informações completas',
        details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '',
        contextSubject: { kind: 'message', id: Number(selected.item.id || 0), title: selected.item.title, topic: selected.item.topic || selected.item.title,
          details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '' },
        reasons: selected.reasons, candidates: candidatePayload, conflict, analysis: result.analysis
      };
      return this.progressiveMenuEvaluation(selectedEvaluation, selected.item, settings);
    },

    simulate(body, { groupId = '', isGroup = true, ignorePermissions = false, includeDrafts = true } = {}) {
      const evaluation = this.evaluate(body, { groupId, isGroup, ignorePermissions, includeDrafts, simulation: true });
      if (!evaluation?.matched || evaluation.type === 'disambiguation') return evaluation;
      const source = {
        source_url: evaluation.source_url || evaluation.contextSubject?.source_url || '',
        source_title: evaluation.source_title || evaluation.contextSubject?.source_title || '',
        verified_at: evaluation.verified_at || evaluation.contextSubject?.verified_at || ''
      };
      const text = !evaluation.sourceAlreadyShown && evaluation.type !== 'message_source'
        ? appendSourceMetadata(evaluation.text, source)
        : evaluation.text;
      return { ...evaluation, text };
    }
  });
};
