'use strict';

module.exports = function installReactionHandler(BotEngine, deps) {
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
    commonMessageEvaluation(message, body, settings, chat) {
      const kind = classifyCommonMessage(body);
      if (!kind) return null;
      if (kind === 'thanks') {
        this.clearRecoveryState(message);
        this.forgetConversationContext(message);
        return { matched: true, type: 'courtesy', text: 'Por nada!', signature: 'courtesy:thanks', matchedItem: 'Cortesia', topic: 'Conversa',
          reasons: ['agradecimento reconhecido'], candidates: [], conflict: false, redactLog: false, analysis: [], attachment: null };
      }
      if (kind === 'ack') {
        this.clearRecoveryState(message);
        this.forgetConversationContext(message);
        return { matched: false, type: 'none', text: '', signature: '', matchedItem: '', topic: 'Conversa',
          reasons: ['confirmação curta reconhecida; nenhuma ajuda adicional necessária'], candidates: [], conflict: false, redactLog: false,
          analysis: [], suppressPrivateFallback: true, blockedBy: 'common-conversation' };
      }
      if (kind === 'conversation') {
        return { matched: false, type: 'none', text: '', signature: '', matchedItem: '', topic: 'Conversa',
          reasons: ['mensagem narrativa ou assunto incompatível reconhecido como conversa comum'], candidates: [], conflict: false,
          redactLog: false, analysis: [], suppressPrivateFallback: true, blockedBy: 'common-conversation' };
      }
      if (kind === 'greeting' && !chat?.isGroup) {
        const key = this.conversationKey(message);
        const days = Math.max(1, Number(settings.recovery_private_welcome_days || 60));
        let shouldWelcome = true;
        try { shouldWelcome = this.db.shouldWelcomePrivateUser?.(key, days) !== false; } catch {}
        try { this.db.touchPrivateUserProfile?.(key, { welcome: shouldWelcome }); } catch {}
        if (!shouldWelcome) return { matched: true, type: 'courtesy', text: 'Olá! Como posso ajudar?', signature: 'courtesy:greeting', matchedItem: 'Saudação', topic: 'Conversa', reasons: ['saudação reconhecida'], candidates: [], conflict: false, redactLog: false, analysis: [] };
        return {
          matched: true, type: 'private_welcome',
          text: [
            'Olá! Eu posso ajudar com:', '',
            '• salas e horários;',
            '• professores e contatos;',
            '• disciplinas e semestres;',
            '• setores e serviços do IFBA;',
            '• documentos, estágio e TCC;',
            '• cálculo da nota final.', '',
            'Você pode escrever normalmente, por exemplo:', '',
            '“qual sala de Cálculo?”',
            '“quem ensina Algoritmos?”',
            '“contato da CAENS”', '',
            'Digite `menu` para ver todas as áreas.'
          ].join('\n'),
          signature: 'private-welcome', matchedItem: 'Apresentação inicial', topic: 'Ajuda', reasons: ['saudação no privado'], candidates: [], conflict: false, redactLog: false, analysis: []
        };
      }
      return null;
    },

    async handleContextualReaction(message, body, chat, settings) {
      const reaction = classifyBotReaction({ ...message, mentionedMe: Boolean(message?.mentionedMe || message?.groupActivated) }, body, { isPrivate: !chat.isGroup });
      if (!reaction || typeof message.react !== 'function') return false;
      try {
        await message.react(reaction.emoji);
        this.metrics.reactions = Number(this.metrics.reactions || 0) + 1;
        this.diagnostic({
          type: 'reaction', outcome: 'responded', matchedItem: reaction.kind === 'thanks' ? 'Agradecimento ao bot' : 'Ofensa ao bot',
          reply: reaction.emoji, summary: `Reação ${reaction.emoji} enviada (${reaction.reason}).`,
          chatType: chat.isGroup ? 'group' : 'private', chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'), message: body
        }, settings);
        return true;
      } catch (error) {
        this.diagnostic({
          type: 'error', outcome: 'error', matchedItem: 'Reação contextual',
          summary: `Falha ao reagir: ${error.message}`,
          chatType: chat.isGroup ? 'group' : 'private', chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'), message: body
        }, settings);
        return false;
      }
    }
  });
};
