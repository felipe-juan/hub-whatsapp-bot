'use strict';

module.exports = function install(BotClass, deps) {
  const { fs, crypto, spawn, QRCode, asBool, RecentMessageTracker, ConversationQueue, ConcurrencyLimiter, CircuitBreaker, HealthWatchdog, fetchGroupRows, resolveIncomingActivation, applyIncomingActivation, FragmentBuffer, isLikelyFragment, delay, backgroundDelay, silentLogger, disconnectCode, cleanAccountNumber, createMessageAdapter } = deps;
  Object.assign(BotClass.prototype, {
    watchdogState() {
      const outbound = this.db.outboundHealth?.() || {};
      const oldestActive = this.activeSendStarted.size ? Math.min(...this.activeSendStarted.values()) : 0;
      const databaseOk = this.db.healthCheck?.().ok !== false;
      return {
        whatsappState: this.status.state,
        databaseOk,
        dueDeliveries: Number(outbound.due || 0),
        oldestActiveSendMs: oldestActive ? Date.now() - oldestActive : 0,
        msSinceLastSendProgress: Date.now() - Number(this.lastSendProgressAt || Date.now()),
        consecutiveSendErrors: this.consecutiveSendErrors,
        processingQueue: this.processingQueue.stats(),
        sendLimiter: this.textSendLimiter.stats(),
        mediaSendLimiter: this.mediaSendLimiter.stats(),
        circuitBreaker: this.circuitBreaker.stats()
      };
    },

    scheduleDatabaseMaintenance(sample = {}) {
      const now = Date.now();
      if (this.sqliteMaintenanceRunning || now - this.lastSqliteMaintenanceAt < 6 * 60 * 60_000) return;
      const busy = this.processingQueue.stats().queuedMessages > 0
        || this.textSendLimiter.stats().active > 0
        || this.mediaSendLimiter.stats().active > 0
        || Number(sample.eventLoopP99Ms || 0) > 100;
      if (busy) return;
      this.sqliteMaintenanceRunning = true;
      const weeklyAnalyze = !this.lastSqliteMaintenanceAt || now - this.lastSqliteMaintenanceAt > 7 * 24 * 60 * 60_000;
      const task = this.writeQueue?.optimize
        ? this.writeQueue.optimize({ force: false, analyze: weeklyAnalyze, maxWalFrames: 4096 })
        : Promise.resolve(this.db.maybeCheckpoint?.({ force: false }) || {});
      Promise.resolve(task).then(result => {
        this.lastSqliteMaintenanceAt = Date.now();
        this.db.pruneProcessedIncomingMessages?.(7);
        this.update({ lastDatabaseMaintenanceAt: new Date(this.lastSqliteMaintenanceAt).toISOString(), databaseMaintenance: result });
      }).catch(error => {
        this.update({ databaseMaintenanceError: error.message });
      }).finally(() => { this.sqliteMaintenanceRunning = false; });
    },

    notifyDesktop(title, message) {
      try {
        const child = spawn('notify-send', [String(title || 'HUB Bot'), String(message || '')], { stdio: 'ignore', detached: true });
        child.unref?.();
      } catch {}
    },

    async recoverHealth(level, reason) {
      this.update({ lastError: `Watchdog: ${reason}`, watchdogRecoveryLevel: level });
      if (level === 1) {
        // Nível 1: renova atividade sem destruir a sessão.
        this.scheduleOutboundDrain(50);
        try { await this.socket?.sendPresenceUpdate?.('available'); } catch {}
        this.db.maybeCheckpoint?.({ force: false });
        return;
      }
      if (level === 2) {
        // Nível 2: recria apenas o socket Baileys.
        this.notifyDesktop('HUB Bot recuperando conexão', reason);
        await this.restart();
        return;
      }
      if (level === 3) {
        // Nível 3: força a recarga do módulo e usa o ciclo completo de reinício.
        // Chamar start() diretamente não funcionava quando o estado ainda era
        // ready/recovering, pois start() encerrava sem recriar o socket.
        this.baileys = null;
        this.saveCreds = null;
        await this.restart();
        return;
      }
      if (level === 4) {
        // Nível 4: encerra de forma controlada; o systemd reinicia o núcleo.
        this.notifyDesktop('HUB Bot reiniciando serviço', `${reason}. Reinício controlado pelo systemd.`);
        setTimeout(() => process.kill(process.pid, 'SIGTERM'), 250).unref?.();
        return;
      }
      // Nível 5: alerta persistente antes de uma última reinicialização.
      this.notifyDesktop('HUB Bot exige atenção', `${reason}. O serviço será reiniciado; consulte o diagnóstico local.`);
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 750).unref?.();
    },

    clearConnectionTimers() {
      clearTimeout(this.connectionWatchdogTimer);
      clearTimeout(this.pairingRestartTimer);
      this.connectionWatchdogTimer = null;
      this.pairingRestartTimer = null;
    },

    clearTimers() {
      clearTimeout(this.reconnectTimer);
      clearTimeout(this.groupSyncTimer);
      clearInterval(this.periodicGroupSyncTimer);
      this.clearConnectionTimers();
      clearTimeout(this.outboundDrainTimer);
      this.outboundDrainTimer = null;
      this.outboundDrainRunning = false;
      this.reconnectTimer = null;
      this.groupSyncTimer = null;
      this.periodicGroupSyncTimer = null;
    },

    async loadBaileys() {
      if (!this.baileys) this.baileys = await import('@whiskeysockets/baileys');
      return this.baileys;
    },

    async resolveWaVersion(baileys) {
      const configuredFallback = baileys.DEFAULT_CONNECTION_CONFIG?.version;
      const fallback = Array.isArray(configuredFallback) && configuredFallback.length === 3
        ? configuredFallback.map(Number)
        : [2, 3000, 1032141294];
    
      if (typeof baileys.fetchLatestBaileysVersion !== 'function') {
        return { version: fallback, source: 'biblioteca' };
      }
    
      let timeout;
      try {
        const result = await Promise.race([
          baileys.fetchLatestBaileysVersion(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('tempo limite ao consultar a versão do WhatsApp Web')), 12_000);
          })
        ]);
        const version = Array.isArray(result?.version) ? result.version.map(Number) : null;
        if (!version || version.length !== 3 || version.some(value => !Number.isFinite(value))) {
          throw new Error('versão recebida em formato inválido');
        }
        return { version, source: result?.isLatest === false ? 'consultada (não confirmada como mais recente)' : 'consultada' };
      } catch (error) {
        console.warn(`Não foi possível consultar a versão atual do WhatsApp Web: ${error.message}. Usando versão de contingência ${fallback.join('.')}.`);
        return { version: fallback, source: 'contingência' };
      } finally {
        clearTimeout(timeout);
      }
    },

    armConnectionWatchdog(socket, generation, timeoutMs = 70_000) {
      clearTimeout(this.connectionWatchdogTimer);
      this.connectionWatchdogTimer = setTimeout(() => {
        if (generation !== this.generation || socket !== this.socket || this.manualStop) return;
        if (!['connecting', 'authenticated', 'starting'].includes(this.status.state)) return;
        const registered = Boolean(socket.authState?.creds?.registered || this.status.credentialsRegistered);
        const reason = registered
          ? 'A sessão foi pareada, mas o WhatsApp não abriu a conexão dentro do tempo esperado.'
          : 'O WhatsApp não concluiu a conexão dentro do tempo esperado.';
        this.update({
          state: 'recovering',
          message: `${reason} Reiniciando a conexão automaticamente…`,
          lastError: reason,
          loadingPercent: registered ? 90 : 50,
          forcedRestartCount: Number(this.status.forcedRestartCount || 0) + 1
        });
        this.restart().catch(error => {
          console.error('Falha na recuperação automática do WhatsApp:', error);
          this.update({ state: 'error', message: 'Falha ao recuperar a conexão do WhatsApp', lastError: error.message, loadingPercent: 0 });
        });
      }, timeoutMs);
    },

    schedulePairingRestart(socket, generation) {
      if (this.pairingRestartGeneration === generation || this.manualStop) return;
      this.pairingRestartGeneration = generation;
      clearTimeout(this.pairingRestartTimer);
      this.pairingRestartTimer = setTimeout(() => {
        if (generation !== this.generation || socket !== this.socket || this.status.state === 'ready' || this.manualStop) return;
        this.update({
          state: 'authenticated',
          message: 'Pareamento concluído; reiniciando a conexão para ativar a nova sessão…',
          qrDataUrl: null,
          authenticatedAt: this.status.authenticatedAt || new Date().toISOString(),
          credentialsRegistered: true,
          loadingPercent: 90,
          forcedRestartCount: Number(this.status.forcedRestartCount || 0) + 1
        });
        this.restart().catch(error => {
          console.error('Falha ao reiniciar após o pareamento:', error);
          this.update({ state: 'error', message: 'Falha ao ativar a sessão pareada', lastError: error.message, loadingPercent: 0 });
        });
      }, 3_000);
    },

    bindSocketEvent(socket, eventName, handler) {
      socket.ev.on(eventName, handler);
      const bindings = this.socketBindings.get(socket) || [];
      bindings.push({ eventName, handler });
      this.socketBindings.set(socket, bindings);
    },

    cleanupSocketBindings(socket) {
      const bindings = this.socketBindings.get(socket) || [];
      for (const { eventName, handler } of bindings) {
        try { socket.ev?.off?.(eventName, handler); } catch {}
        try { socket.ev?.removeListener?.(eventName, handler); } catch {}
      }
      try { socket.ev?.removeAllListeners?.(); } catch {}
      this.socketBindings.delete(socket);
    },

    async initializeFileState() {
      try {
        const [legacy, current] = await Promise.all([
          this.config.legacyAuthDir ? fs.promises.stat(this.config.legacyAuthDir).then(() => true).catch(() => false) : false,
          fs.promises.stat(this.config.authDir).then(() => true).catch(() => false)
        ]);
        this.update({ sessionMigrationRequired: Boolean(legacy && !current) });
      } catch {}
    },

    async createSocket(generation) {
      const baileys = await this.loadBaileys();
      await fs.promises.mkdir(this.config.authDir, { recursive: true });
      const { state, saveCreds } = await baileys.useMultiFileAuthState(this.config.authDir);
      this.saveCreds = saveCreds;
      const logger = silentLogger();
      const { version, source } = await this.resolveWaVersion(baileys);
      const registeredAtStart = Boolean(state.creds?.registered);
    
      this.update({
        waVersion: version.join('.'),
        waVersionSource: source,
        credentialsRegistered: registeredAtStart,
        connectionAttempt: Number(this.status.connectionAttempt || 0) + 1
      });
    
      const auth = {
        creds: state.creds,
        keys: typeof baileys.makeCacheableSignalKeyStore === 'function'
          ? baileys.makeCacheableSignalKeyStore(state.keys, logger)
          : state.keys
      };
    
      const socket = baileys.default({
        version,
        auth,
        logger,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 45_000,
        defaultQueryTimeoutMs: undefined,
        retryRequestDelayMs: 500,
        keepAliveIntervalMs: 20_000,
        qrTimeout: 60_000,
        cachedGroupMetadata: async jid => this.groupMetadataCache.get(jid),
        shouldIgnoreJid: jid => jid === 'status@broadcast' || String(jid || '').endsWith('@newsletter'),
        getMessage: async key => this.messageTracker.getMessage(key) || baileys.proto?.Message?.create?.({})
      });
      this.socket = socket;
    
      this.bindSocketEvent(socket, 'creds.update', async () => {
        try {
          await saveCreds();
          const registered = Boolean(state.creds?.registered || socket.authState?.creds?.registered);
          if (registered) {
            this.update({
              credentialsRegistered: true,
              authenticatedAt: this.status.authenticatedAt || new Date().toISOString(),
              qrDataUrl: null,
              state: this.status.state === 'ready' ? 'ready' : 'authenticated',
              message: this.status.state === 'ready' ? this.status.message : 'Dispositivo pareado; finalizando a ativação da sessão…',
              loadingPercent: this.status.state === 'ready' ? 100 : 85
            });
            if (!registeredAtStart) this.schedulePairingRestart(socket, generation);
          }
        } catch (error) {
          this.update({ lastError: `Falha ao salvar a sessão: ${error.message}` });
        }
      });
    
      this.bindSocketEvent(socket, 'connection.update', update => {
        this.handleConnectionUpdate(socket, generation, update).catch(error => {
          console.error('Falha ao processar estado do WhatsApp:', error);
          this.update({ state: 'error', message: 'Falha ao processar a conexão', lastError: error.message });
        });
      });
    
      this.bindSocketEvent(socket, 'messages.upsert', event => {
        this.handleMessages(socket, generation, event).catch(error => {
          console.error('Erro ao processar mensagens do WhatsApp:', error);
          this.update({ lastError: error.message });
        });
      });
    
      for (const eventName of ['groups.upsert', 'groups.update']) {
        this.bindSocketEvent(socket, eventName, () => this.scheduleGroupSync(2000));
      }
      // Entrada/saída de participantes não altera nome, ID nem permissões locais
      // do grupo. Sincronizar todos os grupos a cada evento desse tipo é muito
      // caro em grupos com centenas de pessoas.
      this.bindSocketEvent(socket, 'group-participants.update', () => {
        this.engine?.performance?.increment?.('group_participant_updates_ignored_for_sync');
      });
    
      this.armConnectionWatchdog(socket, generation);
      return socket;
    },

    async handleConnectionUpdate(socket, generation, update) {
      if (generation !== this.generation || socket !== this.socket) return;
      const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update || {};
      const registeredNow = Boolean(socket.authState?.creds?.registered || this.status.credentialsRegistered);
      console.log(`[WhatsApp] evento=${connection || (qr ? 'qr' : 'atualização')} pareada=${registeredNow ? 'sim' : 'não'} nova=${isNewLogin ? 'sim' : 'não'}`);
      this.update({ lastConnectionEventAt: new Date().toISOString() });
    
      if (qr) {
        this.clearConnectionTimers();
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
          this.update({ state: 'qr', message: 'Leia o QR code com o celular do bot', qrDataUrl, lastError: '', loadingPercent: 0 });
        } catch (error) {
          this.update({ state: 'qr', message: 'Novo QR code disponível; atualize o painel', qrDataUrl: null, lastError: error.message, loadingPercent: 0 });
        }
        return;
      }
    
      if (isNewLogin) {
        this.update({
          state: 'authenticated',
          message: 'Dispositivo vinculado; ativando a sessão',
          qrDataUrl: null,
          authenticatedAt: new Date().toISOString(),
          credentialsRegistered: true,
          loadingPercent: 80
        });
        this.schedulePairingRestart(socket, generation);
      }
    
      if (connection === 'connecting') {
        const registered = Boolean(socket.authState?.creds?.registered || this.status.credentialsRegistered);
        this.update({
          state: registered ? 'authenticated' : 'connecting',
          message: registered ? 'Sessão pareada; conectando novamente ao WhatsApp…' : 'Conectando ao WhatsApp por WebSocket…',
          qrDataUrl: null,
          credentialsRegistered: registered,
          loadingPercent: registered ? 85 : 50
        });
        this.armConnectionWatchdog(socket, generation, registered ? 45_000 : 70_000);
        return;
      }
    
      if (connection === 'open') {
        this.clearConnectionTimers();
        const accountName = String(socket.user?.name || '');
        const accountNumber = cleanAccountNumber(socket.user?.id || socket.user?.lid || '');
        this.update({
          state: 'ready',
          message: 'WhatsApp conectado',
          qrDataUrl: null,
          accountName,
          accountNumber,
          lastError: '',
          readyAt: new Date().toISOString(),
          loadingPercent: 100,
          credentialsRegistered: true,
          sessionMigrationRequired: false,
          consecutiveReconnects: 0
        });
        this.consecutiveReconnects = 0;
        console.log(`WhatsApp conectado como ${accountName || accountNumber || 'conta do bot'} (Baileys/WebSocket, WA ${this.status.waVersion}).`);
        this.scheduleOutboundDrain(100);
        // A sincronização completa pode transferir metadados de grupos com
        // centenas de participantes. Ela não deve bloquear o início do
        // processamento nem o envio de respostas.
        this.syncGroupsWithRetry().catch(error => this.update({ groupSyncError: error.message }));
        clearInterval(this.periodicGroupSyncTimer);
        this.periodicGroupSyncTimer = setInterval(() => {
          if (this.status.state === 'ready') this.syncGroups().catch(error => this.update({ groupSyncError: error.message }));
        }, 6 * 60 * 60 * 1000);
        return;
      }
    
      if (receivedPendingNotifications && this.status.state !== 'ready') {
        this.update({ message: 'Recebendo mensagens pendentes do WhatsApp…', loadingPercent: 90 });
      }
    
      if (connection === 'close') {
        const error = lastDisconnect?.error;
        const code = disconnectCode(error);
        const loggedOut = code === Number(this.baileys?.DisconnectReason?.loggedOut || 401);
        console.warn(`[WhatsApp] conexão encerrada${code ? ` com código ${code}` : ''}: ${String(error?.message || error || 'sem detalhe')}`);
        this.clearTimers();
        this.cleanupSocketBindings(socket);
        if (this.socket === socket) this.socket = null;
        this.update({
          state: loggedOut ? 'logged_out' : 'disconnected',
          message: loggedOut ? 'Sessão encerrada pelo WhatsApp. Remova a sessão e vincule novamente.' : `WhatsApp desconectado${code ? ` (código ${code})` : ''}`,
          lastError: String(error?.message || error || 'Conexão encerrada'),
          qrDataUrl: null,
          lastDisconnectedAt: new Date().toISOString(),
          lastDisconnectCode: code,
          loadingPercent: 0
        });
        if (!loggedOut && !this.manualStop) {
          // 515 é a reinicialização esperada logo após o pareamento. Códigos de
          // limitação/autorização recebem uma pausa longa, evitando reconexões
          // agressivas. Os demais usam backoff exponencial.
          if (code === 515) this.scheduleReconnect(700);
          else if (code === 429) this.scheduleReconnect(15 * 60 * 1000);
          else if (code === 403) this.scheduleReconnect(60 * 60 * 1000);
          else this.scheduleReconnect();
        }
      }
    },

    async start() {
      if (this.starting || ['ready', 'qr', 'connecting', 'authenticated', 'recovering', 'starting'].includes(this.status.state)) return;
      this.starting = true;
      this.manualStop = false;
      this.acceptingMessages = true;
      this.shuttingDown = false;
      await this.initializeFileState();
      const generation = ++this.generation;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.update({ state: 'starting', message: 'Iniciando conexão do WhatsApp', lastError: '', loadingPercent: 10 });
      try {
        const socket = await this.createSocket(generation);
        if (generation !== this.generation) {
          this.cleanupSocketBindings(socket);
          try { socket.end(new Error('instância substituída')); } catch {}
          try { socket.ws?.terminate?.(); } catch {}
          return;
        }
        this.socket = socket;
      } catch (error) {
        if (generation !== this.generation) return;
        console.error('Falha ao iniciar WhatsApp:', error);
        this.update({ state: 'error', message: 'Falha ao iniciar a conexão do WhatsApp', lastError: error.message, qrDataUrl: null, loadingPercent: 0 });
        this.scheduleReconnect();
      } finally {
        if (generation === this.generation) this.starting = false;
      }
    },

    scheduleReconnect(delayMs = null) {
      const auto = asBool(this.db.getSetting('auto_reconnect', 'true'), true);
      if (!auto || this.manualStop || this.reconnectTimer) return;
      const explicit = Number(delayMs);
      const computed = Number.isFinite(explicit) && explicit >= 0
        ? explicit
        : Math.min(15 * 60_000, 5_000 * (2 ** Math.min(this.consecutiveReconnects, 8)));
      this.consecutiveReconnects += 1;
      this.engine?.performance?.increment?.('reconnects_scheduled');
      this.update({
        reconnectCount: Number(this.status.reconnectCount || 0) + 1,
        consecutiveReconnects: this.consecutiveReconnects,
        message: `${this.status.message || 'WhatsApp desconectado'} Nova tentativa em ${Math.ceil(computed / 1000)}s.`
      });
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.restart().catch(error => {
          console.error('Falha ao reconectar o WhatsApp:', error);
          this.update({ state: 'error', message: 'Falha ao reconectar o WhatsApp', lastError: error.message, loadingPercent: 0 });
        });
      }, computed);
    }
  });
};
