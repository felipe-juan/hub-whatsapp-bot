'use strict';

module.exports = function installLearningHandler(BotEngine, deps) {
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
    recordRecovery(message, input = {}) {
      try { this.db.recordRecoveryEvent?.({ context_key: this.conversationKey(message), chat_type: message?.isGroup ? 'group' : 'private', ...input }); } catch {}
    },

    learnFromRecoveryResolution(message, evaluation) {
      const state = this.recoveryState(message);
      if (!state?.originalMessage || !evaluation?.matched || ['recovery_clarification','recovery_menu','disambiguation','private_unknown','unknown_mention'].includes(evaluation.type)) return;
      const selectedId = Number(evaluation.contextSubject?.id || evaluation.candidates?.[0]?.id || 0);
      if (selectedId > 0 && this.db.addUnrecognizedSuggestion) {
        try { this.db.addUnrecognizedSuggestion({ message_excerpt: state.originalMessage, normalized_message: normalizeText(state.originalMessage),
          chat_type: message?.isGroup ? 'group' : 'private', chat_name: '', suggested_message_id: selectedId,
          suggested_title: evaluation.matchedItem || evaluation.contextSubject?.title || '', confidence: 0.96,
          reasons: ['usuário reformulou a pergunta e chegou a esta resposta'] }); } catch {}
      }
      this.recordRecovery(message, { original_message: state.originalMessage, stage: Math.max(1, Number(state.failures || 1)),
        outcome: 'reformulation_resolved', intent: evaluation.detectedIntent || '', entity_type: evaluation.contextSubject?.kind || '',
        entity_id: String(evaluation.contextSubject?.id || ''), messages_to_resolution: Number(state.failures || 1) + 1 });
      this.clearRecoveryState(message);
    },

    unrecognizedSuggestion(body, evaluation = {}) {
      const normalized = normalizeText(body);
      if (!normalized || normalized.length < 3 || normalized.startsWith('!')) return null;
      const snapshot = evaluation.context?.snapshot || null;
      const teachers = snapshot?.teachers || this.db.listTeachers({ activeOnly: true, cloneResult: false });
      const professorMatches = findProfessorDirectoryMatches(normalized, teachers);
      if (professorMatches.length === 1) {
        const teacher = professorMatches[0].teacher;
        const card = (snapshot?.messages || this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false }))
          .find(item => normalizeText(item.title) === normalizeText(`Professor — ${teacher.name}`));
        if (card) return { suggested_message_id: Number(card.id), suggested_title: card.title, confidence: professorMatches[0].fuzzy ? 0.84 : 0.94,
          reasons: ['nome de professor reconhecido; intenção ainda não cadastrada'] };
      }
      const ranked = [...(evaluation.analysis || [])]
        .filter(item => Number(item.id) > 0 && Number(item.score || 0) > 0)
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      const best = ranked[0];
      if (!best) return null;
      const second = ranked[1];
      if (second && Number(best.score || 0) - Number(second.score || 0) < 1) return null;
      return { suggested_message_id: Number(best.id), suggested_title: best.title, confidence: Math.min(0.9, 0.45 + Number(best.score || 0) / 100),
        reasons: [...(best.reasons || []), ...(best.blockedReasons || [])].slice(0, 6) };
    },

    recordUnrecognizedSuggestion(body, evaluation, chat) {
      if (!this.db.addUnrecognizedSuggestion) return;
      const suggestion = this.unrecognizedSuggestion(body, evaluation);
      if (!suggestion) return;
      try {
        this.db.addUnrecognizedSuggestion({
          message_excerpt: String(body || '').slice(0, 300), normalized_message: normalizeText(body),
          chat_type: chat?.isGroup ? 'group' : 'private', chat_name: chat?.name || '', ...suggestion
        });
      } catch (error) {
        console.warn('Não foi possível registrar sugestão de aprendizado assistido:', error.message);
      }
    },

    recordIntentMetric(message, { intent = '', outcome = '', missingField = '', attempts = 0, confidence = 0 } = {}) {
      try {
        this.db.recordIntentMetric?.({
          context_key: this.conversationKey(message),
          chat_type: (String(message?.from || '').endsWith('@g.us') || message?.isGroup) ? 'group' : 'private',
          intent, outcome, missing_field: missingField, attempts, confidence
        });
      } catch {}
    },

    isFalsePositiveFeedback(body) {
      return /^(?:nao era isso|não era isso|resposta errada|nao perguntei isso|não perguntei isso|isso nao foi o que perguntei|isso não foi o que perguntei)[.!?]*$/iu.test(String(body || '').trim());
    },

    async handleFalsePositiveFeedback(message, body, chat, settings) {
      if (!asBool(settings.false_positive_feedback_enabled, true) || !this.isFalsePositiveFeedback(body) || !this.db.addFalsePositiveReport) return false;
      let stored = null;
      for (const key of this.conversationKeys(message)) { stored = this.conversationContexts.get(key); if (stored) break; }
      if (!stored) for (const key of this.conversationKeys(message)) { const row = this.db.getConversationContext?.(key); if (row?.payload) { stored = row.payload; break; } }
      this.db.addFalsePositiveReport({ original_message: stored?.originalMessage || '', matched_message_id: stored?.id || null,
        matched_title: stored?.title || stored?.topic || '', response_excerpt: stored?.responseExcerpt || '', feedback_text: body,
        chat_type: chat?.isGroup ? 'group' : 'private' });
      const reply = 'Obrigado. Registrei essa resposta como possivelmente incorreta para revisão no painel.';
      if (message.sendResponse) await message.sendResponse({ text: reply, attachment: null }, true); else if (message.reply) await message.reply(reply);
      return true;
    }
  });
};
