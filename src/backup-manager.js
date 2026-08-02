const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { asBool } = require('./bot-engine');
const { backup: backupSqlite } = require('node:sqlite');

async function exists(filePath) {
  try { await fs.promises.access(filePath); return true; } catch { return false; }
}

async function copyRegularTree(source, destination) {
  const sourceStat = await fs.promises.lstat(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('A origem do backup não é uma pasta regular.');
  await fs.promises.mkdir(destination, { recursive: true, mode: 0o700 });
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name); const to = path.join(destination, entry.name);
    const stat = await fs.promises.lstat(from);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) await copyRegularTree(from, to);
    else if (stat.isFile()) { await fs.promises.copyFile(from, to); await fs.promises.chmod(to, 0o600).catch(() => {}); }
  }
}

class BackupManager {
  constructor({ database, backupDir, dataDir = '', attachmentsDir = '', authDir = '', rootDir = '', autoSchedule = true }) {
    this.db = database;
    this.autoSchedule = autoSchedule !== false;
    this.backupDir = backupDir;
    this.dataDir = dataDir || path.dirname(database.dbPath);
    this.attachmentsDir = attachmentsDir || path.join(this.dataDir, 'attachments');
    this.authDir = authDir || path.join(this.dataDir, '.baileys_auth');
    this.rootDir = rootDir || path.dirname(this.dataDir);
    this.timer = null;
    this.running = false;
    this.catalog = [];
    this.state = { lastBackupAt: '', lastFile: '', lastError: '', nextBackupAt: '' };
    this.ready = fs.promises.mkdir(this.backupDir, { recursive: true }).then(() => this.refreshCatalog()).catch(error => {
      this.state.lastError = error.message;
      return [];
    });
  }

  settings() {
    const settings = this.db.getSettings();
    return {
      enabled: asBool(settings.automatic_backups_enabled, true),
      intervalHours: Math.max(1, Math.min(720, Number(settings.backup_interval_hours || 24))),
      keepCount: Math.max(1, Math.min(365, Number(settings.backup_keep_count || 14)))
    };
  }

  list() { return this.catalog.map(item => ({ ...item })); }

  async refreshCatalog() {
    await fs.promises.mkdir(this.backupDir, { recursive: true });
    const names = await fs.promises.readdir(this.backupDir).catch(() => []);
    const files = [];
    for (const name of names.filter(value => /^hub-bot-auto-.*\.json$/.test(value))) {
      const filePath = path.join(this.backupDir, name);
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile()) files.push({ name, path: filePath, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() });
      } catch {}
    }
    this.catalog = files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = this.catalog[0];
    if (latest) { this.state.lastBackupAt = latest.createdAt; this.state.lastFile = latest.name; }
    else { this.state.lastBackupAt = ''; this.state.lastFile = ''; }
    return this.list();
  }

  safeFile(name) {
    if (!/^hub-bot-auto-[A-Za-z0-9_.-]+\.json$/.test(String(name || ''))) throw new Error('Nome de backup inválido.');
    const filePath = path.resolve(this.backupDir, name);
    if (!filePath.startsWith(`${path.resolve(this.backupDir)}${path.sep}`)) throw new Error('Caminho de backup inválido.');
    return filePath;
  }

  async cleanup() {
    await this.ready;
    const { keepCount } = this.settings();
    await this.refreshCatalog();
    await Promise.all(this.catalog.slice(keepCount).map(file => fs.promises.rm(file.path, { force: true }).catch(() => {})));
    const names = await fs.promises.readdir(this.backupDir).catch(() => []);
    await Promise.all(names.filter(value => /^hub-bot-completo-.*\.zip\.partial-/.test(value)).map(value => fs.promises.rm(path.join(this.backupDir, value), { force: true }).catch(() => {})));
    const full = [];
    for (const name of names.filter(value => /^hub-bot-completo-.*\.zip$/.test(value))) {
      const filePath = path.join(this.backupDir, name);
      try { const stat = await fs.promises.stat(filePath); full.push({ filePath, mtime: stat.mtimeMs }); } catch {}
    }
    full.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(full.slice(3).map(item => fs.promises.rm(item.filePath, { force: true }).catch(() => {})));
    await this.refreshCatalog();
  }

  async run(reason = 'manual') {
    await this.ready;
    if (this.running) throw new Error('Já existe um backup em andamento.');
    this.running = true;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `hub-bot-auto-${stamp}.json`;
      const finalPath = path.join(this.backupDir, name);
      const tempPath = `${finalPath}.tmp`;
      const payload = { ...this.db.exportData(), backup_reason: reason };
      await fs.promises.writeFile(tempPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
      await fs.promises.rename(tempPath, finalPath);
      this.state.lastBackupAt = new Date().toISOString();
      this.state.lastFile = name;
      this.state.lastError = '';
      await this.cleanup();
      return this.list().find(file => file.name === name) || { name, path: finalPath, createdAt: this.state.lastBackupAt };
    } catch (error) {
      this.state.lastError = error.message;
      throw error;
    } finally {
      this.running = false;
      if (this.autoSchedule) this.schedule();
    }
  }

  async createFullZip({ includeSession = false } = {}) {
    await this.ready;
    if (this.running) throw new Error('Já existe um backup em andamento.');
    this.running = true;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `hub-bot-completo-${stamp}.zip`;
    const finalPath = path.join(this.backupDir, name);
    const partialPath = `${finalPath}.partial-${process.pid}-${Date.now()}`;
    const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hub-bot-backup-'));
    try {
      await fs.promises.writeFile(path.join(stage, 'dados-exportados.json'), JSON.stringify(this.db.exportData(), null, 2), { mode: 0o600 });
      const sqliteSnapshot = path.join(stage, 'hub-bot.sqlite');
      await backupSqlite(this.db.db, sqliteSnapshot);
      await fs.promises.chmod(sqliteSnapshot, 0o600);
      const settings = this.db.getSettings();
      await fs.promises.writeFile(path.join(stage, 'configuracoes.json'), JSON.stringify({
        exported_at: new Date().toISOString(), settings,
        note: 'A senha administrativa está no banco SQLite; proteja este arquivo.'
      }, null, 2), { mode: 0o600 });
      if (await exists(this.attachmentsDir)) await copyRegularTree(this.attachmentsDir, path.join(stage, 'attachments'));
      if (includeSession && await exists(this.authDir)) await copyRegularTree(this.authDir, path.join(stage, 'sessao-whatsapp'));
      await fs.promises.writeFile(path.join(stage, 'LEIA-ME.txt'), [
        'Backup completo do HUB WhatsApp Bot.', '',
        'Conteúdo: banco SQLite, exportação JSON, configurações e anexos.',
        includeSession ? 'A sessão do WhatsApp FOI incluída. Guarde este ZIP como uma senha.' : 'A sessão do WhatsApp NÃO foi incluída.', '',
        'Não compartilhe este arquivo publicamente.'
      ].join('\n'), { mode: 0o600 });
      const script = "import os,sys,zipfile\nroot,out=sys.argv[1],sys.argv[2]\nwith zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,allowZip64=True) as z:\n  for base,dirs,files in os.walk(root):\n    for f in files:\n      p=os.path.join(base,f); z.write(p,os.path.relpath(p,root))\n";
      await execFileAsync('python3', ['-c', script, stage, partialPath], { timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 });
      await fs.promises.chmod(partialPath, 0o600);
      await fs.promises.rename(partialPath, finalPath);
      await this.cleanup();
      const stat = await fs.promises.stat(finalPath);
      return { name, path: finalPath, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), includeSession: Boolean(includeSession) };
    } catch (error) {
      await fs.promises.rm(partialPath, { force: true }).catch(() => {});
      throw error;
    } finally {
      await fs.promises.rm(stage, { recursive: true, force: true }).catch(() => {});
      this.running = false;
    }
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = null;
    const settings = this.settings();
    if (!settings.enabled) { this.state.nextBackupAt = ''; return; }
    const intervalMs = settings.intervalHours * 3600000;
    const lastMs = this.state.lastBackupAt ? new Date(this.state.lastBackupAt).getTime() : 0;
    const dueAt = Math.max(Date.now() + 5000, lastMs + intervalMs);
    this.state.nextBackupAt = new Date(dueAt).toISOString();
    this.timer = setTimeout(() => this.run('scheduled').catch(error => console.error('Falha no backup automático:', error)), Math.max(1000, dueAt - Date.now()));
    this.timer.unref?.();
  }

  async start() { await this.ready; if (this.autoSchedule) this.schedule(); }
  async reload() { await this.cleanup(); if (this.autoSchedule) this.schedule(); }
  stop() { clearTimeout(this.timer); this.timer = null; }
  status() { return { ...this.state, running: this.running, settings: this.settings(), count: this.catalog.length }; }
  async getFile(name) {
    await this.ready;
    const filePath = this.safeFile(name);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat?.isFile()) throw new Error('Backup não encontrado.');
    return filePath;
  }
  async delete(name) {
    const filePath = await this.getFile(name);
    await fs.promises.rm(filePath, { force: true });
    await this.refreshCatalog();
    if (this.autoSchedule) this.schedule();
    return true;
  }
}

module.exports = { BackupManager, copyRegularTree };
