'use strict';

const { normalizeText } = require('../text');
const { normalizeStructuredScheduleEntry } = require('../schedule-structure');
const { buildProfessorScheduleResponse } = require('../professor-schedule-import');

function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function dateOnly(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''; }

module.exports = function createScheduleRepositoryMixin() {
  return class {
    listProfessorScheduleEntries({ academicPeriod = '', semester = 0, dayOfWeek = null, activeOnly = true, professor = '', discipline = '' } = {}) {
      let sql = 'SELECT * FROM professor_schedule_entries'; const where = []; const params = [];
      if (activeOnly) where.push('active=1');
      if (academicPeriod) { where.push('academic_period=?'); params.push(String(academicPeriod)); }
      if (Number(semester)) { where.push('semester_number=?'); params.push(Number(semester)); }
      if (dayOfWeek !== null && dayOfWeek !== undefined && Number.isInteger(Number(dayOfWeek))) { where.push('day_of_week=?'); params.push(Number(dayOfWeek)); }
      if (professor) { where.push('lower(professor_name) LIKE ?'); params.push(`%${String(professor).toLowerCase()}%`); }
      if (discipline) {
        // Consultas estruturadas de disciplina são exatas. O antigo LIKE
        // fazia siglas curtas colidirem com letras internas de outros nomes
        // (por exemplo, RC também encontrava Comércio Eletrônico).
        where.push('(lower(discipline_name)=lower(?) OR lower(discipline_code)=lower(?))');
        params.push(String(discipline), String(discipline));
      }
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY day_of_week,start_minutes,discipline_name COLLATE NOCASE,professor_name COLLATE NOCASE';
      return this.db.prepare(sql).all(...params).map(row => ({
        ...row,
        id: Number(row.id), teacher_id: row.teacher_id ? Number(row.teacher_id) : null,
        semester_number: Number(row.semester_number), day_of_week: Number(row.day_of_week),
        start_minutes: row.start_minutes === null ? null : Number(row.start_minutes),
        end_minutes: row.end_minutes === null ? null : Number(row.end_minutes), active: Boolean(row.active)
      }));
    }


    listProfessorDisciplineDirectory({ academicPeriod = '', activeOnly = true } = {}) {
      let sql = `SELECT DISTINCT professor_name,professor_email,discipline_name,discipline_code
        FROM professor_schedule_entries`;
      const where = []; const params = [];
      if (activeOnly) where.push('active=1');
      if (academicPeriod) { where.push('academic_period=?'); params.push(String(academicPeriod)); }
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY discipline_name COLLATE NOCASE,professor_name COLLATE NOCASE';
      return this.db.prepare(sql).all(...params);
    }

    getProfessorScheduleEntry(id) {
      return this.listProfessorScheduleEntries({ activeOnly: false }).find(item => Number(item.id) === Number(id)) || null;
    }

    validateProfessorScheduleEntry(input = {}) {
      const professorName=String(input.professor_name||'').trim();
      const disciplineName=String(input.discipline_name||'').trim();
      const disciplineCode=String(input.discipline_code||'').trim().toUpperCase();
      const semesterNumber=Number(input.semester_number);
      const dayOfWeek=Number(input.day_of_week);
      const startMinutes=input.start_minutes===''||input.start_minutes===null||input.start_minutes===undefined?null:Number(input.start_minutes);
      const endMinutes=input.end_minutes===''||input.end_minutes===null||input.end_minutes===undefined?null:Number(input.end_minutes);
      if(!professorName)throw new Error('Informe o professor.');
      if(!disciplineName)throw new Error('Informe o nome da disciplina.');
      if(!Number.isInteger(semesterNumber)||semesterNumber<1||semesterNumber>8)throw new Error('Semestre inválido.');
      if(!Number.isInteger(dayOfWeek)||dayOfWeek<0||dayOfWeek>6)throw new Error('Dia da semana inválido.');
      if(!Number.isInteger(startMinutes)||!Number.isInteger(endMinutes)||startMinutes<0||endMinutes>1440||endMinutes<=startMinutes)throw new Error('Informe um horário inicial e final válidos.');
      const dayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
      const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}h${String(value%60).padStart(2,'0')}`;
      const teacher=this.listTeachers({activeOnly:false}).find(item=>normalizeText(item.name)===normalizeText(professorName));
      const email=String(input.professor_email||teacher?.email||'').trim().toLowerCase();
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail do professor inválido.');
      return {teacher_id:teacher?.id||input.teacher_id||null,professor_name:professorName,professor_email:email,discipline_name:disciplineName,discipline_code:disciplineCode,semester_number:semesterNumber,semester_label:`${semesterNumber}º semestre`,day_of_week:dayOfWeek,day_label:dayNames[dayOfWeek],start_minutes:startMinutes,end_minutes:endMinutes,hours_label:`${clock(startMinutes)}–${clock(endMinutes)}`,room:String(input.room||'').trim(),academic_period:String(input.academic_period||this.getSetting('current_academic_period','2026.2')).trim(),source_title:String(input.source_title||'Editor estruturado do painel').trim(),source_version:String(input.source_version||'manual').trim(),source_date:dateOnly(input.source_date)||new Date().toISOString().slice(0,10),active:input.active===undefined?true:Boolean(input.active)};
    }

    refreshProfessorStructuredContent(professorName, academicPeriod) {
      const entries=this.listProfessorScheduleEntries({academicPeriod,activeOnly:true,professor:professorName}).filter(item=>normalizeText(item.professor_name)===normalizeText(professorName));
      const teacher=this.listTeachers({activeOnly:false}).find(item=>normalizeText(item.name)===normalizeText(professorName));
      if(!teacher)return null;
      const classes=entries.map(entry=>({discipline:entry.discipline_name,semester:entry.semester_label||`${entry.semester_number}º semestre`,day:entry.day_label,hours:entry.hours_label,room:entry.room,discipline_code:entry.discipline_code,start_minutes:entry.start_minutes,end_minutes:entry.end_minutes}));
      const disciplines=[...new Set(entries.map(entry=>entry.discipline_code?`${entry.discipline_code} - ${entry.discipline_name}`:entry.discipline_name).filter(Boolean))];
      const updatedTeacher=this.saveTeacher({...teacher,_skip_history:true,disciplines,schedule:classes,academic_period:academicPeriod},teacher.id);
      const card=this.listAutomaticMessages().find(item=>normalizeText(item.title)===normalizeText(`Professor — ${teacher.name}`));
      if(card){const record={name:teacher.name,email:updatedTeacher.email,academic_period:academicPeriod,semesters:[...new Set(entries.map(entry=>entry.semester_label||`${entry.semester_number}º semestre`))],classes};this.saveAutomaticMessage({...card,response_text:buildProfessorScheduleResponse(record,new Date())},card.id);}
      return updatedTeacher;
    }

    syncAcademicCalendarReferences(before, after) {
      if (!before || !after) return 0;
      const oldCode = normalizeText(before.discipline_code); const newCode = String(after.discipline_code || '').trim().toUpperCase();
      const oldProfessor = normalizeText(before.professor_name); const newProfessor = String(after.professor_name || '').trim();
      const oldRoom = normalizeText(before.room); const newRoom = String(after.room || '').trim();
      const events = this.listAcademicCalendarEvents({ activeOnly: false });
      let changed = 0;
      for (const event of events) {
        const patch = { ...event }; let touched = false;
        if (oldCode && newCode && oldCode !== normalizeText(newCode) && normalizeText(event.discipline_code) === oldCode) { patch.discipline_code = newCode; touched = true; }
        if (oldProfessor && oldProfessor !== normalizeText(newProfessor) && normalizeText(event.professor_name) === oldProfessor) { patch.professor_name = newProfessor; touched = true; }
        if (oldRoom && newRoom && oldRoom !== normalizeText(newRoom) && normalizeText(event.old_room) === oldRoom) { patch.old_room = newRoom; touched = true; }
        if (!touched) continue;
        this.saveAcademicCalendarEvent({ ...patch, _skip_history: true }, event.id);
        if (typeof this.recordChangeHistory === 'function') this.recordChangeHistory({
          entity_type: 'academic_calendar', entity_id: String(event.id), entity_label: event.title, action: 'updated',
          source: 'sincronização pelo editor estruturado', before: event, after: this.listAcademicCalendarEvents({ activeOnly: false }).find(item => item.id === event.id)
        });
        changed += 1;
      }
      return changed;
    }

    saveProfessorScheduleEntry(input, id = null) {
      const item=this.validateProfessorScheduleEntry(input);const timestamp=nowIso();const before=id?this.getProfessorScheduleEntry(id):null;
      if(id){const result=this.db.prepare(`UPDATE professor_schedule_entries SET teacher_id=?,professor_name=?,professor_email=?,discipline_name=?,discipline_code=?,semester_number=?,semester_label=?,day_of_week=?,day_label=?,start_minutes=?,end_minutes=?,hours_label=?,room=?,academic_period=?,source_title=?,source_version=?,source_date=?,active=?,updated_at=? WHERE id=?`).run(item.teacher_id,item.professor_name,item.professor_email,item.discipline_name,item.discipline_code,item.semester_number,item.semester_label,item.day_of_week,item.day_label,item.start_minutes,item.end_minutes,item.hours_label,item.room,item.academic_period,item.source_title,item.source_version,item.source_date,item.active?1:0,timestamp,Number(id));if(!result.changes)throw new Error('Aula estruturada não encontrada.');}
      else{id=this.db.prepare(`INSERT INTO professor_schedule_entries(teacher_id,professor_name,professor_email,discipline_name,discipline_code,semester_number,semester_label,day_of_week,day_label,start_minutes,end_minutes,hours_label,room,academic_period,source_title,source_version,source_date,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.teacher_id,item.professor_name,item.professor_email,item.discipline_name,item.discipline_code,item.semester_number,item.semester_label,item.day_of_week,item.day_label,item.start_minutes,item.end_minutes,item.hours_label,item.room,item.academic_period,item.source_title,item.source_version,item.source_date,item.active?1:0,timestamp,timestamp).lastInsertRowid;}
      const after=this.getProfessorScheduleEntry(id);this.refreshProfessorStructuredContent(item.professor_name,item.academic_period);if(before&&(normalizeText(before.professor_name)!==normalizeText(item.professor_name)||before.academic_period!==item.academic_period))this.refreshProfessorStructuredContent(before.professor_name,before.academic_period);if(before)this.syncAcademicCalendarReferences(before,after);
      if(!input._skip_history&&typeof this.recordChangeHistory==='function')this.recordChangeHistory({entity_type:'schedule_entry',entity_id:String(id),entity_label:`${after.professor_name} · ${after.discipline_code||after.discipline_name}`,action:before?'updated':'created',source:'editor estruturado',before,after});
      return after;
    }

    deleteProfessorScheduleEntry(id, options = {}) {const before=this.getProfessorScheduleEntry(id);if(!before)return false;const deleted=Boolean(this.db.prepare('DELETE FROM professor_schedule_entries WHERE id=?').run(Number(id)).changes);if(deleted){this.refreshProfessorStructuredContent(before.professor_name,before.academic_period);if(!options.skipHistory&&typeof this.recordChangeHistory==='function')this.recordChangeHistory({entity_type:'schedule_entry',entity_id:String(id),entity_label:`${before.professor_name} · ${before.discipline_code||before.discipline_name}`,action:'deleted',source:'editor estruturado',before,after:null});}return deleted;}

    replaceProfessorScheduleEntries(records = [], { academicPeriod = '', source = {} } = {}) {
      const clean = Array.isArray(records) ? records : [];
      const period = String(academicPeriod || clean[0]?.academic_period || '2026.2').trim();
      const rows = clean.flatMap(record => (record.classes || []).flatMap(entry => normalizeStructuredScheduleEntry(entry, {
        ...record, academic_period: String(record.academic_period || period).trim()
      }, source)));
      const timestamp = nowIso();
      const insert = this.db.prepare(`INSERT INTO professor_schedule_entries(
        teacher_id,professor_name,professor_email,discipline_name,discipline_code,semester_number,semester_label,
        day_of_week,day_label,start_minutes,end_minutes,hours_label,room,academic_period,source_title,source_version,source_date,active,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      this.db.exec('BEGIN');
      try {
        this.db.prepare('DELETE FROM professor_schedule_entries WHERE academic_period=?').run(period);
        for (const row of rows) insert.run(
          row.teacher_id, row.professor_name, row.professor_email, row.discipline_name, row.discipline_code,
          row.semester_number, row.semester_label, row.day_of_week, row.day_label, row.start_minutes, row.end_minutes,
          row.hours_label, row.room, row.academic_period || period, row.source_title, row.source_version, row.source_date,
          row.active ? 1 : 0, timestamp, timestamp
        );
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      if (typeof this.recordAcademicImport === 'function') this.recordAcademicImport({
        academic_period: period, source_title: String(source.title || source.source_title || rows[0]?.source_title || 'Quadro estruturado'),
        source_version: String(source.version || source.source_version || rows[0]?.source_version || ''),
        source_date: String(source.date || source.source_date || rows[0]?.source_date || ''), entry_count: rows.length,
        checksum: require('node:crypto').createHash('sha256').update(JSON.stringify(rows)).digest('hex')
      });
      return { academic_period: period, records: clean.length, entries: rows.length };
    }

    syncProfessorScheduleRecord(record = {}, source = {}) {
      const period = String(record.academic_period || source.academic_period || '2026.2').trim();
      const professorKey = normalizeText(record.name || '');
      if (!professorKey) throw new Error('Professor não informado para sincronizar o quadro estruturado.');
      const rows = (record.classes || []).flatMap(entry => normalizeStructuredScheduleEntry(entry, { ...record, academic_period: period }, source));
      const timestamp = nowIso();
      const existing = this.db.prepare('SELECT id FROM teachers WHERE lower(email)=lower(?) OR lower(name)=lower(?) ORDER BY lower(email)=lower(?) DESC LIMIT 1')
        .get(String(record.email || ''), String(record.name || ''), String(record.email || ''));
      const insert = this.db.prepare(`INSERT INTO professor_schedule_entries(
        teacher_id,professor_name,professor_email,discipline_name,discipline_code,semester_number,semester_label,
        day_of_week,day_label,start_minutes,end_minutes,hours_label,room,academic_period,source_title,source_version,source_date,active,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      this.db.exec('BEGIN');
      try {
        this.db.prepare(`DELETE FROM professor_schedule_entries WHERE academic_period=? AND (
          lower(professor_name)=lower(?) OR (? IS NOT NULL AND teacher_id=?) OR (?<>'' AND lower(professor_email)=lower(?))
        )`).run(period, String(record.name || ''), existing?.id || null, existing?.id || null, String(record.email || ''), String(record.email || ''));
        for (const row of rows) insert.run(
          existing?.id || row.teacher_id, row.professor_name, row.professor_email, row.discipline_name, row.discipline_code,
          row.semester_number, row.semester_label, row.day_of_week, row.day_label, row.start_minutes, row.end_minutes,
          row.hours_label, row.room, row.academic_period, row.source_title, row.source_version, row.source_date,
          row.active ? 1 : 0, timestamp, timestamp
        );
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      return { professor: record.name, academic_period: period, entries: rows.length };
    }

    listAcademicCalendarEvents({ startDate = '', endDate = '', activeOnly = true, course = '' } = {}) {
      let sql = 'SELECT * FROM academic_calendar_events'; const where = []; const params = [];
      if (activeOnly) where.push('active=1');
      if (startDate) { where.push('end_date>=?'); params.push(String(startDate)); }
      if (endDate) { where.push('start_date<=?'); params.push(String(endDate)); }
      if (course) { where.push("(course='' OR lower(course)='todos' OR lower(course)=lower(?))"); params.push(String(course)); }
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY start_date,event_type,title COLLATE NOCASE';
      return this.db.prepare(sql).all(...params).map(row => ({
        ...row, id: Number(row.id), active: Boolean(row.active),
        semester_numbers: parseJson(row.semester_numbers_json || '[]', []),
        recurrence_weekdays: parseJson(row.recurrence_weekdays_json || '[]', []).map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 6),
        recurrence_interval: Math.max(1, Number(row.recurrence_interval || 1)),
        replacement_day_of_week: row.replacement_day_of_week === null ? null : Number(row.replacement_day_of_week),
        start_minutes: row.start_minutes === null ? null : Number(row.start_minutes),
        end_minutes: row.end_minutes === null ? null : Number(row.end_minutes)
      }));
    }

    academicCalendarEventsForDate(date, { course = 'bsi', semester = 0 } = {}) {
      return this.listAcademicCalendarEvents({ startDate: date, endDate: date, activeOnly: true, course })
        .filter(event => !event.semester_numbers.length || !Number(semester) || event.semester_numbers.includes(Number(semester)));
    }

    validateAcademicCalendarEvent(input = {}) {
      const eventType = String(input.event_type || '').trim();
      const allowed = new Set(['no_classes','recess','partial_no_classes','warning','replacement_day','room_change','class_replacement']);
      if (!allowed.has(eventType)) throw new Error('Tipo de exceção acadêmica inválido.');
      const startDate = dateOnly(input.start_date); const endDate = dateOnly(input.end_date || input.start_date);
      if (!startDate || !endDate || endDate < startDate) throw new Error('Informe datas válidas para a exceção.');
      const title = String(input.title || '').trim();
      if (!title) throw new Error('Título da exceção é obrigatório.');
      const semesters = [...new Set((Array.isArray(input.semester_numbers) ? input.semester_numbers : parseJson(input.semester_numbers_json || '[]', []))
        .map(Number).filter(number => Number.isInteger(number) && number >= 1 && number <= 8))];
      const replacementDay = input.replacement_day_of_week === '' || input.replacement_day_of_week === null || input.replacement_day_of_week === undefined
        ? null : Number(input.replacement_day_of_week);
      if (replacementDay !== null && (!Number.isInteger(replacementDay) || replacementDay < 0 || replacementDay > 6)) throw new Error('Dia de reposição inválido.');
      const startMinutes = input.start_minutes === '' || input.start_minutes === null || input.start_minutes === undefined ? null : Number(input.start_minutes);
      const endMinutes = input.end_minutes === '' || input.end_minutes === null || input.end_minutes === undefined ? null : Number(input.end_minutes);
      for (const [label, value] of [['início', startMinutes], ['fim', endMinutes]]) {
        if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1440)) throw new Error(`Horário de ${label} inválido.`);
      }
      if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) throw new Error('O horário final deve ser posterior ao inicial.');
      const newRoom = String(input.new_room || '').trim();
      if (eventType === 'room_change' && !newRoom) throw new Error('Informe a nova sala para a mudança temporária.');
      if (['replacement_day','class_replacement'].includes(eventType) && replacementDay === null) throw new Error('Informe qual dia da semana será reposto.');
      const recurrenceType = ['none','weekly'].includes(String(input.recurrence_type || 'none')) ? String(input.recurrence_type || 'none') : 'none';
      const recurrenceWeekdays = [...new Set((Array.isArray(input.recurrence_weekdays) ? input.recurrence_weekdays : parseJson(input.recurrence_weekdays_json || '[]', []))
        .map(Number).filter(number => Number.isInteger(number) && number >= 0 && number <= 6))].sort((a,b)=>a-b);
      const recurrenceInterval = Math.max(1, Math.min(52, Number(input.recurrence_interval || 1)));
      if (recurrenceType === 'weekly' && !recurrenceWeekdays.length) throw new Error('Selecione ao menos um dia da semana para a recorrência.');
      return {
        package_key: String(input.package_key || input.key || '').trim(), event_type: eventType,
        start_date: startDate, end_date: endDate, title, description: String(input.description || '').trim().slice(0, 2000),
        course: String(input.course || 'todos').trim(), semester_numbers: semesters,
        discipline_code: String(input.discipline_code || '').trim().toUpperCase(), professor_name: String(input.professor_name || '').trim(),
        old_room: String(input.old_room || '').trim(), new_room: newRoom,
        replacement_day_of_week: replacementDay,
        start_minutes: startMinutes, end_minutes: endMinutes,
        recurrence_type: recurrenceType, recurrence_weekdays: recurrenceWeekdays, recurrence_interval: recurrenceInterval,
        source_url: String(input.source_url || '').trim(), source_title: String(input.source_title || '').trim(),
        verified_at: dateOnly(input.verified_at) || '', active: input.active === undefined ? true : Boolean(input.active)
      };
    }

    saveAcademicCalendarEvent(input, id = null) {
      const item = this.validateAcademicCalendarEvent(input); const timestamp = nowIso();
      const before=id?this.listAcademicCalendarEvents({activeOnly:false}).find(event=>event.id===Number(id)):null;
      if (id) {
        const result = this.db.prepare(`UPDATE academic_calendar_events SET package_key=?,event_type=?,start_date=?,end_date=?,title=?,description=?,course=?,semester_numbers_json=?,discipline_code=?,professor_name=?,old_room=?,new_room=?,replacement_day_of_week=?,start_minutes=?,end_minutes=?,recurrence_type=?,recurrence_weekdays_json=?,recurrence_interval=?,source_url=?,source_title=?,verified_at=?,active=?,updated_at=? WHERE id=?`)
          .run(item.package_key,item.event_type,item.start_date,item.end_date,item.title,item.description,item.course,JSON.stringify(item.semester_numbers),item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.recurrence_type,JSON.stringify(item.recurrence_weekdays),item.recurrence_interval,item.source_url,item.source_title,item.verified_at,item.active?1:0,timestamp,Number(id));
        if (!result.changes) throw new Error('Exceção acadêmica não encontrada.');
      } else {
        id = this.db.prepare(`INSERT INTO academic_calendar_events(package_key,event_type,start_date,end_date,title,description,course,semester_numbers_json,discipline_code,professor_name,old_room,new_room,replacement_day_of_week,start_minutes,end_minutes,recurrence_type,recurrence_weekdays_json,recurrence_interval,source_url,source_title,verified_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(item.package_key,item.event_type,item.start_date,item.end_date,item.title,item.description,item.course,JSON.stringify(item.semester_numbers),item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.recurrence_type,JSON.stringify(item.recurrence_weekdays),item.recurrence_interval,item.source_url,item.source_title,item.verified_at,item.active?1:0,timestamp,timestamp).lastInsertRowid;
      }
      const after=this.listAcademicCalendarEvents({ activeOnly: false }).find(event => event.id === Number(id));
      if(!input._skip_history&&typeof this.recordChangeHistory==='function')this.recordChangeHistory({entity_type:'academic_calendar',entity_id:String(id),entity_label:after.title,action:before?'updated':'created',source:'calendário',before,after});
      return after;
    }

    applyAcademicCalendarImport(events = []) {
      const clean = (Array.isArray(events) ? events : []).map(event => this.validateAcademicCalendarEvent(event));
      if (!clean.length) throw new Error('Nenhuma exceção válida foi encontrada no CSV.');
      const timestamp = nowIso();
      const insert = this.db.prepare(`INSERT INTO academic_calendar_events(package_key,event_type,start_date,end_date,title,description,course,semester_numbers_json,discipline_code,professor_name,old_room,new_room,replacement_day_of_week,start_minutes,end_minutes,recurrence_type,recurrence_weekdays_json,recurrence_interval,source_url,source_title,verified_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const duplicate = this.db.prepare(`SELECT id FROM academic_calendar_events WHERE event_type=? AND start_date=? AND end_date=?
        AND lower(title)=lower(?) AND course=? AND semester_numbers_json=? AND discipline_code=? AND professor_name=?
        AND old_room=? AND new_room=? AND COALESCE(replacement_day_of_week,-1)=COALESCE(?,-1)
        AND COALESCE(start_minutes,-1)=COALESCE(?,-1) AND COALESCE(end_minutes,-1)=COALESCE(?,-1)
        AND recurrence_type=? AND recurrence_weekdays_json=? AND recurrence_interval=? LIMIT 1`);
      let imported = 0; let skipped = 0;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of clean) {
          const semestersJson=JSON.stringify(item.semester_numbers); const weekdaysJson=JSON.stringify(item.recurrence_weekdays);
          if (duplicate.get(item.event_type,item.start_date,item.end_date,item.title,item.course,semestersJson,item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.recurrence_type,weekdaysJson,item.recurrence_interval)) { skipped += 1; continue; }
          insert.run(item.package_key,item.event_type,item.start_date,item.end_date,item.title,item.description,item.course,semestersJson,item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.recurrence_type,weekdaysJson,item.recurrence_interval,item.source_url,item.source_title,item.verified_at,item.active?1:0,timestamp,timestamp);
          imported += 1;
        }
        this.db.exec('COMMIT');
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
      return { imported, skipped };
    }

    deleteAcademicCalendarEvent(id, options = {}) { const before=this.listAcademicCalendarEvents({activeOnly:false}).find(event=>event.id===Number(id));const deleted=Boolean(this.db.prepare('DELETE FROM academic_calendar_events WHERE id=?').run(Number(id)).changes);if(deleted&&!options.skipHistory&&typeof this.recordChangeHistory==='function')this.recordChangeHistory({entity_type:'academic_calendar',entity_id:String(id),entity_label:before?.title||'Exceção acadêmica',action:'deleted',source:'calendário',before,after:null});return deleted; }
  };
};
