const { asBool } = require('./bot-engine');

class AdminScheduler {
  constructor({ database, tasks, backupManager = null, linkChecker = null, realtime = null, writeQueue = null } = {}) {
    this.db = database;
    this.tasks = tasks;
    this.backups = backupManager;
    this.links = linkChecker;
    this.realtime = realtime;
    this.writeQueue = writeQueue;
    this.backupTimer = null;
    this.linkTimer = null;
    this.maintenanceTimer = null;
    this.running = { backup: false, links: false };
  }

  settings() {
    const settings = this.db.getSettings();
    return {
      backupsEnabled: asBool(settings.automatic_backups_enabled, true),
      backupIntervalMs: Math.max(1, Math.min(720, Number(settings.backup_interval_hours || 24))) * 3600000,
      linksEnabled: asBool(settings.link_check_enabled, true),
      linkIntervalMs: Math.max(1, Math.min(720, Number(settings.link_check_interval_hours || 24))) * 3600000
    };
  }

  async runBackup(reason = 'scheduled') {
    if (this.running.backup) return null;
    this.running.backup = true;
    try {
      const result = await this.tasks.run('backup.json', { reason }, { timeoutMs: 10 * 60 * 1000 });
      await this.backups?.refreshCatalog?.();
      this.realtime?.publish?.('backup-created', result || {});
      return result;
    } catch (error) {
      if (this.backups?.state) this.backups.state.lastError = error.message;
      this.realtime?.publish?.('admin-task-failed', { type: 'backup.json', error: error.message });
      throw error;
    } finally {
      this.running.backup = false;
      this.scheduleBackups();
    }
  }

  async runLinks(reason = 'scheduled') {
    if (this.running.links) return null;
    this.running.links = true;
    try {
      const raw = await this.tasks.run('links.run', { reason }, { timeoutMs: 15 * 60 * 1000 });
      const updates = Array.isArray(raw?.updates) ? raw.updates : [];
      if (updates.length) {
        try {
          if (this.writeQueue?.callDatabase) await this.writeQueue.callDatabase('applyLinkHealthBatch', [updates], 120_000);
          else this.db.applyLinkHealthBatch(updates);
        } catch (error) {
          if (!this.writeQueue || !['DB_WRITER_UNAVAILABLE', 'DB_WRITER_OUTCOME_UNKNOWN'].includes(error?.code)) throw error;
          this.db.applyLinkHealthBatch(updates);
        }
      }
      this.db.refreshExternalChanges?.('activeMessages');
      const { updates: _updates, ...result } = raw || {};
      if (this.links?.state) this.links.state = { ...this.links.state, ...result, lastError: '', reason };
      this.realtime?.publish?.('links-checked', result);
      return result;
    } catch (error) {
      if (this.links?.state) this.links.state.lastError = error.message;
      this.realtime?.publish?.('admin-task-failed', { type: 'links.run', error: error.message });
      throw error;
    } finally {
      this.running.links = false;
      this.scheduleLinks();
    }
  }

  scheduleBackups() {
    clearTimeout(this.backupTimer); this.backupTimer = null;
    const settings = this.settings();
    if (!settings.backupsEnabled) return;
    const last = this.backups?.state?.lastBackupAt ? new Date(this.backups.state.lastBackupAt).getTime() : 0;
    const due = Math.max(Date.now() + 5000, last + settings.backupIntervalMs);
    if (this.backups?.state) this.backups.state.nextBackupAt = new Date(due).toISOString();
    this.backupTimer = setTimeout(() => this.runBackup().catch(error => console.error('Falha no backup automático:', error.message)), due - Date.now());
    this.backupTimer.unref?.();
  }

  scheduleLinks() {
    clearTimeout(this.linkTimer); this.linkTimer = null;
    const settings = this.settings();
    if (!settings.linksEnabled) return;
    const last = this.links?.state?.lastRunAt ? new Date(this.links.state.lastRunAt).getTime() : 0;
    const due = Math.max(Date.now() + 15000, last + settings.linkIntervalMs);
    if (this.links?.state) this.links.state.nextRunAt = new Date(due).toISOString();
    this.linkTimer = setTimeout(() => this.runLinks().catch(error => console.error('Falha na verificação automática de links:', error.message)), due - Date.now());
    this.linkTimer.unref?.();
  }

  scheduleMaintenance(delayMs = 60_000) {
    clearTimeout(this.maintenanceTimer);
    this.maintenanceTimer = setTimeout(async () => {
      try {
        if (this.writeQueue?.prune) await this.writeQueue.prune({});
        else await this.tasks.run('maintenance.prune', {}, { timeoutMs: 5 * 60 * 1000 });
      }
      catch (error) { console.warn('Falha na manutenção administrativa:', error.message); }
      finally { this.scheduleMaintenance(6 * 60 * 60 * 1000); }
    }, Math.max(1000, Number(delayMs || 0)));
    this.maintenanceTimer.unref?.();
  }

  async start() {
    await this.backups?.ready;
    this.scheduleBackups();
    this.scheduleLinks();
    this.scheduleMaintenance();
  }

  reload() { this.scheduleBackups(); this.scheduleLinks(); }
  stop() { clearTimeout(this.backupTimer); clearTimeout(this.linkTimer); clearTimeout(this.maintenanceTimer); this.backupTimer = null; this.linkTimer = null; this.maintenanceTimer = null; }
  status() { return { running: { ...this.running }, scheduled: Boolean(this.backupTimer || this.linkTimer || this.maintenanceTimer) }; }
}

module.exports = { AdminScheduler };
