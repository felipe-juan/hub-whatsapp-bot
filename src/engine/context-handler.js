'use strict';

module.exports = function installContextHandler(BotEngine, deps) {
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
    hasFastConversationState(message) {
      const now = Date.now();
      for (const key of this.conversationKeys(message)) {
        const context = this.conversationContexts.get(key);
        if (context && Number(context.expiresAt || 0) > now) return true;
        const pending = this.pendingChoices.get(key);
        if (pending && Number(pending.expiresAt || 0) > now) return true;
      }
      return false;
    },

    activePromptContext(message) {
      const now = Date.now();
      const allowedKinds = new Set(['recovery_prompt', 'semester_schedule_prompt', 'semester_overview_prompt']);
      const quotedKey = this.replyContextKey(message, message?.quotedMessageId);
      let stored = quotedKey ? this.replyContexts.get(quotedKey) : null;
      if (!stored) {
        for (const key of this.conversationKeys(message)) {
          const candidate = this.conversationContexts.get(key);
          if (candidate && Number(candidate.expiresAt || 0) > now) { stored = candidate; break; }
        }
      }
      if (!stored && this.db.getConversationContext) {
        try {
          const persisted = quotedKey ? this.db.getConversationContext('', quotedKey) : null;
          if (persisted?.payload) stored = persisted.payload;
          if (!stored) for (const key of this.conversationKeys(message)) {
            const row = this.db.getConversationContext(key);
            if (row?.payload) { stored = row.payload; break; }
          }
        } catch {}
      }
      if (!stored || Number(stored.expiresAt || 0) <= now || !allowedKinds.has(String(stored.kind || ''))) return null;
      return stored;
    },

    canResolvePromptContext(message, body) {
      return Boolean(String(body || '').trim() && this.activePromptContext(message));
    },

    shouldProcessIncomingFast(message) {
      if (!message?.isGroup) return true;
      const startedAt = performance.now();
      try {
        const body = String(message.body || '').trim();
        if (!body) return false;
        if (message.groupActivated || message.mentionedMe
          || this.isAdminCommand(body) || this.isFalsePositiveFeedback(body) || isHelpCommand(body)) return true;
        if (this.hasFastConversationState(message)) return true;
    
        const normalized = normalizeText(body);
        if (!normalized) return false;
        if (FAST_GROUP_FOLLOWUP_PATTERN.test(normalized)) return true;
        if (looksLikeCalculator(body)) return true;
    
        const tokenCount = normalized.split(/\s+/u).filter(Boolean).length;
        const structuredSignal = FAST_GROUP_DOMAIN_PATTERN.test(normalized);
        const questionLike = /\?\s*$/u.test(body) || FAST_GROUP_QUESTION_LEAD_PATTERN.test(normalized);
        if (structuredSignal && (questionLike || tokenCount <= 5)) return true;
    
        // Para os demais cards, use o snapshot já compilado e em memória. Se a
        // mensagem não casar com nenhuma regra, ela é descartada antes de gerar
        // escrita de deduplicação no SQLite e antes de entrar na fila serial do
        // grupo. A avaliação fica no LRU e será reaproveitada em caso de match.
        const analysis = this.ruleStore.evaluate(body, { isGroup: true, ambiguityThreshold: 1 });
        return analysis.some(item => item.matched);
      } finally {
        this.performance.observe('group_fast_admission_ms', performance.now() - startedAt);
      }
    },

    recoveryState(message, settings = null) {
      const key = this.conversationKey(message);
      const now = Date.now();
      let state = this.recoveryStates.get(key);
      if (state && Number(state.expiresAt || 0) <= now) { this.recoveryStates.delete(key); state = null; }
      if (!state && this.db.getRecoveryState) {
        try {
          const row = this.db.getRecoveryState(key);
          if (row) {
            state = { failures: Number(row.failures || 0), originalMessage: row.original_message || '', lastMessage: row.last_message || '',
              lastIntent: row.last_intent || '', payload: row.payload || {}, expiresAt: Number(row.expires_at) };
            this.recoveryStates.set(key, state);
          }
        } catch {}
      }
      return state || { failures: 0, originalMessage: '', lastMessage: '', lastIntent: '', payload: {}, expiresAt: now + 600000 };
    },

    saveRecoveryState(message, patch = {}, settings = this.db.getSettings()) {
      const current = this.recoveryState(message, settings);
      const ttl = Math.max(120, Math.min(1800, Number(settings.recovery_context_seconds || 300) * 2));
      const next = { ...current, ...patch, expiresAt: Date.now() + ttl * 1000 };
      const key = this.conversationKey(message);
      this.recoveryStates.set(key, next);
      try { this.db.saveRecoveryState?.(key, { failures: next.failures, original_message: next.originalMessage,
        last_message: next.lastMessage, last_intent: next.lastIntent, payload: next.payload || {}, expires_at: next.expiresAt }); } catch {}
      return next;
    },

    clearRecoveryState(message) {
      const key = this.conversationKey(message);
      this.recoveryStates.delete(key);
      try { this.db.clearRecoveryState?.(key); } catch {}
    },

    cleanupExpiredContexts(now = Date.now()) {
      pruneContextMap(this.conversationContexts, { now, max: 1500 });
      pruneContextMap(this.replyContexts, { now, max: 1000 });
      for (const [key, pending] of this.pendingChoices) if (Number(pending.graceUntil || pending.expiresAt || 0) <= now) this.pendingChoices.delete(key);
      for (const [key, state] of this.recoveryStates) if (Number(state.expiresAt || 0) <= now) this.recoveryStates.delete(key);
      this.localPreferences.cleanup(now);
      try { this.db.prunePendingChoices?.(now); } catch {}
      try { this.db.pruneRecoveryStates?.(now); } catch {}
    },

    conversationKeys(message) {
      const chat = String(message?.from || '');
      const isGroup = chat.endsWith('@g.us') || Boolean(message?.isGroup);
      const aliases = [message?.author, ...(Array.isArray(message?.authorAliases) ? message.authorAliases : [])]
        .map(value => String(value || '').trim()).filter(Boolean);
      if (!isGroup || !aliases.length) aliases.push(chat);
      const keys = [];
      for (const alias of aliases) {
        keys.push(`${chat}|jid:${alias}`);
        const number = senderNumber(alias);
        if (number) keys.push(`${chat}|number:${number}`);
      }
      return [...new Set(keys.length ? keys : [`${chat}|jid:${chat}`])];
    },

    conversationKey(message) { return this.conversationKeys(message)[0]; },

    replyContextKey(messageOrChat, messageId = '') {
      const chat = typeof messageOrChat === 'string' ? messageOrChat : String(messageOrChat?.from || '');
      const id = String(messageId || '').trim();
      return id ? `${chat}|${id}` : '';
    },

    outboundMessageId(sendResult) {
      const result = sendResult?.result || sendResult?.textResult || sendResult;
      return String(result?.key?.id || result?.id || '').trim();
    },

    cleanConversationContexts(now = Date.now()) {
      pruneContextMap(this.conversationContexts, { now, max: 1500 });
      pruneContextMap(this.replyContexts, { now, max: 1000 });
    },

    forgetConversationContext(message, stored = null) {
      const keys = this.conversationKeys(message);
      for (const key of keys) {
        if (!stored || this.conversationContexts.get(key) === stored) this.conversationContexts.delete(key);
      }
      if (stored) for (const [key, value] of this.replyContexts) if (value === stored) this.replyContexts.delete(key);
      try { this.db.deleteConversationContexts?.(keys); } catch {}
    },

    rememberConversationContext(message, evaluation, settings = this.db.getSettings(), sendResult = null) {
      if (!evaluation?.matched || evaluation.type === 'disambiguation') return;
      const subject = evaluation.contextSubject;
      if (!subject || typeof subject !== 'object') return;
      const preferenceValue = preferencesFromSubject(subject);
      for (const key of this.conversationKeys(message)) this.localPreferences.set(key, preferenceValue);
      const ttlSeconds = Math.max(60, Math.min(900, Number(settings.contextual_followup_seconds || 300)));
      const quotedTtlSeconds = Math.max(ttlSeconds, Math.min(604800, Number(settings.quoted_context_seconds || 86400)));
      this.cleanConversationContexts();
      const createdAt = Date.now();
      const base = {
        ...subject,
        awaitingNextSenderMessage: subject.kind === 'semester_schedule_prompt',
        createdAt,
        originalMessage: String(subject.originalMessage || message?.body || '').slice(0, 1000),
        responseExcerpt: String(evaluation?.text || '').slice(0, 1000)
      };
      const entry = { ...base, expiresAt: createdAt + ttlSeconds * 1000, contextMode: 'conversation' };
      for (const key of this.conversationKeys(message)) this.conversationContexts.set(key, entry);
      const outboundId = this.outboundMessageId(sendResult);
      const replyKey = this.replyContextKey(message, outboundId);
      const quotedEntry = replyKey ? { ...base, expiresAt: createdAt + quotedTtlSeconds * 1000, contextMode: 'quoted-reply', replyKey } : null;
      if (replyKey) this.replyContexts.set(replyKey, quotedEntry);
      if (asBool(settings.persistent_context_enabled, true) && this.db.saveConversationContext) {
        for (const key of this.conversationKeys(message)) {
          try { this.db.saveConversationContext({ context_key: key, reply_key: '', subject_type: entry.kind || 'subject',
            subject_id: String(entry.id || entry.title || ''), payload: entry, expires_at: entry.expiresAt }); } catch {}
        }
        if (replyKey && quotedEntry) {
          try { this.db.saveConversationContext({ context_key: `quoted:${replyKey}`, reply_key: replyKey, subject_type: quotedEntry.kind || 'subject',
            subject_id: String(quotedEntry.id || quotedEntry.title || ''), payload: quotedEntry, expires_at: quotedEntry.expiresAt }); } catch {}
        }
      }
    }
  });
};
