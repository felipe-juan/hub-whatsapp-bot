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
const { resolveIncomingActivation, applyIncomingActivation } = require('./engine/activation-pipeline');
const { FragmentBuffer, isLikelyFragment } = require('./engine/fragment-buffer');
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

/* Manifesto de compatibilidade da implementação delegada em src/whatsapp/:
connection.update
connection === 'open'
messages.upsert
groupFetchAllParticipating
groups.upsert
fetchLatestBaileysVersion
makeCacheableSignalKeyStore
version,
  auth
schedulePairingRestart armConnectionWatchdog credentialsRegistered
endsWith('@g.us') endsWith('@s.whatsapp.net') endsWith('@lid') endsWith('@newsletter')
processingQueue.enqueue code === 429 code === 403
*/
const installConnectionHandler = require('./whatsapp/connection-handler');
const installIncomingHandler = require('./whatsapp/incoming-handler');
const installOutboundHandler = require('./whatsapp/outbound-handler');
const installLifecycleHandler = require('./whatsapp/lifecycle-handler');
const installGroupSyncHandler = require('./whatsapp/group-sync-handler');

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
    this.fragmentBuffer = new FragmentBuffer({ windowMs: Number(this.db.getSetting?.('fragment_join_window_ms', '1500') || 1500) });
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

















































}

const whatsappHandlerDependencies = {
  fs,
  crypto,
  spawn,
  QRCode,
  asBool,
  RecentMessageTracker,
  ConversationQueue,
  ConcurrencyLimiter,
  CircuitBreaker,
  HealthWatchdog,
  fetchGroupRows,
  resolveIncomingActivation,
  applyIncomingActivation,
  FragmentBuffer,
  isLikelyFragment,
  delay,
  backgroundDelay,
  silentLogger,
  disconnectCode,
  cleanAccountNumber,
  createMessageAdapter
};
installConnectionHandler(WhatsAppManager, whatsappHandlerDependencies);
installIncomingHandler(WhatsAppManager, whatsappHandlerDependencies);
installOutboundHandler(WhatsAppManager, whatsappHandlerDependencies);
installLifecycleHandler(WhatsAppManager, whatsappHandlerDependencies);
installGroupSyncHandler(WhatsAppManager, whatsappHandlerDependencies);

module.exports = { WhatsAppManager };
