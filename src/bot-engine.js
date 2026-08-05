const {
  formatProfessorFullCard, formatSemesterOverviewCard, formatDisciplineFullCard,
  formatContentResponse, formatDisambiguation, formatHelpResponse,
  formatUnknownMentionResponse, appendFooter, appendSourceMetadata
} = require('./engine/response-renderer');
const { isSemesterOverviewRequest } = require('./semester-overview');
const { Cooldown } = require('./cooldown');
const {
  findAutomaticMessageMatchesDetailed,
  evaluateAutomaticMessagesDetailed,
  detectAmbiguousMatches,
  isHelpCommand
} = require('./matcher');
const { handleCalculator, looksLikeCalculator, commandFor } = require('./calculator');
const { truncate, parseList, normalizeText, containsPhrase } = require('./text');
const { OutboundGuard } = require('./outbound-guard');
const { renderTemplate } = require('./template-renderer');
const { AtomicRuleStore } = require('./rule-snapshot');
const { PerformanceMetrics } = require('./performance-metrics');
const {
  LOCATION_CARD_TITLE,
  classifyProfessorLocationRequest,
  findTeacherMatches: findProfessorDirectoryMatches,
  formatProfessorLocationResponse,
  formatAskProfessorNameResponse,
  formatClassroomResponse,
  formatProfessorDisambiguation
} = require('./professor-location');
const { classifySectorRequest, classifySectorFollowUp, formatSectorResponse } = require('./engine/sector-intent-handler');
const { classifyGuidedFlow, formatFlowMenu } = require('./guided-flows');
const { menuCandidates, formatMenu } = require('./help-menu');
const { progressiveMenuFor } = require('./progressive-menus');
const { semanticQuestionAssessment, implicitQuestionStructure } = require('./semantic-question');
const { classifyBotReaction, addressesBot } = require('./reactions');
const { prepareMessage } = require('./message-analysis');
const { LocalPreferenceStore, preferencesFromSubject, applyLocalPreferences } = require('./engine/local-preferences');
const { resolveGroupActivation } = require('./group-activation');
const { resolveIncomingActivation, applyIncomingActivation } = require('./engine/activation-pipeline');
const { recoveryEvaluation, broadHelpText, categoryCandidates } = require('./recovery/recovery-engine');
const { classifyCommonMessage, choiceNumber, isCancel, isNone, isListDisciplines, isUnknownSubject, canonicalSpeechText } = require('./recovery/language');
const { shouldBlockAttendanceQuestion } = require('./engine/attendance-guard');
const { mergeSlots, formatUnderstanding, buildQueryFromSlots, parseExplicitCorrection, looksLikeNewCompleteRequest, expectedForSlots } = require('./recovery/dialog-state');
const { analyzeUnifiedQuery, mergeQueryState, intentLabels } = require('./engine/query-model');
const { guidedDisciplineCandidates, guidedPrompt } = require('./engine/guided-discipline-search');
const { pruneContextMap } = require('./engine/context-manager');
const { capCandidates } = require('./engine/disambiguation-manager');
const { findDisciplineMatches, findDisciplineCandidates, isDirectDisciplineReference, hasDisciplineInformationIntent, formatDisciplineList } = require('./discipline-directory');
const { requestedProfessorFields, requestedDisciplineFields, professorIntentLabel, formatProfessorFieldResponse, isProfessorPrivatePhoneRequest, formatProfessorPhonePrivacyResponse } = require('./engine/professor-intent-handler');
const {
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
  DEFAULT_TIME_ZONE
} = require('./engine/semester-intent-handler');

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}
function senderNumber(value) { return String(value || '').split('@')[0].replace(/\D/g, ''); }

// Sinais que podem acionar as rotas estruturadas sem depender diretamente de
// um card estático. A lista é deliberadamente acadêmica/institucional: ela não
// responde por si só; apenas permite que a mensagem chegue ao motor completo.
const FAST_GROUP_DOMAIN_PATTERN = /\b(?:sala|salas|bloco|predio|prédio|andar|laboratorio|laboratório|aula|aulas|horario|horário|horarios|horários|semestre|disciplina|disciplinas|materia|matéria|materias|matérias|professor|professora|docente|contato|email|e-mail|telefone|celular|numero|número|whatsapp|zap|caens|cores|capne|biblioteca|psicologia|coordenacao|coordenação|colegiado|dasi|btech|estagio|estágio|tcc|acex|barema|calendario|calendário|final|media|média|suap|ppc|fluxograma|matriz|drive|repositorio|repositório|arquivos|acervo|protocolo|quebra|requisito|requisitos|prerequisito|jubilamento|trancamento|matricula|matrícula|aproveitamento|equivalencia|equivalência|monitoria|bolsa|auxilio|auxílio)\b/u;
const FAST_GROUP_FOLLOWUP_PATTERN = /^(?:[1-9]|e\b|mas\b|entao\b|então\b|e\s+(?:o|a|os|as)?\s*(?:horario|horário|sala|professor|professora|contato|email|e-mail|dia|dias|semestre|local)|só\s+a|so\s+a|a\s+primeira|a\s+segunda)\b/u;
const FAST_GROUP_QUESTION_LEAD_PATTERN = /^(?:qual|quais|como|onde|quem|quando|quanto|quantos|o que|que|tem|pode|posso|preciso|me passa|manda|informe|informar)\b/u;

const installContextHandler = require('./engine/context-handler');
const installCorrectionHandler = require('./engine/correction-handler');
const installAcademicHandler = require('./engine/academic-handler');
const installDisambiguationHandler = require('./engine/disambiguation-handler');
const installLearningHandler = require('./engine/learning-handler');
const installReactionHandler = require('./engine/reaction-handler');
const installFallbackHandler = require('./engine/fallback-handler');
const installCardHandler = require('./engine/card-handler');

class BotEngine {
  constructor(database, options = {}) {
    this.db = database;
    this.cooldown = new Cooldown();
    this.diagnostics = options.diagnostics || null;
    this.groupTouches = new Map();
    this.pendingChoices = new Map();
    this.conversationContexts = new Map();
    this.replyContexts = new Map();
    this.recoveryStates = new Map();
    this.localPreferences = new LocalPreferenceStore({ ttlMs: Number(options.localPreferenceTtlMs || 10 * 60_000) });
    this.outboundGuard = options.outboundGuard || new OutboundGuard();
    this.services = {};
    this.performance = options.performance || new PerformanceMetrics({ maxSamples: 2000 });
    this.metrics = {
      startedAt: new Date().toISOString(), lastMessageAt: '', lastReplyAt: '', totalProcessed: 0,
      totalReplies: 0, lastMatchType: '', lastMatchedItem: '', disambiguations: 0, adminCommands: 0, rateLimitedReplies: 0,
      ruleSnapshotReloads: 0, lastRuleReloadAt: '', reactions: 0
    };
    this.ruleStore = new AtomicRuleStore(database, {
      snapshotPath: options.ruleSnapshotPath || '',
      initialSnapshot: options.initialRuleSnapshot || null,
      onReload: event => {
        this.metrics.ruleSnapshotReloads = Number(this.metrics.ruleSnapshotReloads || 0) + 1;
        this.metrics.lastRuleReloadAt = event.snapshot.createdAt;
      }
    });
    this.metrics.lastRuleReloadAt = this.ruleStore.snapshot.createdAt;
    this.groupTouchIntervalMs = Math.max(30000, Number(options.groupTouchIntervalSeconds || 600) * 1000);
    this.contextCleanupTimer = setInterval(() => this.cleanupExpiredContexts(), 60_000);
    this.contextCleanupTimer.unref?.();
  }

  setServices(services = {}) { this.services = { ...this.services, ...services }; }
  getMetrics() { return { ...this.metrics, pendingDisambiguations: this.pendingChoices.size, conversationContexts: this.conversationContexts.size, replyContexts: this.replyContexts.size, recoveryStates: this.recoveryStates.size, localPreferences: this.localPreferences.size(), outboundGuard: this.outboundGuard.stats(), rules: this.ruleStore.stats(), performance: this.performance.snapshot() }; }
  reloadRules(reason = 'manual') { return this.ruleStore.scheduleReload(reason); }
  close() { clearInterval(this.contextCleanupTimer); this.contextCleanupTimer = null; this.localPreferences.cleanup(Number.MAX_SAFE_INTEGER); this.ruleStore.close(); }





  touchGroup(groupId, name) {
    const now = Date.now(); const lastTouch = this.groupTouches.get(groupId) || 0;
    if (now - lastTouch < this.groupTouchIntervalMs) return;
    if (this.services.writeQueue?.upsertGroup) this.services.writeQueue.upsertGroup(groupId, name);
    else this.db.upsertGroup(groupId, name);
    this.groupTouches.set(groupId, now);
    if (this.groupTouches.size > 500) {
      const cutoff = now - this.groupTouchIntervalMs * 2;
      for (const [id, touchedAt] of this.groupTouches) if (touchedAt < cutoff) this.groupTouches.delete(id);
    }
  }

  featureAllowed(context, feature, settings) {
    if (!context.isGroup || context.ignorePermissions) return true;
    return this.db.isFeatureAllowed(context.groupId, feature, settings.group_mode || 'all');
  }
















  buildMessageSnapshot(prepared, context = {}, settings = null) {
    const resolvedSettings = settings || this.db.getSettings();
    const academicPeriod = String(resolvedSettings.current_academic_period || '2026.2');
    const messages = this.activeContent({ includeDrafts: Boolean(context.includeDrafts) }).messages;
    const teachers = this.db.listTeachers({ activeOnly: true, cloneResult: false });
    const sectors = this.db.listSectors({ activeOnly: true, cloneResult: false });
    const calculators = this.db.listCalculators({ enabledOnly: true, cloneResult: false });
    // Catálogo compacto: uma linha por disciplina/professor, sem carregar o
    // quadro semanal inteiro apenas para reconhecer siglas e nomes novos.
    const disciplineDirectory = this.db.listProfessorDisciplineDirectory?.({ academicPeriod, activeOnly: true }) || [];
    const permanentDisciplines = this.db.listAcademicDisciplines?.({ activeOnly: true }) || [];
    const approvedAliases = this.db.listDisciplineAliases?.({ activeOnly: true }) || [];
    const disciplineSources = [
      ...permanentDisciplines.map(item => ({
        discipline_name: item.name, discipline_code: item.code,
        aliases: [...(item.aliases || []), ...(item.speech_aliases || []), ...(item.common_typos || [])]
      })),
      ...disciplineDirectory,
      ...approvedAliases.map(item => ({ discipline_name: item.discipline_name, discipline_code: item.discipline_code, alias: item.alias }))
    ];
    const base = { settings: resolvedSettings, academicPeriod, messages, teachers, sectors, calculators, disciplineDirectory: disciplineSources };
    return this.scopeMessageSnapshot(base, prepared);
  }

  scopeMessageSnapshot(base, prepared) {
    let scheduleEntries = [];
    let calendarEvents = [];
    if (prepared?.targetDate?.matched && prepared?.semester) {
      scheduleEntries = this.db.listProfessorScheduleEntries?.({
        academicPeriod: base.academicPeriod, semester: prepared.semester,
        dayOfWeek: prepared.targetDate.dayIndex, activeOnly: true
      }) || [];
      calendarEvents = this.db.academicCalendarEventsForDate?.(prepared.targetDate.iso, { course: 'bsi', semester: prepared.semester }) || [];
    }
    return Object.freeze({ ...base, scheduleEntries, calendarEvents });
  }
































  diagnosticEnabled(settings = this.db.getSettings()) { return asBool(settings.diagnostic_enabled, true) && Boolean(this.diagnostics); }
  diagnostic(input, settings = this.db.getSettings()) { if (this.diagnosticEnabled(settings)) this.diagnostics.add(input); }
  analysisDetails(evaluation) {
    const details = (evaluation?.analysis || []).map(item => ({
      id: item.id, title: item.title, matched: item.matched, score: item.score, scope: item.scope,
      keywordMatched: Number(item.keywordMatched || 0), keywordTotal: Number(item.keywordTotal || 0), reasons: item.reasons || [], blockedReasons: item.blockedReasons || []
    }));
    if (evaluation?.contextSubject) details.unshift({
      id: `context:${evaluation.contextSubject.kind || 'subject'}:${evaluation.contextSubject.id || 0}`,
      title: `Contexto ativo — ${evaluation.contextSubject.title || evaluation.contextSubject.topic || 'conversa'}`,
      matched: true, score: 0, scope: 'conversation', keywordMatched: 0, keywordTotal: 0,
      reasons: ['contexto curto da mesma conversa usado ou renovado'], blockedReasons: []
    });
    return details;
  }

  ignoredBotNumbers(settings) { return new Set(parseList(String(settings.ignored_bot_numbers || '').replace(/\s+/g, ',' )).map(senderNumber).filter(Boolean)); }
  ignoredPrefixes(settings) { return String(settings.ignored_message_prefixes || '').split(/[\n,;|]+/).map(value => value.trim()).filter(Boolean); }
  cycleBlockReason(message, body, settings) {
    const sender = senderNumber(message.author || message.from);
    if (sender && this.ignoredBotNumbers(settings).has(sender)) return 'mensagem enviada por outro número cadastrado como bot';
    const trimmed = String(body || '').trim();
    const prefix = this.ignoredPrefixes(settings).find(value => trimmed.toLowerCase().startsWith(value.toLowerCase()));
    if (prefix) return `mensagem iniciada pelo marcador de bot “${prefix}”`;
    return '';
  }
  renderEvaluation(evaluation, message, chat) {
    if (!evaluation?.matched || evaluation.type === 'disambiguation') return evaluation;
    const renderOne = item => {
      let text = renderTemplate(item.text, {
        isGroup: Boolean(chat?.isGroup), groupName: chat?.name || '', senderName: message?.senderName || ''
      });
      const source = {
        source_url: item.source_url || '', source_title: item.source_title || '', verified_at: item.verified_at || ''
      };
      if (!item.sourceAlreadyShown && evaluation.type !== 'message_source') text = appendSourceMetadata(text, source);
      return { ...item, text };
    };
    if (Array.isArray(evaluation.responseItems) && evaluation.responseItems.length) {
      const responseItems = evaluation.responseItems.map(renderOne);
      return { ...evaluation, responseItems, text: responseItems[0]?.text || evaluation.text };
    }
    const item = renderOne({
      text: evaluation.text,
      source_url: evaluation.source_url || evaluation.contextSubject?.source_url || '',
      source_title: evaluation.source_title || evaluation.contextSubject?.source_title || '',
      verified_at: evaluation.verified_at || evaluation.contextSubject?.verified_at || '',
      sourceAlreadyShown: evaluation.sourceAlreadyShown
    });
    return { ...evaluation, text: item.text };
  }

  async setSettingsPersisted(values) {
    if (this.services.writeQueue?.callDatabase) {
      try {
        const result = await this.services.writeQueue.callDatabase('setSettings', [values]);
        this.db.refreshExternalChanges?.('settings');
        return result;
      } catch (error) { this.performance.increment('database_writer_fallbacks'); }
    }
    return this.db.setSettings(values);
  }




  adminNumbers(settings) { return new Set(parseList(String(settings.admin_numbers || '').replace(/\s+/g, ',' )).map(senderNumber).filter(Boolean)); }
  isAdmin(message, settings) { const candidate = senderNumber(message.author || message.from); return candidate && this.adminNumbers(settings).has(candidate); }
  isAdminCommand(body) { return /^!(?:bot\s+)?(?:ajuda|help|status|pausar|pause|continuar|retomar|resume|backup|reiniciar|restart)\b/iu.test(String(body || '').trim()); }
  async handleAdminCommand(message, body, chat, settings) {
    if (!this.isAdminCommand(body) || !this.isAdmin(message, settings)) return false;
    const command = normalizeText(body).replace(/^!bot\s+/, '').replace(/^!/, '').trim();
    let response = '';
    if (['ajuda', 'help'].includes(command)) {
      response = ['🔐 *Comandos administrativos*', '', '• bot !status', '• bot !pausar', '• bot !continuar', '• bot !backup', '• bot !reiniciar'].join('\n');
    } else if (command === 'status') {
      const state = this.services.whatsapp?.getStatus?.() || {};
      response = [`🔐 *Status do HUB Bot*`, '', `WhatsApp: *${state.state || 'desconhecido'}*`, `Automação: *${asBool(settings.bot_paused, false) ? 'pausada' : 'ativa'}*`, `Respostas desde o início: ${this.metrics.totalReplies}`, `Pendências de escolha: ${this.pendingChoices.size}`].join('\n');
    } else if (['pausar', 'pause'].includes(command)) {
      await this.setSettingsPersisted({ bot_paused: 'true' }); response = '⏸️ Automação pausada. Somente comandos administrativos continuarão ativos.';
    } else if (['continuar', 'retomar', 'resume'].includes(command)) {
      await this.setSettingsPersisted({ bot_paused: 'false' }); response = '▶️ Automação retomada.';
    } else if (command === 'backup') {
      if (!this.services.backupManager) response = 'Não foi possível acessar o gerenciador de backups.';
      else { await this.services.backupManager.run('whatsapp-admin'); response = '✅ Backup local criado.'; }
    } else if (['reiniciar', 'restart'].includes(command)) {
      response = '🔄 Reiniciando a conexão do WhatsApp.';
      setTimeout(() => this.services.whatsapp?.restart?.().catch(console.error), 800).unref?.();
    } else return false;
    await message.reply(response);
    this.metrics.adminCommands += 1;
    return true;
  }

  async reply(message, evaluation, chat, originalBody) {
    const settings = evaluation.context?.snapshot?.settings || this.db.getSettings();
    const seconds = Number(settings.cooldown_seconds || 20);
    const cooldownKey = this.conversationKey(message);
    if (evaluation.type !== 'private_unknown' && seconds > 0 && this.cooldown.isActive(cooldownKey, evaluation.type, evaluation.signature, seconds)) {
      evaluation.replyBlockedReason = 'antirrepetição';
      return false;
    }
    const sender = message.author || message.from;
    const guard = this.outboundGuard.check(sender, settings);
    if (!guard.allowed) {
      this.outboundGuard.reject(); this.metrics.rateLimitedReplies += 1;
      evaluation.replyBlockedReason = guard.reason; return false;
    }
    this.outboundGuard.record(sender);
    const quote = asBool(settings.quote_replies, true);
    const items = Array.isArray(evaluation.responseItems) && evaluation.responseItems.length
      ? evaluation.responseItems
      : [{ text: evaluation.text, attachment: evaluation.attachment || null }];
    const sentResults = [];
    const finishSend = this.performance.timer('reply_send_ms');
    for (const item of items) {
      const attachmentPath = item.attachment ? await this.services.attachments?.resolve?.(item.attachment) : null;
      if (item.attachment && !attachmentPath) evaluation.attachmentMissing = true;
      const response = { text: item.text, attachment: item.attachment || null, attachmentPath };
      let sendResult;
      if (evaluation.privateDelivery && chat?.isGroup && typeof message.sendPrivateResponse === 'function') {
        sendResult = await message.sendPrivateResponse(response);
      } else if (message.sendResponse) sendResult = await message.sendResponse(response, quote);
      else if (quote || !chat?.sendMessage) sendResult = await message.reply(item.text);
      else sendResult = await chat.sendMessage(item.text);
      sentResults.push(sendResult);
      if (sendResult?.attachmentError) evaluation.attachmentSendError = String(sendResult.attachmentError);
    }
    finishSend();
    if (evaluation.type !== 'private_unknown' && seconds > 0) this.cooldown.touch(cooldownKey, evaluation.type, evaluation.signature, seconds);
    this.metrics.lastReplyAt = new Date().toISOString();
    this.metrics.totalReplies += items.length;
    this.metrics.lastMatchType = evaluation.type; this.metrics.lastMatchedItem = evaluation.matchedItem;

    if (evaluation.type !== 'disambiguation') {
      if (this.services.writeQueue?.recordUsage) this.services.writeQueue.recordUsage(evaluation.topic || evaluation.matchedItem || 'Outros', evaluation.type);
      else this.db.recordUsage(evaluation.topic || evaluation.matchedItem || 'Outros', evaluation.type, asBool(settings.usage_statistics_enabled, true));
    }
    this.rememberConversationContext(message, evaluation, settings, sentResults[0]);

    if (asBool(settings.log_matched_messages, true)) {
      const logEntry = {
        chatId: chat.id?._serialized || message.from, chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'),
        message: evaluation.redactLog ? '[conteúdo não armazenado]' : truncate(originalBody, 220), matchType: evaluation.type,
        matchedItem: truncate(evaluation.matchedItem, 160), reply: evaluation.redactLog ? '[resposta não armazenada]' : truncate(items.map(item => item.text).join(' | '), 260)
      };
      if (this.services.writeQueue?.addLog) this.services.writeQueue.addLog(logEntry);
      else this.db.addLog(logEntry);
    }
    return true;
  }

  async handle(message) {
    if (!message || message.fromMe || message.from === 'status@broadcast') return;
    const finishHandle = this.performance.timer('message_handle_ms');
    try {
    const groupLike = Boolean(message.isGroup || String(message.from || '').endsWith('@g.us'));
    if (!message.activationResolved) {
      const activation = resolveIncomingActivation(message, { engine: this });
      if (groupLike && !activation.active) {
        this.performance.increment?.('group_messages_without_activation_skipped');
        return;
      }
      applyIncomingActivation(message, activation);
    }
    const body = String(message.body || '').trim(); if (!body) return;
    this.metrics.lastMessageAt = new Date().toISOString(); this.metrics.totalProcessed += 1;
    const chat = await message.getChat(); const groupId = chat.isGroup ? (chat.id?._serialized || message.from) : '';
    if (chat.isGroup) this.touchGroup(groupId, chat.name || 'Grupo sem nome');

    let settings = this.db.getSettings();
    const diagnosticBase = { chatType: chat.isGroup ? 'group' : 'private', chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'), message: body };
    if (this.isAdminCommand(body) && !this.isAdmin(message, settings)) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: 'Comando administrativo ignorado para remetente não autorizado.', ...diagnosticBase }, settings);
      return;
    }
    if (await this.handleAdminCommand(message, body, chat, settings)) {
      this.diagnostic({ type: 'admin', outcome: 'responded', matchedItem: 'Comando administrativo', summary: 'Comando administrativo autorizado e executado.', ...diagnosticBase }, settings);
      return;
    }
    const cycleReason = this.cycleBlockReason(message, body, settings);
    if (cycleReason) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: `Proteção contra ciclo: ${cycleReason}.`, ...diagnosticBase }, settings);
      return;
    }
    if (asBool(settings.bot_paused, false)) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: 'Bot pausado nas configurações.', ...diagnosticBase }, settings);
      return;
    }
    if (await this.handleFalsePositiveFeedback(message, body, chat, settings)) return;
    if (await this.handleContextualReaction(message, body, chat, settings)) return;

    if (!chat.isGroup) {
      try { this.db.touchPrivateUserProfile?.(this.conversationKey(message), { welcome: false }); } catch {}
    }
    const common = this.commonMessageEvaluation(message, body, settings, chat);
    if (common) {
      if (!common.matched) {
        this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: common.reasons?.join('; ') || 'Conversa comum.', ...diagnosticBase }, settings);
        return;
      }
      const renderedCommon = this.renderEvaluation(common, message, chat);
      const sentCommon = await this.reply(message, renderedCommon, chat, body);
      this.diagnostic({ type: sentCommon ? 'response' : 'cooldown', outcome: sentCommon ? 'responded' : 'ignored', matchedItem: common.matchedItem,
        reply: sentCommon ? common.text : '', summary: 'Mensagem social tratada sem abrir menu.', ...diagnosticBase }, settings);
      return;
    }

    const baseContext = {
      isGroup: Boolean(chat.isGroup), groupId, now: message.timestampMs || Date.now(),
      hasReply: Boolean(message.quotedFromMe), mentionedMe: Boolean(message.mentionedMe), groupActivated: Boolean(message.groupActivated)
    };
    const baseSnapshot = this.buildMessageSnapshot(null, baseContext, settings);
    let prepared = prepareMessage(body, {
      now: baseContext.now, teachers: baseSnapshot.teachers,
      scheduleEntries: baseSnapshot.disciplineDirectory,
      isGroup: baseContext.isGroup, hasReply: baseContext.hasReply,
      mentionedMe: baseContext.mentionedMe
    });
    let recentPreferences = null;
    for (const key of this.conversationKeys(message)) { recentPreferences = this.localPreferences.get(key); if (recentPreferences) break; }
    if (recentPreferences) {
      prepared = applyLocalPreferences(prepared, recentPreferences, body);
      if (prepared.localPreferencesApplied && !prepared.disciplineMatches?.length && recentPreferences.discipline) {
        const disciplineMatches = findDisciplineMatches(String(recentPreferences.discipline), baseSnapshot.disciplineDirectory, { allowShortStandalone: true });
        if (disciplineMatches.length) prepared = { ...prepared, disciplineMatches: Object.freeze(disciplineMatches) };
      }
      if (prepared.localPreferencesApplied && !prepared.professorMatches?.length && recentPreferences.professor) {
        const professorMatches = findProfessorDirectoryMatches(normalizeText(String(recentPreferences.professor)), baseSnapshot.teachers)
          .filter(match => match?.teacher && match.fuzzy !== true);
        if (professorMatches.length) prepared = { ...prepared, professorMatches: Object.freeze(professorMatches) };
      }
    }
    const snapshot = this.scopeMessageSnapshot(baseSnapshot, prepared);
    const evaluationContext = { ...baseContext, prepared, snapshot, settings };

    const pending = this.pendingEvaluation(message, body, settings);
    const chosen = pending ? this.renderEvaluation(pending, message, chat) : null;
    if (chosen) {
      this.rememberPendingChoice(message, chosen, settings);
      const sent = await this.reply(message, chosen, chat, body);
      if (sent) this.rememberConversationContext(message, chosen, settings, sent);
      this.diagnostic({ type: sent ? 'response' : 'cooldown', outcome: sent ? 'responded' : 'ignored', matchedItem: chosen.matchedItem, intent: chosen.detectedIntent || '', reply: sent ? chosen.text : '', summary: sent ? 'Escolha de desambiguação respondida.' : `Resposta bloqueada: ${chosen.replyBlockedReason || 'antirrepetição'}.`, ...diagnosticBase }, settings);
      return;
    }

    const ignoredAttendanceConfirmation = prepared.intent === 'professor-attendance-confirmation'
      ? this.professorAttendanceIgnoredEvaluation(body, evaluationContext) : null;
    const ignoredScheduleStatusConfirmation = ['schedule-status-confirmation', 'schedule-narrative'].includes(prepared.intent)
      ? this.scheduleStatusConfirmationIgnoredEvaluation(body, evaluationContext) : null;
    let evaluation = ignoredAttendanceConfirmation
      || ignoredScheduleStatusConfirmation
      || this.contextualFollowUpEvaluation(message, body, settings)
      || this.evaluate(body, evaluationContext);
    if (!evaluation.matched && !evaluation.suppressPrivateFallback && !evaluation.blockedBy) {
      const recovered = this.recoveryEvaluationFor(message, body, evaluationContext, settings);
      if (recovered) evaluation = recovered;
    }
    if (!evaluation.matched) this.recordUnrecognizedSuggestion(body, evaluation, chat);
    if (!evaluation.matched && !this.isAdminCommand(body) && this.botMentioned(message, body, settings) && this.featureAllowed({ isGroup: Boolean(chat.isGroup), groupId }, 'help', settings)) {
      evaluation = this.unknownMentionEvaluation(settings);
    }
    if (!evaluation.matched && !chat.isGroup && !evaluation.suppressPrivateFallback) evaluation = this.privateUnknownEvaluation(settings);
    if (evaluation.matched && !evaluation.recoveryMetadata && !String(evaluation.type || '').startsWith('recovery_') && evaluation.type !== 'disambiguation') this.learnFromRecoveryResolution(message, evaluation);
    if (!evaluation.matched) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', matchedItem: '', intent: evaluation.detectedIntent || prepared.intent || '', summary: evaluation.blockedBy || evaluation.reasons.join('; ') || 'Nenhuma regra correspondeu.', details: this.analysisDetails(evaluation), ...diagnosticBase }, settings);
      return;
    }
    evaluation = this.renderEvaluation(evaluation, message, chat);
    this.rememberPendingChoice(message, evaluation, settings);
    try {
      const sent = await this.reply(message, evaluation, chat, body);
      this.diagnostic({
        type: sent ? 'response' : 'cooldown', outcome: sent ? 'responded' : 'ignored', matchedItem: evaluation.matchedItem, intent: evaluation.detectedIntent || prepared.intent || '',
        reply: sent ? evaluation.text : '', summary: sent ? `Resposta enviada por “${evaluation.matchedItem}”.${evaluation.attachmentMissing ? ' O arquivo do anexo não foi encontrado; somente o texto foi enviado.' : evaluation.attachmentSendError ? ` O texto foi enviado, mas o anexo falhou: ${evaluation.attachmentSendError}` : ''}` : `Resposta bloqueada: ${evaluation.replyBlockedReason || 'antirrepetição'}.`,
        details: this.analysisDetails(evaluation), rateLimited: Boolean(!sent && evaluation.replyBlockedReason && evaluation.replyBlockedReason !== 'antirrepetição'), ...diagnosticBase
      }, settings);
    } catch (error) {
      this.diagnostic({ type: 'error', outcome: 'error', matchedItem: evaluation.matchedItem, intent: evaluation.detectedIntent || prepared.intent || '', summary: `Falha ao enviar: ${error.message}`, details: this.analysisDetails(evaluation), ...diagnosticBase }, settings);
      throw error;
    }
    } finally { finishHandle(); }
  }
}

const handlerDependencies = {
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
};
installContextHandler(BotEngine, handlerDependencies);
installCorrectionHandler(BotEngine, handlerDependencies);
installAcademicHandler(BotEngine, handlerDependencies);
installDisambiguationHandler(BotEngine, handlerDependencies);
installLearningHandler(BotEngine, handlerDependencies);
installReactionHandler(BotEngine, handlerDependencies);
installFallbackHandler(BotEngine, handlerDependencies);
installCardHandler(BotEngine, handlerDependencies);

module.exports = { BotEngine, asBool, senderNumber };
