const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { URL } = require('node:url');
const { importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv } = require('./csv-import');
const { parseProfessorScheduleFile } = require('./professor-schedule-import');

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

class AdminServer {
  constructor({ config, database, whatsapp, engine, backupManager, linkChecker, updateManager, diagnostics, attachments, adminTasks = null, adminScheduler = null, realtime = null, coreIpc = null, writeQueue = null }) {
    this.config = config; this.db = database; this.whatsapp = whatsapp; this.engine = engine;
    this.backups = backupManager; this.linkChecker = linkChecker; this.updates = updateManager;
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
      version: this.updates?.status?.().currentVersion || '0.10.7', whatsapp: this.whatsapp.getStatus(),
      stats,
      analytics,
      health: {
        process: { pid: process.pid, uptimeSeconds: Math.floor(process.uptime()), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, nodeVersion: process.version },
        database: { ...databaseHealth, wal: this.cachedStatusPart('database-wal', 15_000, () => this.db.walStatus?.() || null) }, engine: this.engine?.getMetrics?.() || {},
        backups: this.cachedStatusPart('backups-status', 15_000, () => this.backups?.status?.() || null),
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
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const state = this.loginState(req);
        if (state.blockedUntil > Date.now()) return json(res, 429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.', retry_after_seconds: Math.ceil((state.blockedUntil - Date.now()) / 1000) }, { 'Retry-After': String(Math.ceil((state.blockedUntil - Date.now()) / 1000)) });
        if (this.loginVerifications.has(state.key) || this.loginVerifications.size >= this.maxConcurrentLoginVerifications) {
          return json(res, 429, { error: 'Já existe uma verificação de acesso em andamento. Tente novamente em instantes.' }, { 'Retry-After': '1' });
        }
        const body = await readBody(req);
        const suppliedPassword = typeof body.password === 'string' ? body.password : '';
        if (Buffer.byteLength(suppliedPassword, 'utf8') > this.maxLoginPasswordBytes) {
          const failed = this.failedLogin(req);
          return json(res, failed.blockedUntil ? 429 : 400, { error: failed.blockedUntil ? 'Limite de tentativas atingido. O acesso foi temporariamente bloqueado.' : 'Senha inválida.' });
        }
        this.loginVerifications.add(state.key);
        let valid = false;
        try {
          valid = this.db.verifyAdminPasswordAsync
            ? await this.db.verifyAdminPasswordAsync(suppliedPassword)
            : this.db.verifyAdminPassword(suppliedPassword);
        } finally { this.loginVerifications.delete(state.key); }
        if (!valid) {
          const failed = this.failedLogin(req);
          if (failed.blockedUntil) return json(res, 429, { error: 'Limite de tentativas atingido. O acesso foi temporariamente bloqueado.', retry_after_seconds: Math.ceil((failed.blockedUntil - Date.now()) / 1000) });
          return json(res, 401, { error: `Senha incorreta. Restam ${failed.attemptsRemaining} tentativa(s).` });
        }
        this.loginAttempts.delete(state.key); const token = this.createSession();
        return json(res, 200, { ok: true }, { 'Set-Cookie': `hub_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${this.config.sessionHours * 3600}` });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const current = this.session(req); if (current) this.sessions.delete(current.token);
        return json(res, 200, { ok: true }, { 'Set-Cookie': 'hub_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
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
    if (route === '/api/status' && req.method === 'GET') return json(res, 200, this.statusPayload());
    if (route === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', ...this.securityHeaders()
      });
      safeStreamWrite(res, ': conectado\n\n');
      for (const event of this.realtime?.list?.({ after: url.searchParams.get('after') || req.headers['last-event-id'] || 0, limit: 100 }) || []) {
        safeStreamWrite(res, `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
      }
      const unsubscribe = this.realtime?.subscribe?.(event => {
        safeStreamWrite(res, `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
      }) || (() => {});
      const heartbeat = setInterval(() => safeStreamWrite(res, ': ping\n\n'), 20_000);
      req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
      return;
    }
    if (route === '/api/diagnostics' && req.method === 'GET') return json(res, 200, this.diagnostics?.list({ after: url.searchParams.get('after') || 0, limit: url.searchParams.get('limit') || 300 }) || []);
    if (route === '/api/diagnostics' && req.method === 'DELETE') { this.diagnostics?.clear?.(); return json(res, 200, { ok: true }); }
    if (route === '/api/diagnostics/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', ...this.securityHeaders()
      });
      safeStreamWrite(res, ': conectado\n\n');
      const send = event => safeStreamWrite(res, `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
      const unsubscribe = this.diagnostics?.subscribe?.(send) || (() => {});
      const heartbeat = setInterval(() => safeStreamWrite(res, ': ping\n\n'), 20_000);
      req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
      return;
    }
    if (route === '/api/settings' && req.method === 'GET') return json(res, 200, this.db.getSettings());
    if (route === '/api/settings' && req.method === 'PUT') {
      const result = await this.mutateDatabase('setSettings', [await readBody(req)], { reason: 'settings', reloadRules: false }); this.backups?.reload?.().catch?.(error => console.warn('Falha ao recarregar backups:', error.message)); this.adminScheduler?.reload?.(); this.publish('settings-changed', {}); return json(res, 200, result);
    }
    if (route === '/api/security/password' && req.method === 'POST') {
      const body = await readBody(req); await this.mutateDatabase('changeAdminPassword', [body.current_password || '', body.new_password || ''], { reason: 'password', reloadRules: false }); this.clearSessions();
      return json(res, 200, { ok: true, relogin: true }, { 'Set-Cookie': 'hub_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }

    if (route === '/api/simulator' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, this.engine.simulate(body.message || '', { groupId: body.group_id || '', isGroup: body.is_group !== false, ignorePermissions: Boolean(body.ignore_permissions), includeDrafts: body.include_drafts !== false }));
    }
    if (route === '/api/conflicts' && req.method === 'GET') {
      const report = this.adminTasks ? await this.adminTasks.run('conflicts.calculate', {}, { timeoutMs: 120000 }) : this.db.getConflictReport();
      return json(res, 200, report);
    }
    if (route === '/api/examples' && req.method === 'DELETE') return json(res, 200, await this.mutateDatabase('deleteExampleData', [], { reason: 'examples-deleted' }));

    if (route === '/api/messages' && req.method === 'GET') {
      const summary = url.searchParams.get('summary') === '1';
      const paginated = summary && (url.searchParams.has('limit') || url.searchParams.has('cursor') || url.searchParams.get('paginated') === '1');
      if (paginated) {
        return json(res, 200, this.db.listAutomaticMessageSummaryPage({
          search: url.searchParams.get('q') || '',
          limit: url.searchParams.get('limit') || 30,
          cursor: url.searchParams.get('cursor') || '',
          status: url.searchParams.get('status') || 'current',
          tag: url.searchParams.get('tag') || '',
          origin: url.searchParams.get('origin') || '',
          conflictsOnly: url.searchParams.get('conflicts') === '1'
        }));
      }
      const options = { search: url.searchParams.get('q') || '' };
      return json(res, 200, summary ? this.db.listAutomaticMessageSummaries(options) : this.db.listAutomaticMessages(options));
    }
    if (route === '/api/messages' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 201, await this.mutateDatabase(url.searchParams.get('draft') === 'true' ? 'saveAutomaticMessageDraft' : 'saveAutomaticMessage', [body], { reason: 'message-created' }));
    }
    if (route === '/api/messages/validate' && req.method === 'POST') {
      const body = await readBody(req); return json(res, 200, this.db.validateAutomaticMessageRules(body.message || body, body.id || null));
    }
    if (route === '/api/messages/reorder' && req.method === 'POST') {
      const body = await readBody(req); return json(res, 200, await this.mutateDatabase('reorderAutomaticMessages', [body.ids || []], { reason: 'messages-reordered' }));
    }
    if (route === '/api/messages/bulk' && req.method === 'POST') {
      const body = await readBody(req); return json(res, 200, await this.mutateDatabase('bulkAutomaticMessages', [body.ids || [], body.action || '', body.value || ''], { reason: 'messages-bulk' }));
    }
    if (route === '/api/messages/export' && req.method === 'POST') {
      const body = await readBody(req); return json(res, 200, { format: 'hub-whatsapp-bot-messages', version: 1, exported_at: new Date().toISOString(), automatic_messages: this.db.exportAutomaticMessages(body.ids || []) });
    }
    const publishMessage = route.match(/^\/api\/messages\/(\d+)\/publish$/); if (publishMessage && req.method === 'POST') return json(res, 200, await this.mutateDatabase('publishAutomaticMessage', [publishMessage[1]], { reason: 'message-published' }));
    const discardMessage = route.match(/^\/api\/messages\/(\d+)\/draft$/); if (discardMessage && req.method === 'DELETE') return json(res, 200, { discarded: await this.mutateDatabase('discardAutomaticMessageDraft', [discardMessage[1]], { reason: 'message-draft-discarded' }) });
    const messageMatch = route.match(/^\/api\/messages\/(\d+)$/);
    if (messageMatch && req.method === 'GET') {
      const item = this.db.getAutomaticMessage(messageMatch[1]);
      if (!item) throw new Error('Mensagem automática não encontrada.');
      return json(res, 200, item);
    }
    if (messageMatch && req.method === 'PUT') {
      const body = await readBody(req);
      return json(res, 200, await this.mutateDatabase(url.searchParams.get('draft') === 'true' ? 'saveAutomaticMessageDraft' : 'saveAutomaticMessage', [body, messageMatch[1]], { reason: 'message-updated' }));
    }
    if (messageMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteAutomaticMessage', [messageMatch[1]], { reason: 'message-deleted' }) });
    const packageMessage = route.match(/^\/api\/messages\/(\d+)\/package-update$/);
    if (packageMessage && req.method === 'POST') { const body = await readBody(req); return json(res, 200, await this.mutateDatabase('resolvePackageAutomaticMessageUpdate', [packageMessage[1], body.strategy || ''], { reason: 'package-message-resolved' })); }
    const duplicateMessage = route.match(/^\/api\/messages\/(\d+)\/duplicate$/);
    if (duplicateMessage && req.method === 'POST') return json(res, 201, await this.mutateDatabase('duplicateAutomaticMessage', [duplicateMessage[1]], { reason: 'message-duplicated' }));
    const historyMessage = route.match(/^\/api\/messages\/(\d+)\/history$/);
    if (historyMessage && req.method === 'GET') return json(res, 200, this.db.listAutomaticMessageHistory(historyMessage[1], url.searchParams.get('limit') || 50));
    const restoreHistory = route.match(/^\/api\/messages\/(\d+)\/history\/(\d+)\/restore$/);
    if (restoreHistory && req.method === 'POST') return json(res, 200, await this.mutateDatabase('restoreAutomaticMessageHistory', [restoreHistory[1], restoreHistory[2]], { reason: 'message-history-restored' }));
    const attachmentMessage = route.match(/^\/api\/messages\/(\d+)\/attachment$/);
    if (attachmentMessage && req.method === 'POST') {
      if (!this.attachments) throw new Error('Gerenciador de anexos indisponível.');
      const current = this.db.getAutomaticMessage(attachmentMessage[1]); if (!current) throw new Error('Mensagem automática não encontrada.');
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'arquivo'));
      const mimeType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
      const buffer = await readBuffer(req, this.attachments.maxSize + 1);
      const attachment = await this.attachments.save(buffer, { fileName, mimeType });
      return json(res, 201, await this.mutateDatabase('setAutomaticMessageAttachment', [attachmentMessage[1], attachment], { reason: 'message-attachment' }));
    }
    if (attachmentMessage && req.method === 'DELETE') return json(res, 200, await this.mutateDatabase('clearAutomaticMessageAttachment', [attachmentMessage[1]], { reason: 'message-attachment-cleared' }));
    const attachmentDownload = route.match(/^\/api\/messages\/(\d+)\/attachment\/download$/);
    if (attachmentDownload && req.method === 'GET') {
      const item = this.db.getAutomaticMessage(attachmentDownload[1]); const attachment = item?.attachment;
      const filePath = await this.attachments?.resolve?.(attachment); if (!filePath) throw new Error('Anexo não encontrado.');
      const fileStat = await fs.promises.stat(filePath);
      return streamFile(res, filePath, { headers: { 'Content-Type': attachment.mime_type || 'application/octet-stream', 'Content-Length': fileStat.size,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.file_name || 'arquivo')}`, 'Cache-Control': 'private, max-age=60' } });
    }
    if (route === '/api/import/professor-schedule/preview' && req.method === 'POST') {
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'quadro-docente.csv'));
      const academicPeriod = decodeURIComponent(String(req.headers['x-academic-period'] || ''));
      const buffer = await readBuffer(req, 25 * 1024 * 1024);
      const parsed = this.adminTasks
        ? await this.withTemporaryUpload(buffer, fileName, filePath => this.adminTasks.run('professor.preview', { filePath, fileName, academicPeriod }, { timeoutMs: 180000 }))
        : (() => { const value = parseProfessorScheduleFile(buffer, fileName, { academicPeriod }); return { ...value, preview: this.db.previewProfessorScheduleImport(value.records) }; })();
      return json(res, 200, parsed);
    }
    if (route === '/api/import/professor-schedule/apply' && req.method === 'POST') {
      const body = await readBody(req, 10 * 1024 * 1024);
      const result = await this.mutateDatabase('applyProfessorScheduleImport', [body.records || []], { reason: 'professor-import', timeoutMs: 180_000 });
      return json(res, 200, result);
    }
    if (route === '/api/templates/professor-schedule.csv' && req.method === 'GET') return text(res, 200,
      `professor,email,disciplina,semestre,dia,horário,período letivo
Allan de Sousa Soares,allansoares@ifba.edu.br,Matemática Discreta I,1º semestre,quinta-feira,18h30–20h10 e 20h20–22h,2027.1
`,
      'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="quadro-docente-modelo.csv"' });
    if (route === '/api/import/messages-csv' && req.method === 'POST') { const body = await readBody(req, 5 * 1024 * 1024); const result = this.writeQueue?.importMessagesCsv ? await this.writeQueue.importMessagesCsv(body.csv || '', { publish: body.publish !== false }) : importAutomaticMessagesCsv(this.db, body.csv || '', { publish: body.publish !== false }); await this.refreshAfterExternalTask('messages-import'); return json(res, 200, result); }
    if (route === '/api/templates/messages.csv' && req.method === 'GET') return text(res, 200, 'title,scope,sentences,keywords,require_question_mark,response_text,priority,active,publish\nContato de Bruno,both,"qual o contato de bruno|email do professor bruno","bruno|contato",true,"📧 contato.bruno@example.invalid",50,true,true\n', 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="mensagens-modelo.csv"' });

    if (route === '/api/teachers' && req.method === 'GET') return json(res, 200, this.db.listTeachers({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/teachers' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveTeacher', [await readBody(req)], { reason: 'teacher-created', reloadRules: true }));
    const teacherMatch = route.match(/^\/api\/teachers\/(\d+)$/);
    if (teacherMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveTeacher', [await readBody(req), teacherMatch[1]], { reason: 'teacher-updated', reloadRules: true }));
    if (teacherMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteTeacher', [teacherMatch[1]], { reason: 'teacher-deleted', reloadRules: true }) });

    if (route === '/api/sectors' && req.method === 'GET') return json(res, 200, this.db.listSectors({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/sectors' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveSector', [await readBody(req)], { reason: 'sector-created', reloadRules: true }));
    const sectorMatch = route.match(/^\/api\/sectors\/(\d+)$/);
    if (sectorMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveSector', [await readBody(req), sectorMatch[1]], { reason: 'sector-updated', reloadRules: true }));
    if (sectorMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteSector', [sectorMatch[1]], { reason: 'sector-deleted', reloadRules: true }) });

    if (route === '/api/synonyms' && req.method === 'GET') return json(res, 200, this.db.listSynonymGroups());
    if (route === '/api/synonyms' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveSynonymGroup', [await readBody(req)], { reason: 'synonym-created' }));
    const synonymMatch = route.match(/^\/api\/synonyms\/(\d+)$/);
    if (synonymMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveSynonymGroup', [await readBody(req), synonymMatch[1]], { reason: 'synonym-updated' }));
    if (synonymMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteSynonymGroup', [synonymMatch[1]], { reason: 'synonym-deleted' }) });

    if (route === '/api/import/teachers-csv' && req.method === 'POST') { const body = await readBody(req, 5 * 1024 * 1024); const result = this.writeQueue?.importTeachersCsv ? await this.writeQueue.importTeachersCsv(body.csv || '') : importTeachersCsv(this.db, body.csv || ''); await this.refreshAfterExternalTask('teachers-import'); return json(res, 200, result); }
    if (route === '/api/import/links-csv' && req.method === 'POST') { const body = await readBody(req, 5 * 1024 * 1024); const result = this.writeQueue?.importLinksCsv ? await this.writeQueue.importLinksCsv(body.csv || '', { publish: Boolean(body.publish) }) : importLinksCsv(this.db, body.csv || '', { publish: Boolean(body.publish) }); await this.refreshAfterExternalTask('links-import'); return json(res, 200, result); }
    if (route === '/api/templates/teachers.csv' && req.method === 'GET') return text(res, 200, 'name,email,aliases,room,building,room_confirmed_at,room_source,disciplines,schedule,academic_period,notes,active\nMaria Souza,maria@ifba.edu.br,"maria|profa maria",H410,Bloco H,2026-08-02,Coordenação de BSI,"Disciplina A|Disciplina B","segunda 18h30|quarta 20h20",2026.2,,true\n', 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="professores-modelo.csv"' });
    if (route === '/api/templates/links.csv' && req.method === 'GET') return text(res, 200, 'title,category,url,description,keywords,response_text,priority,active,publish\nBarema,Acadêmico,https://exemplo.org/barema,Atividades complementares,"barema|horas complementares",,10,true,false\n', 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="links-modelo.csv"' });

    if (route === '/api/links' && req.method === 'GET') return json(res, 200, this.db.listHubLinks({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/links' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveHubLinkDraft', [await readBody(req)], { reason: 'link-created', reloadRules: false }));
    const publishLink = route.match(/^\/api\/links\/(\d+)\/publish$/); if (publishLink && req.method === 'POST') return json(res, 200, await this.mutateDatabase('publishHubLink', [publishLink[1]], { reason: 'link-published', reloadRules: false }));
    const discardLink = route.match(/^\/api\/links\/(\d+)\/draft$/); if (discardLink && req.method === 'DELETE') return json(res, 200, { discarded: await this.mutateDatabase('discardHubLinkDraft', [discardLink[1]], { reason: 'link-draft-discarded', reloadRules: false }) });
    const linkMatch = route.match(/^\/api\/links\/(\d+)$/);
    if (linkMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveHubLinkDraft', [await readBody(req), linkMatch[1]], { reason: 'link-updated', reloadRules: false }));
    if (linkMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteHubLink', [linkMatch[1]], { reason: 'link-deleted', reloadRules: false }) });
    if (route === '/api/link-checks' && req.method === 'GET') return json(res, 200, this.linkChecker?.status?.() || { running: false });
    if (route === '/api/link-checks/run' && req.method === 'POST') { let result = this.adminTasks ? await this.adminTasks.run('links.run', { reason: 'manual' }, { timeoutMs: 300000 }) : await this.linkChecker.run('manual'); if (this.adminTasks) { result = await this.persistLinkCheckUpdates(result); if (this.linkChecker?.state) this.linkChecker.state = { ...this.linkChecker.state, ...result, lastError: '' }; } this.publish('links-checked', result); return json(res, 200, result); }

    if (route === '/api/faqs' && req.method === 'GET') return json(res, 200, this.db.listFaqs({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/faqs' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveFaqDraft', [await readBody(req)], { reason: 'faq-created', reloadRules: false }));
    const publishFaq = route.match(/^\/api\/faqs\/(\d+)\/publish$/); if (publishFaq && req.method === 'POST') return json(res, 200, await this.mutateDatabase('publishFaq', [publishFaq[1]], { reason: 'faq-published', reloadRules: false }));
    const discardFaq = route.match(/^\/api\/faqs\/(\d+)\/draft$/); if (discardFaq && req.method === 'DELETE') return json(res, 200, { discarded: await this.mutateDatabase('discardFaqDraft', [discardFaq[1]], { reason: 'faq-draft-discarded', reloadRules: false }) });
    const faqMatch = route.match(/^\/api\/faqs\/(\d+)$/);
    if (faqMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveFaqDraft', [await readBody(req), faqMatch[1]], { reason: 'faq-updated', reloadRules: false }));
    if (faqMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteFaq', [faqMatch[1]], { reason: 'faq-deleted', reloadRules: false }) });

    if (route === '/api/calculators' && req.method === 'GET') return json(res, 200, this.db.listCalculators());
    const calculatorMatch = route.match(/^\/api\/calculators\/([a-z0-9_-]+)$/i);
    if (calculatorMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveCalculator', [calculatorMatch[1], await readBody(req)], { reason: 'calculator-updated', reloadRules: false }));

    if (route === '/api/groups' && req.method === 'GET') return json(res, 200, this.db.listGroups());
    if (route === '/api/groups/sync' && req.method === 'POST') {
      const synced = this.coreIpc?.request ? await this.coreIpc.request('whatsapp.sync-groups', {}) : await this.whatsapp.syncGroups();
      return json(res, 200, { synced: Number(synced?.synced ?? synced ?? 0) });
    }
    const groupMatch = route.match(/^\/api\/groups\/(.+)$/);
    if (groupMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('setGroupPermissions', [decodeURIComponent(groupMatch[1]), await readBody(req)], { reason: 'group-permissions', reloadRules: false }));

    if (route === '/api/logs' && req.method === 'GET') return json(res, 200, this.db.listLogs(url.searchParams.get('limit') || 200));
    if (route === '/api/logs' && req.method === 'DELETE') { await this.mutateDatabase('clearLogs', [], { reason: 'logs-cleared', reloadRules: false }); return json(res, 200, { ok: true }); }
    if (route === '/api/analytics' && req.method === 'GET') return json(res, 200, this.db.getUsageStats(url.searchParams.get('days') || 30));
    if (route === '/api/analytics' && req.method === 'DELETE') { await this.mutateDatabase('clearUsageStats', [], { reason: 'analytics-cleared', reloadRules: false }); return json(res, 200, { ok: true }); }

    if (route === '/api/outbound/uncertain' && req.method === 'GET') {
      const items = this.db.listUncertainOutboundDeliveries(url.searchParams.get('limit') || 100)
        .map(item => ({ ...item, reconciling: Boolean(this.whatsapp?.hasPendingLateSend?.(item.id)) }));
      return json(res, 200, { items });
    }
    const uncertainRetry = route.match(/^\/api\/outbound\/(\d+)\/retry$/);
    if (uncertainRetry && req.method === 'POST') {
      if (this.whatsapp?.hasPendingLateSend?.(uncertainRetry[1])) {
        throw httpError('O envio original ainda está sendo reconciliado. Aguarde a confirmação ou a falha antes de reenviar.', 409);
      }
      const result = await this.mutateDatabase('retryUncertainOutboundDelivery', [uncertainRetry[1], 500], { reason: 'outbound-manual-retry', reloadRules: false });
      if (!result) throw httpError('Entrega não encontrada.', 404);
      if (!result.transitioned && result.state !== 'retry') throw httpError('A entrega não está com resultado desconhecido.', 409);
      if (this.coreIpc?.request) this.coreIpc.request('outbound.drain', {}).catch(() => {});
      else this.whatsapp?.scheduleOutboundDrain?.(50);
      return json(res, 202, result);
    }

    if (route === '/api/backup/full' && req.method === 'GET') {
      const includeSession = url.searchParams.get('session') === '1';
      const file = this.adminTasks ? await this.adminTasks.run('backup.full', { includeSession }, { timeoutMs: 20 * 60 * 1000 }) : await this.backups.createFullZip({ includeSession });
      return streamFile(res, file.path, { headers: { 'Content-Type': 'application/zip', 'Content-Length': file.sizeBytes,
        'Content-Disposition': `attachment; filename="${file.name}"`, 'Cache-Control': 'no-store' } });
    }
    if (route === '/api/backup' && req.method === 'GET') {
      if (!this.adminTasks) return text(res, 200, JSON.stringify(this.db.exportData(), null, 2), 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="hub-bot-backup-${new Date().toISOString().slice(0, 10)}.json"` });
      const file = await this.adminTasks.run('backup.json', { reason: 'download' }, { timeoutMs: 300000 });
      await this.backups.refreshCatalog?.();
      const headers = { 'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.name}"`, 'Cache-Control': 'no-store' };
      if (Number(file.sizeBytes || 0) > 0) headers['Content-Length'] = Number(file.sizeBytes);
      return streamFile(res, file.path, { headers });
    }
    if (route === '/api/restore' && req.method === 'POST') {
      const buffer = await readBuffer(req, 10 * 1024 * 1024);
      const parsed = JSON.parse(buffer.toString('utf8'));
      const result = await this.mutateDatabase('importData', [parsed], { reason: 'restore', timeoutMs: 10 * 60 * 1000 });
      await this.backups?.reload?.(); this.adminScheduler?.reload?.();
      return json(res, 200, result);
    }
    if (route === '/api/backups' && req.method === 'GET') return json(res, 200, { status: this.backups.status(), files: this.backups.list() });
    if (route === '/api/backups/run' && req.method === 'POST') { const result = this.adminTasks ? await this.adminTasks.run('backup.json', { reason: 'manual' }, { timeoutMs: 300000 }) : await this.backups.run('manual'); if (this.adminTasks) await this.backups.refreshCatalog?.(); this.publish('backup-created', result); return json(res, 201, result); }
    const backupDownload = route.match(/^\/api\/backups\/([^/]+)\/download$/);
    if (backupDownload && req.method === 'GET') {
      const name = decodeURIComponent(backupDownload[1]); const filePath = await this.backups.getFile(name);
      return streamFile(res, filePath, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
    }
    const backupDelete = route.match(/^\/api\/backups\/([^/]+)$/); if (backupDelete && req.method === 'DELETE') return json(res, 200, { deleted: await this.backups.delete(decodeURIComponent(backupDelete[1])) });

    if (route === '/api/update' && req.method === 'GET') return json(res, 200, this.updates?.status?.() || { state: 'unavailable' });
    if (route === '/api/update/upload' && req.method === 'POST') {
      if (!this.updates) throw new Error('Gerenciador de atualizações indisponível.');
      const fileName = decodeURIComponent(String(req.headers['x-update-filename'] || 'update.zip'));
      const buffer = await readBuffer(req, 100 * 1024 * 1024);
      const result = this.adminTasks
        ? await this.withTemporaryUpload(buffer, fileName, filePath => this.adminTasks.run('update.stage', { filePath, fileName }, { timeoutMs: 20 * 60 * 1000 }))
        : this.updates.stageAndApply(buffer, fileName);
      return json(res, 202, result);
    }

    if (route === '/api/database/checkpoint' && req.method === 'POST') {
      let result;
      try {
        if (this.coreIpc?.request) result = await this.coreIpc.request('database.optimize', { force: true, analyze: true }, 120_000);
        else if (this.writeQueue?.optimize) result = await this.writeQueue.optimize({ force: true, analyze: true });
        else result = this.db.maybeCheckpoint?.({ force: true, idleMs: 0 }) || { skipped: true, reason: 'unsupported' };
      } catch (error) { result = { error: error.message }; }
      this.statusParts.delete('database-health'); this.statusParts.delete('database-wal');
      this.publish('database-maintenance', result);
      return json(res, result.error ? 500 : 200, result);
    }

    if (route === '/api/whatsapp/restart' && req.method === 'POST') {
      if (this.coreIpc?.request) this.coreIpc.request('whatsapp.restart', {}).catch(console.error);
      else this.whatsapp.restart().catch(console.error);
      return json(res, 202, { ok: true });
    }
    if (route === '/api/whatsapp/logout' && req.method === 'POST') { await this.whatsapp.logout(); return json(res, 202, { ok: true, state: this.whatsapp.getStatus().state }); }
    return json(res, 404, { error: 'Rota não encontrada.' });
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

module.exports = { AdminServer, readBuffer, streamFile, safeStreamWrite, MAX_STREAM_BUFFER_BYTES };
