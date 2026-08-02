module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, captionAnalysis, crypto } = deps;
  return class {
  enqueueOutboundDelivery(conversationId, content, { idempotencyKey = '', priority = 0, sourceMessageId = '' } = {}) {
    const timestamp = nowIso();
    const payload = JSON.stringify(content || {});
    const key = String(idempotencyKey || '').slice(0, 180);
    if (key) {
      const existing = this.prepared.getOutboundByKey.get(key);
      if (existing) return this.mapOutboundDelivery(existing);
    }
    const result = this.prepared.insertOutbound.run(
      String(conversationId || ''), payload, timestamp, timestamp, key,
      Math.max(-100, Math.min(100, Number(priority || 0))), String(sourceMessageId || '').slice(0, 180)
    );
    this.touchWrite();
    if (result.lastInsertRowid) return this.getOutboundDelivery(result.lastInsertRowid);
    return key ? this.mapOutboundDelivery(this.prepared.getOutboundByKey.get(key)) : null;
  }

  mapOutboundDelivery(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id), attempts: Number(row.attempts || 0), priority: Number(row.priority || 0),
      content: parseJson(row.content_json, {}) || {}
    };
  }

  getOutboundDelivery(id) { return this.mapOutboundDelivery(this.prepared.getOutboundById.get(Number(id))); }
  getOutboundDeliveryByKey(key) { return this.mapOutboundDelivery(this.prepared.getOutboundByKey.get(String(key || ''))); }

  claimOutboundDelivery(id, claimToken = '') {
    const timestamp = nowIso();
    const token = String(claimToken || crypto.randomUUID()).slice(0, 120);
    const result = this.prepared.claimOutbound.run(token, timestamp, Number(id));
    if (result.changes) this.touchWrite();
    const delivery = this.getOutboundDelivery(id);
    const ownsClaim = delivery?.state === 'sending' && delivery?.claim_token === token;
    return delivery ? { ...delivery, claimed: Boolean(result.changes || ownsClaim), claimOwned: ownsClaim } : null;
  }

  outboundAttempt(value) {
    if (value === null || value === undefined || value === '') return null;
    const attempt = Number(value);
    return Number.isInteger(attempt) && attempt >= 0 ? attempt : null;
  }

  markOutboundDelivered(id, whatsappMessageId = '', expectedAttempt = null) {
    const timestamp = nowIso();
    const attempt = this.outboundAttempt(expectedAttempt);
    const result = this.prepared.markOutboundSent.run(String(whatsappMessageId || ''), timestamp, timestamp, Number(id), attempt, attempt);
    if (result.changes) this.touchWrite();
    const delivery = this.getOutboundDelivery(id);
    return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
  }

  markOutboundRetry(id, error, delayMs = 3000, expectedAttempt = null) {
    const due = new Date(Date.now() + Math.max(500, Number(delayMs || 0))).toISOString();
    const attempt = this.outboundAttempt(expectedAttempt);
    const result = this.prepared.markOutboundRetry.run(due, String(error?.message || error || 'falha temporária').slice(0, 1000), nowIso(), Number(id), attempt, attempt);
    if (result.changes) this.touchWrite();
    const delivery = this.getOutboundDelivery(id);
    return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
  }

  markOutboundFailed(id, error, expectedAttempt = null) {
    const attempt = this.outboundAttempt(expectedAttempt);
    const result = this.prepared.markOutboundFailed.run(String(error?.message || error || 'falha permanente').slice(0, 1000), nowIso(), Number(id), attempt, attempt);
    if (result.changes) this.touchWrite();
    const delivery = this.getOutboundDelivery(id);
    return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
  }

  markOutboundUncertain(id, error = 'resultado do envio desconhecido', expectedAttempt = null) {
    const attempt = this.outboundAttempt(expectedAttempt);
    const result = this.prepared.markOutboundUncertain.run(String(error?.message || error || 'resultado do envio desconhecido').slice(0, 1000), nowIso(), Number(id), attempt, attempt);
    if (result.changes) this.touchWrite();
    const delivery = this.getOutboundDelivery(id);
    return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
  }

  retryUncertainOutboundDelivery(id, delayMs = 500) {
    const delivery = this.getOutboundDelivery(id);
    if (!delivery || delivery.state !== 'uncertain') return delivery ? { ...delivery, transitioned: false } : null;
    return this.markOutboundRetry(id, 'reenvio manual de entrega com resultado desconhecido', delayMs, delivery.attempts);
  }

  listUncertainOutboundDeliveries(limit = 100) {
    return this.db.prepare(`SELECT * FROM outbound_deliveries WHERE state='uncertain' ORDER BY updated_at DESC,id DESC LIMIT ?`)
      .all(Math.max(1, Math.min(500, Number(limit || 100)))).map(row => this.mapOutboundDelivery(row));
  }

  recoverInterruptedOutboundDeliveries() {
    const timestamp = nowIso();
    const changes = this.db.prepare(`UPDATE outbound_deliveries SET state='uncertain',next_attempt_at='',claim_token='',last_error=CASE WHEN last_error='' THEN 'processo reiniciado durante um envio; resultado desconhecido' ELSE last_error END,updated_at=? WHERE state='sending'`)
      .run(timestamp).changes;
    if (changes) this.touchWrite();
    return Number(changes || 0);
  }

  returnSendingDeliveriesToPending(reason = 'encerramento durante envio; resultado desconhecido') {
    const timestamp = nowIso();
    const changes = this.db.prepare(`UPDATE outbound_deliveries SET state='uncertain',next_attempt_at='',claim_token='',last_error=?,updated_at=? WHERE state='sending'`)
      .run(String(reason || '').slice(0, 1000), timestamp).changes;
    if (changes) this.touchWrite();
    return Number(changes || 0);
  }

  listDueOutboundDeliveries(limit = 50) {
    const now = nowIso();
    return this.db.prepare(`SELECT * FROM outbound_deliveries WHERE state IN ('pending','retry') AND (next_attempt_at='' OR next_attempt_at<=?)
      ORDER BY priority DESC,id ASC LIMIT ?`)
      .all(now, Math.max(1, Math.min(500, Number(limit || 50)))).map(row => this.mapOutboundDelivery(row));
  }

  outboundDeliveryStats() {
    const rows = this.prepared.outboundStats.all();
    return Object.fromEntries(rows.map(row => [row.state, Number(row.count || 0)]));
  }

  pruneOutboundDeliveries({ sentDays = 7, failedDays = 30, uncertainDays = 90 } = {}) {
    const sentCutoff = new Date(Date.now() - Math.max(1, Number(sentDays || 7)) * 86400000).toISOString();
    const failedCutoff = new Date(Date.now() - Math.max(1, Number(failedDays || 30)) * 86400000).toISOString();
    const uncertainCutoff = new Date(Date.now() - Math.max(1, Number(uncertainDays || 90)) * 86400000).toISOString();
    const changes = Number(this.db.prepare(`DELETE FROM outbound_deliveries WHERE (state='sent' AND sent_at<>'' AND sent_at<?) OR (state='failed' AND updated_at<?) OR (state='uncertain' AND updated_at<?)`).run(sentCutoff, failedCutoff, uncertainCutoff).changes || 0);
    if (changes) this.touchWrite();
    return changes;
  }

  };
};
