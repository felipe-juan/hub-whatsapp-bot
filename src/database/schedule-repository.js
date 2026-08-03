'use strict';

const { normalizeText } = require('../text');
const { normalizeStructuredScheduleEntry } = require('../schedule-structure');

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
      if (discipline) { where.push('(lower(discipline_name) LIKE ? OR lower(discipline_code)=?)'); params.push(`%${String(discipline).toLowerCase()}%`, String(discipline).toLowerCase()); }
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
        this.db.prepare('DELETE FROM professor_schedule_entries WHERE academic_period=? AND lower(professor_name)=lower(?)').run(period, String(record.name || ''));
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
      return {
        package_key: String(input.package_key || input.key || '').trim(), event_type: eventType,
        start_date: startDate, end_date: endDate, title, description: String(input.description || '').trim().slice(0, 2000),
        course: String(input.course || 'todos').trim(), semester_numbers: semesters,
        discipline_code: String(input.discipline_code || '').trim().toUpperCase(), professor_name: String(input.professor_name || '').trim(),
        old_room: String(input.old_room || '').trim(), new_room: newRoom,
        replacement_day_of_week: replacementDay,
        start_minutes: startMinutes, end_minutes: endMinutes,
        source_url: String(input.source_url || '').trim(), source_title: String(input.source_title || '').trim(),
        verified_at: dateOnly(input.verified_at) || '', active: input.active === undefined ? true : Boolean(input.active)
      };
    }

    saveAcademicCalendarEvent(input, id = null) {
      const item = this.validateAcademicCalendarEvent(input); const timestamp = nowIso();
      if (id) {
        const result = this.db.prepare(`UPDATE academic_calendar_events SET package_key=?,event_type=?,start_date=?,end_date=?,title=?,description=?,course=?,semester_numbers_json=?,discipline_code=?,professor_name=?,old_room=?,new_room=?,replacement_day_of_week=?,start_minutes=?,end_minutes=?,source_url=?,source_title=?,verified_at=?,active=?,updated_at=? WHERE id=?`)
          .run(item.package_key,item.event_type,item.start_date,item.end_date,item.title,item.description,item.course,JSON.stringify(item.semester_numbers),item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.source_url,item.source_title,item.verified_at,item.active?1:0,timestamp,Number(id));
        if (!result.changes) throw new Error('Exceção acadêmica não encontrada.');
      } else {
        id = this.db.prepare(`INSERT INTO academic_calendar_events(package_key,event_type,start_date,end_date,title,description,course,semester_numbers_json,discipline_code,professor_name,old_room,new_room,replacement_day_of_week,start_minutes,end_minutes,source_url,source_title,verified_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(item.package_key,item.event_type,item.start_date,item.end_date,item.title,item.description,item.course,JSON.stringify(item.semester_numbers),item.discipline_code,item.professor_name,item.old_room,item.new_room,item.replacement_day_of_week,item.start_minutes,item.end_minutes,item.source_url,item.source_title,item.verified_at,item.active?1:0,timestamp,timestamp).lastInsertRowid;
      }
      return this.listAcademicCalendarEvents({ activeOnly: false }).find(event => event.id === Number(id));
    }

    deleteAcademicCalendarEvent(id) { return Boolean(this.db.prepare('DELETE FROM academic_calendar_events WHERE id=?').run(Number(id)).changes); }
  };
};
