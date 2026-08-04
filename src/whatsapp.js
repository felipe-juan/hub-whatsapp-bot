const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const QRCode = require('qrcode');
const { asBool } = require('./bot-engine');
const { RecentMessageTracker } = require('./message-tracker');
const { ConversationQueue } = require('./conversation-queue');
const { ConcurrencyLimiter } = require('./concurrency-limiter');
const { CircuitBreaker } = require('./circuit-breaker');
const { HealthWatchdog } = require('./health-watchdog');
const { fetchGroupRows } = require('./whatsapp/group-sync');
const { resolveGroupActivation } = require('./group-activation');
// groupFetchAllParticipating é encapsulado por fetchGroupRows para manter a integração Baileys isolada.

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const backgroundDelay = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

function silentLogger() {
  const logger = {};
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) logger[level] = () => {};
  logger.child = () => logger;
  logger.level = 'silent';
  return logger;
}

const { disconnectCode, cleanAccountNumber, createMessageAdapter } = require('./baileys-adapter');

class WhatsAppManager {
  constructor({ config, database, engine, realtime = null, writeQueue = null }) {
    this.config = config;
    this.db = database;
    this.engine = engine;
    this.realtime = realtime;
    this.writeQueue = writeQueue;
    this.socket = null;
    this.baileys = null;
    this.saveCreds = null;
    this.reconnectTimer = null;
    this.groupSyncTimer = null;
    this.periodicGroupSyncTimer = null;
    this.connectionWatchdogTimer = null;
    this.pairingRestartTimer = null;
    this.outboundDrainTimer = null;
    this.outboundDrainRunning = false;
    this.starting = false;
    this.manualStop = false;
    this.generation = 0;
    this.pairingRestartGeneration = 0;
    this.groupMetadataCache = new Map();
    this.socketBindings = new Map();
    this.messageTracker = new RecentMessageTracker();
    this.activeSendCount = 0;
    this.activeSendStarted = new Map();
    this.pendingLateSends = new Map();
    this.confirmedSendReconcileDelays = [250, 1500, 5000];
    this.acceptingMessages = true;
    this.shuttingDown = false;
    this.lastMessageReceivedAt = 0;
    this.lastSendCompletedAt = 0;
    this.lastSendProgressAt = Date.now();
    this.consecutiveSendErrors = 0;
    this.lastSqliteMaintenanceAt = 0;
    this.sqliteMaintenanceRunning = false;
    const maxConcurrent = Math.max(1, Math.min(32, Number(this.db.getSetting?.('max_concurrent_sends', '8') || 8)));
    this.processingQueue = new ConversationQueue(stats => {
      this.update({
        conversationQueueDepth: stats.queuedMessages,
        activeConversationCount: stats.activeConversations,
        trackedConversationCount: stats.trackedConversations,
        outboundQueueDepth: stats.queuedMessages,
        processingConcurrency: stats.maxConcurrent
      });
    }, { maxConcurrent, name: 'incoming-conversations' });
    this.recoveryQueue = new ConversationQueue(null, { maxConcurrent, name: 'recovered-deliveries' });
    this.textSendLimiter = new ConcurrencyLimiter({ maxConcurrent, name: 'whatsapp-text-sends', onChange: stats => {
      this.update({ outboundTextActive: stats.active, outboundTextWaiting: stats.queued, sendConcurrency: stats.maxConcurrent });
    } });
    const maxMediaConcurrent = Math.max(1, Math.min(8, Number(this.db.getSetting?.('max_concurrent_media_sends', '2') || 2)));
    this.mediaSendLimiter = new ConcurrencyLimiter({ maxConcurrent: maxMediaConcurrent, name: 'whatsapp-media-sends', onChange: stats => {
      this.update({ outboundMediaActive: stats.active, outboundMediaWaiting: stats.queued, mediaSendConcurrency: stats.maxConcurrent });
    } });
    // Compatibilidade com testes e integrações anteriores.
    this.sendLimiter = this.textSendLimiter;
    this.circuitBreaker = new CircuitBreaker({ failureThreshold: 3, baseCooldownMs: 15_000, maxCooldownMs: 5 * 60_000, onChange: stats => {
      this.outboundPausedUntil = stats.nextAttemptAt ? new Date(stats.nextAttemptAt).getTime() : 0;
      this.update({ circuitBreaker: stats, outboundPausedUntil: stats.nextAttemptAt || '' });
    } });
    const recoveredAtStartup = Number(this.db.recoverInterruptedOutboundDeliveries?.() || 0);
    if (recoveredAtStartup) this.engine?.performance?.increment?.('deliveries_recovered_after_restart', recoveredAtStartup);
    this.db.pruneOutboundDeliveries?.();
    this.db.pruneProcessedIncomingMessages?.(7);
    this.outboundPausedUntil = 0;
    this.consecutiveReconnects = 0;
    this.watchdog = new HealthWatchdog({
      getState: () => this.watchdogState(),
      recover: (level, reason, sample) => this.recoverHealth(level, reason, sample),
      onSample: sample => {
        this.engine?.performance?.observe?.('event_loop_p99_ms', sample.eventLoopP99Ms || 0);
        this.scheduleDatabaseMaintenance(sample);
        this.update({ watchdog: this.watchdog?.stats?.() || null });
      }
    });
    this.watchdog.start();
    this.status = {
      state: 'stopped',
      message: 'Aguardando inicialização',
      transport: 'Baileys · WebSocket',
      sessionMigrationRequired: false,
      qrDataUrl: null,
      accountName: '',
      accountNumber: '',
      lastError: '',
      readyAt: '',
      authenticatedAt: '',
      lastDisconnectedAt: '',
      reconnectCount: 0,
      forcedRestartCount: 0,
      connectionAttempt: 0,
      loadingPercent: 0,
      syncedGroupCount: 0,
      lastGroupSyncAt: '',
      groupSyncError: '',
      waVersion: '',
      waVersionSource: '',
      credentialsRegistered: false,
      lastConnectionEventAt: '',
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
      pendingLateSendCount: 0,
      lastMessageReceivedAt: '',
      lastSendCompletedAt: '',
      updatedAt: new Date().toISOString()
    };
  }

  update(patch) {
    this.status = { ...this.status, ...patch, updatedAt: new Date().toISOString() };
    this.realtime?.publish?.('whatsapp-status', { ...this.status, qrDataUrl: this.status.qrDataUrl ? '[available]' : null });
  }

  getStatus() { return { ...this.status, qrDataUrl: this.status.qrDataUrl }; }

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
  }


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
  }

  notifyDesktop(title, message) {
    try {
      const child = spawn('notify-send', [String(title || 'HUB Bot'), String(message || '')], { stdio: 'ignore', detached: true });
      child.unref?.();
    } catch {}
  }

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
  }


  clearConnectionTimers() {
    clearTimeout(this.connectionWatchdogTimer);
    clearTimeout(this.pairingRestartTimer);
    this.connectionWatchdogTimer = null;
    this.pairingRestartTimer = null;
  }

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
  }

  async loadBaileys() {
    if (!this.baileys) this.baileys = await import('@whiskeysockets/baileys');
    return this.baileys;
  }

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
  }

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
  }

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
  }

  bindSocketEvent(socket, eventName, handler) {
    socket.ev.on(eventName, handler);
    const bindings = this.socketBindings.get(socket) || [];
    bindings.push({ eventName, handler });
    this.socketBindings.set(socket, bindings);
  }

  cleanupSocketBindings(socket) {
    const bindings = this.socketBindings.get(socket) || [];
    for (const { eventName, handler } of bindings) {
      try { socket.ev?.off?.(eventName, handler); } catch {}
      try { socket.ev?.removeListener?.(eventName, handler); } catch {}
    }
    try { socket.ev?.removeAllListeners?.(); } catch {}
    this.socketBindings.delete(socket);
  }

  async initializeFileState() {
    try {
      const [legacy, current] = await Promise.all([
        this.config.legacyAuthDir ? fs.promises.stat(this.config.legacyAuthDir).then(() => true).catch(() => false) : false,
        fs.promises.stat(this.config.authDir).then(() => true).catch(() => false)
      ]);
      this.update({ sessionMigrationRequired: Boolean(legacy && !current) });
    } catch {}
  }

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
  }

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
  }

  rememberMessage(raw) { return this.messageTracker.remember(raw); }

  wasSeen(raw) { return this.messageTracker.has(raw); }

  messageTimestampMs(raw) {
    const value = raw?.messageTimestamp;
    const seconds = Number(typeof value?.toNumber === 'function' ? value.toNumber() : value || 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
  }

  isSupportedChatJid(jid) {
    const value = String(jid || '');
    if (!value || value === 'status@broadcast' || value.endsWith('@broadcast') || value.endsWith('@newsletter')) return false;
    return value.endsWith('@g.us') || value.endsWith('@s.whatsapp.net') || value.endsWith('@lid');
  }

  async handleMessages(socket, generation, event) {
    if (generation !== this.generation || socket !== this.socket || !this.acceptingMessages) return;
    if (!event || !['notify', 'append'].includes(event.type)) return;
    const processAppend = asBool(this.db.getSetting('process_append_messages', 'false'), false);
    const tasks = [];
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
      if (adapter.isGroup) {
        const activation = resolveGroupActivation(adapter);
        if (!activation.active) {
          this.engine?.performance?.increment?.('group_messages_without_activation_skipped');
          continue;
        }
        adapter.originalBody = adapter.body;
        adapter.body = activation.body;
        adapter.groupActivated = true;
        adapter.groupActivationMode = activation.mode;
      }
      if (adapter.isGroup && this.engine?.shouldProcessIncomingFast && !this.engine.shouldProcessIncomingFast(adapter)) {
        this.engine?.performance?.increment?.('group_messages_fast_skipped');
        continue;
      }
      const remoteJid = String(raw?.key?.remoteJid || adapter.from || '');
      const messageId = String(raw?.key?.id || adapter.messageId || '');
      if (this.db.claimIncomingMessage && !this.db.claimIncomingMessage(remoteJid, messageId)) {
        this.engine?.performance?.increment?.('incoming_duplicates_blocked');
        continue;
      }
      // Cada conversa possui sua própria fila: mensagens do mesmo grupo ou
      // privado mantêm a ordem de chegada, enquanto conversas diferentes são
      // processadas simultaneamente e sem intervalo artificial.
      const conversationId = String(raw?.key?.remoteJid || adapter.from || 'unknown');
      const queuedAt = performance.now();
      const receivedLatency = Math.max(0, Date.now() - this.messageTimestampMs(raw));
      this.engine?.performance?.observe?.('receive_transport_latency_ms', receivedLatency);
      tasks.push(this.processingQueue.enqueue(conversationId, async () => {
        this.engine?.performance?.observe?.('conversation_queue_wait_ms', performance.now() - queuedAt);
        try {
          const result = await this.engine.handle(adapter);
          this.db.completeIncomingMessage?.(remoteJid, messageId);
          return result;
        } catch (error) {
          this.db.failIncomingMessage?.(remoteJid, messageId, error);
          throw error;
        }
      }));
    }
    if (!tasks.length) return;
    const results = await Promise.allSettled(tasks);
    for (const result of results) if (result.status === 'rejected') {
      console.error('Erro ao processar uma mensagem do WhatsApp:', result.reason);
      this.update({ lastError: result.reason?.message || String(result.reason || 'erro ao processar mensagem') });
    }
  }

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
  }

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
  }

  serializeOutboundContent(jid, content, metadata = {}) {
    const payload = { jid: String(jid || ''), content: content || {}, metadata: { kind: metadata.kind || 'message', attachment: Boolean(metadata.attachment) } };
    JSON.stringify(payload);
    return payload;
  }

  outboundIdempotencyKey(jid, content, metadata = {}) {
    const source = String(metadata.sourceMessageId || 'manual');
    const sequence = Number(metadata.sequence || 0);
    const digest = crypto.createHash('sha256').update(JSON.stringify({ jid: String(jid || ''), source, sequence, content })).digest('hex');
    return `wa:${digest}`;
  }

  contentPriority(content, metadata = {}) {
    if (Number.isFinite(Number(metadata.priority))) return Number(metadata.priority);
    if (content?.text) return 100;
    if (content?.image || content?.document || content?.audio || content?.video) return 10;
    return 50;
  }

  temporarySendError(error, code = disconnectCode(error)) {
    if ([400, 401, 403, 404, 406, 415].includes(Number(code || 0))) return false;
    return true;
  }

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
  }

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
  }

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
  }

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
  }

  hasPendingLateSend(deliveryId) { return Boolean(this.pendingLateSends?.has(Number(deliveryId))); }

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
  }

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
  }

  scheduleOutboundDrain(delayMs = 1000) {
    clearTimeout(this.outboundDrainTimer);
    this.outboundDrainTimer = setTimeout(() => {
      this.outboundDrainTimer = null;
      this.drainOutboundDeliveries().catch(error => this.update({ lastError: `Falha ao recuperar envios: ${error.message}` }));
    }, Math.max(50, Number(delayMs || 0)));
    this.outboundDrainTimer.unref?.();
  }

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
  }

  async sendSelfTest() {
    if (!this.socket || this.status.state !== 'ready') throw new Error('WhatsApp não está conectado.');
    const jid = String(this.socket.user?.id || this.socket.user?.lid || '').trim();
    if (!jid) throw new Error('Não foi possível identificar a conta do bot para o teste.');
    const text = `✅ Teste de envio do HUB WhatsApp Bot\n\nServidor e fila persistente funcionando em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}.`;
    const result = await this.enqueueSend(this.socket, jid, { text }, undefined, { kind: 'health-test', priority: 100 });
    return { ok: true, jid, messageId: result?.key?.id || '' };
  }

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
  }

  async gracefulShutdown({ timeoutMs = 15_000, logout = false } = {}) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.acceptingMessages = false;
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
  }

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
  }

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
  }

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

  scheduleGroupSync(delayMs = 1500) {
    clearTimeout(this.groupSyncTimer);
    this.groupSyncTimer = setTimeout(() => {
      this.groupSyncTimer = null;
      if (this.status.state === 'ready') this.syncGroups().catch(error => this.update({ groupSyncError: error.message }));
    }, delayMs);
  }

  async syncGroupsWithRetry() {
    const delays = [0, 3000, 10000];
    let lastError = null;
    for (const wait of delays) {
      if (wait) await delay(wait);
      try { return await this.syncGroups(); } catch (error) { lastError = error; }
    }
    if (lastError) {
      this.update({ groupSyncError: lastError.message });
      console.warn('Não foi possível sincronizar grupos automaticamente:', lastError.message);
    }
    return 0;
  }

  async syncGroups() {
    if (!this.socket || this.status.state !== 'ready') throw new Error('WhatsApp ainda não está conectado.');
    const groups = await fetchGroupRows(this.socket);
    let count = 0;
    for (const item of groups) {
      const groupId = item.id;
      const name = item.name;
      // Guarde somente o necessário para o processamento de mensagens. Manter
      // a lista completa de participantes de todos os grupos aumenta o uso de
      // memória e o custo do GC sem ajudar na resposta do bot.
      this.groupMetadataCache.set(groupId, { id: groupId, subject: name });
      while (this.groupMetadataCache.size > 500) this.groupMetadataCache.delete(this.groupMetadataCache.keys().next().value);
      if (this.writeQueue?.upsertGroup) this.writeQueue.upsertGroup(groupId, name);
      else this.db.upsertGroup(groupId, name);
      count += 1;
    }
    this.update({ syncedGroupCount: count, lastGroupSyncAt: new Date().toISOString(), groupSyncError: '' });
    return count;
  }
}

module.exports = { WhatsAppManager };
