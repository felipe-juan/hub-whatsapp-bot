'use strict';

module.exports = function install(BotClass, deps) {
  const { fs, crypto, spawn, QRCode, asBool, RecentMessageTracker, ConversationQueue, ConcurrencyLimiter, CircuitBreaker, HealthWatchdog, fetchGroupRows, resolveIncomingActivation, applyIncomingActivation, FragmentBuffer, isLikelyFragment, delay, backgroundDelay, silentLogger, disconnectCode, cleanAccountNumber, createMessageAdapter } = deps;
  Object.assign(BotClass.prototype, {
    async closeSocket({ logout = false } = {}) {
      const socket = this.socket;
      if (this.socket === socket) this.socket = null;
      if (!socket) return;
      this.cleanupSocketBindings(socket);
      this.saveCreds = null;
      try {
        await Promise.race([
          logout ? socket.logout() : Promise.resolve(socket.end(new Error('encerramento solicitado'))),
          delay(1500)
        ]);
      } catch {}
      try { socket.ws?.close?.(); } catch {}
      try { socket.ws?.terminate?.(); } catch {}
      await delay(100);
    },

    async gracefulShutdown({ timeoutMs = 15_000, logout = false } = {}) {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      this.acceptingMessages = false;
      this.fragmentBuffer.clear();
      this.processingQueue.stopAccepting();
      this.update({ state: 'stopping', message: 'Concluindo envios antes de encerrar…' });
      const started = Date.now();
      const remaining = () => Math.max(0, Number(timeoutMs || 0) - (Date.now() - started));
      await this.processingQueue.whenIdle(remaining());
      this.recoveryQueue.stopAccepting();
      await this.recoveryQueue.whenIdle(remaining());
      this.textSendLimiter.stopAccepting();
      this.mediaSendLimiter.stopAccepting();
      await Promise.allSettled([this.textSendLimiter.whenIdle(remaining()), this.mediaSendLimiter.whenIdle(remaining())]);
      this.db.returnSendingDeliveriesToPending?.('serviço encerrado durante um envio; resultado desconhecido');
      this.db.flushUsageStats?.();
      this.db.maybeCheckpoint?.({ force: true, idleMs: 0 });
      await this.closeSocket({ logout });
    },

    async destroy() {
      this.manualStop = true;
      this.generation += 1;
      this.starting = false;
      this.clearTimers();
      this.watchdog.stop();
      await this.gracefulShutdown({ timeoutMs: 15_000 });
      this.processingQueue.close();
      this.recoveryQueue.close();
      this.update({ state: 'stopped', message: 'WhatsApp parado', qrDataUrl: null, loadingPercent: 0 });
    },

    async restart() {
      this.manualStop = true;
      this.generation += 1;
      this.starting = false;
      this.clearTimers();
      await this.closeSocket();
      this.circuitBreaker.reset();
      this.acceptingMessages = true;
      this.shuttingDown = false;
      this.processingQueue.resumeAccepting();
      this.recoveryQueue.resumeAccepting();
      this.textSendLimiter.resumeAccepting();
      this.mediaSendLimiter.resumeAccepting();
      this.update({ state: 'stopped', message: 'Reiniciando WhatsApp…', qrDataUrl: null, loadingPercent: 0 });
      await delay(700);
      this.manualStop = false;
      await this.start();
    },

    async logout() {
      // “Remover sessão” deve ser uma operação completa: encerra o socket antigo,
      // apaga as credenciais e inicia imediatamente uma conexão limpa para que um
      // novo QR code seja gerado. Deixar o estado em `stopped` obrigava o usuário
      // a descobrir e executar uma segunda ação manualmente.
      this.manualStop = true;
      this.generation += 1;
      this.starting = false;
      this.clearTimers();
      this.update({
        state: 'resetting',
        message: 'Removendo a sessão e preparando um novo QR code…',
        qrDataUrl: null,
        accountName: '',
        accountNumber: '',
        credentialsRegistered: false,
        lastError: '',
        loadingPercent: 10
      });
    
      await this.closeSocket({ logout: true });
    
      try {
        await fs.promises.rm(this.config.authDir, { recursive: true, force: true });
        await fs.promises.mkdir(this.config.authDir, { recursive: true });
      } catch (error) {
        this.update({
          state: 'error',
          message: 'Não foi possível limpar a sessão do WhatsApp',
          lastError: error.message,
          loadingPercent: 0
        });
        throw error;
      }
    
      this.saveCreds = null;
      this.groupMetadataCache.clear();
      this.messageTracker.clear();
      this.pairingRestartGeneration = 0;
      this.update({
        state: 'resetting',
        message: 'Sessão removida; iniciando uma conexão limpa…',
        qrDataUrl: null,
        accountName: '',
        accountNumber: '',
        authenticatedAt: '',
        readyAt: '',
        credentialsRegistered: false,
        lastDisconnectCode: 0,
        outboundQueueDepth: 0,
        outboundActiveSends: 0,
        outboundWaitingSends: 0,
        sendConcurrency: this.textSendLimiter.stats().maxConcurrent,
        mediaSendConcurrency: this.mediaSendLimiter.stats().maxConcurrent,
        outboundTextActive: 0, outboundTextWaiting: 0, outboundMediaActive: 0, outboundMediaWaiting: 0,
        processingConcurrency: this.processingQueue.stats().maxConcurrent,
        conversationQueueDepth: 0,
        activeConversationCount: 0,
        trackedConversationCount: 0,
        outboundPausedUntil: '',
        consecutiveReconnects: 0,
        circuitBreaker: this.circuitBreaker.stats(),
        watchdog: null,
        persistentDeliveries: this.db.outboundDeliveryStats?.() || {},
        loadingPercent: 20
      });
    
      // Pequeno intervalo para o sistema liberar arquivos/sockets antes de criar
      // a nova instância. Em seguida, a própria ação gera o novo QR.
      await delay(700);
      this.manualStop = false;
      this.circuitBreaker.reset();
      this.acceptingMessages = true;
      this.shuttingDown = false;
      this.processingQueue.resumeAccepting();
      this.recoveryQueue.resumeAccepting();
      this.textSendLimiter.resumeAccepting();
      this.mediaSendLimiter.resumeAccepting();
      await this.start();
    }
  });
};
