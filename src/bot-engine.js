const { Cooldown } = require('./cooldown');
const {
  findAutomaticMessageMatchesDetailed,
  evaluateAutomaticMessagesDetailed,
  detectAmbiguousMatches,
  isHelpCommand
} = require('./matcher');
const { handleCalculator, looksLikeCalculator, commandFor } = require('./calculator');
const {
  formatContentResponse,
  formatDisambiguation,
  formatHelpResponse,
  formatUnknownMentionResponse,
  appendFooter,
  appendSourceMetadata
} = require('./responses');
const { truncate, parseList, normalizeText, containsPhrase } = require('./text');
const { OutboundGuard } = require('./outbound-guard');
const { renderTemplate } = require('./template-renderer');
const { AtomicRuleStore } = require('./rule-snapshot');
const { PerformanceMetrics } = require('./performance-metrics');
const {
  LOCATION_CARD_TITLE,
  classifyProfessorLocationRequest,
  formatProfessorLocationResponse,
  formatAskProfessorNameResponse,
  formatClassroomResponse,
  formatProfessorDisambiguation
} = require('./professor-location');
const { classifySectorRequest, classifySectorFollowUp, formatSectorResponse } = require('./sector-directory');
const { classifyGuidedFlow, formatFlowMenu } = require('./guided-flows');
const { menuCandidates, formatMenu } = require('./help-menu');
const { progressiveMenuFor } = require('./progressive-menus');
const { semanticQuestionAssessment, implicitQuestionStructure } = require('./semantic-question');
const { classifyBotReaction } = require('./reactions');
const {
  SEMESTER_SCHEDULE_CARD_TITLE,
  classifySemesterScheduleRequest,
  formatSemesterScheduleResponse,
  formatSemesterSchedulePrompt,
  semesterFromFollowUp
} = require('./semester-schedule');

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}
function senderNumber(value) { return String(value || '').split('@')[0].replace(/\D/g, ''); }

class BotEngine {
  constructor(database, options = {}) {
    this.db = database;
    this.cooldown = new Cooldown();
    this.diagnostics = options.diagnostics || null;
    this.groupTouches = new Map();
    this.pendingChoices = new Map();
    this.conversationContexts = new Map();
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
  }

  setServices(services = {}) { this.services = { ...this.services, ...services }; }
  getMetrics() { return { ...this.metrics, pendingDisambiguations: this.pendingChoices.size, conversationContexts: this.conversationContexts.size, outboundGuard: this.outboundGuard.stats(), rules: this.ruleStore.stats(), performance: this.performance.snapshot() }; }
  reloadRules(reason = 'manual') { return this.ruleStore.scheduleReload(reason); }
  close() { this.ruleStore.close(); }

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


  botMentioned(message) {
    // Ajuda por menção só deve ser ativada por uma menção real do WhatsApp.
    // Palavras comuns como “bot” não são suficientes.
    return Boolean(message?.mentionedMe);
  }

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
  }

  privateUnknownEvaluation(settings) {
    return {
      matched: true, type: 'private_unknown', text: formatUnknownMentionResponse(settings),
      signature: 'private-unknown', matchedItem: 'Ajuda automática no privado', topic: 'Ajuda',
      reasons: ['mensagem privada sem comando ou gatilho reconhecido'], candidates: [], conflict: false, redactLog: false, analysis: []
    };
  }

  activeContent({ includeDrafts = false } = {}) {
    let messages = this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false });
    if (includeDrafts) {
      messages = this.db.listAutomaticMessages().map(item => {
        const effective = item.draft || item;
        return { ...item, ...effective, id: item.id, active: Boolean(effective.active), published: true, simulationDraft: Boolean(item.draft) };
      }).filter(item => item.active && item.response_text);
    }
    return { messages };
  }

  professorLocationEvaluation(text, context, settings) {
    const { messages } = this.activeContent({ includeDrafts: Boolean(context.includeDrafts) });
    const enabled = messages.some(item => normalizeText(item.title) === normalizeText(LOCATION_CARD_TITLE));
    if (!enabled) return null;
    const teachers = this.db.listTeachers({ activeOnly: true });
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
      return {
        ...base, type: 'disambiguation', text: formatProfessorDisambiguation(matches, timeout),
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
  }

  semesterScheduleEnabled({ includeDrafts = false } = {}) {
    return this.activeContent({ includeDrafts }).messages
      .some(item => normalizeText(item.title) === normalizeText(SEMESTER_SCHEDULE_CARD_TITLE));
  }

  semesterScheduleEvaluation(text, context = {}) {
    if (!this.semesterScheduleEnabled({ includeDrafts: Boolean(context.includeDrafts) })) return null;
    const request = classifySemesterScheduleRequest(text, { now: context.now || Date.now() });
    if (!request) return null;
    const base = {
      matched: true, candidates: [], conflict: false, redactLog: false,
      topic: 'Horários de BSI', analysis: [], reasons: ['consulta de aulas por semestre e dia'],
      context: { ...context }, attachment: null
    };
    if (request.kind === 'ask-semester') {
      return {
        ...base,
        type: 'semester_schedule_prompt',
        text: formatSemesterSchedulePrompt(request.dayIndex),
        signature: `semester-schedule-prompt:${request.iso}`,
        matchedItem: SEMESTER_SCHEDULE_CARD_TITLE,
        contextSubject: {
          kind: 'semester_schedule_prompt',
          title: SEMESTER_SCHEDULE_CARD_TITLE,
          targetDate: request.iso,
          dayIndex: request.dayIndex
        }
      };
    }
    return {
      ...base,
      type: 'semester_schedule',
      text: request.text,
      signature: `semester-schedule:${request.iso}:${request.semester}`,
      matchedItem: `${SEMESTER_SCHEDULE_CARD_TITLE} — ${request.semester}º semestre`
    };
  }

  sectorEvaluation(text, context, settings) {
    const sectors = this.db.listSectors({ activeOnly: true });
    const classified = classifySectorRequest(text, sectors);
    if (!classified.matched || !classified.sector) return null;
    const sector = classified.sector; const intent = classified.intent || 'contact';
    // A Coordenação de BSI possui um card de contato completo com o nome do
    // coordenador. Para essa intenção específica, o card tem precedência sobre
    // a resposta resumida do diretório estruturado.
    if (normalizeText(sector.acronym || '') === 'csi' && intent === 'contact') {
      const normalizedRequest = normalizeText(text);
      const asksCoordinationOffice = /\b(?:coordenacao|csi)\b/u.test(normalizedRequest)
        && !/\bcoordenador(?:a)?\b/u.test(normalizedRequest);
      const hasCoordinationCard = this.activeContent({ includeDrafts: Boolean(context.includeDrafts) }).messages
        .some(item => normalizeText(item.title) === normalizeText('BSI — Contato da coordenação'));
      if (asksCoordinationOffice && hasCoordinationCard) return null;
    }
    if (/\?\s*$/.test(String(text || '')) || implicitQuestionStructure(text)) {
      const intentLabel = intent === 'location' ? 'onde fica' : intent === 'services' ? 'o que resolve' : intent === 'source' ? 'qual a fonte' : 'contato';
      const semantic = semanticQuestionAssessment(text, [`${intentLabel} ${sector.acronym || sector.name}`, sector.name, sector.acronym || '']);
      if (!semantic.allowed) return null;
    }
    return {
      matched: true, type: 'sector', text: formatSectorResponse(sector, intent), signature: `sector:${sector.id}:${intent}`,
      matchedItem: `${sector.acronym || sector.name} — ${intent}`, topic: 'Setores do IFBA', attachment: null,
      source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '',
      sourceAlreadyShown: intent === 'source',
      reasons: ['consulta estruturada ao cadastro de setores'], candidates: [], conflict: false, redactLog: false,
      context: { ...context }, analysis: [], contextSubject: { kind: 'sector', id: Number(sector.id), title: sector.name,
        source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '' }
    };
  }
  guidedFlowEvaluation(text, context, settings) {
    const flow = classifyGuidedFlow(text);
    if (!flow) return null;
    const messages = this.db.listAutomaticMessages({ activeOnly: true });
    const byTitle = new Map(messages.map(item => [normalizeText(item.title), item]));
    const candidates = flow.options.map(([label, title]) => {
      const item = byTitle.get(normalizeText(title));
      if (!item) return null;
      return { kind: 'message', item: { ...item, topic: item.topic || item.title }, score: 100, reasons: [`opção do roteiro ${flow.key}`], label,
        contextSubject: { kind: 'message', id: Number(item.id), title: item.title, topic: item.topic || item.title,
          details_text: item.details_text || '', source_url: item.source_url || '', source_title: item.source_title || '', verified_at: item.verified_at || '' } };
    }).filter(Boolean).slice(0, 5);
    if (!candidates.length) return null;
    const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
    return {
      matched: true, type: 'disambiguation', text: formatFlowMenu({ ...flow, options: candidates.map(candidate => [candidate.label, candidate.item.title]) }, timeout),
      signature: `flow:${flow.key}`, matchedItem: `Roteiro — ${flow.title}`, topic: flow.title, attachment: null,
      reasons: ['roteiro orientado solicitado'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
      conflict: true, redactLog: false, context: { ...context }, analysis: [], pendingCandidates: candidates
    };
  }

  menuEvaluation(menuKey, context, settings) {
    const messages = this.db.listAutomaticMessages({ activeOnly: true });
    const candidates = menuCandidates(menuKey, messages);
    if (!candidates.length) return null;
    const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
    return {
      matched: true, type: 'disambiguation', text: formatMenu(menuKey, candidates, timeout),
      signature: `menu:${menuKey}`, matchedItem: `Menu — ${menuKey}`, topic: 'Ajuda', attachment: null,
      reasons: ['menu contextual solicitado'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
      conflict: true, redactLog: false, context: { ...context }, analysis: [], pendingCandidates: candidates
    };
  }

  progressiveMenuEvaluation(evaluation, item, settings) {
    const menuKey = progressiveMenuFor(item?.title || evaluation?.matchedItem || '');
    if (!menuKey) return evaluation;
    const candidates = menuCandidates(menuKey, this.db.listAutomaticMessages({ activeOnly: true }));
    if (!candidates.length) return evaluation;
    const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
    const menuText = formatMenu(menuKey, candidates, timeout);
    return { ...evaluation, text: `${String(evaluation.text || '').trim()}

${menuText}`.trim(), pendingCandidates: candidates };
  }

  rememberPendingChoice(message, evaluation, settings) {
    if (!evaluation?.pendingCandidates?.length) return;
    const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
    this.pendingChoices.set(this.conversationKey(message), { candidates: evaluation.pendingCandidates, expiresAt: Date.now() + timeout * 1000 });
    if (evaluation.type === 'disambiguation') this.metrics.disambiguations += 1;
  }

  evaluate(body, context = {}) {
    const text = String(body || '').trim();
    const settings = this.db.getSettings();
    const result = {
      matched: false, type: 'none', text: '', signature: '', matchedItem: '', redactLog: false,
      reasons: [], candidates: [], conflict: false, blockedBy: '', topic: '', context: { ...context }, analysis: []
    };
    if (!text) return result;

    if (isHelpCommand(text)) {
      if (!this.featureAllowed(context, 'help', settings)) return { ...result, blockedBy: 'group-help-disabled', reasons: ['ajuda desativada neste grupo'] };
      return this.menuEvaluation('root', context, settings)
        || { ...result, matched: true, type: 'help', text: formatHelpResponse(settings, this.db.listCalculators()), signature: 'help', matchedItem: 'Ajuda', topic: 'Ajuda', reasons: ['comando de ajuda reconhecido'] };
    }

    const calculators = this.db.listCalculators({ enabledOnly: true });
    const explicitCalculatorCommand = Boolean(commandFor(text, calculators));
    const numericCalculatorRequest = looksLikeCalculator(text, calculators) && /\d/.test(String(text || ''));
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

    const semesterSchedule = this.semesterScheduleEvaluation(text, context);
    if (semesterSchedule) return { ...result, ...semesterSchedule };

    const sector = this.sectorEvaluation(text, context, settings);
    if (sector) return { ...result, ...sector };

    const guidedFlow = this.guidedFlowEvaluation(text, context, settings);
    if (guidedFlow) return { ...result, ...guidedFlow };

    const professorLocation = this.professorLocationEvaluation(text, context, settings);
    if (professorLocation) return { ...result, ...professorLocation };

    let analysis;
    const finishTriggerEvaluation = this.performance.timer('trigger_evaluation_ms');
    if (context.includeDrafts) {
      const { messages } = this.activeContent({ includeDrafts: true });
      const synonymGroups = this.db.listSynonymGroups({ activeOnly: true });
      analysis = evaluateAutomaticMessagesDetailed(text, messages, synonymGroups, { isGroup: Boolean(context.isGroup) });
    } else {
      // O snapshot foi totalmente compilado antes de se tornar visível. A
      // mensagem atual usa uma única referência imutável, mesmo que o
      // administrador salve outra regra durante esta avaliação.
      analysis = this.ruleStore.evaluate(text, { isGroup: Boolean(context.isGroup), ambiguityThreshold: Math.max(0, Number(settings.disambiguation_threshold || 1)) });
    }
    finishTriggerEvaluation();
    const candidateStats = analysis.candidateStats || { candidates: analysis.length, total: analysis.length, skipped: 0 };
    this.performance.observe('trigger_candidates', candidateStats.candidates);
    const candidates = analysis.filter(item => item.matched)
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
      return {
        ...result, matched: true, type: 'disambiguation', text: formatDisambiguation(candidates, timeout, ''),
        signature: candidates.slice(0, 3).map(candidate => `message:${candidate.item.id}`).join('|'),
        matchedItem: candidates.slice(0, 3).map(candidate => candidate.item.title).join(', '), topic: 'Desambiguação',
        reasons: candidates.slice(0, 3).flatMap(candidate => candidate.reasons), candidates: candidatePayload, conflict: true,
        pendingCandidates: candidates.slice(0, 3)
      };
    }

    const selected = candidates[0];
    const selectedEvaluation = {
      ...result, matched: true, type: 'message', text: selected.responsePlan?.text ?? selected.item.response_text,
      signature: `message:${selected.item.id}`, matchedItem: selected.item.title,
      topic: selected.item.topic || selected.item.title, attachment: selected.item.attachment || null,
      details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '',
      contextSubject: { kind: 'message', id: Number(selected.item.id || 0), title: selected.item.title, topic: selected.item.topic || selected.item.title,
        details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '' },
      reasons: selected.reasons, candidates: candidatePayload, conflict, analysis: result.analysis
    };
    return this.progressiveMenuEvaluation(selectedEvaluation, selected.item, settings);
  }

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

  conversationKey(message) { return `${message.from || ''}|${message.author || message.from || ''}`; }
  cleanConversationContexts() {
    const now = Date.now();
    for (const [key, context] of this.conversationContexts) if (Number(context.expiresAt || 0) <= now) this.conversationContexts.delete(key);
    if (this.conversationContexts.size > 500) {
      const ordered = [...this.conversationContexts.entries()].sort((a, b) => Number(a[1].expiresAt || 0) - Number(b[1].expiresAt || 0));
      for (const [key] of ordered.slice(0, this.conversationContexts.size - 500)) this.conversationContexts.delete(key);
    }
  }
  rememberConversationContext(message, evaluation, settings = this.db.getSettings()) {
    if (!evaluation?.matched || evaluation.type === 'disambiguation') return;
    const subject = evaluation.contextSubject;
    if (!subject || typeof subject !== 'object') return;
    const ttlSeconds = Math.max(60, Math.min(900, Number(settings.contextual_followup_seconds || 300)));
    this.cleanConversationContexts();
    this.conversationContexts.set(this.conversationKey(message), { ...subject, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  contextualFollowUpEvaluation(message, body, settings) {
    this.cleanConversationContexts();
    const stored = this.conversationContexts.get(this.conversationKey(message));
    if (!stored) return null;
    const raw = String(body || '').trim();
    const normalized = normalizeText(raw.replace(/[?]+\s*$/, '')).replace(/^(?:e|mas|entao|então)\s+/, '').trim();
    const hasQuestion = /\?\s*$/.test(raw);
    if (stored.kind === 'semester_schedule_prompt') {
      const semester = semesterFromFollowUp(raw);
      if (!semester) return null;
      const dayIndex = Number(stored.dayIndex);
      if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
      return {
        matched: true,
        type: 'semester_schedule',
        text: formatSemesterScheduleResponse(semester, dayIndex),
        signature: `semester-schedule:${stored.targetDate || 'context'}:${semester}`,
        matchedItem: `${SEMESTER_SCHEDULE_CARD_TITLE} — ${semester}º semestre`,
        topic: 'Horários de BSI', reasons: ['semestre informado como continuação da consulta'],
        candidates: [], conflict: false, redactLog: false, attachment: null
      };
    }
    if (stored.kind === 'sector') {
      if (/^(?:e\s+)?(?:o\s+)?horario(?:\s+de\s+atendimento)?$/u.test(normalized) || /^(?:qual|quais)\s+(?:e|é|sao|são)?\s*o?\s*horario$/u.test(normalized)) {
        const sector = this.db.listSectors({ activeOnly: true }).find(item => Number(item.id) === Number(stored.id));
        if (!sector) return null;
        const schedule = this.db.listAutomaticMessages({ activeOnly: true }).find(item => normalizeText(item.title) === normalizeText('HUB — Quadro de horários 2026.2'));
        const candidates = [
          { kind: 'static', label: `Horário de atendimento da ${sector.acronym || sector.name}`, item: { id: `sector-hours:${sector.id}`, title: `Horário de atendimento — ${sector.acronym || sector.name}`, topic: 'Setores do IFBA', response_text: `🏢 *Horário de atendimento — ${sector.acronym || sector.name}*\n\nNão há um horário de atendimento confirmado no cadastro. Confirme diretamente pelo canal oficial do setor.${sector.email ? `\n\n📧 ${sector.email}` : ''}` }, score: 100, reasons: ['horário de atendimento do setor'] },
          ...(schedule ? [{ kind: 'message', label: 'Horário de uma disciplina ou turma de BSI', item: { ...schedule, topic: schedule.topic || schedule.title }, score: 100, reasons: ['horário acadêmico'] }] : [])
        ];
        return { matched: true, type: 'disambiguation', text: `Você quer saber:\n\n1. Horário de atendimento da ${sector.acronym || sector.name}\n${schedule ? '2. Horário de uma disciplina ou turma de BSI\n' : ''}\nResponda apenas com o número.`, signature: `context-hours:${sector.id}`, matchedItem: `${sector.acronym || sector.name} — horário ambíguo`, topic: 'Contexto', reasons: ['continuação contextual ambígua; confirmação de tema necessária'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })), conflict: true, redactLog: false, pendingCandidates: candidates };
      }
      const intent = classifySectorFollowUp(raw);
      if (!intent) return null;
      const sector = this.db.listSectors({ activeOnly: true }).find(item => Number(item.id) === Number(stored.id));
      if (!sector) return null;
      return {
        matched: true, type: 'sector', text: formatSectorResponse(sector, intent), signature: `sector:${sector.id}:${intent}`,
        matchedItem: `${sector.acronym || sector.name} — ${intent}`, topic: 'Setores do IFBA', reasons: ['continuação contextual curta'],
        candidates: [], conflict: false, redactLog: false, attachment: null,
        source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '',
        sourceAlreadyShown: intent === 'source',
        contextSubject: { kind: 'sector', id: Number(sector.id), title: sector.name,
          source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '' }
      };
    }
    const detailsPhrases = new Set(['mais detalhes','detalhes','explique melhor','quero mais detalhes','pode detalhar']);
    const sourcePhrases = new Set(['fonte','qual a fonte','qual e a fonte','onde foi confirmado','link da fonte','origem da informacao','origem da informação']);
    const directAllowed = detailsPhrases.has(normalized) || sourcePhrases.has(normalized);
    if (!directAllowed && !hasQuestion) return null;
    if (detailsPhrases.has(normalized) && stored.details_text) {
      return { matched: true, type: 'message_details', text: stored.details_text, signature: `details:${stored.id || stored.title}`,
        matchedItem: `${stored.title} — mais detalhes`, topic: stored.topic || stored.title, reasons: ['detalhes do último card'], candidates: [], conflict: false,
        redactLog: false, attachment: null, source_url: stored.source_url || '', source_title: stored.source_title || '', verified_at: stored.verified_at || '', contextSubject: stored };
    }
    if (sourcePhrases.has(normalized)) {
      const lines = ['🔎 *Fonte da informação*'];
      if (stored.source_title) lines.push('', stored.source_title);
      if (stored.source_url) lines.push(stored.source_url);
      if (stored.verified_at) lines.push(`Verificada em: ${stored.verified_at.split('-').reverse().join('/')}`);
      if (!stored.source_url) lines.push('', 'Este card não possui uma fonte cadastrada.');
      return { matched: true, type: 'message_source', text: lines.join('\n'), signature: `source:${stored.id || stored.title}`,
        matchedItem: `${stored.title} — fonte`, topic: stored.topic || stored.title, reasons: ['fonte do último card'], candidates: [], conflict: false,
        redactLog: false, attachment: null, contextSubject: stored };
    }
    return null;
  }
  cleanPendingChoices() {
    const now = Date.now();
    for (const [key, pending] of this.pendingChoices) if (pending.expiresAt <= now) this.pendingChoices.delete(key);
    if (this.pendingChoices.size > 500) {
      const ordered = [...this.pendingChoices.entries()].sort((a, b) => Number(a[1].expiresAt || 0) - Number(b[1].expiresAt || 0));
      for (const [key] of ordered.slice(0, this.pendingChoices.size - 500)) this.pendingChoices.delete(key);
    }
  }
  pendingEvaluation(message, body, settings) {
    this.cleanPendingChoices();
    const key = this.conversationKey(message); const pending = this.pendingChoices.get(key);
    if (!pending || !/^[1-9]$/.test(String(body).trim())) return null;
    const index = Number(String(body).trim()) - 1; const selected = pending.candidates[index];
    if (!selected) return null;
    this.pendingChoices.delete(key);
    if (selected.submenuKey) return this.menuEvaluation(selected.submenuKey, {}, settings);
    const chosen = {
      matched: true, type: selected.kind, text: formatContentResponse(selected),
      signature: `${selected.kind}:${selected.item.id}`, matchedItem: selected.item.title,
      topic: selected.item.topic || selected.item.title, attachment: selected.item.attachment || null,
      details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '',
      contextSubject: selected.contextSubject || { kind: 'message', id: Number(selected.item.id || 0), title: selected.item.title, topic: selected.item.topic || selected.item.title,
        details_text: selected.item.details_text || '', source_url: selected.item.source_url || '', source_title: selected.item.source_title || '', verified_at: selected.item.verified_at || '' },
      reasons: ['opção escolhida após desambiguação'], candidates: [], conflict: false, redactLog: false
    };
    return selected.kind === 'message' ? this.progressiveMenuEvaluation(chosen, selected.item, settings) : chosen;
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
    let text = renderTemplate(evaluation.text, {
      isGroup: Boolean(chat?.isGroup), groupName: chat?.name || '', senderName: message?.senderName || ''
    });
    const source = {
      source_url: evaluation.source_url || evaluation.contextSubject?.source_url || '',
      source_title: evaluation.source_title || evaluation.contextSubject?.source_title || '',
      verified_at: evaluation.verified_at || evaluation.contextSubject?.verified_at || ''
    };
    if (!evaluation.sourceAlreadyShown && evaluation.type !== 'message_source') text = appendSourceMetadata(text, source);
    return { ...evaluation, text };
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

  async handleContextualReaction(message, body, chat, settings) {
    const reaction = classifyBotReaction(message, body, { isPrivate: !chat.isGroup });
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

  adminNumbers(settings) { return new Set(parseList(String(settings.admin_numbers || '').replace(/\s+/g, ',' )).map(senderNumber).filter(Boolean)); }
  isAdmin(message, settings) { const candidate = senderNumber(message.author || message.from); return candidate && this.adminNumbers(settings).has(candidate); }
  isAdminCommand(body) { return normalizeText(body).startsWith('bot ') && String(body).trim().startsWith('!'); }
  async handleAdminCommand(message, body, chat, settings) {
    if (!this.isAdminCommand(body) || !this.isAdmin(message, settings)) return false;
    const command = normalizeText(body).replace(/^bot\s+/, '').trim();
    let response = '';
    if (['ajuda', 'help'].includes(command)) {
      response = ['🔐 *Comandos administrativos*', '', '• !bot status', '• !bot pausar', '• !bot continuar', '• !bot backup', '• !bot reiniciar'].join('\n');
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
    const settings = this.db.getSettings(); const seconds = Number(settings.cooldown_seconds || 20);
    const cooldownKey = this.conversationKey(message);
    if (evaluation.type !== 'private_unknown' && seconds > 0 && this.cooldown.isActive(cooldownKey, evaluation.type, evaluation.signature, seconds)) {
      evaluation.replyBlockedReason = 'antirrepetição';
      return false;
    }
    const sender = message.author || message.from;
    const guard = this.outboundGuard.check(sender, settings);
    if (!guard.allowed) {
      this.outboundGuard.reject();
      this.metrics.rateLimitedReplies += 1;
      evaluation.replyBlockedReason = guard.reason;
      return false;
    }
    this.outboundGuard.record(sender);
    const attachmentPath = evaluation.attachment ? await this.services.attachments?.resolve?.(evaluation.attachment) : null;
    evaluation.attachmentMissing = Boolean(evaluation.attachment && !attachmentPath);
    const response = { text: evaluation.text, attachment: evaluation.attachment || null, attachmentPath };
    const quote = asBool(settings.quote_replies, true);
    let sendResult;
    const finishSend = this.performance.timer('reply_send_ms');
    if (message.sendResponse) sendResult = await message.sendResponse(response, quote);
    else if (quote || !chat?.sendMessage) sendResult = await message.reply(evaluation.text);
    else sendResult = await chat.sendMessage(evaluation.text);
    finishSend();
    if (sendResult?.attachmentError) evaluation.attachmentSendError = String(sendResult.attachmentError);
    if (evaluation.type !== 'private_unknown' && seconds > 0) this.cooldown.touch(cooldownKey, evaluation.type, evaluation.signature, seconds);
    this.metrics.lastReplyAt = new Date().toISOString(); this.metrics.totalReplies += 1; this.metrics.lastMatchType = evaluation.type; this.metrics.lastMatchedItem = evaluation.matchedItem;

    if (evaluation.type !== 'disambiguation') {
      if (this.services.writeQueue?.recordUsage) this.services.writeQueue.recordUsage(evaluation.topic || evaluation.matchedItem || 'Outros', evaluation.type);
      else this.db.recordUsage(evaluation.topic || evaluation.matchedItem || 'Outros', evaluation.type);
    }
    this.rememberConversationContext(message, evaluation, settings);

    if (asBool(settings.log_matched_messages, true)) {
      const logEntry = {
        chatId: chat.id?._serialized || message.from, chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'),
        message: evaluation.redactLog ? '[conteúdo não armazenado]' : truncate(originalBody, 220), matchType: evaluation.type,
        matchedItem: truncate(evaluation.matchedItem, 160), reply: evaluation.redactLog ? '[resposta não armazenada]' : truncate(evaluation.text, 260)
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
    const body = String(message.body || '').trim(); if (!body) return;
    this.metrics.lastMessageAt = new Date().toISOString(); this.metrics.totalProcessed += 1;
    const chat = await message.getChat(); const groupId = chat.isGroup ? (chat.id?._serialized || message.from) : '';
    if (chat.isGroup) this.touchGroup(groupId, chat.name || 'Grupo sem nome');

    let settings = this.db.getSettings();
    const diagnosticBase = { chatType: chat.isGroup ? 'group' : 'private', chatName: chat.name || (chat.isGroup ? 'Grupo' : 'Conversa privada'), message: body };
    if (await this.handleAdminCommand(message, body, chat, settings)) {
      this.diagnostic({ type: 'admin', outcome: 'responded', matchedItem: 'Comando administrativo', summary: 'Comando administrativo autorizado e executado.', ...diagnosticBase }, settings);
      return;
    }
    settings = this.db.getSettings();
    const cycleReason = this.cycleBlockReason(message, body, settings);
    if (cycleReason) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: `Proteção contra ciclo: ${cycleReason}.`, ...diagnosticBase }, settings);
      return;
    }
    if (asBool(settings.bot_paused, false)) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', summary: 'Bot pausado nas configurações.', ...diagnosticBase }, settings);
      return;
    }
    if (await this.handleContextualReaction(message, body, chat, settings)) return;

    const pending = this.pendingEvaluation(message, body, settings);
    const chosen = pending ? this.renderEvaluation(pending, message, chat) : null;
    if (chosen) {
      this.rememberPendingChoice(message, chosen, settings);
      const sent = await this.reply(message, chosen, chat, body);
      this.diagnostic({ type: sent ? 'response' : 'cooldown', outcome: sent ? 'responded' : 'ignored', matchedItem: chosen.matchedItem, reply: sent ? chosen.text : '', summary: sent ? 'Escolha de desambiguação respondida.' : `Resposta bloqueada: ${chosen.replyBlockedReason || 'antirrepetição'}.`, ...diagnosticBase }, settings);
      return;
    }

    let evaluation = this.contextualFollowUpEvaluation(message, body, settings)
      || this.evaluate(body, { isGroup: Boolean(chat.isGroup), groupId, now: message.timestampMs || Date.now() });
    if (!evaluation.matched && !this.isAdminCommand(body) && this.botMentioned(message, body, settings) && this.featureAllowed({ isGroup: Boolean(chat.isGroup), groupId }, 'help', settings)) {
      evaluation = this.unknownMentionEvaluation(settings);
    }
    if (!evaluation.matched && !chat.isGroup) evaluation = this.privateUnknownEvaluation(settings);
    if (!evaluation.matched) {
      this.diagnostic({ type: 'ignored', outcome: 'ignored', matchedItem: '', summary: evaluation.blockedBy || evaluation.reasons.join('; ') || 'Nenhuma regra correspondeu.', details: this.analysisDetails(evaluation), ...diagnosticBase }, settings);
      return;
    }
    evaluation = this.renderEvaluation(evaluation, message, chat);
    this.rememberPendingChoice(message, evaluation, settings);
    try {
      const sent = await this.reply(message, evaluation, chat, body);
      this.diagnostic({
        type: sent ? 'response' : 'cooldown', outcome: sent ? 'responded' : 'ignored', matchedItem: evaluation.matchedItem,
        reply: sent ? evaluation.text : '', summary: sent ? `Resposta enviada por “${evaluation.matchedItem}”.${evaluation.attachmentMissing ? ' O arquivo do anexo não foi encontrado; somente o texto foi enviado.' : evaluation.attachmentSendError ? ` O texto foi enviado, mas o anexo falhou: ${evaluation.attachmentSendError}` : ''}` : `Resposta bloqueada: ${evaluation.replyBlockedReason || 'antirrepetição'}.`,
        details: this.analysisDetails(evaluation), rateLimited: Boolean(!sent && evaluation.replyBlockedReason && evaluation.replyBlockedReason !== 'antirrepetição'), ...diagnosticBase
      }, settings);
    } catch (error) {
      this.diagnostic({ type: 'error', outcome: 'error', matchedItem: evaluation.matchedItem, summary: `Falha ao enviar: ${error.message}`, details: this.analysisDetails(evaluation), ...diagnosticBase }, settings);
      throw error;
    }
    } finally { finishHandle(); }
  }
}

module.exports = { BotEngine, asBool, senderNumber };
