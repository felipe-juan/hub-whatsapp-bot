'use strict';

module.exports = async function handleRoute(server, req, res, url, deps) {
  const { fs, path, crypto, os, execFileSync, spawn, json, text, readBody, readBuffer, streamFile, safeStreamWrite, httpError, runtimeCompatibility, TRIGGER_POLICY_TYPES, previewLearningImpact, simulateConversation, runConsistencyCheck, systemHealth, importTeachersCsv, importLinksCsv, importAutomaticMessagesCsv, parseProfessorScheduleFile, parseAcademicCalendarCsv, normalizeText } = deps;
  const route = url.pathname;
  return await (async function dispatch() {
    if (route === '/api/import/professor-schedule/preview' && req.method === 'POST') {
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'quadro-docente.csv'));
      const academicPeriod = decodeURIComponent(String(req.headers['x-academic-period'] || ''));
      const buffer = await readBuffer(req, 25 * 1024 * 1024);
      const parsed = this.adminTasks
        ? await this.withTemporaryUpload(buffer, fileName, filePath => this.adminTasks.run('professor.preview', { filePath, fileName, academicPeriod }, { timeoutMs: 180000 }))
        : (() => { const value = parseProfessorScheduleFile(buffer, fileName, { academicPeriod }); return { ...value, preview: this.db.previewProfessorScheduleImport(value.records) }; })();
      const effectivePeriod=String(academicPeriod||parsed.records?.[0]?.academic_period||'').trim();
      const previousPeriod=String(this.db.getSetting('current_academic_period','')||'');
      parsed.period_preview=this.db.previewAcademicPeriodImport?.(parsed.records||[],{period:effectivePeriod,previousPeriod:previousPeriod!==effectivePeriod?previousPeriod:''})||null;
      return json(res, 200, parsed);
    }
    if (route === '/api/import/professor-schedule/apply' && req.method === 'POST') {
      const body = await readBody(req, 10 * 1024 * 1024);
      const result = await this.mutateDatabase('applyProfessorScheduleImport', [body.records || [], body.selected_change_ids ?? null], { reason: 'professor-import', timeoutMs: 180_000 });
      const period=String(body.records?.[0]?.academic_period||'').trim();
      if(period){ const count=this.db.listProfessorScheduleEntries?.({academicPeriod:period,activeOnly:false}).length||0; this.db.saveAcademicPeriod?.({period,state:'draft',entry_count:count,previous_period:this.db.getSetting('current_academic_period',''),source_title:body.records?.[0]?.source_title||'Importação do quadro',source_date:body.records?.[0]?.source_date||''}); this.db.syncAcademicDisciplinesFromSchedule?.(period); }
      return json(res, 200, {...result,academic_period:period,period_state:period?'draft':''});
    }
    if (route === '/api/templates/professor-schedule.csv' && req.method === 'GET') return text(res, 200,
      `professor,email,disciplina,semestre,dia,horário,período letivo
    Allan de Sousa Soares,allansoares@ifba.edu.br,Matemática Discreta I,1º semestre,quinta-feira,18h30–20h10 e 20h20–22h,2027.1
    `,
      'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="quadro-docente-modelo.csv"' });
    if (route === '/api/professor-schedule-entries' && req.method === 'GET') return json(res, 200, this.db.listProfessorScheduleEntries({
      academicPeriod: url.searchParams.get('period') || this.db.getSetting('current_academic_period', '2026.2'),
      semester: url.searchParams.get('semester') || 0,
      dayOfWeek: url.searchParams.has('day') ? Number(url.searchParams.get('day')) : null,
      professor: url.searchParams.get('professor') || '', discipline: url.searchParams.get('discipline') || ''
    }));
    if (route === '/api/professor-schedule-entries' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveProfessorScheduleEntry', [await readBody(req)], { reason: 'structured-schedule-created' }));
    const structuredScheduleMatch = route.match(/^\/api\/professor-schedule-entries\/(\d+)$/);
    if (structuredScheduleMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveProfessorScheduleEntry', [await readBody(req), structuredScheduleMatch[1]], { reason: 'structured-schedule-updated' }));
    if (structuredScheduleMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteProfessorScheduleEntry', [structuredScheduleMatch[1]], { reason: 'structured-schedule-deleted' }) });
    if (route === '/api/import/academic-calendar/preview' && req.method === 'POST') {
      const buffer = await readBuffer(req, 5 * 1024 * 1024);
      return json(res, 200, parseAcademicCalendarCsv(buffer.toString('utf8')));
    }
    if (route === '/api/import/academic-calendar/apply' && req.method === 'POST') {
      const body = await readBody(req, 5 * 1024 * 1024);
      return json(res, 200, await this.mutateDatabase('applyAcademicCalendarImport', [body.events || []], { reason: 'academic-calendar-import', reloadRules: false }));
    }
    if (route === '/api/templates/academic-calendar.csv' && req.method === 'GET') return text(res, 200,
      'tipo,data_inicial,data_final,titulo,descricao,curso,semestres,disciplina,professor,sala_anterior,nova_sala,dia_de_reposicao,hora_inicial,hora_final,recorrencia,dias_da_semana,intervalo_semanas,url_fonte,fonte,verificada_em,ativo\nMudança de sala,10/08/2026,31/08/2026,LPII na H105,,bsi,3,LPII,,H108,H105,,,,semanal,segunda,1,,,03/08/2026,sim\n',
      'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="excecoes-academicas-modelo.csv"' });
    
    if (route === '/api/academic-disciplines' && req.method === 'GET') return json(res,200,this.db.listAcademicDisciplines?.({activeOnly:url.searchParams.get('all')!=='1'})||[]);
    if (route === '/api/academic-disciplines' && req.method === 'POST') return json(res,201,await this.mutateDatabase('saveAcademicDiscipline',[await readBody(req)],{reason:'academic-discipline-created',reloadRules:true}));
    const academicDisciplineMatch=route.match(/^\/api\/academic-disciplines\/(\d+)$/);
    if(academicDisciplineMatch&&req.method==='PUT') return json(res,200,await this.mutateDatabase('saveAcademicDiscipline',[await readBody(req),academicDisciplineMatch[1]],{reason:'academic-discipline-updated',reloadRules:true}));
    if (route === '/api/academic-periods' && req.method === 'GET') return json(res,200,this.db.listAcademicPeriods?.()||[]);
    if (route === '/api/academic-periods/preview' && req.method === 'POST') { const body=await readBody(req,10*1024*1024); return json(res,200,this.db.previewAcademicPeriodImport?.(body.records||[],{period:body.period||'',previousPeriod:body.previous_period||''})||{}); }
    const publishPeriod=route.match(/^\/api\/academic-periods\/([^/]+)\/publish$/);
    if(publishPeriod&&req.method==='POST') return json(res,200,await this.mutateDatabase('publishAcademicPeriod',[decodeURIComponent(publishPeriod[1]),await readBody(req)],{reason:'academic-period-published',reloadRules:true}));
    if (route === '/api/academic-calendar' && req.method === 'GET') return json(res, 200, this.db.listAcademicCalendarEvents({
      startDate: url.searchParams.get('start') || '', endDate: url.searchParams.get('end') || '',
      activeOnly: url.searchParams.get('all') !== '1', course: url.searchParams.get('course') || ''
    }));
    if (route === '/api/academic-calendar' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveAcademicCalendarEvent', [await readBody(req)], { reason: 'academic-calendar-created', reloadRules: false }));
    const academicCalendarMatch = route.match(/^\/api\/academic-calendar\/(\d+)$/);
    if (academicCalendarMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveAcademicCalendarEvent', [await readBody(req), academicCalendarMatch[1]], { reason: 'academic-calendar-updated', reloadRules: false }));
    if (academicCalendarMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteAcademicCalendarEvent', [academicCalendarMatch[1]], { reason: 'academic-calendar-deleted', reloadRules: false }) });
    if (route === '/api/teachers' && req.method === 'GET') return json(res, 200, this.db.listTeachers({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/teachers' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveTeacher', [await readBody(req)], { reason: 'teacher-created', reloadRules: true }));
    const teacherMatch = route.match(/^\/api\/teachers\/(\d+)$/);
    if (teacherMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveTeacher', [await readBody(req), teacherMatch[1]], { reason: 'teacher-updated', reloadRules: true }));
    if (teacherMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteTeacher', [teacherMatch[1]], { reason: 'teacher-deleted', reloadRules: true }) });
    
    if (route === '/api/sectors' && req.method === 'GET') return json(res, 200, this.db.listSectors({ search: url.searchParams.get('q') || '' }));
    if (route === '/api/sectors' && req.method === 'POST') return json(res, 201, await this.mutateDatabase('saveSector', [await readBody(req)], { reason: 'sector-created', reloadRules: true }));
    const sectorMatch = route.match(/^\/api\/sectors\/(\d+)$/);
    if (sectorMatch && req.method === 'PUT') return json(res, 200, await this.mutateDatabase('saveSector', [await readBody(req), sectorMatch[1]], { reason: 'sector-updated', reloadRules: true }));
    if (sectorMatch && req.method === 'DELETE') return json(res, 200, { deleted: await this.mutateDatabase('deleteSector', [sectorMatch[1]], { reason: 'sector-deleted', reloadRules: true }) });
    return json(res, 404, { error: 'Rota não encontrada.' });
  }).call(server);
};
