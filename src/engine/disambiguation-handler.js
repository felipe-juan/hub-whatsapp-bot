'use strict';

module.exports = function installDisambiguationHandler(BotEngine, deps) {
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
    disciplineDisambiguationEvaluation(text, matches = [], context = {}, settings = {}) {
      if (matches.length < 2) return null;
      const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
      const fields = requestedDisciplineFields(text);
      const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context, settings);
      const candidates = capCandidates(matches, 9).map(discipline => {
        const title = this.disciplineDisplayLabel(discipline);
        return {
          kind: 'discipline_query',
          item: { id: `discipline:${discipline.code || normalizeText(discipline.name)}`, title },
          discipline: { code: discipline.code || '', name: discipline.name || '', label: title },
          fields: [...fields], academicPeriod: snapshot.academicPeriod,
          contextSubject: { kind: 'discipline_card', id: discipline.code || normalizeText(discipline.name), title,
            referenceText: discipline.code || discipline.name, disciplineNames: [discipline.name] }
        };
      });
      candidates.push({ kind: 'none', label: 'Nenhuma dessas', item: { id: 'none', title: 'Nenhuma dessas', topic: 'Recuperação' }, score: 0, reasons: ['saída da lista'] });
      const list = candidates.map((candidate, index) => `${index + 1}. *${candidate.item.title}*`).join('\n');
      return {
        matched: true, type: 'disambiguation',
        text: `Você quis dizer?
    
    ${list}
    
    Responda somente com o número desejado em até ${Math.ceil(timeout / 60)} min.`,
        signature: `discipline-disambiguation:${candidates.filter(item => item.discipline).map(item => item.discipline.code || normalizeText(item.discipline.name)).join('|')}`,
        matchedItem: candidates.map(item => item.item.title).join(', '), topic: 'Professores e Disciplinas',
        detectedIntent: professorIntentLabel(fields), reasons: ['termo de disciplina ambíguo', 'confirmação numérica necessária'],
        candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
        conflict: true, redactLog: false, analysis: [], attachment: null, context: { ...context }, pendingCandidates: candidates
      };
    },

    disciplineChoiceEvaluation(selected = {}) {
      const discipline = selected.discipline || {};
      const academicPeriod = String(selected.academicPeriod || this.db.getSetting?.('current_academic_period', '2026.2') || '2026.2');
      const entries = this.db.listProfessorScheduleEntries?.({
        academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name
      }) || [];
      const teachers = [...new Map(entries.map(entry => [normalizeText(entry.professor_name), {
        name: entry.professor_name, email: entry.professor_email || ''
      }])).values()];
      const fields = Array.isArray(selected.fields) ? selected.fields : [];
      const text = fields.length
        ? formatProfessorFieldResponse({ entries, teachers, fields })
        : formatDisciplineFullCard({ entries, academicPeriod });
      const title = selected.item?.title || this.disciplineDisplayLabel(discipline);
      return {
        matched: true, type: 'message', text,
        signature: `discipline-choice:${discipline.code || normalizeText(discipline.name)}:${fields.join(',') || 'full'}`,
        matchedItem: title, topic: 'Professores e Disciplinas', attachment: null,
        details_text: '', source_url: '', source_title: '', verified_at: '',
        detectedIntent: professorIntentLabel(fields), reasons: ['disciplina escolhida após desambiguação'],
        candidates: [], conflict: false, redactLog: false,
        contextSubject: selected.contextSubject || { kind: 'discipline_card', id: discipline.code || normalizeText(discipline.name), title,
          referenceText: discipline.code || discipline.name, disciplineNames: [discipline.name] }
      };
    },

    rememberPendingChoice(message, evaluation, settings) {
      if (!evaluation?.pendingCandidates?.length) return;
      const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
      const graceSeconds = Math.max(60, Math.min(1800, Number(settings.recovery_recent_expired_seconds || 600)));
      const entry = {
        candidates: evaluation.pendingCandidates,
        expiresAt: Date.now() + timeout * 1000,
        graceUntil: Date.now() + (timeout + graceSeconds) * 1000,
        originalMessage: evaluation.recoveryMetadata?.originalMessage || evaluation.context?.originalMessage || '',
        recoveryMetadata: evaluation.recoveryMetadata || null,
        promptText: String(evaluation.text || '').slice(0, 3000)
      };
      const key = this.conversationKey(message);
      this.pendingChoices.set(key, entry);
      try { this.db.savePendingChoice?.(key, entry, entry.expiresAt, entry.graceUntil); } catch {}
      if (evaluation.type === 'disambiguation') this.metrics.disambiguations += 1;
    },

    cleanPendingChoices() {
      if (this.pendingChoices.size > 500) {
        const ordered = [...this.pendingChoices.entries()].sort((a, b) => Number(a[1].graceUntil || a[1].expiresAt || 0) - Number(b[1].graceUntil || b[1].expiresAt || 0));
        for (const [key] of ordered.slice(0, this.pendingChoices.size - 500)) this.pendingChoices.delete(key);
      }
    },

    loadPendingChoice(message, { includeGrace = true } = {}) {
      this.cleanPendingChoices();
      const key = this.conversationKey(message);
      let pending = this.pendingChoices.get(key) || null;
      if (!pending && this.db.getPendingChoice) {
        try {
          const row = this.db.getPendingChoice(key, { includeGrace });
          if (row?.payload) {
            pending = row.payload;
            pending.expiresAt = Number(row.expires_at || pending.expiresAt || 0);
            pending.graceUntil = Number(row.grace_until || pending.graceUntil || pending.expiresAt || 0);
            this.pendingChoices.set(key, pending);
          }
        } catch {}
      }
      return pending;
    },

    clearPendingChoice(message) {
      const key = this.conversationKey(message);
      this.pendingChoices.delete(key);
      try { this.db.deletePendingChoice?.(key); } catch {}
    },

    choiceIndexForBody(body, candidates = []) {
      const raw = String(body || '').trim();
      if (!raw) return -1;
      const number = choiceNumber(raw);
      if (number > 0 && number <= candidates.length) return number - 1;
      if (isNone(raw)) {
        const index = candidates.findIndex(candidate => candidate.kind === 'none');
        if (index >= 0) return index;
      }
      const normalized = canonicalSpeechText(raw);
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const values = [candidate.label, candidate.item?.title, candidate.discipline?.code, candidate.discipline?.name,
          candidate.contextSubject?.referenceText, ...(candidate.aliases || [])].map(canonicalSpeechText).filter(Boolean);
        if (values.some(value => normalized === value || (normalized.length >= 3 && value.startsWith(`${normalized} `)))) return index;
      }
      return -1;
    },

    hasPendingChoice(message) {
      const pending = this.loadPendingChoice(message, { includeGrace: false });
      return Boolean(pending && Number(pending.expiresAt || 0) > Date.now() && Array.isArray(pending.candidates) && pending.candidates.length);
    },

    canResolvePendingChoice(message, body) {
      const pending = this.loadPendingChoice(message, { includeGrace: true });
      if (!pending?.candidates?.length) return false;
      if (isCancel(body)) return true;
      return this.choiceIndexForBody(body, pending.candidates) >= 0;
    },

    expiredChoiceEvaluation(message, pending) {
      if (!pending?.candidates?.length || Number(pending.graceUntil || 0) <= Date.now()) return null;
      const labels = pending.candidates.filter(item => item.kind !== 'none').slice(0, 4)
        .map((item,index)=>`${index+1}. ${item.label || item.item?.title || 'Opção'}`).join('\n');
      const timeout = Math.max(30, Number(this.db.getSetting?.('disambiguation_timeout_seconds','120') || 120));
      pending.expiresAt = Date.now() + timeout * 1000;
      pending.graceUntil = pending.expiresAt + 600000;
      const key = this.conversationKey(message);
      this.pendingChoices.set(key, pending);
      try { this.db.savePendingChoice?.(key, pending, pending.expiresAt, pending.graceUntil); } catch {}
      return {
        matched: true, type: 'expired_choice_recovery',
        text: `Sua escolha anterior expirou, mas ainda consigo retomá-la.\n\n${labels}\n\nResponda novamente com o número ou o nome da opção.`,
        signature: 'expired-choice-recovery', matchedItem: 'Retomada de escolha expirada', topic: 'Recuperação de conversa',
        reasons: ['contexto expirado recentemente foi recuperado'], candidates: [], conflict: false, redactLog: false, analysis: [],
        pendingCandidates: pending.candidates, recoveryMetadata: { stage: 1, outcome: 'expired_context_resumed', optionCount: pending.candidates.length }
      };
    },

    pendingEvaluation(message, body, settings) {
      const pending = this.loadPendingChoice(message, { includeGrace: true });
      if (!pending) return null;
      if (isCancel(body)) {
        this.clearPendingChoice(message); this.clearRecoveryState(message);
        return { matched: true, type: 'choice_cancelled', text: 'Tudo bem. A escolha foi cancelada.', signature: 'choice-cancelled',
          matchedItem: 'Escolha cancelada', topic: 'Recuperação de conversa', reasons: ['cancelamento solicitado'], candidates: [], conflict: false, redactLog: false, analysis: [] };
      }
      if (Number(pending.expiresAt || 0) <= Date.now()) {
        const indexInGrace = this.choiceIndexForBody(body, pending.candidates);
        if (indexInGrace < 0) return this.expiredChoiceEvaluation(message, pending);
      }
      const index = this.choiceIndexForBody(body, pending.candidates);
      if (index < 0) return null;
      const selected = pending.candidates[index];
      this.clearPendingChoice(message);
      if (selected.kind === 'none') {
        if (pending.recoveryMetadata?.outcome === 'suggestions' && pending.originalMessage && this.db.addNegativeExampleSuggestion) {
          for (const candidate of pending.candidates || []) {
            const messageId = Number(candidate?.item?.id || 0);
            if (candidate.kind !== 'message' || !messageId) continue;
            try {
              this.db.addNegativeExampleSuggestion({
                message_excerpt: pending.originalMessage,
                normalized_message: normalizeText(pending.originalMessage),
                message_id: messageId,
                message_title: candidate.item?.title || '',
                source: 'suggestion_rejected',
                chat_type: message?.isGroup ? 'group' : 'private'
              });
            } catch {}
          }
        }
        this.recordRecovery(message, { original_message: pending.originalMessage || '', stage: pending.recoveryMetadata?.stage || 1,
          outcome: 'suggestions_rejected', option_count: Math.max(0,pending.candidates.length-1), selected_option: 'Nenhuma dessas' });
        this.saveRecoveryState(message, { failures: Math.max(2, Number(this.recoveryState(message).failures || 0) + 1),
          originalMessage: pending.originalMessage || this.recoveryState(message).originalMessage || '', lastMessage: body }, settings);
        const categories = categoryCandidates(2);
        return {
          matched: true, type: 'recovery_menu', text: broadHelpText(pending.originalMessage || '', 2), signature: 'recovery-none-categories',
          matchedItem: 'Recuperação — nenhuma opção', topic: 'Recuperação de conversa', reasons: ['usuário rejeitou as sugestões'],
          candidates: categories.map(item => ({ kind: item.kind, id: item.item.id, title: item.item.title })), conflict: false, redactLog: false, analysis: [],
          pendingCandidates: categories,
          recoveryMetadata: { stage: 2, outcome: 'categories', optionCount: categories.length, originalMessage: pending.originalMessage || '' },
          contextSubject: { kind: 'recovery_categories', title: 'Categorias de ajuda', originalMessage: pending.originalMessage || '', stage: 2 }
        };
      }
      if (selected.submenuKey) {
        this.recordRecovery(message, { original_message: pending.originalMessage || '', stage: pending.recoveryMetadata?.stage || 2,
          outcome: 'menu_resolved', selected_option: selected.item?.title || '', entity_type: 'menu', entity_id: selected.submenuKey,
          option_count: pending.candidates.length, messages_to_resolution: Number(this.recoveryState(message).failures || 1) + 1 });
        this.clearRecoveryState(message);
        return this.menuEvaluation(selected.submenuKey, {}, settings);
      }
      if (selected.kind === 'discipline_query') {
        const evaluation = this.disciplineChoiceEvaluation(selected);
        this.recordRecovery(message, { original_message: pending.originalMessage || '', stage: pending.recoveryMetadata?.stage || 1,
          outcome: 'suggestion_selected', selected_option: selected.item?.title || '', entity_type: 'discipline',
          entity_id: selected.discipline?.code || selected.discipline?.name || '', option_count: pending.candidates.length,
          messages_to_resolution: Number(this.recoveryState(message).failures || 1) + 1 });
        this.clearRecoveryState(message);
        return evaluation;
      }
      const chosen = {
        matched: true, type: selected.kind, text: formatContentResponse(selected),
        signature: `${selected.kind}:${selected.item.id}`, matchedItem: selected.item.title,
        topic: selected.item.topic || selected.item.title, attachment: selected.item.attachment || null,
        details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '',
        contextSubject: selected.contextSubject || { kind: 'message', id: Number(selected.item.id || 0), title: selected.item.title, topic: selected.item.topic || selected.item.title,
          details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '' },
        reasons: ['opção escolhida após desambiguação'], candidates: [], conflict: false, redactLog: false
      };
      if (pending.originalMessage && Number(selected.item?.id) > 0 && this.db.addUnrecognizedSuggestion) {
        try { this.db.addUnrecognizedSuggestion({ message_excerpt: pending.originalMessage, normalized_message: normalizeText(pending.originalMessage),
          chat_type: message?.isGroup ? 'group' : 'private', chat_name: '', suggested_message_id: Number(selected.item.id),
          suggested_title: selected.item.title, confidence: 0.99, reasons: ['usuário escolheu esta opção após sugestão'] }); } catch {}
      }
      this.recordRecovery(message, { original_message: pending.originalMessage || '', stage: pending.recoveryMetadata?.stage || 1,
        outcome: 'suggestion_selected', selected_option: selected.item?.title || '', entity_type: selected.contextSubject?.kind || 'message',
        entity_id: String(selected.item?.id || ''), option_count: pending.candidates.length,
        messages_to_resolution: Number(this.recoveryState(message).failures || 1) + 1 });
      this.clearRecoveryState(message);
      return selected.kind === 'message' ? this.progressiveMenuEvaluation(chosen, selected.item, settings) : chosen;
    }
  });
};
