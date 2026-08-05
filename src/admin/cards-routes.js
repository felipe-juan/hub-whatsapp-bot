'use strict';

module.exports = async function handleRoute(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES, previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText } = deps;
  const route = url.pathname;
  return await (async function dispatch() {
    if (route === '/api/settings' && req.method === 'GET') return json(res, 200, this.db.getSettings());
    if (route === '/api/settings' && req.method === 'PUT') {
      const result = await this.mutateDatabase('setSettings', [await readBody(req)], { reason: 'settings', reloadRules: false }); this.backups?.reload?.().catch?.(error => console.warn('Falha ao recarregar backups:', error.message)); this.externalBackups?.reload?.(); this.adminScheduler?.reload?.(); this.publish('settings-changed', {}); return json(res, 200, result);
    }
    if (route === '/api/security/password' && req.method === 'POST') {
      const body = await readBody(req); await this.mutateDatabase('changeAdminPassword', [body.current_password || '', body.new_password || ''], { reason: 'password', reloadRules: false }); this.clearSessions();
      return json(res, 200, { ok: true, relogin: true }, { 'Set-Cookie': 'hub_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
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
    if (route === '/api/import/messages-csv' && req.method === 'POST') { const body = await readBody(req, 5 * 1024 * 1024); const result = this.writeQueue?.importMessagesCsv ? await this.writeQueue.importMessagesCsv(body.csv || '', { publish: body.publish !== false }) : importAutomaticMessagesCsv(this.db, body.csv || '', { publish: body.publish !== false }); await this.refreshAfterExternalTask('messages-import'); return json(res, 200, result); }
    if (route === '/api/templates/messages.csv' && req.method === 'GET') return text(res, 200, 'title,scope,sentences,keywords,require_question_mark,response_text,priority,active,publish\nContato de Bruno,both,"qual o contato de bruno|email do professor bruno","bruno|contato",true,"📧 contato.bruno@example.invalid",50,true,true\n', 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="mensagens-modelo.csv"' });
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
    return json(res, 404, { error: 'Rota não encontrada.' });
  }).call(server);
};
