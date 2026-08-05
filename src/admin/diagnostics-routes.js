'use strict';

module.exports = async function handleRoute(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES, previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText } = deps;
  const route = url.pathname;
  return await (async function dispatch() {
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
    const diagnosticAction=route.match(/^\/api\/diagnostics\/(\d+)\/actions$/);
    if(diagnosticAction&&req.method==='POST'){
      const body=await readBody(req); const event=(this.diagnostics?.list({after:0,limit:2000})||[]).find(item=>Number(item.id)===Number(diagnosticAction[1]));
      if(!event) throw httpError('Diagnóstico não encontrado.',404);
      if(body.action==='add-test') return json(res,201,await this.mutateDatabase('saveRegressionCase',[{phrase:event.message,expectation:body.expectation||'respond',expected_title:event.matchedItem||''}],{reason:'diagnostic-to-test',reloadRules:false}));
      if(body.action==='negative'&&body.message_id) return json(res,201,await this.mutateDatabase('addNegativeExampleSuggestion',[{message_excerpt:event.message,message_id:Number(body.message_id),message_title:event.matchedItem,source:'diagnostic'}],{reason:'diagnostic-negative-suggestion',reloadRules:false}));
      if(body.action==='positive'&&body.message_id) return json(res,201,await this.mutateDatabase('addUnrecognizedSuggestion',[{message_excerpt:event.message,suggested_message_id:Number(body.message_id),suggested_title:event.matchedItem,confidence:.9,reasons:['criado pelo diagnóstico']}],{reason:'diagnostic-positive-suggestion',reloadRules:false}));
      throw httpError('Ação de diagnóstico inválida.',400);
    }
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
    if (route === '/api/quality/runtime' && req.method === 'GET') return json(res, 200, runtimeCompatibility());
    if (route === '/api/quality/migrations' && req.method === 'GET') return json(res, 200, this.db.listSchemaMigrations?.() || []);
    if (route === '/api/quality/academic' && req.method === 'GET') return json(res, 200, this.db.academicDataStatus?.() || {});
    if (route === '/api/quality/recovery' && req.method === 'GET') return json(res, 200, this.db.recoveryMetrics?.({ days: url.searchParams.get('days') || 30 }) || {});
    if (route === '/api/quality/observations' && req.method === 'GET') return json(res, 200, this.db.listTriggerObservations?.({ state: url.searchParams.get('state') || 'pending', limit: url.searchParams.get('limit') || 100 }) || []);
    if (route === '/api/quality/false-positives' && req.method === 'GET') return json(res, 200, this.db.listFalsePositiveReports?.({ state: url.searchParams.get('state') || 'pending', limit: url.searchParams.get('limit') || 100 }) || []);
    if (route === '/api/quality/corpus' && req.method === 'GET') return json(res, 200, this.db.listCorpusCases?.({ activeOnly: url.searchParams.get('active') !== '0' }) || []);
    if (route === '/api/quality/trigger-policies' && req.method === 'GET') return json(res, 200, TRIGGER_POLICY_TYPES);
    if (route === '/api/quality/intent-metrics' && req.method === 'GET') return json(res, 200, this.db.intentMetrics?.({ days: url.searchParams.get('days') || 30 }) || []);
    if (route === '/api/simulator' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, this.engine.simulate(body.message || '', { groupId: body.group_id || '', isGroup: body.is_group !== false, ignorePermissions: Boolean(body.ignore_permissions), includeDrafts: body.include_drafts !== false }));
    }
    if (route === '/api/simulator/conversation' && req.method === 'POST') {
      const body=await readBody(req,2*1024*1024); const simulation=await simulateConversation(this.engine,this.db,body.messages||body.text||[],{is_group:Boolean(body.is_group)});
      const saved=body.save?this.db.saveConversationSimulation({title:body.title||'',messages:simulation.messages,results:simulation.results,savedAsTest:Boolean(body.save_as_test)}):null;
      if(body.save_as_test){ for(const step of simulation.results){ const response=step.replies?.[0]?.text||''; if(step.input)this.db.saveRegressionCase({phrase:step.input,expectation:response?'respond':'ignore',expected_title:''}); } }
      return json(res,200,{...simulation,saved});
    }
    if (route === '/api/simulator/conversations' && req.method === 'GET') return json(res,200,this.db.listConversationSimulations?.(url.searchParams.get('limit')||50)||[]);
    if (route === '/api/conflicts' && req.method === 'GET') {
      const report = this.adminTasks ? await this.adminTasks.run('conflicts.calculate', {}, { timeoutMs: 120000 }) : this.db.getConflictReport();
      return json(res, 200, report);
    }
    if (route === '/api/logs' && req.method === 'GET') return json(res, 200, this.db.listLogs(url.searchParams.get('limit') || 200));
    if (route === '/api/logs' && req.method === 'DELETE') { await this.mutateDatabase('clearLogs', [], { reason: 'logs-cleared', reloadRules: false }); return json(res, 200, { ok: true }); }
    if (route === '/api/analytics' && req.method === 'GET') return json(res, 200, this.db.getUsageStats(url.searchParams.get('days') || 30));
    if (route === '/api/analytics' && req.method === 'DELETE') { await this.mutateDatabase('clearUsageStats', [], { reason: 'analytics-cleared', reloadRules: false }); return json(res, 200, { ok: true }); }
    
    if (route === '/api/consistency' && req.method === 'GET') {
      const report = runConsistencyCheck(this.db, { attachmentsDir: this.config.attachmentsDir });
      this.statusParts.set('consistency', { value: report, expiresAt: Date.now() + 60_000 });
      return json(res, 200, report);
    }
    if (route === '/api/system/verify' && req.method === 'POST') {
      const database = this.db.healthCheck({ deep: true });
      const consistency = runConsistencyCheck(this.db, { attachmentsDir: this.config.attachmentsDir });
      this.statusParts.delete('database-health'); this.statusParts.delete('consistency');
      return json(res, 200, { ok: database.ok && consistency.ok, database, consistency });
    }
    if (route === '/api/system/test-send' && req.method === 'POST') return json(res, 202, await this.whatsapp.sendSelfTest());
    if (route === '/api/system/restart' && req.method === 'POST') { this.scheduleServiceRestart(); return json(res, 202, { ok: true, message: 'Reinício agendado.' }); }
    if (route === '/api/system/logs' && req.method === 'GET') {
      const output = this.runControl('logs', [url.searchParams.get('limit') || '1000'], { timeout: 30_000 });
      return text(res, 200, output, 'text/plain; charset=utf-8', { 'Content-Disposition': `attachment; filename="hub-whatsapp-bot-logs-${new Date().toISOString().slice(0,10)}.txt"` });
    }
    if (route === '/api/change-history' && req.method === 'GET') return json(res, 200, this.db.listChangeHistory({ limit: url.searchParams.get('limit') || 200, entityType: url.searchParams.get('entity_type') || '', entityId: url.searchParams.get('entity_id') || '' }));
    const revertHistory = route.match(/^\/api\/change-history\/(\d+)\/revert$/);
    if (revertHistory && req.method === 'POST') return json(res, 200, await this.mutateDatabase('revertChangeHistory', [revertHistory[1]], { reason: 'change-history-reverted' }));
    return json(res, 404, { error: 'Rota não encontrada.' });
  }).call(server);
};
