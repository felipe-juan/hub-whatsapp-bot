'use strict';

module.exports = async function handleRoute(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES, previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText } = deps;
  const route = url.pathname;
  return await (async function dispatch() {
    if (route === '/api/external-backups' && req.method === 'GET') return json(res, 200, this.externalBackups?.status?.() || { configured: false });
    if (route === '/api/external-backups/run' && req.method === 'POST') { if (!this.externalBackups) throw httpError('Backup externo indisponível.', 503); return json(res, 201, await this.externalBackups.run('manual')); }
    if (route === '/api/outbound' && req.method === 'GET') return json(res, 200, { stats: this.db.outboundDeliveryStats(), items: this.db.listOutboundDeliveries({ state: url.searchParams.get('state') || '', limit: url.searchParams.get('limit') || 100 }) });
    
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
    if (route === '/api/update/remote' && req.method === 'GET') {
      if (!this.updates) throw httpError('Gerenciador de atualizações indisponível.', 503);
      const settings = this.db.getSettings();
      return json(res, 200, await this.updates.checkRemote(settings.update_github_repository, settings.update_github_branch));
    }
    if (route === '/api/update/remote/apply' && req.method === 'POST') {
      if (!this.updates) throw httpError('Gerenciador de atualizações indisponível.', 503);
      const settings = this.db.getSettings();
      const backups = await this.prepareUpdateBackups('pre-update');
      const result = await this.updates.downloadRemoteAndApply(settings.update_github_repository, settings.update_github_branch);
      return json(res, 202, { ...result, backups });
    }
    if (route === '/api/update/upload' && req.method === 'POST') {
      if (!this.updates) throw new Error('Gerenciador de atualizações indisponível.');
      const fileName = decodeURIComponent(String(req.headers['x-update-filename'] || 'update.zip'));
      const buffer = await readBuffer(req, 100 * 1024 * 1024);
      await this.prepareUpdateBackups('pre-update');
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
  }).call(server);
};
