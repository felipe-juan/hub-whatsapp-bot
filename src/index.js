const fs = require('node:fs');
const config = require('./config');
const { Database } = require('./database');
const { BotEngine } = require('./bot-engine');
const { WhatsAppManager } = require('./whatsapp');
const { AdminServer } = require('./admin-server');
const { BackupManager } = require('./backup-manager');
const { LinkChecker } = require('./link-checker');
const { UpdateManager } = require('./update-manager');
const { DiagnosticBus } = require('./diagnostics');
const { AttachmentManager } = require('./attachment-manager');
const { RealtimeBus } = require('./realtime-bus');
const { AdminTaskRunner } = require('./admin-task-runner');
const { AdminScheduler } = require('./admin-scheduler');
const { loadRuleSnapshotFile } = require('./rule-snapshot');
const { DatabaseWriteQueue } = require('./database-write-queue');
const { CoreIpcServer, CoreIpcClient } = require('./unix-ipc');

async function main() {
  await Promise.all([
    fs.promises.mkdir(config.dataDir, { recursive: true }),
    fs.promises.mkdir(config.attachmentsDir, { recursive: true }),
    fs.promises.mkdir(config.backupDir, { recursive: true })
  ]);

  // Adquire a exclusividade antes de abrir o SQLite ou criar workers. Uma
  // segunda instância não pode executar migrações nem recuperar entregas que
  // pertencem ao processo já ativo.
  const realtime = new RealtimeBus({ maxEntries: 300, batchWindowMs: 150 });
  const ipcHandlers = {};
  const ipcServer = new CoreIpcServer({ socketPath: config.ipcSocketPath, realtime, handlers: ipcHandlers });
  await ipcServer.start();

  const database = new Database(config.dbPath);
  const initialRuleSnapshot = await loadRuleSnapshotFile(config.ruleSnapshotPath);
  const diagnostics = new DiagnosticBus({ maxEntries: 500 });
  const writeQueue = new DatabaseWriteQueue({ dbPath: config.dbPath, realtime });
  const attachments = new AttachmentManager({ dir: config.attachmentsDir });
  const engine = new BotEngine(database, {
    groupTouchIntervalSeconds: config.groupTouchIntervalSeconds,
    diagnostics,
    ruleSnapshotPath: config.ruleSnapshotPath,
    initialRuleSnapshot
  });
  const whatsapp = new WhatsAppManager({ config, database, engine, realtime, writeQueue });
  const backups = new BackupManager({ database, backupDir: config.backupDir, dataDir: config.dataDir, attachmentsDir: config.attachmentsDir, authDir: config.authDir, rootDir: config.rootDir, autoSchedule: false });
  const linkChecker = new LinkChecker({ database });
  const updates = new UpdateManager({ rootDir: config.rootDir, dataDir: config.dataDir });
  const adminTasks = new AdminTaskRunner({ database, realtime });
  const adminScheduler = new AdminScheduler({ database, tasks: adminTasks, backupManager: backups, linkChecker, realtime, writeQueue });
  Object.assign(ipcHandlers, {
      'core.health': async () => ({ whatsapp: whatsapp.getStatus(), engine: engine.getMetrics(), writer: writeQueue.status() }),
      'rules.reload': async payload => { database.refreshExternalChanges(); return { generation: (await engine.reloadRules(payload.reason || 'ipc')).generation }; },
      'whatsapp.restart': async () => { await whatsapp.restart(); return { ok: true }; },
      'whatsapp.sync-groups': async () => ({ synced: await whatsapp.syncGroups() }),
      'outbound.drain': async () => { whatsapp.scheduleOutboundDrain(50); return { ok: true }; },
      'database.optimize': async payload => writeQueue.optimize(payload || {})
  });
  const coreIpc = new CoreIpcClient({ socketPath: config.ipcSocketPath });

  // Comandos administrativos do WhatsApp também usam o processo auxiliar.
  const backupProxy = { run: async reason => { const result = await adminTasks.run('backup.json', { reason }, { timeoutMs: 10 * 60 * 1000 }); await backups.refreshCatalog(); return result; } };
  const linksProxy = { run: async reason => {
    const raw = await adminTasks.run('links.run', { reason }, { timeoutMs: 15 * 60 * 1000 });
    const updates = Array.isArray(raw?.updates) ? raw.updates : [];
    if (updates.length) await writeQueue.callDatabase('applyLinkHealthBatch', [updates], 120_000);
    database.refreshExternalChanges('activeMessages');
    const { updates: _updates, ...result } = raw || {};
    return result;
  } };
  engine.setServices({ whatsapp, backupManager: backupProxy, linkChecker: linksProxy, attachments, writeQueue });

  database.onChange(event => realtime.publish('database-change', event));
  const admin = new AdminServer({ config, database, whatsapp, engine, backupManager: backups, linkChecker, updateManager: updates, diagnostics, attachments, adminTasks, adminScheduler, realtime, writeQueue, coreIpc });
  await attachments.cleanup(database.referencedAttachmentNames());

  await admin.start();
  await adminScheduler.start();
  whatsapp.start().catch(error => console.error('Erro ao iniciar WhatsApp:', error));

  let shuttingDown = false;
  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal}: encerrando...`);
    adminScheduler.stop();
    const forcedExit = setTimeout(() => process.exit(1), 18_000);
    forcedExit.unref?.();
    coreIpc.close();
    // O núcleo conclui/reagenda os envios antes de encerrar o escritor do banco.
    await whatsapp.destroy().catch(() => {});
    await Promise.allSettled([adminTasks.close(), admin.stop?.(), ipcServer.close()]);
    await writeQueue.close().catch(() => {});
    engine.close?.();
    database.close();
    clearTimeout(forcedExit);
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(error => { console.error(error); process.exit(1); });
