const { asBool } = require('./bot-engine');

class LinkChecker {
  constructor({ database, autoSchedule = true, persistResults = true }) {
    this.db = database;
    this.autoSchedule = autoSchedule !== false;
    this.persistResults = persistResults !== false;
    this.timer = null;
    this.running = false;
    this.state = { lastRunAt: '', nextRunAt: '', lastError: '', checked: 0, healthy: 0, broken: 0, restricted: 0 };
  }

  settings() {
    const settings = this.db.getSettings();
    return {
      enabled: asBool(settings.link_check_enabled, true),
      intervalHours: Math.max(1, Math.min(720, Number(settings.link_check_interval_hours || 24))),
      timeoutSeconds: Math.max(3, Math.min(60, Number(settings.link_check_timeout_seconds || 12)))
    };
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings().timeoutSeconds * 1000);
    try {
      return await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'HUB-WhatsApp-Bot-LinkChecker/0.4', ...(options.headers || {}) },
        ...options
      });
    } finally { clearTimeout(timer); }
  }

  async checkOne(link) {
    const checkedAt = new Date().toISOString();
    try {
      let response = await this.fetchWithTimeout(link.url, { method: 'HEAD' });
      if ([400, 405, 501].includes(response.status)) {
        try { response.body?.cancel?.(); } catch {}
        response = await this.fetchWithTimeout(link.url, { method: 'GET', headers: { Range: 'bytes=0-1024' } });
      }
      try { response.body?.cancel?.(); } catch {}
      let status = 'healthy';
      if ([401, 403, 429].includes(response.status)) status = 'restricted';
      else if (response.status >= 400) status = 'broken';
      const result = { id: Number(link.id), url: String(link.url || ''), status, checkedAt, httpStatus: response.status, error: '' };
      return this.persistResults ? this.db.updateLinkHealth(link.id, result) : result;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Tempo limite excedido.' : error.message;
      const result = { id: Number(link.id), url: String(link.url || ''), status: 'broken', checkedAt, httpStatus: 0, error: message };
      return this.persistResults ? this.db.updateLinkHealth(link.id, result) : result;
    }
  }

  async run(reason = 'manual') {
    if (this.running) throw new Error('A verificação de links já está em andamento.');
    this.running = true;
    const links = this.db.listLinksForCheck();
    const counts = { checked: 0, healthy: 0, broken: 0, restricted: 0 }; const updates = [];
    try {
      const queue = [...links];
      const worker = async () => {
        while (queue.length) {
          const link = queue.shift();
          const result = await this.checkOne(link);
          counts.checked += 1;
          const status = result.link_status || result.status || 'broken';
          counts[status] = Number(counts[status] || 0) + 1;
          if (!this.persistResults) updates.push(result);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, Math.max(1, links.length)) }, worker));
      this.state = { ...this.state, ...counts, lastRunAt: new Date().toISOString(), lastError: '', reason };
      return { ...counts, reason, lastRunAt: this.state.lastRunAt, ...(this.persistResults ? {} : { updates }) };
    } catch (error) {
      this.state.lastError = error.message; throw error;
    } finally { this.running = false; if (this.autoSchedule) this.schedule(); }
  }

  schedule() {
    clearTimeout(this.timer); this.timer = null;
    const settings = this.settings();
    if (!settings.enabled) { this.state.nextRunAt = ''; return; }
    const intervalMs = settings.intervalHours * 3600000;
    const lastMs = this.state.lastRunAt ? new Date(this.state.lastRunAt).getTime() : 0;
    const dueAt = Math.max(Date.now() + 15000, lastMs + intervalMs);
    this.state.nextRunAt = new Date(dueAt).toISOString();
    this.timer = setTimeout(() => this.run('scheduled').catch(error => console.error('Falha na verificação automática de links:', error)), Math.max(1000, dueAt - Date.now()));
    this.timer.unref?.();
  }
  start() { if (this.autoSchedule) this.schedule(); }
  reload() { if (this.autoSchedule) this.schedule(); }
  stop() { clearTimeout(this.timer); this.timer = null; }
  status() { return { ...this.state, running: this.running, settings: this.settings() }; }
}

module.exports = { LinkChecker };
