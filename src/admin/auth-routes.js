'use strict';

module.exports = async function handleAuthRoutes(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, readBody } = deps;
  return await (async function dispatchAuth() {
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
    return json(res, 404, { error: 'Rota não encontrada.' });
  }).call(server);
};
