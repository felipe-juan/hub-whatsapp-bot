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
  findTeacherMatches: findProfessorDirectoryMatches,
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
const { prepareMessage, isProfessorAttendanceConfirmation } = require('./message-analysis');
const { findDisciplineMatches, hasDisciplineInformationIntent } = require('./discipline-directory');
const { requestedProfessorFields, professorIntentLabel, formatProfessorFieldResponse } = require('./professor-card-response');
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
    this.replyContexts = new Map();
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
  getMetrics() { return { ...this.metrics, pendingDisambiguations: this.pendingChoices.size, conversationContexts: this.conversationContexts.size, replyContexts: this.replyContexts.size, outboundGuard: this.outboundGuard.stats(), rules: this.ruleStore.stats(), performance: this.performance.snapshot() }; }
  reloadRules(reason = 'manual') { return this.ruleStore.scheduleReload(reason); }
  close() { clearInterval(this.contextCleanupTimer); this.contextCleanupTimer = null; this.ruleStore.close(); }

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
  }

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
  }

  cleanupExpiredContexts(now = Date.now()) {
    for (const [key, context] of this.conversationContexts) if (Number(context.expiresAt || 0) <= now) this.conversationContexts.delete(key);
    for (const [key, context] of this.replyContexts) if (Number(context.expiresAt || 0) <= now) this.replyContexts.delete(key);
    for (const [key, pending] of this.pendingChoices) if (Number(pending.expiresAt || 0) <= now) this.pendingChoices.delete(key);
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
    const base = { settings: resolvedSettings, academicPeriod, messages, teachers, sectors, calculators, disciplineDirectory };
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

  professorAttendanceConfirmation(text, context = {}) {
    const prepared = context.prepared;
    if (prepared?.intent === 'professor-attendance-confirmation') return true;
    const normalized = prepared?.normalized || normalizeText(text);
    if (!normalized) return false;
    const teachers = context.snapshot?.teachers || this.db.listTeachers({ activeOnly: true });
    const exactTeacherMatches = (prepared?.professorMatches || findProfessorDirectoryMatches(normalized, teachers)).filter(match => !match.fuzzy);
    return isProfessorAttendanceConfirmation({ normalized, professorMatches: exactTeacherMatches });
  }

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
  }

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
  }

  professorCardIntent(text, prepared = null) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    const topic = /\b(?:contato|ctt|email|e-mail|dia|dias|horario|horarios|materia|materias|disciplina|disciplinas|sala|salas|laboratorio|lab|aula|aulas|professor|professora|docente|onde|quando|semestre|semestres|informacao|informacoes|dados|tudo|ministra|ministro|leciona|ensina|da)\b/u.test(normalized);
    if (!topic) return false;
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
  }

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
  }

  professorNoClassResponse(prepared, teachers = [], disciplines = []) {
    const target = prepared?.targetDate;
    const when = target?.expression || 'nesse dia';
    const discipline = disciplines[0]?.name || disciplines[0]?.code || '';
    const teacher = teachers[0]?.name || '';
    if (discipline) return `Não há aula cadastrada de *${discipline}* ${when}.`;
    if (teacher) return `Não há aula cadastrada de *${teacher}* ${when}.`;
    return `Não há aula cadastrada ${when}.`;
  }

  professorCardEvaluation(text, context = {}) {
    const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context);
    const prepared = context.prepared || prepareMessage(text, {
      now: context.now || Date.now(), teachers: snapshot.teachers,
      scheduleEntries: snapshot.disciplineDirectory, isGroup: context.isGroup
    });
    if (!this.professorCardIntent(text, prepared)) return null;
    let teacherMatches = [...(prepared.professorMatches || [])];
    const disciplineMatches = prepared.disciplineMatches?.length ? prepared.disciplineMatches : findDisciplineMatches(text, snapshot.disciplineDirectory);
    const sharedCards = [];
    if (disciplineMatches.length) {
      const names = new Set();
      for (const discipline of disciplineMatches) {
        const shared = snapshot.messages.find(item => normalizeText(item.title) === normalizeText(`Disciplina Compartilhada — ${discipline.name}`));
        if (shared?.response_text) sharedCards.push(shared);
        const entries = this.db.listProfessorScheduleEntries?.({ academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name }) || [];
        for (const entry of entries) names.add(normalizeText(entry.professor_name));
        for (const name of discipline.professorNames || []) names.add(normalizeText(name));
      }
      for (const teacher of snapshot.teachers) if (names.has(normalizeText(teacher.name))) teacherMatches.push({ teacher, fuzzy: false, score: 100 });
    }
    const teachers = [...new Map(teacherMatches.map(match => [Number(match.teacher?.id || 0) || normalizeText(match.teacher?.name), match.teacher])).values()].filter(Boolean);
    if (!teachers.length && !sharedCards.length) return null;
    const professorCards = teachers.map(teacher => snapshot.messages.find(item => normalizeText(item.title) === normalizeText(`Professor — ${teacher.name}`)));
    const cards = [...new Map([...sharedCards, ...professorCards]
      .filter(card => card?.response_text)
      .filter(card => !(context.isGroup && (card.scope || 'both') === 'private') && !(!context.isGroup && (card.scope || 'both') === 'group'))
      .map(card => [Number(card.id) || normalizeText(card.title), card])).values()];
    if (!cards.length) return null;

    const requestedFields = requestedProfessorFields(text);
    let structuredEntries = [];
    if (requestedFields.length) {
      if (disciplineMatches.length) {
        for (const discipline of disciplineMatches) structuredEntries.push(...(this.db.listProfessorScheduleEntries?.({
          academicPeriod: snapshot.academicPeriod, activeOnly: true, discipline: discipline.code || discipline.name
        }) || []));
      } else {
        for (const teacher of teachers) structuredEntries.push(...(this.db.listProfessorScheduleEntries?.({
          academicPeriod: snapshot.academicPeriod, activeOnly: true, professor: teacher.name
        }) || []).filter(entry => normalizeText(entry.professor_name) === normalizeText(teacher.name)));
      }
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
          referenceText, teacherNames: teachers.map(item => item.name), disciplineNames: disciplineMatches.map(item => item.name),
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
    if (!compact) responseItems = cards.map(card => ({
      text: card.response_text, attachment: card.attachment || null,
      source_url: card.source_url || '', source_title: card.source_title || '', verified_at: card.verified_at || '',
      matchedItem: card.title, topic: card.topic || card.title
    }));

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
        referenceText, teacherNames: teachers.map(item => item.name), disciplineNames: disciplineMatches.map(item => item.name),
        details_text: first.details_text || '', source_url: first.source_url || '', source_title: first.source_title || '', verified_at: first.verified_at || '' }
    };
  }

  semesterScheduleEnabled({ includeDrafts = false, messages = null } = {}) {
    const source = messages || this.activeContent({ includeDrafts }).messages;
    return source.some(item => normalizeText(item.title) === normalizeText(SEMESTER_SCHEDULE_CARD_TITLE));
  }

  semesterScheduleEvaluation(text, context = {}) {
    const snapshot = context.snapshot || this.buildMessageSnapshot(context.prepared || null, context);
    if (!this.semesterScheduleEnabled({ includeDrafts: Boolean(context.includeDrafts), messages: snapshot.messages })) return null;
    const prepared = context.prepared || prepareMessage(text, { now: context.now || Date.now(), teachers: snapshot.teachers, isGroup: context.isGroup });
    if (['schedule-status-confirmation','schedule-narrative','professor-attendance-confirmation'].includes(prepared.intent)) return null;
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
  }
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
    const timeout = Math.max(30, Math.min(600, Number(settings.disambiguation_timeout_seconds || 120)));
    return {
      matched: true, type: 'disambiguation', text: formatFlowMenu({ ...flow, options: candidates.map(candidate => [candidate.label, candidate.item.title]) }, timeout),
      signature: `flow:${flow.key}`, matchedItem: `Roteiro — ${flow.title}`, topic: flow.title, attachment: null,
      reasons: ['roteiro orientado solicitado'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })),
      conflict: true, redactLog: false, context: { ...context }, analysis: [], pendingCandidates: candidates
    };
  }

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
  }

  progressiveMenuEvaluation(evaluation, item, settings) {
    const menuKey = progressiveMenuFor(item?.title || evaluation?.matchedItem || '');
    if (!menuKey) return evaluation;
    const candidates = menuCandidates(menuKey, evaluation?.context?.snapshot?.messages || this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false }));
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
      reasons: [], candidates: [], conflict: false, blockedBy: '', topic: '', context: { ...context }, analysis: []
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

    // Uma correspondência docente exata ou uma disciplina reconhecida tem
    // prioridade sobre a pergunta genérica por semestre. Correspondências
    // apenas aproximadas ficam depois, evitando confundir “amanhã” com Amanda.
    const strongProfessorReference = Boolean(prepared.disciplineMatches?.length)
      || Boolean(prepared.professorMatches?.some(match => !match.fuzzy));
    if (strongProfessorReference) {
      const professorCard = this.professorCardEvaluation(text, context);
      if (professorCard) return { ...result, ...professorCard };
    }

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
      detectedIntent: /^BSI — Aulas e horários do/iu.test(String(selected.item.title || '')) ? 'horário' : 'informações completas',
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
  }
  conversationKey(message) { return this.conversationKeys(message)[0]; }
  replyContextKey(messageOrChat, messageId = '') {
    const chat = typeof messageOrChat === 'string' ? messageOrChat : String(messageOrChat?.from || '');
    const id = String(messageId || '').trim();
    return id ? `${chat}|${id}` : '';
  }
  outboundMessageId(sendResult) {
    const result = sendResult?.result || sendResult?.textResult || sendResult;
    return String(result?.key?.id || result?.id || '').trim();
  }
  cleanConversationContexts() {
    // A expiração completa é feita pelo temporizador periódico. No caminho
    // quente de cada mensagem, limitamos apenas o tamanho dos mapas.
    if (this.conversationContexts.size > 1500) {
      const ordered = [...this.conversationContexts.entries()].sort((a, b) => Number(a[1].expiresAt || 0) - Number(b[1].expiresAt || 0));
      for (const [key] of ordered.slice(0, this.conversationContexts.size - 1500)) this.conversationContexts.delete(key);
    }
    if (this.replyContexts.size > 1000) {
      const ordered = [...this.replyContexts.entries()].sort((a, b) => Number(a[1].expiresAt || 0) - Number(b[1].expiresAt || 0));
      for (const [key] of ordered.slice(0, this.replyContexts.size - 1000)) this.replyContexts.delete(key);
    }
  }
  forgetConversationContext(message, stored = null) {
    for (const key of this.conversationKeys(message)) {
      if (!stored || this.conversationContexts.get(key) === stored) this.conversationContexts.delete(key);
    }
    if (stored) for (const [key, value] of this.replyContexts) if (value === stored) this.replyContexts.delete(key);
  }
  rememberConversationContext(message, evaluation, settings = this.db.getSettings(), sendResult = null) {
    if (!evaluation?.matched || evaluation.type === 'disambiguation') return;
    const subject = evaluation.contextSubject;
    if (!subject || typeof subject !== 'object') return;
    const ttlSeconds = Math.max(60, Math.min(900, Number(settings.contextual_followup_seconds || 300)));
    this.cleanConversationContexts();
    const entry = {
      ...subject,
      awaitingNextSenderMessage: subject.kind === 'semester_schedule_prompt',
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000
    };
    for (const key of this.conversationKeys(message)) this.conversationContexts.set(key, entry);
    const outboundId = this.outboundMessageId(sendResult);
    const replyKey = this.replyContextKey(message, outboundId);
    if (replyKey) this.replyContexts.set(replyKey, entry);
  }
  contextualFollowUpEvaluation(message, body, settings) {
    this.cleanConversationContexts();
    const quotedKey = this.replyContextKey(message, message?.quotedMessageId);
    let stored = quotedKey ? this.replyContexts.get(quotedKey) : null;
    if (!stored) {
      for (const key of this.conversationKeys(message)) {
        stored = this.conversationContexts.get(key);
        if (stored) break;
      }
    }
    if (!stored) return null;
    if (Number(stored.expiresAt || 0) <= Date.now()) { this.forgetConversationContext(message, stored); return null; }
    const raw = String(body || '').trim();
    const normalized = normalizeText(raw.replace(/[?]+\s*$/, '')).replace(/^(?:e|mas|entao|então)\s+/, '').trim();
    const hasQuestion = /\?\s*$/.test(raw);
    const isGroup = String(message?.from || '').endsWith('@g.us') || Boolean(message?.isGroup);
    if (stored.kind === 'professor_card') {
      const contextualLead = /^(?:e|mas|entao|então)\b/u.test(normalizeText(raw));
      const privateNoReplyAllowed = !isGroup && asBool(settings.private_context_without_reply, true) && contextualLead;
      if (!message.quotedFromMe && !privateNoReplyAllowed) return null;
      const fields = requestedProfessorFields(raw);
      if (!fields.length || !stored.referenceText) return null;
      const contextualQuery = `${raw.replace(/[?]+\s*$/, '').trim()} ${stored.referenceText}?`.trim();
      const evaluation = this.professorCardEvaluation(contextualQuery, {
        isGroup, now: message.timestampMs || Date.now(), settings
      });
      if (!evaluation?.matched) return null;
      return {
        ...evaluation,
        detectedIntent: professorIntentLabel(fields),
        reasons: [...(evaluation.reasons || []), 'continuação contextual sem repetir professor ou disciplina']
      };
    }
    if (stored.kind === 'semester_schedule_prompt') {
      // Este é um passo explícito de diálogo: a próxima mensagem da mesma
      // pessoa deve ser interpretada antes de qualquer outro gatilho, mesmo em
      // grupos e mesmo sem reply. Quando houver reply, o ID da mensagem do bot
      // também recupera o contexto, evitando falhas por alternância PN/LID.
      const semester = semesterFromFollowUp(raw);
      if (!semester) {
        return {
          matched: true,
          type: 'semester_schedule_prompt_invalid',
          text: [
            'Não consegui identificar o semestre.',
            '',
            'Responda apenas com um número entre 1 e 8, como `3`, `5` ou `8`.'
          ].join('\n'),
          signature: `semester-schedule-prompt-invalid:${stored.targetDate || 'context'}`,
          matchedItem: SEMESTER_SCHEDULE_CARD_TITLE,
          topic: 'Horários de BSI', reasons: ['resposta ao pedido de semestre não pôde ser interpretada'],
          candidates: [], conflict: false, redactLog: false, attachment: null,
          contextSubject: { kind: 'semester_schedule_prompt', title: SEMESTER_SCHEDULE_CARD_TITLE,
            targetDate: stored.targetDate || '', dayIndex: Number(stored.dayIndex) }
        };
      }
      const dayIndex = Number(stored.dayIndex);
      if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
      const academicPeriod = String(settings.current_academic_period || '2026.2');
      const scheduleEntries = this.db.listProfessorScheduleEntries?.({ academicPeriod, semester, dayOfWeek: dayIndex, activeOnly: true }) || [];
      const calendarEvents = stored.targetDate ? (this.db.academicCalendarEventsForDate?.(stored.targetDate, { course: 'bsi', semester }) || []) : [];
      const targetDate = stored.targetDate ? new Date(`${stored.targetDate}T12:00:00Z`) : null;
      const target = { dayIndex, iso: stored.targetDate || '', date: targetDate };
      this.forgetConversationContext(message, stored);
      return {
        matched: true,
        type: 'semester_schedule',
        text: formatSemesterScheduleResponse(semester, target, { scheduleEntries, calendarEvents, academicPeriod }),
        signature: `semester-schedule:${stored.targetDate || 'context'}:${semester}`,
        matchedItem: `${SEMESTER_SCHEDULE_CARD_TITLE} — ${semester}º semestre`,
        topic: 'Horários de BSI', reasons: ['semestre informado como continuação da consulta'],
        candidates: [], conflict: false, redactLog: false, attachment: null,
        contextSubject: { kind: 'semester_schedule', title: SEMESTER_SCHEDULE_CARD_TITLE,
          targetDate: stored.targetDate || '', dayIndex, semester }
      };
    }
    if (stored.kind === 'semester_schedule') {
      const contextualLead = /^(?:e|mas|entao|então)\b/u.test(normalizeText(raw));
      const privateNoReplyAllowed = !isGroup && asBool(settings.private_context_without_reply, true) && contextualLead;
      if (!message.quotedFromMe && !privateNoReplyAllowed) return null;
      const dateRequest = parseTargetDate(raw, message.timestampMs || Date.now());
      const semester = parseSemester(raw) || Number(stored.semester || 0);
      const detail = scheduleDetailIntent(raw);
      const changedDate = Boolean(dateRequest?.matched);
      const changedSemester = Boolean(parseSemester(raw));
      if (!changedDate && !changedSemester && !detail) return null;
      if (!semester || semester < 1 || semester > 8) return null;
      const storedDate = stored.targetDate ? new Date(`${stored.targetDate}T12:00:00Z`) : null;
      const target = changedDate
        ? { dayIndex: dateRequest.dayIndex, iso: dateRequest.iso, date: dateRequest.date }
        : { dayIndex: Number(stored.dayIndex), iso: stored.targetDate || '', date: storedDate };
      if (!Number.isInteger(target.dayIndex) || target.dayIndex < 0 || target.dayIndex > 6) return null;
      const academicPeriod = String(settings.current_academic_period || '2026.2');
      const scheduleEntries = this.db.listProfessorScheduleEntries?.({ academicPeriod, semester, dayOfWeek: target.dayIndex, activeOnly: true }) || [];
      const calendarEvents = target.iso ? (this.db.academicCalendarEventsForDate?.(target.iso, { course: 'bsi', semester }) || []) : [];
      const text = detail
        ? formatSemesterScheduleDetail(semester, target, detail, { scheduleEntries, calendarEvents, academicPeriod })
        : formatSemesterScheduleResponse(semester, target, { scheduleEntries, calendarEvents, academicPeriod });
      return {
        matched: true, type: detail ? `semester_schedule_${detail}` : 'semester_schedule', text,
        signature: `semester-schedule:${target.iso || 'context'}:${semester}:${detail || 'full'}`,
        matchedItem: `${SEMESTER_SCHEDULE_CARD_TITLE} — ${semester}º semestre`, topic: 'Horários de BSI',
        reasons: ['continuação contextual da consulta de aulas'], candidates: [], conflict: false,
        redactLog: false, attachment: null,
        contextSubject: { kind: 'semester_schedule', title: SEMESTER_SCHEDULE_CARD_TITLE,
          targetDate: target.iso || '', dayIndex: target.dayIndex, semester }
      };
    }
    if (stored.kind === 'sector') {
      if (/^(?:e\s+)?(?:o\s+)?horario(?:\s+de\s+atendimento)?$/u.test(normalized) || /^(?:qual|quais)\s+(?:e|é|sao|são)?\s*o?\s*horario$/u.test(normalized)) {
        const sector = this.db.listSectors({ activeOnly: true, cloneResult: false }).find(item => Number(item.id) === Number(stored.id));
        if (!sector) return null;
        const schedule = this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false }).find(item => normalizeText(item.title) === normalizeText('HUB — Quadro de horários 2026.2'));
        const candidates = [
          { kind: 'static', label: `Horário de atendimento da ${sector.acronym || sector.name}`, item: { id: `sector-hours:${sector.id}`, title: `Horário de atendimento — ${sector.acronym || sector.name}`, topic: 'Setores do IFBA', response_text: `*Horário de atendimento — ${sector.acronym || sector.name}*\n\nNão há um horário de atendimento confirmado no cadastro. Confirme diretamente pelo canal oficial do setor.${sector.email ? `\n\n${sector.email}` : ''}` }, score: 100, reasons: ['horário de atendimento do setor'] },
          ...(schedule ? [{ kind: 'message', label: 'Horário de uma disciplina ou turma de BSI', item: { ...schedule, topic: schedule.topic || schedule.title }, score: 100, reasons: ['horário acadêmico'] }] : [])
        ];
        return { matched: true, type: 'disambiguation', text: `Você quer saber:\n\n1. Horário de atendimento da ${sector.acronym || sector.name}\n${schedule ? '2. Horário de uma disciplina ou turma de BSI\n' : ''}\nResponda apenas com o número.`, signature: `context-hours:${sector.id}`, matchedItem: `${sector.acronym || sector.name} — horário ambíguo`, topic: 'Contexto', reasons: ['continuação contextual ambígua; confirmação de tema necessária'], candidates: candidates.map(candidate => ({ kind: candidate.kind, id: candidate.item.id, title: candidate.item.title })), conflict: true, redactLog: false, pendingCandidates: candidates };
      }
      const intent = classifySectorFollowUp(raw);
      if (!intent) return null;
      const sector = this.db.listSectors({ activeOnly: true, cloneResult: false }).find(item => Number(item.id) === Number(stored.id));
      if (!sector) return null;
      return {
        matched: true, type: 'sector', text: formatSectorResponse(sector, intent), signature: `sector:${sector.id}:${intent}`,
        matchedItem: `${sector.acronym || sector.name} — ${intent}`, topic: 'Setores do IFBA', reasons: ['continuação contextual curta'],
        candidates: [], conflict: false, redactLog: false, attachment: null,
        source_url: sector.source_url || '', source_title: sector.source_title || '', verified_at: sector.verified_at || '',
        sourceAlreadyShown: true,
        detectedIntent: ({ email: 'e-mail', whatsapp: 'WhatsApp', phone: 'telefone', location: 'localização', services: 'serviços', source: 'fonte', contact: 'contato' })[intent] || 'contato',
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
      const lines = ['*Fonte da informação*'];
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
    // Expirações são removidas pelo temporizador periódico. Aqui só limitamos
    // o mapa para manter o custo por mensagem constante.
    if (this.pendingChoices.size > 500) {
      const ordered = [...this.pendingChoices.entries()].sort((a, b) => Number(a[1].expiresAt || 0) - Number(b[1].expiresAt || 0));
      for (const [key] of ordered.slice(0, this.pendingChoices.size - 500)) this.pendingChoices.delete(key);
    }
  }
  pendingEvaluation(message, body, settings) {
    this.cleanPendingChoices();
    const key = this.conversationKey(message); const pending = this.pendingChoices.get(key);
    if (pending && Number(pending.expiresAt || 0) <= Date.now()) { this.pendingChoices.delete(key); return null; }
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

    const baseContext = {
      isGroup: Boolean(chat.isGroup), groupId, now: message.timestampMs || Date.now(),
      hasReply: Boolean(message.quotedFromMe), mentionedMe: Boolean(message.mentionedMe)
    };
    const baseSnapshot = this.buildMessageSnapshot(null, baseContext, settings);
    const prepared = prepareMessage(body, {
      now: baseContext.now, teachers: baseSnapshot.teachers,
      scheduleEntries: baseSnapshot.disciplineDirectory,
      isGroup: baseContext.isGroup, hasReply: baseContext.hasReply,
      mentionedMe: baseContext.mentionedMe
    });
    const snapshot = this.scopeMessageSnapshot(baseSnapshot, prepared);
    const evaluationContext = { ...baseContext, prepared, snapshot, settings };

    const pending = this.pendingEvaluation(message, body, settings);
    const chosen = pending ? this.renderEvaluation(pending, message, chat) : null;
    if (chosen) {
      this.rememberPendingChoice(message, chosen, settings);
      const sent = await this.reply(message, chosen, chat, body);
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
    if (!evaluation.matched) this.recordUnrecognizedSuggestion(body, evaluation, chat);
    if (!evaluation.matched && !this.isAdminCommand(body) && this.botMentioned(message, body, settings) && this.featureAllowed({ isGroup: Boolean(chat.isGroup), groupId }, 'help', settings)) {
      evaluation = this.unknownMentionEvaluation(settings);
    }
    if (!evaluation.matched && !chat.isGroup && !evaluation.suppressPrivateFallback) evaluation = this.privateUnknownEvaluation(settings);
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

module.exports = { BotEngine, asBool, senderNumber };
