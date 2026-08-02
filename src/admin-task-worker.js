const os = require('node:os');
const fs = require('node:fs/promises');
const config = require('./config');
const { Database } = require('./database');
const { BackupManager } = require('./backup-manager');
const { LinkChecker } = require('./link-checker');
const { UpdateManager } = require('./update-manager');
const { importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv } = require('./csv-import');
const { parseProfessorScheduleFile } = require('./professor-schedule-import');

try { os.setPriority(0, 10); } catch {}

let db;
let backups;
let links;
let updates;

const ready = (async () => {
  await Promise.all([
    fs.mkdir(config.dataDir, { recursive: true }),
    fs.mkdir(config.backupDir, { recursive: true }),
    fs.mkdir(config.attachmentsDir, { recursive: true })
  ]);
  db = new Database(config.dbPath, { seedBundledContent: false });
  backups = new BackupManager({
    database: db,
    backupDir: config.backupDir,
    dataDir: config.dataDir,
    attachmentsDir: config.attachmentsDir,
    authDir: config.authDir,
    rootDir: config.rootDir,
    autoSchedule: false
  });
  links = new LinkChecker({ database: db, autoSchedule: false, persistResults: false });
  updates = new UpdateManager({ rootDir: config.rootDir, dataDir: config.dataDir });
  await backups.ready;
})();

function progress(taskId, value, message = '') {
  process.send?.({ kind: 'progress', taskId, progress: Math.max(0, Math.min(100, Number(value || 0))), message });
}

async function execute(taskId, type, payload = {}) {
  await ready;
  progress(taskId, 5, 'Tarefa iniciada');
  switch (type) {
    case 'conflicts.calculate':
      progress(taskId, 30, 'Analisando gatilhos');
      return db.getConflictReport();
    case 'professor.preview': {
      const buffer = await fs.readFile(payload.filePath);
      progress(taskId, 45, 'Lendo quadro docente');
      const parsed = parseProfessorScheduleFile(buffer, payload.fileName || 'quadro-docente.csv', { academicPeriod: payload.academicPeriod || '' });
      progress(taskId, 80, 'Comparando com cartões existentes');
      return { ...parsed, preview: db.previewProfessorScheduleImport(parsed.records) };
    }
    case 'professor.apply':
      progress(taskId, 30, 'Atualizando professores');
      return db.applyProfessorScheduleImport(payload.records || []);
    case 'import.teachers':
      return importTeachersCsv(db, payload.csv || '');
    case 'import.links':
      return importLinksCsv(db, payload.csv || '', { publish: Boolean(payload.publish) });
    case 'import.messages':
      return importAutomaticMessagesCsv(db, payload.csv || '', { publish: payload.publish !== false });
    case 'backup.json':
      progress(taskId, 25, 'Exportando banco');
      return backups.run(payload.reason || 'manual-worker');
    case 'backup.full':
      progress(taskId, 15, 'Preparando backup completo');
      return backups.createFullZip({ includeSession: Boolean(payload.includeSession) });
    case 'restore.json': {
      progress(taskId, 20, 'Lendo backup');
      const content = JSON.parse(await fs.readFile(payload.filePath, 'utf8'));
      progress(taskId, 45, 'Restaurando banco');
      db.importData(content);
      return { ok: true, messageCount: db.listAutomaticMessages().length, restoredAt: new Date().toISOString() };
    }
    case 'links.run':
      progress(taskId, 10, 'Verificando links');
      return links.run(payload.reason || 'manual-worker');
    case 'update.stage': {
      const buffer = await fs.readFile(payload.filePath);
      progress(taskId, 35, 'Validando pacote de atualização');
      return updates.stageAndApply(buffer, payload.fileName || 'update.zip');
    }
    case 'maintenance.prune':
      return { outbound: db.pruneOutboundDeliveries(), tasks: db.pruneAdminTaskRuns(), logs: db.pruneLogs(), checkpoint: db.maybeCheckpoint({ force: false }) };
    case 'database.optimize': {
      progress(taskId, 35, 'Otimizando índices e estatísticas do SQLite');
      db.db.exec('PRAGMA optimize;');
      if (payload.analyze) db.db.exec('ANALYZE;');
      const pageCount = Number(db.db.prepare('PRAGMA page_count').get()?.page_count || 0);
      const freePages = Number(db.db.prepare('PRAGMA freelist_count').get()?.freelist_count || 0);
      if (freePages > Math.max(1000, pageCount * 0.1)) db.db.exec(`PRAGMA incremental_vacuum(${Math.min(freePages, 2000)});`);
      return { ok: true, pageCount, freePages, checkpoint: db.maybeCheckpoint({ force: Boolean(payload.force), idleMs: 0 }), optimizedAt: new Date().toISOString() };
    }
    case 'database.health':
      return db.healthCheck({ deep: Boolean(payload.deep) });
    default:
      throw new Error(`Tarefa administrativa desconhecida: ${type}`);
  }
}

process.on('message', async message => {
  if (!message || message.kind !== 'task') return;
  const { taskId, type, payload } = message;
  try {
    const result = await execute(taskId, type, payload || {});
    progress(taskId, 100, 'Tarefa concluída');
    process.send?.({ kind: 'result', taskId, result });
  } catch (error) {
    process.send?.({ kind: 'error', taskId, error: error?.stack || error?.message || String(error) });
  }
});

async function shutdown() {
  await ready.catch(() => {});
  try { links?.stop(); } catch {}
  try { backups?.stop(); } catch {}
  try { db?.close(); } catch {}
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
