'use strict';

module.exports = function installFallbackHandler(BotEngine, deps) {
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
    botMentioned(message) {
      // Ajuda por menção só deve ser ativada por uma menção real do WhatsApp.
      // Palavras comuns como “bot” não são suficientes.
      return Boolean(message?.mentionedMe || message?.groupActivated);
    },

    unknownMentionEvaluation(settings) {
      return {
        matched: true,
        type: 'unknown_mention',
        text: formatUnknownMentionResponse(settings),
        signature: 'unknown-mention',
        matchedItem: 'Ajuda por menção',
        topic: 'Ajuda',
        reasons: ['o bot foi mencionado, mas nenhum comando ou gatilho foi reconhecido'],
        candidates: [],
        conflict: false,
        redactLog: false,
        analysis: []
      };
    },

    privateUnknownEvaluation(settings) {
      return {
        matched: true, type: 'private_unknown', text: formatUnknownMentionResponse(settings),
        signature: 'private-unknown', matchedItem: 'Ajuda automática no privado', topic: 'Ajuda',
        reasons: ['mensagem privada sem comando ou gatilho reconhecido'], candidates: [], conflict: false, redactLog: false, analysis: []
      };
    },

    recoveryEvaluationFor(message, body, context, settings) {
      if (!asBool(settings.recovery_enabled, true)) return null;
      const state = this.recoveryState(message, settings);
      const failures = Number(state.failures || 0);
      const immutableOriginal = String(state.originalMessage || '').trim();
      const recoveryInput = failures > 0 && immutableOriginal && normalizeText(immutableOriginal) !== normalizeText(body)
        ? `${immutableOriginal} ${body}`.trim()
        : body;
      const evaluation = recoveryEvaluation(recoveryInput, {
        prepared: failures > 0 ? null : context.prepared, snapshot: context.snapshot, context,
        failures, maxSuggestions: Number(settings.recovery_max_suggestions || 3)
      });
      if (!evaluation) return null;
      const nextFailures = Number(state.failures || 0) + 1;
      this.saveRecoveryState(message, { failures: nextFailures, originalMessage: state.originalMessage || body,
        lastMessage: body, lastIntent: evaluation.detectedIntent || context.prepared?.intent || '', payload: { stage: evaluation.recoveryMetadata?.stage || 1 } }, settings);
      if (evaluation.recoveryMetadata) evaluation.recoveryMetadata.originalMessage = state.originalMessage || body;
      this.recordRecovery(message, { original_message: state.originalMessage || body, stage: evaluation.recoveryMetadata?.stage || nextFailures,
        outcome: evaluation.recoveryMetadata?.outcome || evaluation.type, intent: evaluation.detectedIntent || '', option_count: evaluation.recoveryMetadata?.optionCount || 0,
        messages_to_resolution: nextFailures });
      return evaluation;
    }
  });
};
