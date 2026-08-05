const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { URL } = require('node:url');
const { execFileSync, spawn } = require('node:child_process');
const { runConsistencyCheck } = require('./consistency-checker');
const { systemHealth } = require('./system-health');
const { importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv } = require('./csv-import');
const { parseProfessorScheduleFile } = require('./professor-schedule-import');
const { parseAcademicCalendarCsv } = require('./academic-calendar-import');
const { normalizeText } = require('./text');
const { runtimeCompatibility } = require('./runtime-compatibility');
const { TRIGGER_POLICY_TYPES } = require('./trigger-policy');
const { previewLearningImpact } = require('./learning-impact');
const { simulateConversation } = require('./conversation-simulator');

const MAX_STREAM_BUFFER_BYTES = 512 * 1024;
function safeStreamWrite(res, payload) {
  if (!res || res.destroyed || res.writableEnded) return false;
  if (Number(res.writableLength || 0) > MAX_STREAM_BUFFER_BYTES) {
    res.destroy(new Error('Cliente lento demais para o fluxo em tempo real.'));
    return false;
  }
  try {
    const accepted = res.write(payload);
    if (!accepted && Number(res.writableLength || 0) > MAX_STREAM_BUFFER_BYTES) {
      res.destroy(new Error('Cliente lento demais para o fluxo em tempo real.'));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function streamFile(res, filePath, { status = 200, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) });
    let opened = false;
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve(true);
    };
    stream.once('open', () => {
      if (res.destroyed || res.writableEnded) {
        stream.destroy();
        finish();
        return;
      }
      opened = true;
      res.writeHead(status, headers);
      stream.pipe(res);
    });
    stream.once('error', error => {
      if (!opened && !res.headersSent) finish(httpError('Arquivo não encontrado ou indisponível.', 404));
      else {
        try { res.destroy(error); } catch {}
        finish();
      }
    });
    res.once('finish', () => finish());
    res.once('close', () => {
      if (!opened) stream.destroy();
      finish();
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};
function json(res, status, payload, extraHeaders = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }); res.end(JSON.stringify(payload)); }
function text(res, status, payload, contentType = 'text/plain; charset=utf-8', headers = {}) { res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', ...headers }); res.end(payload); }
function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').slice(0, 16 * 1024).split(';')) {
    const item = part.trim(); const index = item.indexOf('=');
    if (!item || index <= 0) continue;
    try { cookies[decodeURIComponent(item.slice(0, index))] = decodeURIComponent(item.slice(index + 1)); } catch {}
  }
  return cookies;
}
function httpError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }
function readBuffer(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let rejected = false;
    req.on('data', chunk => {
      if (rejected) return; size += chunk.length;
      if (size > limit) {
        rejected = true;
        req.resume();
        reject(httpError('Corpo da requisição grande demais.', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on('error', error => { if (!rejected) reject(error); });
  });
}
async function readBody(req, limit = 1024 * 1024) {
  const raw = (await readBuffer(req, limit)).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw httpError('JSON inválido.', 400); }
}

// Manifesto de compatibilidade das rotas delegadas aos módulos em src/admin/.
// Mantido aqui para diagnóstico estático, documentação e verificações de release:
// /api/messages/reorder /api/messages/bulk /api/academic-calendar /api/professor-schedule-entries
// /api/consistency /api/system/restart /api/system/test-send /api/change-history
// /api/external-backups /api/update/remote /api/learning-impact /api/simulator/conversation
// /api/quality/intent-metrics /api/diagnostics/ /api/academic-disciplines
// /api/academic-periods/preview /publish database.optimize

const handleAuthRoutes = require('./admin/auth-routes');
const handleCardsRoutes = require('./admin/cards-routes');
const handleLearningRoutes = require('./admin/learning-routes');
const handleAcademicRoutes = require('./admin/academic-routes');
const handleBackupRoutes = require('./admin/backup-routes');
const handleDiagnosticsRoutes = require('./admin/diagnostics-routes');

class AdminServer {
  constructor({ config, database, whatsapp, engine, backupManager, externalBackupManager = null, linkChecker, updateManager, diagnostics, attachments, adminTasks = null, adminScheduler = null, realtime = null, coreIpc = null, writeQueue = null }) {
    this.config = config; this.db = database; this.whatsapp = whatsapp; this.engine = engine;
    this.backups = backupManager; this.externalBackups = externalBackupManager; this.linkChecker = linkChecker; this.updates = updateManager;
    this.diagnostics = diagnostics; this.attachments = attachments; this.adminTasks = adminTasks; this.adminScheduler = adminScheduler; this.realtime = realtime; this.coreIpc = coreIpc; this.writeQueue = writeQueue;
    this.sessions = new Map(); this.loginAttempts = new Map(); this.loginVerifications = new Set();
    this.maxConcurrentLoginVerifications = 4;
    this.maxTrackedLoginClients = 2048;
    this.maxLoginPasswordBytes = 512;
    this.statusParts = new Map();
    this.db.initializeAdminPassword(config.adminPassword);
    this.server = http.createServer(this.handle.bind(this));
    this.server.keepAliveTimeout = 65_000;
    this.server.headersTimeout = 70_000;
    this.server.requestTimeout = 30_000;
  }

  session(req) {
    const token = parseCookies(req).hub_admin; const session = token ? this.sessions.get(token) : null;
    if (!session || session.expiresAt < Date.now()) { if (token) this.sessions.delete(token); return null; }
    return { token, ...session };
  }
  createSession() {
    const now = Date.now();
    for (const [token, session] of this.sessions) if (session.expiresAt < now) this.sessions.delete(token);
    while (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value);
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(token, { expiresAt: now + this.config.sessionHours * 3600000 });
    return token;
  }
  clearSessions() { this.sessions.clear(); }
  securityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
  }
  sameOrigin(req) { const origin = req.headers.origin; if (!origin) return true; const host = String(req.headers.host || ''); return Boolean(host) && origin === `http://${host}`; }
  clientKey(req) { return String(req.socket.remoteAddress || 'local').trim(); }
  loginPolicy() {
    const settings = this.db.getSettings();
    return { maxAttempts: Math.max(2, Math.min(20, Number(settings.login_max_attempts || 5))), lockMinutes: Math.max(1, Math.min(1440, Number(settings.login_lock_minutes || 15))) };
  }
  pruneLoginAttempts(now = Date.now()) {
    for (const [key, state] of this.loginAttempts) {
      if ((state.blockedUntil && state.blockedUntil <= now) || (!state.blockedUntil && Number(state.updatedAt || 0) + 24 * 3600000 <= now)) this.loginAttempts.delete(key);
    }
    while (this.loginAttempts.size >= this.maxTrackedLoginClients) this.loginAttempts.delete(this.loginAttempts.keys().next().value);
  }
  loginState(req) {
    this.pruneLoginAttempts();
    const key = this.clientKey(req); const current = this.loginAttempts.get(key);
    if (!current) return { key, attempts: 0, blockedUntil: 0 };
    return { key, ...current };
  }
  failedLogin(req) {
    const state = this.loginState(req); const policy = this.loginPolicy(); const attempts = state.attempts + 1;
    const blockedUntil = attempts >= policy.maxAttempts ? Date.now() + policy.lockMinutes * 60000 : 0;
    this.loginAttempts.set(state.key, { attempts: blockedUntil ? 0 : attempts, blockedUntil, updatedAt: Date.now() });
    this.pruneLoginAttempts();
    return { attemptsRemaining: blockedUntil ? 0 : Math.max(0, policy.maxAttempts - attempts), blockedUntil };
  }

  cachedStatusPart(key, ttlMs, producer) {
    const current = this.statusParts.get(key);
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = producer();
    this.statusParts.set(key, { value, expiresAt: Date.now() + Math.max(250, Number(ttlMs || 0)) });
    return value;
  }

  statusPayload() {
    const memory = process.memoryUsage();
    // O estado dinâmico do WhatsApp e do motor é sempre atual. Consultas
    // agregadas e verificações do SQLite são reutilizadas por alguns segundos,
    // evitando travamentos perceptíveis ao voltar para uma aba inativa.
    const stats = this.cachedStatusPart('stats', 3_000, () => this.db.getStats());
    const analytics = this.cachedStatusPart('analytics30', 60_000, () => this.db.getUsageStats(30));
    const databaseHealth = this.cachedStatusPart('database-health', 60_000, () => this.db.healthCheck());
    return {
      version: this.updates?.status?.().currentVersion || '0.19.0', whatsapp: this.whatsapp.getStatus(),
      stats,
      analytics,
      health: {
        process: { pid: process.pid, uptimeSeconds: Math.floor(process.uptime()), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, nodeVersion: process.version },
        database: { ...databaseHealth, wal: this.cachedStatusPart('database-wal', 15_000, () => this.db.walStatus?.() || null) }, engine: this.engine?.getMetrics?.() || {},
        system: this.cachedStatusPart('system-health', 5_000, () => systemHealth(this.config.rootDir)),
        consistency: this.cachedStatusPart('consistency', 60_000, () => runConsistencyCheck(this.db, { attachmentsDir: this.config.attachmentsDir })),
        backups: this.cachedStatusPart('backups-status', 15_000, () => this.backups?.status?.() || null),
        externalBackups: this.cachedStatusPart('external-backups-status', 15_000, () => this.externalBackups?.status?.() || null),
        links: this.cachedStatusPart('links-status', 5_000, () => this.linkChecker?.status?.() || null),
        update: this.cachedStatusPart('update-status', 3_000, () => this.updates?.status?.() || null),
        diagnostics: this.diagnostics?.stats?.() || null,
        adminTasks: this.adminTasks?.status?.() || null,
        adminScheduler: this.adminScheduler?.status?.() || null,
        realtime: this.realtime?.stats?.() || null,
        coreIpc: this.coreIpc?.status?.() || null,
        databaseWriter: this.writeQueue?.status?.() || null
      }
    };
  }

  controlHelper() { return '/usr/local/sbin/hub-whatsapp-bot-control'; }

  runControl(action, args = [], options = {}) {
    const helper = this.controlHelper();
    if (!fs.existsSync(helper)) throw httpError('Integração com o serviço Oracle não instalada. Execute: sudo bash scripts/install-oracle-management.sh', 503);
    return execFileSync('sudo', ['-n', helper, action, ...args.map(String)], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: options.timeout || 30_000 });
  }

  scheduleServiceRestart() {
    const helper = this.controlHelper();
    if (!fs.existsSync(helper)) throw httpError('Integração com o serviço Oracle não instalada. Execute: sudo bash scripts/install-oracle-management.sh', 503);
    const child = spawn('/bin/bash', ['-lc', `sleep 1; sudo -n ${helper} restart`], { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  }

  async prepareUpdateBackups(reason = 'pre-update') {
    const local = this.adminTasks
      ? await this.adminTasks.run('backup.full', { includeSession: true }, { timeoutMs: 20 * 60 * 1000 })
      : await this.backups.createFullZip({ includeSession: true });
    let external = null;
    const externalStatus = this.externalBackups?.status?.();
    if (externalStatus?.settings?.enabled) external = await this.externalBackups.run(reason);
    return { local, external };
  }

  publish(type, payload = {}) { this.realtime?.publish?.(type, payload); }

  async refreshAfterExternalTask(reason = 'admin-task') {
    this.db.refreshExternalChanges?.();
    if (this.coreIpc?.request) await this.coreIpc.request('rules.reload', { reason }).catch(() => this.engine?.reloadRules?.(reason));
    else await this.engine?.reloadRules?.(reason);
    this.statusParts.clear();
    this.publish('data-changed', { reason });
  }

  async mutateDatabase(method, args = [], { reason = method, timeoutMs = 120_000, reloadRules = true } = {}) {
    let result;
    if (this.writeQueue?.callDatabase) {
      try {
        result = await this.writeQueue.callDatabase(method, args, timeoutMs);
      } catch (error) {
        // Só é seguro repetir localmente quando a solicitação não chegou ao worker.
        // Timeout ou encerramento após o envio têm resultado desconhecido e uma
        // repetição poderia criar registros, mensagens ou importações duplicadas.
        if (error?.code !== 'DB_WRITER_UNAVAILABLE' || typeof this.db?.[method] !== 'function') throw error;
        result = this.db[method](...args);
      }
    } else {
      if (typeof this.db?.[method] !== 'function') throw new Error(`Operação de banco indisponível: ${method}`);
      result = this.db[method](...args);
    }
    this.db.refreshExternalChanges?.();
    if (reloadRules) {
      if (this.coreIpc?.request) await this.coreIpc.request('rules.reload', { reason }).catch(() => this.engine?.reloadRules?.(reason));
      else await this.engine?.reloadRules?.(reason);
    }
    this.statusParts.clear();
    this.publish('data-changed', { reason, method });
    return result;
  }


  async persistLinkCheckUpdates(result) {
    const updates = Array.isArray(result?.updates) ? result.updates : [];
    if (updates.length) {
      if (this.writeQueue?.callDatabase) {
        try { await this.writeQueue.callDatabase('applyLinkHealthBatch', [updates], 120_000); }
        catch (error) {
          if (!['DB_WRITER_UNAVAILABLE', 'DB_WRITER_OUTCOME_UNKNOWN'].includes(error?.code)) throw error;
          this.db.applyLinkHealthBatch(updates);
        }
      } else this.db.applyLinkHealthBatch(updates);
      this.db.refreshExternalChanges?.('activeMessages');
    }
    if (!result || typeof result !== 'object') return result;
    const { updates: _updates, ...summary } = result;
    return summary;
  }

  async withTemporaryUpload(buffer, fileName, task) {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hub-bot-admin-'));
    const safeName = path.basename(String(fileName || 'arquivo.bin')).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'arquivo.bin';
    const filePath = path.join(directory, safeName);
    try {
      await fs.promises.writeFile(filePath, buffer, { mode: 0o600 });
      return await task(filePath);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }

  async handle(req, res) {
    Object.entries(this.securityHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    try {
      // O Host é controlado pelo cliente e não deve participar da análise da URL.
      const url = new URL(String(req.url || '/'), 'http://localhost');
      if (url.pathname === '/health') return json(res, 200, { ok: true, whatsapp: this.whatsapp.getStatus().state });
      if (url.pathname === '/api/login' || url.pathname === '/api/logout') return handleAuthRoutes(this, req, res, url, adminRouteDependencies);
      if (url.pathname.startsWith('/api/')) {
        if (!this.session(req)) return json(res, 401, { error: 'Não autenticado.' });
        if (!['GET', 'HEAD'].includes(req.method) && !this.sameOrigin(req)) return json(res, 403, { error: 'Origem não permitida.' });
        return await this.handleApi(req, res, url);
      }
      return this.serveStatic(res, url.pathname);
    } catch (error) {
      console.error('Erro no painel:', error);
      if (res.headersSent || res.destroyed || res.writableEnded) { try { if (!res.writableEnded) res.destroy(error); } catch {} return; }
      const status = Number(error?.statusCode || 400);
      return json(res, status, { error: error.message || 'Erro inesperado.' });
    }
  }

  async handleApi(req, res, url) {
    const route = url.pathname;
    if (/^\/api\/(?:learning-|negative-example|discipline-alias|regression-cases)/.test(route) || /^\/api\/quality\/(?:observations|false-positives)/.test(route) || /^\/api\/messages\/\d+\/(?:observation|trigger-policy)$/.test(route)) return handleLearningRoutes(this, req, res, url, adminRouteDependencies);
    if (/^\/api\/(?:professor-schedule|academic-|teachers|sectors|import\/(?:professor-schedule|academic-calendar)|templates\/(?:professor-schedule|academic-calendar))/.test(route)) return handleAcademicRoutes(this, req, res, url, adminRouteDependencies);
    if (/^\/api\/(?:backup|backups|restore|external-backups|update|outbound|database\/checkpoint|whatsapp\/(?:restart|logout))/.test(route)) return handleBackupRoutes(this, req, res, url, adminRouteDependencies);
    if (/^\/api\/(?:settings|security|messages|examples|import\/messages-csv|templates\/messages|synonyms|import\/(?:teachers|links)|templates\/(?:teachers|links)|links|link-checks|faqs|calculators|groups)/.test(route)) return handleCardsRoutes(this, req, res, url, adminRouteDependencies);
    return handleDiagnosticsRoutes(this, req, res, url, adminRouteDependencies);
  }

  async serveStatic(res, requestPath) {
    const spaPaths = new Set(['/', '/login', '/painel']);
    const relative = spaPaths.has(requestPath) ? 'index.html' : requestPath.replace(/^\/+/, ''); const filePath = path.resolve(this.config.publicDir, relative); const publicRoot = `${path.resolve(this.config.publicDir)}${path.sep}`;
    if (filePath !== path.resolve(this.config.publicDir) && !filePath.startsWith(publicRoot)) return json(res, 403, { error: 'Acesso negado.' });
    let stat; try { stat = await fs.promises.stat(filePath); } catch { return json(res, 404, { error: 'Arquivo não encontrado.' }); }
    if (stat.isDirectory()) return json(res, 404, { error: 'Arquivo não encontrado.' });
    const ext = path.extname(filePath).toLowerCase();
    return streamFile(res, filePath, { headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' } });
  }
  start() { return new Promise(resolve => this.server.listen(this.config.adminPort, this.config.adminHost, () => { console.log(`Painel local: http://${this.config.adminHost}:${this.config.adminPort}`); resolve(); })); }

  stop({ timeoutMs = 5000 } = {}) {
    if (!this.server?.listening) return Promise.resolve(true);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => {
        try { this.server.closeAllConnections?.(); } catch {}
        finish(false);
      }, Math.max(500, Number(timeoutMs || 5000)));
      timer.unref?.();
      this.server.close(error => finish(!error));
      try { this.server.closeIdleConnections?.(); } catch {}
    });
  }
}

const adminRouteDependencies = {
  fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES,
  previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv,
  importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText
};

module.exports = { AdminServer, readBuffer, streamFile, safeStreamWrite, MAX_STREAM_BUFFER_BYTES };
