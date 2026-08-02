const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const os = require('node:os');

function databaseWriterError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

class DatabaseWriteQueue {
  constructor({ dbPath, workerPath = path.join(__dirname, 'database-write-worker.js'), realtime = null } = {}) {
    this.dbPath = dbPath;
    this.workerPath = workerPath;
    this.realtime = realtime;
    this.worker = null;
    this.pending = new Map();
    this.closed = false;
    this.restartTimer = null;
    this.logBuffer = [];
    this.usageBuffer = new Map();
    this.groupBuffer = new Map();
    this.droppedLogs = 0;
    this.flushTimer = setInterval(() => this.flush().catch(error => console.warn('Falha ao gravar lote no SQLite:', error.message)), 1000);
    this.flushTimer.unref?.();
    this.start();
  }

  start() {
    if (this.closed || this.worker) return;
    const worker = fork(this.workerPath, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, HUB_DB_PATH: this.dbPath, HUB_DB_WRITER: '1' } });
    this.worker = worker;
    try { os.setPriority(worker.pid, 0); } catch {}
    worker.on('message', message => this.handleMessage(message));
    worker.once('exit', (code, signal) => {
      if (this.worker === worker) this.worker = null;
      const error = databaseWriterError('DB_WRITER_OUTCOME_UNKNOWN', `Processo de escrita SQLite encerrado${code !== null ? ` (${code})` : signal ? ` por ${signal}` : ''}; o resultado de operações pendentes é desconhecido.`);
      for (const [id, request] of this.pending) { clearTimeout(request.timer); request.reject(error); this.pending.delete(id); }
      this.realtime?.publish?.('database-writer', { state: 'stopped', error: error.message });
      if (!this.closed) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this.start(), 1000);
        this.restartTimer.unref?.();
      }
    });
    this.realtime?.publish?.('database-writer', { state: 'ready', pid: worker.pid });
  }

  handleMessage(message) {
    if (message?.kind !== 'response') return;
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(databaseWriterError('DB_WRITER_OPERATION_FAILED', String(message.error).split('\n')[0]));
    else request.resolve(message.result);
  }

  request(type, payload = {}, timeoutMs = 15_000) {
    if (this.closed) return Promise.reject(databaseWriterError('DB_WRITER_CLOSED', 'Fila de escrita encerrada.'));
    this.start();
    const worker = this.worker;
    if (!worker?.connected) return Promise.reject(databaseWriterError('DB_WRITER_UNAVAILABLE', 'Processo de escrita ainda não está disponível.'));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const fail = error => {
        const request = this.pending.get(id);
        if (!request) return;
        this.pending.delete(id);
        clearTimeout(request.timer);
        reject(error);
      };
      const timer = setTimeout(() => fail(databaseWriterError('DB_WRITER_OUTCOME_UNKNOWN', `Tempo limite na escrita SQLite: ${type}. O resultado da operação é desconhecido.`)), timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, type });
      try {
        worker.send({ kind: 'request', id, type, payload }, error => {
          if (error) fail(databaseWriterError('DB_WRITER_UNAVAILABLE', `Não foi possível enviar a operação SQLite: ${type}.`, error));
        });
      } catch (error) {
        fail(databaseWriterError('DB_WRITER_UNAVAILABLE', `Não foi possível enviar a operação SQLite: ${type}.`, error));
      }
    });
  }

  addLog(log) {
    this.logBuffer.push({ ...log, createdAt: new Date().toISOString() });
    if (this.logBuffer.length > 1000) { const excess = this.logBuffer.length - 1000; this.logBuffer.splice(0, excess); this.droppedLogs += excess; }
    if (this.logBuffer.length >= 50) this.flushLogs().catch(() => {});
  }

  recordUsage(topic, matchType) {
    const day = new Date().toISOString().slice(0, 10);
    const safeTopic = String(topic || 'Outros').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Outros';
    const safeType = String(matchType || 'other').slice(0, 40);
    const key = JSON.stringify([day, safeTopic, safeType]);
    this.usageBuffer.set(key, Number(this.usageBuffer.get(key) || 0) + 1);
  }

  upsertGroup(whatsappId, name) {
    this.groupBuffer.set(String(whatsappId || ''), { whatsappId: String(whatsappId || ''), name: String(name || ''), seenAt: new Date().toISOString() });
  }

  async flushLogs() {
    if (!this.logBuffer.length) return 0;
    const logs = this.logBuffer.splice(0, 100);
    try { await this.request('logs.batch', { logs }); return logs.length; }
    catch (error) { this.logBuffer.unshift(...logs); throw error; }
  }

  async flushUsage() {
    if (!this.usageBuffer.size) return 0;
    const entries = [...this.usageBuffer.entries()];
    this.usageBuffer.clear();
    const rows = entries.map(([key, count]) => { const [day, topic, matchType] = JSON.parse(key); return { day, topic, matchType, count }; });
    try { await this.request('usage.batch', { rows }); return rows.length; }
    catch (error) { for (const [key, count] of entries) this.usageBuffer.set(key, Number(this.usageBuffer.get(key) || 0) + count); throw error; }
  }

  async flushGroups() {
    if (!this.groupBuffer.size) return 0;
    const groups = [...this.groupBuffer.values()];
    this.groupBuffer.clear();
    try { await this.request('groups.batch', { groups }); return groups.length; }
    catch (error) { for (const group of groups) this.groupBuffer.set(group.whatsappId, group); throw error; }
  }

  async flush() { await Promise.allSettled([this.flushLogs(), this.flushUsage(), this.flushGroups()]); }
  enqueueOutbound(conversationId, content, options = {}) { return this.request('outbound.enqueue', { conversationId, content, ...options }); }
  claimOutbound(id, claimToken) { return this.request('outbound.claim', { id, claimToken }); }
  markOutboundDelivered(id, whatsappMessageId = '', expectedAttempt = null) { return this.request('outbound.sent', { id, whatsappMessageId, expectedAttempt }); }
  markOutboundRetry(id, error, delayMs = 3000, expectedAttempt = null) { return this.request('outbound.retry', { id, error: String(error?.message || error || ''), delayMs, expectedAttempt }); }
  markOutboundFailed(id, error, expectedAttempt = null) { return this.request('outbound.failed', { id, error: String(error?.message || error || ''), expectedAttempt }); }
  markOutboundUncertain(id, error, expectedAttempt = null) { return this.request('outbound.uncertain', { id, error: String(error?.message || error || ''), expectedAttempt }); }
  retryUncertainOutboundDelivery(id, delayMs = 500) { return this.callDatabase('retryUncertainOutboundDelivery', [id, delayMs]); }
  callDatabase(method, args = [], timeoutMs = 120_000) { return this.request('database.call', { method, args }, timeoutMs); }
  importTeachersCsv(csv) { return this.request('database.import.teachers', { csv }, 180_000); }
  importLinksCsv(csv, options = {}) { return this.request('database.import.links', { csv, publish: Boolean(options.publish) }, 180_000); }
  importMessagesCsv(csv, options = {}) { return this.request('database.import.messages', { csv, publish: options.publish !== false }, 180_000); }
  prune(options = {}) { return this.request('maintenance.prune', options, 120_000); }
  optimize(options = {}) { return this.request('maintenance.optimize', options, 120_000); }

  status() { return { connected: Boolean(this.worker?.connected), pid: this.worker?.pid || 0, pendingRequests: this.pending.size, bufferedLogs: this.logBuffer.length, bufferedUsage: this.usageBuffer.size, bufferedGroups: this.groupBuffer.size, droppedNonCriticalLogs: this.droppedLogs }; }

  async close() {
    clearInterval(this.flushTimer);
    clearTimeout(this.restartTimer);
    await this.flush().catch(() => {});
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1500);
      worker.once('exit', () => { clearTimeout(timer); resolve(); });
      try { worker.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

module.exports = { DatabaseWriteQueue, databaseWriterError };
