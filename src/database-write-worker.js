const { Database } = require('./database');
const { importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv } = require('./csv-import');

const dbPath = process.env.HUB_DB_PATH;
if (!dbPath) throw new Error('HUB_DB_PATH ausente no processo de escrita.');
const database = new Database(dbPath, { seedBundledContent: false });
const db = database.db;
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;
  PRAGMA temp_store=MEMORY;
  PRAGMA cache_size=-4096;
  PRAGMA auto_vacuum=INCREMENTAL;
`);

let logRowsSincePrune = 0;

const statements = {
  insertLog: db.prepare('INSERT INTO message_logs(created_at,chat_id,chat_name,message_excerpt,match_type,matched_item,reply_excerpt) VALUES (?,?,?,?,?,?,?)'),
  incrementUsage: db.prepare(`INSERT INTO usage_stats(day,topic,match_type,count) VALUES (?,?,?,?)
    ON CONFLICT(day,topic,match_type) DO UPDATE SET count=count+excluded.count`),
  upsertGroup: db.prepare(`INSERT INTO groups(whatsapp_id,name,enabled,last_seen_at,allow_help,allow_teachers,allow_links,allow_faqs,allow_calculator,allow_messages)
    VALUES (?,?,0,?,1,1,1,1,1,1) ON CONFLICT(whatsapp_id) DO UPDATE SET name=excluded.name,last_seen_at=excluded.last_seen_at`),
  getOutboundById: db.prepare('SELECT * FROM outbound_deliveries WHERE id=?'),
  getOutboundByKey: db.prepare("SELECT * FROM outbound_deliveries WHERE idempotency_key=? AND idempotency_key<>''"),
  insertOutbound: db.prepare(`INSERT OR IGNORE INTO outbound_deliveries(
    conversation_id,content_json,state,attempts,next_attempt_at,last_error,created_at,updated_at,idempotency_key,priority,source_message_id
  ) VALUES (?,?,'pending',0,'','',?,?,?,?,?)`),
  claimOutbound: db.prepare(`UPDATE outbound_deliveries SET state='sending',attempts=attempts+1,claim_token=?,updated_at=? WHERE id=? AND state IN ('pending','retry')`),
  markSent: db.prepare(`UPDATE outbound_deliveries SET state='sent',whatsapp_message_id=?,last_error='',claim_token='',sent_at=?,updated_at=?
    WHERE id=? AND state IN ('sending','retry','uncertain') AND (? IS NULL OR attempts=?)`),
  markRetry: db.prepare(`UPDATE outbound_deliveries SET state='retry',next_attempt_at=?,last_error=?,claim_token='',updated_at=?
    WHERE id=? AND state IN ('pending','retry','sending','uncertain') AND (? IS NULL OR attempts=?)`),
  markFailed: db.prepare(`UPDATE outbound_deliveries SET state='failed',last_error=?,claim_token='',updated_at=?
    WHERE id=? AND state IN ('pending','retry','sending','uncertain') AND (? IS NULL OR attempts=?)`),
  markUncertain: db.prepare(`UPDATE outbound_deliveries SET state='uncertain',next_attempt_at='',last_error=?,claim_token='',updated_at=?
    WHERE id=? AND state IN ('sending','retry') AND (? IS NULL OR attempts=?)`)
};

function nowIso() { return new Date().toISOString(); }
function outboundAttempt(value) { if (value === null || value === undefined || value === '') return null; const attempt = Number(value); return Number.isInteger(attempt) && attempt >= 0 ? attempt : null; }
function parseJson(value, fallback = {}) { try { return JSON.parse(value); } catch { return fallback; } }
function mapOutbound(row) {
  if (!row) return null;
  return { ...row, id: Number(row.id), attempts: Number(row.attempts || 0), priority: Number(row.priority || 0), content: parseJson(row.content_json, {}) };
}
function transaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = callback(); db.exec('COMMIT'); return result; }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

const DATABASE_CALL_ALLOWLIST = new Set([
  'setSettings','changeAdminPassword','deleteExampleData',
  'saveAutomaticMessageDraft','saveAutomaticMessage','reorderAutomaticMessages','bulkAutomaticMessages',
  'publishAutomaticMessage','discardAutomaticMessageDraft','deleteAutomaticMessage','resolvePackageAutomaticMessageUpdate',
  'duplicateAutomaticMessage','restoreAutomaticMessageHistory','setAutomaticMessageAttachment','clearAutomaticMessageAttachment',
  'applyProfessorScheduleImport','replaceProfessorScheduleEntries','syncProfessorScheduleRecord','saveProfessorScheduleEntry','deleteProfessorScheduleEntry','saveAcademicCalendarEvent','deleteAcademicCalendarEvent','saveTeacher','deleteTeacher','revertChangeHistory','saveSector','deleteSector','saveSynonymGroup','deleteSynonymGroup',
  'saveHubLinkDraft','publishHubLink','discardHubLinkDraft','deleteHubLink',
  'saveFaqDraft','publishFaq','discardFaqDraft','deleteFaq','saveCalculator','setGroupPermissions',
  'clearLogs','clearUsageStats','importData','updateLinkHealth','applyLinkHealthBatch',
  'retryUncertainOutboundDelivery'
]);

function execute(type, payload = {}) {
  switch (type) {
    case 'logs.batch':
      return transaction(() => {
        const logs = payload.logs || [];
        for (const log of logs) statements.insertLog.run(log.createdAt || nowIso(), log.chatId || '', log.chatName || '', log.message || '', log.matchType || '', log.matchedItem || '', log.reply || '');
        logRowsSincePrune += logs.length;
        if (logRowsSincePrune >= 250) {
          const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
          db.prepare('DELETE FROM message_logs WHERE created_at<?').run(cutoff);
          db.exec('DELETE FROM message_logs WHERE id NOT IN (SELECT id FROM message_logs ORDER BY id DESC LIMIT 10000);');
          logRowsSincePrune = 0;
        }
        return { written: logs.length };
      });
    case 'usage.batch':
      return transaction(() => {
        for (const row of payload.rows || []) statements.incrementUsage.run(row.day, row.topic, row.matchType, Number(row.count || 0));
        return { written: (payload.rows || []).length };
      });
    case 'groups.batch':
      return transaction(() => {
        for (const group of payload.groups || []) statements.upsertGroup.run(String(group.whatsappId || ''), String(group.name || ''), group.seenAt || nowIso());
        return { written: (payload.groups || []).length };
      });
    case 'database.call': {
      const method = String(payload.method || '');
      if (!DATABASE_CALL_ALLOWLIST.has(method) || typeof database[method] !== 'function') throw new Error(`Operação de banco não permitida: ${method}`);
      return database[method](...(Array.isArray(payload.args) ? payload.args : []));
    }
    case 'database.import.teachers':
      return importTeachersCsv(database, String(payload.csv || ''));
    case 'database.import.links':
      return importLinksCsv(database, String(payload.csv || ''), { publish: Boolean(payload.publish) });
    case 'database.import.messages':
      return importAutomaticMessagesCsv(database, String(payload.csv || ''), { publish: payload.publish !== false });
    case 'outbound.enqueue': {
      const timestamp = nowIso();
      const key = String(payload.idempotencyKey || '').slice(0, 180);
      if (key) {
        const existing = statements.getOutboundByKey.get(key);
        if (existing) return mapOutbound(existing);
      }
      const result = statements.insertOutbound.run(String(payload.conversationId || ''), JSON.stringify(payload.content || {}), timestamp, timestamp, key,
        Math.max(-100, Math.min(100, Number(payload.priority || 0))), String(payload.sourceMessageId || '').slice(0, 180));
      if (result.lastInsertRowid) return mapOutbound(statements.getOutboundById.get(Number(result.lastInsertRowid)));
      return key ? mapOutbound(statements.getOutboundByKey.get(key)) : null;
    }
    case 'outbound.claim': {
      const token = String(payload.claimToken || '').slice(0, 120);
      if (!token) throw new Error('Token de reserva da entrega ausente.');
      const result = statements.claimOutbound.run(token, nowIso(), Number(payload.id));
      const delivery = mapOutbound(statements.getOutboundById.get(Number(payload.id)));
      const ownsClaim = delivery?.state === 'sending' && delivery?.claim_token === token;
      return delivery ? { ...delivery, claimed: Boolean(result.changes || ownsClaim), claimOwned: ownsClaim } : null;
    }
    case 'outbound.sent': {
      const timestamp = nowIso(); const attempt = outboundAttempt(payload.expectedAttempt);
      const result = statements.markSent.run(String(payload.whatsappMessageId || ''), timestamp, timestamp, Number(payload.id), attempt, attempt);
      const delivery = mapOutbound(statements.getOutboundById.get(Number(payload.id)));
      return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
    }
    case 'outbound.retry': {
      const due = new Date(Date.now() + Math.max(500, Number(payload.delayMs || 0))).toISOString(); const attempt = outboundAttempt(payload.expectedAttempt);
      const result = statements.markRetry.run(due, String(payload.error || 'falha temporária').slice(0, 1000), nowIso(), Number(payload.id), attempt, attempt);
      const delivery = mapOutbound(statements.getOutboundById.get(Number(payload.id)));
      return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
    }
    case 'outbound.failed': {
      const attempt = outboundAttempt(payload.expectedAttempt);
      const result = statements.markFailed.run(String(payload.error || 'falha permanente').slice(0, 1000), nowIso(), Number(payload.id), attempt, attempt);
      const delivery = mapOutbound(statements.getOutboundById.get(Number(payload.id)));
      return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
    }
    case 'outbound.uncertain': {
      const attempt = outboundAttempt(payload.expectedAttempt);
      const result = statements.markUncertain.run(String(payload.error || 'resultado do envio desconhecido').slice(0, 1000), nowIso(), Number(payload.id), attempt, attempt);
      const delivery = mapOutbound(statements.getOutboundById.get(Number(payload.id)));
      return delivery ? { ...delivery, transitioned: Boolean(result.changes) } : null;
    }
    case 'maintenance.prune': {
      return {
        outbound: database.pruneOutboundDeliveries(payload.outbound || {}),
        tasks: database.pruneAdminTaskRuns(payload.tasks || {}),
        logs: database.pruneLogs()
      };
    }
    case 'maintenance.optimize': {
      const passive = db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get() || {};
      const pageCount = Number(db.prepare('PRAGMA page_count').get()?.page_count || 0);
      const freePages = Number(db.prepare('PRAGMA freelist_count').get()?.freelist_count || 0);
      let checkpoint = passive;
      if (payload.force || Number(passive.log || passive[1] || 0) > Number(payload.maxWalFrames || 4096)) checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() || passive;
      if (payload.analyze) db.exec('ANALYZE;');
      db.exec('PRAGMA optimize;');
      if (freePages > Math.max(1000, pageCount * 0.1)) db.exec(`PRAGMA incremental_vacuum(${Math.min(freePages, 2000)});`);
      return { checkpoint, pageCount, freePages, optimizedAt: nowIso() };
    }
    default: throw new Error(`Operação de escrita desconhecida: ${type}`);
  }
}

process.on('message', message => {
  if (!message || message.kind !== 'request') return;
  try { process.send?.({ kind: 'response', id: message.id, result: execute(message.type, message.payload || {}) }); }
  catch (error) { process.send?.({ kind: 'response', id: message.id, error: error?.stack || error?.message || String(error) }); }
});

function shutdown() { try { database.close(); } catch {} process.exit(0); }
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
