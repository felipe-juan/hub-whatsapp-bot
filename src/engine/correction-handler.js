'use strict';

module.exports = function installCorrectionHandler(BotEngine, deps) {
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
    contextualFollowUpEvaluation(message, body, settings) {
      this.cleanConversationContexts();
      const quotedKey = this.replyContextKey(message, message?.quotedMessageId);
      const now = Date.now();
      let stored = quotedKey ? this.replyContexts.get(quotedKey) : null;
      if (stored && Number(stored.expiresAt || 0) <= now) { this.replyContexts.delete(quotedKey); stored = null; }
      if (!stored) {
        for (const key of this.conversationKeys(message)) {
          const candidate = this.conversationContexts.get(key);
          if (candidate && Number(candidate.expiresAt || 0) > now) { stored = candidate; break; }
          if (candidate) this.conversationContexts.delete(key);
        }
      }
      if (!stored && asBool(settings.persistent_context_enabled, true) && this.db.getConversationContext) {
        const persisted = quotedKey ? this.db.getConversationContext('', quotedKey) : null;
        if (persisted?.payload) stored = persisted.payload;
        if (!stored) for (const key of this.conversationKeys(message)) {
          const row = this.db.getConversationContext(key);
          if (row?.payload) { stored = row.payload; this.conversationContexts.set(key, stored); break; }
        }
      }
      let resumedExpired = false;
      if (!stored && this.db.getRecentExpiredConversationContext) {
        const graceMs = Math.max(60000, Number(settings.recovery_recent_expired_seconds || 600) * 1000);
        const normalizedReply = normalizeText(String(body || ''));
        if (/^(?:e|mas|entao|então|a primeira|a segunda|primeira|segunda|[1-9])\b/u.test(normalizedReply)) {
          for (const key of this.conversationKeys(message)) {
            const row = this.db.getRecentExpiredConversationContext(key, graceMs);
            if (row?.payload) { stored = { ...row.payload, expiresAt: Date.now() + 120000 }; resumedExpired = true; this.conversationContexts.set(key, stored); break; }
          }
        }
      }
      if (!stored) return null;
      if (Number(stored.expiresAt || 0) <= Date.now()) { this.forgetConversationContext(message, stored); return null; }
      const raw = String(body || '').trim();
      const normalized = normalizeText(raw.replace(/[?]+\s*$/, '')).replace(/^(?:e|mas|entao|então)\s+/, '').trim();
      const hasQuestion = /\?\s*$/.test(raw);
      const isGroup = String(message?.from || '').endsWith('@g.us') || Boolean(message?.isGroup);
    
      // Correções explícitas também precisam funcionar depois de uma resposta
      // normal, não apenas enquanto existe uma pergunta complementar pendente.
      // Ex.: “qual sala de AP?” → “não é AP, é Cálculo”. O novo valor troca
      // somente a entidade corrigida e preserva a intenção “sala”.
      if (['discipline_card', 'professor_card'].includes(String(stored.kind || ''))) {
        const currentNow = message.timestampMs || Date.now();
        const snapshot = this.buildMessageSnapshot(null, { isGroup, now: currentNow }, settings);
        const correction = parseExplicitCorrection(raw, currentNow, {
          scheduleEntries: snapshot.disciplineDirectory,
          teachers: snapshot.teachers
        });
        const hasCorrection = Boolean(correction && (
          correction.corrections?.length
          || correction.discipline || correction.professor || correction.semester || correction.targetDate
          || correction.intents?.length || correction.entityMode
        ));
        if (hasCorrection) {
          const priorDisciplineText = stored.disciplineNames?.[0]
            || (stored.kind === 'discipline_card' ? stored.referenceText : '')
            || '';
          const priorDisciplineMatch = priorDisciplineText
            ? findDisciplineCandidates(priorDisciplineText, snapshot.disciplineDirectory, { allowShortStandalone: true }).matches[0]
            : null;
          const priorTeacherName = stored.teacherNames?.[0] || '';
          const priorTeacher = priorTeacherName
            ? snapshot.teachers.find(item => normalizeText(item.name) === normalizeText(priorTeacherName))
            : null;
          const baseSlots = {
            intent: stored.intents?.[0] || 'general',
            intents: Array.isArray(stored.intents) && stored.intents.length ? [...stored.intents] : ['general'],
            excludedIntents: [],
            discipline: priorDisciplineMatch ? {
              code: priorDisciplineMatch.code || '', name: priorDisciplineMatch.name || '', label: priorDisciplineMatch.label || ''
            } : null,
            professor: priorTeacher ? { id: Number(priorTeacher.id || 0), name: priorTeacher.name || '' } : null,
            semester: Number(stored.semester || 0),
            targetDate: stored.targetDate ? {
              iso: stored.targetDate || '', dayIndex: Number.isInteger(stored.dayIndex) ? stored.dayIndex : null,
              expression: stored.targetDateExpression || ''
            } : null,
            entityMode: '', evidence: []
          };
          const correctedSlots = mergeSlots(baseSlots, correction);
          const query = buildQueryFromSlots(correctedSlots, raw);
          const prepared = prepareMessage(query, {
            now: currentNow, teachers: snapshot.teachers,
            scheduleEntries: snapshot.disciplineDirectory, isGroup
          });
          const evaluation = this.evaluate(query, {
            isGroup, now: currentNow, settings, prepared,
            snapshot: this.scopeMessageSnapshot(snapshot, prepared)
          });
          if (evaluation?.matched) {
            return {
              ...evaluation,
              reasons: [...(evaluation.reasons || []), 'correção explícita aplicada ao contexto da resposta citada ou recente']
            };
          }
        }
      }
    
      if (stored.kind === 'recovery_prompt') {
        const original = String(stored.originalMessage || '').trim();
        let expected = String(stored.expected || '');
        let slots = mergeSlots({
          intent: stored.primaryIntent || 'general',
          discipline: null,
          professor: null,
          semester: Number(stored.semester || 0),
          targetDate: stored.targetDate ? { iso: stored.targetDate, expression: stored.targetDateExpression || '' } : null,
          entityMode: ''
        }, stored.slots || {});
        const currentNow = message.timestampMs || Date.now();
        const snapshot = this.buildMessageSnapshot(null, { isGroup, now: currentNow }, settings);
    
        if (isCancel(raw)) {
          this.forgetConversationContext(message, stored);
          this.clearRecoveryState(message);
          if (/^menu$/u.test(normalizeText(raw))) {
            const menu = this.menuEvaluation('root', {}, settings);
            if (menu) return { ...menu, reasons: [...(menu.reasons || []), 'consulta pendente cancelada e menu solicitado'] };
          }
          return {
            matched: true, type: 'recovery_cancelled',
            text: 'Tudo bem. A consulta pendente foi cancelada.',
            signature: 'recovery-prompt-cancelled', matchedItem: 'Recuperação — consulta cancelada', topic: 'Recuperação de conversa',
            reasons: ['cancelamento solicitado durante pergunta complementar'], candidates: [], conflict: false, redactLog: false, analysis: []
          };
        }
    
        if (isUnknownSubject(raw) && ['discipline', 'subject'].includes(expected)) {
          return {
            matched: true, type: 'recovery_guided_subject_prompt', text: guidedPrompt(),
            signature: 'recovery-guided-subject', matchedItem: 'Recuperação — descoberta de disciplina', topic: 'Recuperação de conversa',
            reasons: ['usuário não lembra o nome da disciplina; busca guiada iniciada'], candidates: [], conflict: false, redactLog: false, analysis: [],
            contextSubject: { ...stored, originalMessage: original, expected, primaryIntent: slots.intent, slots, invalidAttempts: Number(stored.invalidAttempts || 0), guidedSearch: true, lastReply: raw }
          };
        }
    
        if (isListDisciplines(raw) && ['discipline', 'subject'].includes(expected)) {
          return {
            matched: true, type: 'recovery_discipline_list', text: formatDisciplineList(snapshot.disciplineDirectory),
            signature: 'recovery-discipline-list', matchedItem: 'Recuperação — lista de disciplinas', topic: 'Recuperação de conversa',
            reasons: ['lista de disciplinas solicitada durante pergunta complementar'], candidates: [], conflict: false, redactLog: false, analysis: [],
            contextSubject: { ...stored, originalMessage: original, slots, invalidAttempts: Number(stored.invalidAttempts || 0), lastReply: raw }
          };
        }
    
        const correction = parseExplicitCorrection(raw, currentNow, { scheduleEntries: snapshot.disciplineDirectory, teachers: snapshot.teachers });
        if (correction) {
          slots = mergeSlots(slots, correction);
          if (correction.entityMode === 'discipline') {
            slots.professor = null;
            expected = 'discipline';
          } else if (correction.entityMode === 'professor') {
            slots.discipline = null;
            expected = 'professor';
          }
        }
    
        if (!correction && looksLikeNewCompleteRequest(raw, { expected, scheduleEntries: snapshot.disciplineDirectory, teachers: snapshot.teachers, now: currentNow })) {
          const independentPrepared = prepareMessage(raw, {
            now: currentNow, teachers: snapshot.teachers, scheduleEntries: snapshot.disciplineDirectory, isGroup
          });
          const independent = this.evaluate(raw, {
            isGroup, now: currentNow, settings, prepared: independentPrepared,
            snapshot: this.scopeMessageSnapshot(snapshot, independentPrepared)
          });
          if (independent?.matched) {
            this.forgetConversationContext(message, stored);
            this.clearRecoveryState(message);
            return { ...independent, reasons: [...(independent.reasons || []), 'nova solicitação completa substituiu a consulta pendente'] };
          }
        }
    
        const rawDiscipline = correction?.discipline
          ? { matches: [correction.discipline], fragment: correction.discipline.code || correction.discipline.name || '' }
          : findDisciplineCandidates(raw, snapshot.disciplineDirectory, { allowShortStandalone: true });
        if (rawDiscipline.matches.length === 1) {
          const discipline = rawDiscipline.matches[0];
          slots = mergeSlots(slots, { discipline: { code: discipline.code || '', name: discipline.name || '', label: discipline.label || '' } });
        } else if (rawDiscipline.matches.length > 1 && ['discipline', 'subject'].includes(expected)) {
          const synthetic = buildQueryFromSlots({ ...slots, discipline: null }, original);
          const disambiguation = this.disciplineDisambiguationEvaluation(synthetic, rawDiscipline.matches, {
            isGroup, now: currentNow, settings, snapshot
          }, settings);
          if (disambiguation) {
            disambiguation.originalMessage = original;
            disambiguation.recoveryMetadata = { stage: 1, outcome: 'discipline_disambiguation', optionCount: rawDiscipline.matches.length, originalMessage: original };
            return disambiguation;
          }
        }
    
        const rawPrepared = prepareMessage(raw, {
          now: currentNow, teachers: snapshot.teachers, scheduleEntries: snapshot.disciplineDirectory, isGroup
        });
        const exactProfessor = (rawPrepared.professorMatches || []).find(match => match?.teacher && match.fuzzy !== true)?.teacher || null;
        if (exactProfessor) slots = mergeSlots(slots, { professor: { id: Number(exactProfessor.id || 0), name: exactProfessor.name || '' } });
        const parsedSemester = parseSemester(raw);
        if (parsedSemester) slots = mergeSlots(slots, { semester: parsedSemester });
        const parsedDate = parseTargetDate(raw, currentNow);
        if (parsedDate?.matched) slots = mergeSlots(slots, { targetDate: { iso: parsedDate.iso || '', dayIndex: parsedDate.dayIndex, expression: parsedDate.expression || '' } });
    
        if (!slots.discipline && ['discipline', 'subject'].includes(expected) && (stored.guidedSearch || parsedSemester || exactProfessor || /\b(?:programacao|programação|dados|matematica|matemática|redes|software|gestao|gestão)\b/u.test(normalizeText(raw)))) {
          const allEntries = this.db.listProfessorScheduleEntries?.({ academicPeriod: snapshot.academicPeriod, activeOnly: true }) || [];
          const guided = guidedDisciplineCandidates(raw, { entries: allEntries, teachers: snapshot.teachers, limit: 9 });
          if (guided.length === 1) {
            const discipline = guided[0];
            slots = mergeSlots(slots, { discipline: { code: discipline.code || '', name: discipline.name || '', label: discipline.label || '' } });
          } else if (guided.length > 1) {
            const disambiguation = this.disciplineDisambiguationEvaluation(buildQueryFromSlots(slots, original), guided, {
              isGroup, now: currentNow, settings, snapshot
            }, settings);
            if (disambiguation) {
              disambiguation.text = `Encontrei estas disciplinas com a pista informada:
    
    ${disambiguation.text.replace(/^Você quis dizer\?\s*/u, '')}`;
              disambiguation.originalMessage = original;
              disambiguation.recoveryMetadata = { stage: 1, outcome: 'guided_discipline_search', optionCount: guided.length, originalMessage: original };
              return disambiguation;
            }
          }
        }
    
        expected = expectedForSlots(slots) || expected;
        const hasExpectedValue = expected === 'discipline' ? Boolean(slots.discipline)
          : expected === 'professor' ? Boolean(slots.professor)
          : expected === 'semester' ? Boolean(slots.semester)
          : expected === 'subject' ? Boolean(slots.discipline || slots.professor || slots.semester)
          : true;
    
        if (hasExpectedValue) {
          const query = buildQueryFromSlots(slots, `${original} ${raw}`.trim());
          const prepared = prepareMessage(query, {
            now: currentNow, teachers: snapshot.teachers, scheduleEntries: snapshot.disciplineDirectory, isGroup
          });
          const evaluation = this.evaluate(query, {
            isGroup, now: currentNow, settings, prepared,
            snapshot: this.scopeMessageSnapshot(snapshot, prepared)
          });
          if (evaluation?.matched) {
            this.forgetConversationContext(message, stored);
            const selectedId = Number(evaluation.contextSubject?.id || evaluation.candidates?.[0]?.id || 0);
            if (selectedId > 0 && original && this.db.addUnrecognizedSuggestion) {
              try { this.db.addUnrecognizedSuggestion({ message_excerpt: original, normalized_message: normalizeText(original),
                chat_type: isGroup ? 'group' : 'private', chat_name: '', suggested_message_id: selectedId,
                suggested_title: evaluation.matchedItem || evaluation.contextSubject?.title || '', confidence: 0.96,
                reasons: ['pergunta complementar ou reformulação resolveu a mensagem original'] }); } catch {}
            }
            if (rawDiscipline.fragment && slots.discipline && normalizeText(rawDiscipline.fragment) !== normalizeText(slots.discipline.code || slots.discipline.name)
              && this.db.addDisciplineAliasSuggestion) {
              try { this.db.addDisciplineAliasSuggestion({ alias: rawDiscipline.fragment, discipline_code: slots.discipline.code || '', discipline_name: slots.discipline.name || '',
                original_message: original, chat_type: isGroup ? 'group' : 'private' }); } catch {}
            }
            this.recordRecovery(message, { original_message: original, stage: 1, outcome: 'clarification_resolved',
              intent: slots.intent || evaluation.detectedIntent || '', entity_type: evaluation.contextSubject?.kind || '',
              entity_id: String(evaluation.contextSubject?.id || ''), messages_to_resolution: Number(stored.invalidAttempts || 0) + 2 });
            this.recordIntentMetric(message, { intent: (slots.intents || [slots.intent]).join('+'), outcome: 'clarification_resolved', attempts: Number(stored.invalidAttempts || 0) + 1, confidence: prepared.queryModel?.confidence || 1 });
            this.clearRecoveryState(message);
            return { ...evaluation, reasons: [...(evaluation.reasons || []), 'informação ausente preenchida em estado estruturado'] };
          }
        }
    
        expected = expectedForSlots(slots) || expected;
        const attempts = Number(stored.invalidAttempts || 0) + 1;
        if (attempts >= 3) {
          this.recordIntentMetric(message, { intent: (slots.intents || [slots.intent]).join('+'), outcome: 'abandoned', missingField: expected, attempts, confidence: 0 });
          this.forgetConversationContext(message, stored);
          this.clearRecoveryState(message);
          return {
            matched: true, type: 'recovery_clarification_closed',
            text: 'Não consegui completar a consulta após três tentativas. Encerrei este pedido para você não ficar preso. Faça uma nova pergunta normalmente.',
            signature: `recovery-closed:${expected}`, matchedItem: 'Recuperação — consulta encerrada', topic: 'Recuperação de conversa',
            reasons: ['limite de respostas inválidas atingido'], candidates: [], conflict: false, redactLog: false, analysis: []
          };
        }
    
        const understanding = formatUnderstanding(slots, { expected });
        const prompt = expected === 'semester' ? 'Responda com um número entre 1 e 8.'
          : expected === 'professor' ? 'Envie o primeiro nome ou o nome completo do professor.'
          : expected === 'subject' ? 'Envie o nome de um professor, disciplina ou semestre.'
          : 'Envie a sigla ou o nome da disciplina.';
        const guidance = attempts === 1
          ? `${prompt}\n\nVocê também pode escrever “ver disciplinas” ou “cancelar”.`
          : `${prompt}\n\n1. Digitar o nome ou a sigla\n2. Escrever “ver disciplinas”\n3. Escrever “cancelar”`;
        this.recordIntentMetric(message, { intent: (slots.intents || [slots.intent]).join('+'), outcome: 'clarification', missingField: expected, attempts, confidence: 0 });
        return {
          matched: true, type: 'recovery_clarification_invalid',
          text: `${attempts === 1 ? 'Não identifiquei a informação pedida.' : 'Ainda não identifiquei a informação pedida.'}\n\n${understanding}\n\n${guidance}`,
          signature: `recovery-invalid:${expected}:${attempts}`, matchedItem: 'Recuperação — resposta incompleta', topic: 'Recuperação de conversa',
          reasons: ['a resposta não preencheu a informação solicitada', `tentativa inválida: ${attempts}`], candidates: [], conflict: false, redactLog: false, analysis: [],
          contextSubject: { ...stored, originalMessage: original, expected, primaryIntent: slots.intent, slots, invalidAttempts: attempts, lastReply: raw }
        };
      }
      if (stored.kind === 'recovery_categories' || stored.kind === 'recovery_menu') {
        const number = choiceNumber(raw);
        const menuByChoice = { 1: 'professors', 2: 'professors', 3: 'sectors', 4: 'records', 5: 'academic', 7: 'root' };
        if (number === 6) {
          this.forgetConversationContext(message, stored);
          return { matched: true, type: 'static', text: 'Para calcular a nota da final, envie por exemplo: `!final 6,9`.',
            signature: 'recovery-calculator-help', matchedItem: 'Calculadora da final', topic: 'Calculadoras', reasons: ['categoria escolhida'], candidates: [], conflict: false, redactLog: false, analysis: [] };
        }
        if (menuByChoice[number]) {
          this.forgetConversationContext(message, stored);
          const evaluation = this.menuEvaluation(menuByChoice[number], {}, settings);
          if (evaluation) return { ...evaluation, reasons: [...(evaluation.reasons || []), 'categoria escolhida na recuperação'] };
        }
        if (/^atendimento$/u.test(normalizeText(raw))) {
          this.forgetConversationContext(message, stored);
          return { matched: true, type: 'static', text: 'Descreva em uma frase curta o que você precisa resolver. Vou indicar o setor mais relacionado.',
            signature: 'recovery-attendance-prompt', matchedItem: 'Encaminhamento por setor', topic: 'Recuperação de conversa', reasons: ['encaminhamento solicitado'],
            candidates: [], conflict: false, redactLog: false, analysis: [], contextSubject: { kind: 'recovery_prompt', expected: 'subject',
              originalMessage: 'preciso de atendimento para', primaryIntent: 'contact', title: 'Encaminhamento por setor' } };
        }
        return null;
      }
      if (stored.kind === 'discipline_card') {
        const fields = requestedDisciplineFields(raw);
        const contextualLead = /^(?:e|mas|entao|então)\b/u.test(normalizeText(raw));
        if (!fields.length || (!message.quotedFromMe && isGroup && !contextualLead && !message.groupActivated)) return null;
        const query = `${raw.replace(/[?]+\s*$/u, '').trim()} ${stored.referenceText || stored.title}?`.trim();
        const evaluation = this.professorCardEvaluation(query, { isGroup, now: message.timestampMs || Date.now(), settings });
        if (!evaluation?.matched) return null;
        return { ...evaluation, reasons: [...(evaluation.reasons || []), resumedExpired ? 'contexto recém-expirado retomado' : 'continuação do último assunto respondido'] };
      }
      if (stored.kind === 'professor_card') {
        const contextualLead = /^(?:e|mas|entao|então)\b/u.test(normalizeText(raw));
        const privateNoReplyAllowed = !isGroup && asBool(settings.private_context_without_reply, true) && contextualLead;
        if (!message.quotedFromMe && !privateNoReplyAllowed) return null;
        const contextTeachers = (stored.teacherNames || []).map(name => ({ name }));
        const privacy = this.professorPhonePrivacyEvaluation(raw, { isGroup, now: message.timestampMs || Date.now(), settings }, {
          hasProfessorContext: true, teachers: contextTeachers
        });
        if (privacy) return { ...privacy, reasons: [...(privacy.reasons || []), 'continuação contextual do card docente'] };
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
      if (stored.kind === 'semester_overview_prompt') {
        const semester = semesterFromFollowUp(raw);
        if (!semester) {
          return {
            matched: true,
            type: 'semester_overview_prompt_invalid',
            text: ['Não consegui identificar o semestre.', '', 'Responda apenas com um número entre `1` e `8`.'].join('\n'),
            signature: 'semester-overview-prompt-invalid',
            matchedItem: 'BSI — Aulas e horários por semestre',
            topic: 'Horários de BSI', detectedIntent: 'horário',
            reasons: ['resposta ao pedido de semestre não pôde ser interpretada'],
            candidates: [], conflict: false, redactLog: false, attachment: null,
            contextSubject: { kind: 'semester_overview_prompt', title: 'BSI — Aulas e horários por semestre' }
          };
        }
        const title = `BSI — Aulas e horários do ${semester}º semestre`;
        const card = this.db.listAutomaticMessages({ activeOnly: true, cloneResult: false })
          .find(item => normalizeText(item.title) === normalizeText(title));
        if (!card?.response_text) return null;
        this.forgetConversationContext(message, stored);
        return {
          matched: true, type: 'message', text: card.response_text,
          signature: `semester-overview:${semester}`, matchedItem: card.title,
          topic: card.topic || 'Horários de BSI', detectedIntent: 'horário',
          reasons: ['semestre informado como continuação da consulta da grade semanal'],
          candidates: [{ kind: 'message', id: card.id, title: card.title }], conflict: false,
          redactLog: false, attachment: card.attachment || null,
          details_text: card.details_text || '', source_url: card.source_url || '',
          source_title: card.source_title || '', verified_at: card.verified_at || '',
          contextSubject: { kind: 'message', id: Number(card.id || 0), title: card.title, topic: card.topic || card.title,
            details_text: card.details_text || '', source_url: card.source_url || '', source_title: card.source_title || '', verified_at: card.verified_at || '' }
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
  });
};
