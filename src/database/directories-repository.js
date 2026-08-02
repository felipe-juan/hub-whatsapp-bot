module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, captionAnalysis, crypto } = deps;
  return class {
  listTeachers({ activeOnly = false, search = '' } = {}) {
    if (activeOnly && !search && this.cache.activeTeachers) return clone(this.cache.activeTeachers);
    let sql = 'SELECT * FROM teachers'; const where = []; const params = [];
    if (activeOnly) where.push('active=1');
    if (search) { where.push('(name LIKE ? OR email LIKE ? OR aliases_json LIKE ?)'); const term = `%${search}%`; params.push(term, term, term); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY active DESC,name COLLATE NOCASE';
    const items = this.db.prepare(sql).all(...params).map(row => this.mapTeacher(row));
    if (activeOnly && !search) this.cache.activeTeachers = items;
    return clone(items);
  }
  mapTeacher(row) {
    if (!row) return null;
    const { aliases_json, disciplines_json, schedule_json, ...rest } = row;
    return {
      ...rest,
      active: Boolean(row.active),
      is_example: Boolean(row.is_example),
      aliases: parseJsonList(aliases_json),
      disciplines: parseJsonList(disciplines_json),
      schedule: parseJson(schedule_json || '[]', [])
    };
  }
  validateTeacher(input) {
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const room = String(input.room || '').trim();
    const building = String(input.building || '').trim();
    const roomConfirmedAt = String(input.room_confirmed_at || '').trim();
    const roomSource = String(input.room_source || '').trim();
    if (!name) throw new Error('Nome do professor é obrigatório.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
    if (name.length > 180 || email.length > 254) throw new Error('Nome ou e-mail excede o tamanho permitido.');
    if (room.length > 120 || building.length > 120 || roomSource.length > 300) throw new Error('Os dados de localização excedem o tamanho permitido.');
    if (room && !/^\d{4}-\d{2}-\d{2}$/.test(roomConfirmedAt)) throw new Error('Informe a data de confirmação da sala no formato AAAA-MM-DD.');
    if (room && !roomSource) throw new Error('Informe a fonte usada para confirmar a sala.');
    if (!room && (roomConfirmedAt || roomSource)) throw new Error('Informe a sala antes de registrar data ou fonte de confirmação.');
    const aliases = [...new Set(parseList(input.aliases))].slice(0, 40);
    const disciplines = [...new Set(parseList(input.disciplines))].slice(0, 80);
    let schedule = input.schedule;
    if (!Array.isArray(schedule)) {
      if (typeof schedule === 'string' && schedule.trim().startsWith('[')) schedule = parseJson(schedule, []);
      else schedule = parseList(schedule).map(value => ({ description: value }));
    }
    schedule = (Array.isArray(schedule) ? schedule : []).slice(0, 100).map(entry => {
      if (entry && typeof entry === 'object') return {
        discipline: String(entry.discipline || '').trim(), semester: String(entry.semester || '').trim(),
        day: String(entry.day || '').trim(), hours: String(entry.hours || '').trim(),
        description: String(entry.description || '').trim()
      };
      return { description: String(entry || '').trim() };
    });
    return {
      name, email, aliases, notes: String(input.notes || '').trim().slice(0, 2000),
      room, building, room_confirmed_at: room ? roomConfirmedAt : '', room_source: room ? roomSource : '',
      disciplines, schedule, academic_period: String(input.academic_period || '').trim().slice(0, 40),
      active: input.active === undefined ? true : Boolean(input.active)
    };
  }
  saveTeacher(input, id = null) {
    const item = this.validateTeacher(input); const timestamp = nowIso();
    if (id) {
      const result = this.db.prepare(`UPDATE teachers SET name=?,email=?,aliases_json=?,notes=?,room=?,building=?,room_confirmed_at=?,room_source=?,disciplines_json=?,schedule_json=?,academic_period=?,active=?,updated_at=? WHERE id=?`)
        .run(item.name, item.email, JSON.stringify(item.aliases), item.notes, item.room, item.building, item.room_confirmed_at, item.room_source,
          JSON.stringify(item.disciplines), JSON.stringify(item.schedule), item.academic_period, boolToDb(item.active), timestamp, Number(id));
      if (!result.changes) throw new Error('Professor não encontrado.');
      this.invalidate('activeTeachers'); return this.mapTeacher(this.db.prepare('SELECT * FROM teachers WHERE id=?').get(Number(id)));
    }
    const result = this.db.prepare(`INSERT INTO teachers(name,email,aliases_json,notes,room,building,room_confirmed_at,room_source,disciplines_json,schedule_json,academic_period,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(item.name, item.email, JSON.stringify(item.aliases), item.notes, item.room, item.building, item.room_confirmed_at, item.room_source,
        JSON.stringify(item.disciplines), JSON.stringify(item.schedule), item.academic_period, boolToDb(item.active), timestamp, timestamp);
    this.invalidate('activeTeachers'); return this.mapTeacher(this.db.prepare('SELECT * FROM teachers WHERE id=?').get(result.lastInsertRowid));
  }
  upsertTeacherByEmail(input) { const email = String(input.email || '').trim().toLowerCase(); const found = this.db.prepare('SELECT id FROM teachers WHERE lower(email)=?').get(email); return { item: this.saveTeacher(input, found?.id || null), created: !found }; }
  deleteTeacher(id) { const deleted = Boolean(this.db.prepare('DELETE FROM teachers WHERE id=?').run(Number(id)).changes); if (deleted) this.invalidate('activeTeachers'); return deleted; }

  listSectors({ activeOnly = false, search = '' } = {}) {
    if (activeOnly && !search && this.cache.activeSectors) return clone(this.cache.activeSectors);
    let sql = 'SELECT * FROM sectors'; const where = []; const params = [];
    if (activeOnly) where.push('active=1');
    if (search) {
      where.push('(name LIKE ? OR acronym LIKE ? OR aliases_json LIKE ? OR email LIKE ? OR services_json LIKE ?)');
      const term = `%${search}%`; params.push(term, term, term, term, term);
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY active DESC,acronym COLLATE NOCASE,name COLLATE NOCASE';
    const items = this.db.prepare(sql).all(...params).map(row => this.mapSector(row));
    if (activeOnly && !search) this.cache.activeSectors = items;
    return clone(items);
  }
  mapSector(row) {
    if (!row) return null;
    const { aliases_json, services_json, ...rest } = row;
    return { ...rest, active: Boolean(row.active), aliases: parseJsonList(aliases_json), services: parseJsonList(services_json) };
  }
  validateSector(input) {
    const name = String(input.name || '').trim();
    const acronym = String(input.acronym || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const whatsapp = String(input.whatsapp || '').trim();
    const phone = String(input.phone || '').trim();
    const location = String(input.location || '').trim();
    const sourceUrl = String(input.source_url || '').trim();
    const sourceTitle = String(input.source_title || '').trim();
    const verifiedAt = String(input.verified_at || '').trim();
    if (!name) throw new Error('Nome do setor é obrigatório.');
    if (!acronym) throw new Error('Sigla ou nome curto do setor é obrigatório.');
    if (name.length > 220 || acronym.length > 80) throw new Error('Nome ou sigla do setor excede o tamanho permitido.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail do setor inválido.');
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('A fonte do setor deve começar com http:// ou https://.');
    if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) throw new Error('A data de verificação deve usar AAAA-MM-DD.');
    for (const [label, value, max] of [['WhatsApp', whatsapp, 300], ['telefone', phone, 200], ['localização', location, 500], ['título da fonte', sourceTitle, 240]]) {
      if (value.length > max) throw new Error(`${label} do setor excede o tamanho permitido.`);
    }
    return {
      name, acronym, aliases: [...new Set(parseList(input.aliases))].slice(0, 60), email, whatsapp, phone, location,
      services: [...new Set(parseList(input.services))].slice(0, 80), source_url: sourceUrl, source_title: sourceTitle,
      verified_at: verifiedAt, active: input.active === undefined ? true : Boolean(input.active)
    };
  }
  saveSector(input, id = null) {
    const item = this.validateSector(input); const timestamp = nowIso();
    try {
      if (id) {
        const result = this.db.prepare(`UPDATE sectors SET name=?,acronym=?,aliases_json=?,email=?,whatsapp=?,phone=?,location=?,services_json=?,source_url=?,source_title=?,verified_at=?,active=?,updated_at=? WHERE id=?`)
          .run(item.name, item.acronym, JSON.stringify(item.aliases), item.email, item.whatsapp, item.phone, item.location,
            JSON.stringify(item.services), item.source_url, item.source_title, item.verified_at, boolToDb(item.active), timestamp, Number(id));
        if (!result.changes) throw new Error('Setor não encontrado.');
      } else {
        id = this.db.prepare(`INSERT INTO sectors(name,acronym,aliases_json,email,whatsapp,phone,location,services_json,source_url,source_title,verified_at,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(item.name, item.acronym, JSON.stringify(item.aliases), item.email, item.whatsapp, item.phone, item.location,
            JSON.stringify(item.services), item.source_url, item.source_title, item.verified_at, boolToDb(item.active), timestamp, timestamp).lastInsertRowid;
      }
    } catch (error) {
      if (/UNIQUE/i.test(error.message)) throw new Error('Já existe um setor com essa sigla ou nome.');
      throw error;
    }
    this.invalidate('activeSectors');
    return this.mapSector(this.db.prepare('SELECT * FROM sectors WHERE id=?').get(Number(id)));
  }
  deleteSector(id) {
    const deleted = Boolean(this.db.prepare('DELETE FROM sectors WHERE id=?').run(Number(id)).changes);
    if (deleted) this.invalidate('activeSectors');
    return deleted;
  }

  };
};
