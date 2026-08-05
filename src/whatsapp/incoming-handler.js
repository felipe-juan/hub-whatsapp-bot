'use strict';

module.exports = function install(BotClass, deps) {
  const { fs, crypto, spawn, QRCode, asBool, RecentMessageTracker, ConversationQueue, ConcurrencyLimiter, CircuitBreaker, HealthWatchdog, fetchGroupRows, resolveIncomingActivation, applyIncomingActivation, FragmentBuffer, isLikelyFragment, delay, backgroundDelay, silentLogger, disconnectCode, cleanAccountNumber, createMessageAdapter } = deps;
  Object.assign(BotClass.prototype, {
    rememberMessage(raw) { return this.messageTracker.remember(raw); },

    wasSeen(raw) { return this.messageTracker.has(raw); },

    messageTimestampMs(raw) {
      const value = raw?.messageTimestamp;
      const seconds = Number(typeof value?.toNumber === 'function' ? value.toNumber() : value || 0);
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
    },

    isSupportedChatJid(jid) {
      const value = String(jid || '');
      if (!value || value === 'status@broadcast' || value.endsWith('@broadcast') || value.endsWith('@newsletter')) return false;
      return value.endsWith('@g.us') || value.endsWith('@s.whatsapp.net') || value.endsWith('@lid');
    },

    fragmentKey(adapter, raw) {
      const conversation = String(raw?.key?.remoteJid || adapter?.from || 'unknown');
      const participant = String(raw?.key?.participant || adapter?.authorId || adapter?.participant || adapter?.from || 'unknown');
      return `${conversation}::${participant}`;
    },

    enqueueIncomingItems(items = []) {
      const valid = items.filter(Boolean);
      if (!valid.length) return Promise.resolve(null);
      const first = valid[0];
      const adapter = first.adapter;
      if (valid.length > 1) {
        adapter.body = valid.map(item => String(item.adapter?.body || '').trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
        adapter.originalBody = valid.map(item => String(item.adapter?.originalBody || item.adapter?.body || '').trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
        adapter.fragmentCount = valid.length;
        adapter.fragmentMessageIds = valid.map(item => item.messageId).filter(Boolean);
        adapter.groupActivationMode = adapter.groupActivationMode || 'fragment-joined';
      }
      if (adapter.isGroup && this.engine?.shouldProcessIncomingFast && !this.engine.shouldProcessIncomingFast(adapter)) {
        this.engine?.performance?.increment?.('group_messages_fast_skipped');
        for (const item of valid) this.db.completeIncomingMessage?.(item.remoteJid, item.messageId);
        return Promise.resolve(null);
      }
      const conversationId = first.conversationId;
      const queuedAt = performance.now();
      return this.processingQueue.enqueue(conversationId, async () => {
        this.engine?.performance?.observe?.('conversation_queue_wait_ms', performance.now() - queuedAt);
        try {
          const result = await this.engine.handle(adapter);
          for (const item of valid) this.db.completeIncomingMessage?.(item.remoteJid, item.messageId);
          return result;
        } catch (error) {
          for (const item of valid) this.db.failIncomingMessage?.(item.remoteJid, item.messageId, error);
          throw error;
        }
      });
    },

    async handleMessages(socket, generation, event) {
      if (generation !== this.generation || socket !== this.socket || !this.acceptingMessages) return;
      if (!event || !['notify', 'append'].includes(event.type)) return;
      const processAppend = asBool(this.db.getSetting('process_append_messages', 'false'), false);
      const fragmentEnabled = asBool(this.db.getSetting('fragment_join_enabled', 'true'), true);
      const tasks = [];
      const reportFailure = error => {
        console.error('Erro ao processar uma mensagem do WhatsApp:', error);
        this.update({ lastError: error?.message || String(error || 'erro ao processar mensagem') });
      };
      for (const raw of event.messages || []) {
        if (!raw?.message || raw?.key?.fromMe || !this.isSupportedChatJid(raw?.key?.remoteJid)) continue;
        if (event.type === 'append' && !processAppend) { this.rememberMessage(raw); continue; }
        if (event.type === 'append' && Date.now() - this.messageTimestampMs(raw) > 2 * 60 * 1000) continue;
        if (this.wasSeen(raw)) continue;
        this.rememberMessage(raw);
        this.lastMessageReceivedAt = Date.now();
        this.update({ lastMessageReceivedAt: new Date(this.lastMessageReceivedAt).toISOString() });
        const adapter = createMessageAdapter({ raw, socket, metadataCache: this.groupMetadataCache, sendMessage: (jid, content, options, metadata) => this.enqueueSend(socket, jid, content, options, metadata) });
        if (!adapter.body) continue;
        const fragmentKey = this.fragmentKey(adapter, raw);
        const activation = resolveIncomingActivation(adapter, { engine: this.engine, fragmentPending: fragmentEnabled && this.fragmentBuffer.has(fragmentKey) });
        if (activation.isGroup && !activation.active) {
          this.engine?.performance?.increment?.('group_messages_without_activation_skipped');
          continue;
        }
        applyIncomingActivation(adapter, activation);
        const remoteJid = String(raw?.key?.remoteJid || adapter.from || '');
        const messageId = String(raw?.key?.id || adapter.messageId || '');
        if (this.db.claimIncomingMessage && !this.db.claimIncomingMessage(remoteJid, messageId)) {
          this.engine?.performance?.increment?.('incoming_duplicates_blocked');
          continue;
        }
        const conversationId = String(raw?.key?.remoteJid || adapter.from || 'unknown');
        const receivedLatency = Math.max(0, Date.now() - this.messageTimestampMs(raw));
        this.engine?.performance?.observe?.('receive_transport_latency_ms', receivedLatency);
        const item = { adapter, raw, remoteJid, messageId, conversationId };
        const shouldBuffer = fragmentEnabled && (this.fragmentBuffer.has(fragmentKey) || isLikelyFragment(adapter.body));
        if (shouldBuffer) {
          this.fragmentBuffer.push(fragmentKey, item, {
            windowMs: Number(this.db.getSetting('fragment_join_window_ms', '1500') || 1500),
            flush: buffered => this.enqueueIncomingItems(buffered).catch(reportFailure)
          });
          continue;
        }
        tasks.push(this.enqueueIncomingItems([item]));
      }
      if (!tasks.length) return;
      const results = await Promise.allSettled(tasks);
      for (const result of results) if (result.status === 'rejected') reportFailure(result.reason);
    }
  });
};
