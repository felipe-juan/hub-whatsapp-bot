'use strict';

module.exports = function install(BotClass, deps) {
  const { fs, crypto, spawn, QRCode, asBool, RecentMessageTracker, ConversationQueue, ConcurrencyLimiter, CircuitBreaker, HealthWatchdog, fetchGroupRows, resolveIncomingActivation, applyIncomingActivation, FragmentBuffer, isLikelyFragment, delay, backgroundDelay, silentLogger, disconnectCode, cleanAccountNumber, createMessageAdapter } = deps;
  Object.assign(BotClass.prototype, {
    async persistentWrite(queueMethod, databaseMethod, args = []) {
      if (this.writeQueue?.[queueMethod]) {
        try { return await this.writeQueue[queueMethod](...args); }
        catch (error) {
          const safeOutboundFallbacks = new Set([
            'enqueueOutboundDelivery', 'claimOutboundDelivery', 'markOutboundDelivered', 'markOutboundRetry', 'markOutboundFailed', 'markOutboundUncertain'
          ]);
          const canReconcile = ['DB_WRITER_UNAVAILABLE', 'DB_WRITER_OUTCOME_UNKNOWN', 'DB_WRITER_OPERATION_FAILED'].includes(error?.code)
            && safeOutboundFallbacks.has(databaseMethod);
          if (!canReconcile) throw error;
          this.engine?.performance?.increment?.('database_writer_fallbacks');
          this.update({ databaseWriterError: error.message });
        }
      }
      if (typeof this.db?.[databaseMethod] !== 'function') throw new Error(`Persistência indisponível: ${databaseMethod}`);
      return this.db[databaseMethod](...args);
    },

    serializeOutboundContent(jid, content, metadata = {}) {
      const payload = { jid: String(jid || ''), content: content || {}, metadata: { kind: metadata.kind || 'message', attachment: Boolean(metadata.attachment) } };
      JSON.stringify(payload);
      return payload;
    },

    outboundIdempotencyKey(jid, content, metadata = {}) {
      const source = String(metadata.sourceMessageId || 'manual');
      const sequence = Number(metadata.sequence || 0);
      const digest = crypto.createHash('sha256').update(JSON.stringify({ jid: String(jid || ''), source, sequence, content })).digest('hex');
      return `wa:${digest}`;
    },

    contentPriority(content, metadata = {}) {
      if (Number.isFinite(Number(metadata.priority))) return Number(metadata.priority);
      if (content?.text) return 100;
      if (content?.image || content?.document || content?.audio || content?.video) return 10;
      return 50;
    },

    temporarySendError(error, code = disconnectCode(error)) {
      if ([400, 401, 403, 404, 406, 415].includes(Number(code || 0))) return false;
      return true;
    },

    async sendWithTimeout(socket, jid, content, options, timeoutMs = 20_000) {
      let timer;
      const sendPromise = Promise.resolve().then(() => socket.sendMessage(jid, content, options));
      try {
        return await Promise.race([
          sendPromise,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              const error = new Error('Tempo limite ao enviar pelo WhatsApp; o resultado ainda é desconhecido.');
              error.code = 'WA_SEND_TIMEOUT';
              error.outcomeUnknown = true;
              error.lateOutcome = sendPromise;
              reject(error);
            }, timeoutMs);
          })
        ]);
      } catch (error) {
        if (error?.code === 'WA_SEND_TIMEOUT') this.engine?.performance?.increment?.('send_timeouts');
        throw error;
      } finally { clearTimeout(timer); }
    },

    trackPendingSendReconciliation(deliveryId, operation) {
      const id = Number(deliveryId);
      let tracked;
      tracked = Promise.resolve(operation).catch(error => {
        this.update({ lastError: `Falha ao reconciliar o envio #${id}: ${error.message}` });
      }).finally(() => {
        if (this.pendingLateSends?.get(id) === tracked) this.pendingLateSends.delete(id);
        this.update({ pendingLateSendCount: this.pendingLateSends?.size || 0, persistentDeliveries: this.db.outboundDeliveryStats?.() || {} });
      });
      this.pendingLateSends?.set(id, tracked);
      this.update({ pendingLateSendCount: this.pendingLateSends?.size || 0 });
      return tracked;
    },

    reconcileLateSend(deliveryId, expectedAttempt, lateOutcome) {
      if (!lateOutcome || typeof lateOutcome.then !== 'function') return;
      const id = Number(deliveryId);
      const operation = Promise.resolve(lateOutcome).then(async result => {
        try {
          await this.persistentWrite('markOutboundDelivered', 'markOutboundDelivered', [id, result?.key?.id || '', expectedAttempt]);
          this.circuitBreaker?.recordSuccess?.();
          this.consecutiveSendErrors = 0;
          this.outboundPausedUntil = 0;
          this.engine?.performance?.increment?.('late_send_confirmations');
          this.update({ lastError: '', outboundPausedUntil: '', circuitBreaker: this.circuitBreaker?.stats?.() || {}, persistentDeliveries: this.db.outboundDeliveryStats?.() || {} });
        } catch (error) {
          this.update({ databaseWriterError: error.message, lastError: `Envio tardio confirmado, mas não foi possível registrar: ${error.message}` });
        }
      }, async error => {
        try {
          const code = disconnectCode(error);
          if (this.temporarySendError(error, code)) {
            await this.persistentWrite('markOutboundRetry', 'markOutboundRetry', [id, error, 5000, expectedAttempt]);
            this.scheduleOutboundDrain(5100);
          } else {
            await this.persistentWrite('markOutboundFailed', 'markOutboundFailed', [id, error, expectedAttempt]);
          }
          this.engine?.performance?.increment?.('late_send_failures');
        } catch (persistError) {
          this.update({ databaseWriterError: persistError.message, lastError: `Falha tardia do envio não pôde ser registrada: ${persistError.message}` });
        }
      });
      this.trackPendingSendReconciliation(id, operation);
    },

    reconcileConfirmedSend(deliveryId, expectedAttempt, whatsappMessageId = '') {
      const id = Number(deliveryId);
      const delays = Array.isArray(this.confirmedSendReconcileDelays) && this.confirmedSendReconcileDelays.length
        ? this.confirmedSendReconcileDelays : [250, 1500, 5000];
      const operation = (async () => {
        let lastError = null;
        for (const waitMs of delays) {
          if (Number(waitMs) > 0) await backgroundDelay(Number(waitMs));
          try {
            const persisted = await this.persistentWrite('markOutboundDelivered', 'markOutboundDelivered', [id, whatsappMessageId, expectedAttempt]);
            if (persisted?.state === 'sent') {
              this.engine?.performance?.increment?.('confirmed_send_reconciliations');
              this.update({ databaseWriterError: '', lastError: '', persistentDeliveries: this.db.outboundDeliveryStats?.() || {} });
              return true;
            }
            lastError = new Error(`Estado atual: ${persisted?.state || 'desconhecido'}.`);
          } catch (error) { lastError = error; }
        }
        this.update({
          databaseWriterError: lastError?.message || 'Falha desconhecida.',
          lastError: `A mensagem #${id} foi aceita pelo WhatsApp, mas a confirmação no SQLite ainda exige revisão manual.`
        });
        return false;
      })();
      return this.trackPendingSendReconciliation(id, operation);
    },

    hasPendingLateSend(deliveryId) { return Boolean(this.pendingLateSends?.has(Number(deliveryId))); },

    async deliverPersistent(socket, delivery, options = undefined) {
      if (!delivery) throw new Error('Entrega persistente inválida.');
      if (delivery.state === 'sent') {
        this.engine?.performance?.increment?.('idempotent_reuses');
        return { key: { id: delivery.whatsapp_message_id || '' }, idempotent: true };
      }
      if (socket !== this.socket || this.status.state !== 'ready') {
        await this.persistentWrite('markOutboundRetry', 'markOutboundRetry', [delivery.id, 'WhatsApp desconectado', 3000]);
        throw new Error('WhatsApp não está pronto para enviar.');
      }
      const permission = this.circuitBreaker.beforeRequest();
      if (!permission.allowed) {
        await this.persistentWrite('markOutboundRetry', 'markOutboundRetry', [delivery.id, 'Circuit breaker temporariamente aberto', permission.retryAfterMs]);
        this.scheduleOutboundDrain(permission.retryAfterMs + 100);
        throw new Error('Envios temporariamente pausados para recuperar a conexão.');
      }
      const claimToken = crypto.randomUUID();
      const claimed = await this.persistentWrite('claimOutbound', 'claimOutboundDelivery', [delivery.id, claimToken]);
      if (!claimed) throw new Error('Entrega persistente não foi encontrada.');
      if (claimed.state === 'sent') return { key: { id: claimed.whatsapp_message_id || '' }, idempotent: true };
      if (!claimed.claimed) {
        if (claimed.state === 'sending') {
          this.engine?.performance?.increment?.('idempotent_reuses');
          return { key: { id: claimed.whatsapp_message_id || '' }, idempotent: true, inFlight: true };
        }
        throw new Error(`Entrega não pôde ser reservada: estado ${claimed.state || 'desconhecido'}.`);
      }
      if (claimed.state !== 'sending') throw new Error(`Entrega não pôde ser reservada: estado ${claimed.state || 'desconhecido'}.`);
      const payload = claimed.content || delivery.content || {};
      const priority = Number(claimed.priority || payload.metadata?.priority || 0);
      const startedAt = Date.now();
      this.activeSendStarted.set(Number(delivery.id), startedAt);
      this.activeSendCount += 1;
      this.lastSendProgressAt = Date.now();
      this.update({ outboundActiveSends: this.activeSendCount });
      try {
        const isMedia = Boolean(payload.metadata?.attachment || payload.content?.image || payload.content?.document || payload.content?.audio || payload.content?.video);
        const limiter = isMedia ? this.mediaSendLimiter : this.textSendLimiter;
        let result;
        try {
          result = await limiter.schedule(
            () => this.sendWithTimeout(socket, payload.jid, payload.content, options),
            { priority, label: `${payload.jid}:${delivery.id}` }
          );
        } catch (error) {
          const code = disconnectCode(error);
          this.consecutiveSendErrors += 1;
          this.engine?.performance?.increment?.('delivery_errors');
          const cooldownMs = code === 429 ? 15 * 60_000 : code === 403 ? 60 * 60_000 : 0;
          const breaker = this.circuitBreaker.recordFailure(error, { code, cooldownMs });
          this.outboundPausedUntil = breaker.nextAttemptAt ? new Date(breaker.nextAttemptAt).getTime() : 0;
          const attempts = Number(claimed.attempts || delivery.attempts || 0);
          if (error?.outcomeUnknown) {
            try { await this.persistentWrite('markOutboundUncertain', 'markOutboundUncertain', [delivery.id, error, claimed.attempts]); }
            catch (persistError) { this.update({ databaseWriterError: persistError.message }); }
            this.reconcileLateSend(delivery.id, claimed.attempts, error.lateOutcome);
            this.engine?.performance?.increment?.('deliveries_uncertain');
          } else if (this.temporarySendError(error, code) && attempts < 6) {
            const delayMs = Math.max(
              Number(breaker.retryAfterMs || 0),
              Math.min(60_000, 1500 * (2 ** Math.min(attempts, 5)))
            );
            await this.persistentWrite('markOutboundRetry', 'markOutboundRetry', [delivery.id, error, delayMs, claimed.attempts]);
            this.scheduleOutboundDrain(delayMs + 100);
          } else {
            await this.persistentWrite('markOutboundFailed', 'markOutboundFailed', [delivery.id, error, claimed.attempts]);
          }
          this.update({
            outboundPausedUntil: breaker.nextAttemptAt || '',
            circuitBreaker: breaker,
            lastError: `Falha de envio${code ? ` (${code})` : ''}: ${error.message}`
          });
          throw error;
        }
    
        let persistenceWarning = '';
        try {
          const persisted = await this.persistentWrite('markOutboundDelivered', 'markOutboundDelivered', [delivery.id, result?.key?.id || '', claimed.attempts]);
          if (!persisted || persisted.state !== 'sent') throw new Error('O estado enviado não pôde ser confirmado no SQLite.');
        } catch (error) {
          // O WhatsApp já aceitou a mensagem. Tratar esta falha como erro de envio
          // colocaria a mesma entrega em retry e produziria uma duplicata imediata.
          persistenceWarning = `Mensagem enviada, mas a confirmação no SQLite falhou: ${error.message}`;
          this.engine?.performance?.increment?.('delivery_persistence_errors');
          try {
            await this.persistentWrite('markOutboundUncertain', 'markOutboundUncertain', [delivery.id, persistenceWarning, claimed.attempts]);
          } catch {}
          this.reconcileConfirmedSend(delivery.id, claimed.attempts, result?.key?.id || '');
          this.update({ databaseWriterError: error.message, lastError: persistenceWarning });
        }
    
        this.circuitBreaker.recordSuccess();
        this.consecutiveSendErrors = 0;
        this.lastSendCompletedAt = Date.now();
        this.lastSendProgressAt = Date.now();
        this.engine?.performance?.observe?.('whatsapp_send_ms', Date.now() - startedAt);
        this.engine?.performance?.increment?.('deliveries_sent');
        this.update({ lastSendCompletedAt: new Date(this.lastSendCompletedAt).toISOString(), persistentDeliveries: this.db.outboundDeliveryStats?.() || {} });
        return persistenceWarning ? { ...result, persistenceWarning: true } : result;
      } finally {
        this.activeSendStarted.delete(Number(delivery.id));
        this.activeSendCount = Math.max(0, this.activeSendCount - 1);
        this.update({ outboundActiveSends: this.activeSendCount, persistentDeliveries: this.db.outboundDeliveryStats?.() || {} });
      }
    },

    async enqueueSend(socket, jid, content, options, metadata = {}) {
      if (socket !== this.socket || this.status.state !== 'ready') throw new Error('WhatsApp não está pronto para enviar.');
      const priority = this.contentPriority(content, metadata);
      const payload = this.serializeOutboundContent(jid, content, { ...metadata, priority });
      const persistenceAvailable = Boolean(
        this.writeQueue?.enqueueOutbound || typeof this.db?.enqueueOutboundDelivery === 'function'
      );
      if (!persistenceAvailable) {
        // Lightweight adapters and tests may not provide a database. Keep the send
        // path operational while still respecting the independent text/media pools.
        const isMedia = Boolean(metadata.attachment || content?.image || content?.document || content?.audio || content?.video);
        const limiter = isMedia ? this.mediaSendLimiter : this.textSendLimiter;
        return limiter.schedule(
          () => this.sendWithTimeout(socket, jid, content, options),
          { priority, label: `${jid}:ephemeral` }
        );
      }
      const idempotencyKey = this.outboundIdempotencyKey(jid, content, metadata);
      const delivery = await this.persistentWrite('enqueueOutbound', 'enqueueOutboundDelivery', [jid, payload, {
        idempotencyKey,
        priority,
        sourceMessageId: metadata.sourceMessageId || ''
      }]);
      if (!delivery) return this.sendWithTimeout(socket, jid, content, options);
      return this.deliverPersistent(socket, delivery, options);
    },

    scheduleOutboundDrain(delayMs = 1000) {
      clearTimeout(this.outboundDrainTimer);
      this.outboundDrainTimer = setTimeout(() => {
        this.outboundDrainTimer = null;
        this.drainOutboundDeliveries().catch(error => this.update({ lastError: `Falha ao recuperar envios: ${error.message}` }));
      }, Math.max(50, Number(delayMs || 0)));
      this.outboundDrainTimer.unref?.();
    },

    async drainOutboundDeliveries() {
      if (this.outboundDrainRunning || !this.socket || this.status.state !== 'ready') return;
      if (this.outboundPausedUntil > Date.now()) { this.scheduleOutboundDrain(this.outboundPausedUntil - Date.now() + 250); return; }
      this.outboundDrainRunning = true;
      try {
        const deliveries = this.db.listDueOutboundDeliveries?.(50) || [];
        if (deliveries.length) this.engine?.performance?.increment?.('deliveries_recovered_from_queue', deliveries.length);
        const tasks = deliveries.map(delivery => this.recoveryQueue.enqueue(delivery.conversation_id, () =>
          this.deliverPersistent(this.socket, delivery, undefined).catch(() => null)
        ));
        if (tasks.length) await Promise.allSettled(tasks);
        const remaining = this.db.listDueOutboundDeliveries?.(1) || [];
        if (remaining.length) this.scheduleOutboundDrain(500);
      } finally { this.outboundDrainRunning = false; }
    },

    async sendSelfTest() {
      if (!this.socket || this.status.state !== 'ready') throw new Error('WhatsApp não está conectado.');
      const jid = String(this.socket.user?.id || this.socket.user?.lid || '').trim();
      if (!jid) throw new Error('Não foi possível identificar a conta do bot para o teste.');
      const text = `✅ Teste de envio do HUB WhatsApp Bot\n\nServidor e fila persistente funcionando em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}.`;
      const result = await this.enqueueSend(this.socket, jid, { text }, undefined, { kind: 'health-test', priority: 100 });
      return { ok: true, jid, messageId: result?.key?.id || '' };
    }
  });
};
