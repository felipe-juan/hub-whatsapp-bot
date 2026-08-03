'use strict';

const { buildProfessorScheduleImportPlan, buildEffectiveProfessorScheduleRecords } = require('../schedule-import-plan');

module.exports = function createMixin(deps) {
  const { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, captionAnalysis, toPortugueseTitleCase, crypto } = deps;
  return class {
  validateAutomaticMessage(input) {
    const title = toPortugueseTitleCase(String(input.title || '').trim());
    const responseText = String(input.response_text || input.answer || '').trim();
    if (!title) throw new Error('O nome interno da mensagem é obrigatório.');
    if (!responseText) throw new Error('Escreva a resposta completa que o bot deve enviar.');
    const triggerInput = input.trigger && typeof input.trigger === 'object' ? { ...input.trigger } : { ...input };
    // Palavras-chave são cumulativas no modelo simplificado: todas precisam aparecer.
    triggerInput.match_mode = 'all';
    const trigger = {
      ...this.validateTrigger(triggerInput, parseList(input.keywords || input.trigger?.keywords)),
      // A marca permanece ativa por compatibilidade. Desde a v0.10.2, o motor
      // também aceita perguntas completas sem “?”, desde que a estrutura
      // interrogativa seja clara; menções soltas continuam bloqueadas.
      require_question_mark: true
    };
    const hasTrigger = trigger.keywords.length || trigger.sentences.length || trigger.exact_phrases.length || trigger.regex_pattern || trigger.synonym_group_ids.length;
    if (!hasTrigger) throw new Error('Cadastre ao menos uma sentença, palavra-chave ou expressão regular.');
    const scope = ['both', 'group', 'private'].includes(String(input.scope || 'both')) ? String(input.scope || 'both') : 'both';
    const tags = [];
    const topic = '';
    const attachment = input.attachment && typeof input.attachment === 'object' ? { ...input.attachment } : null;
    const sourceUrl = String(input.source_url || '').trim();
    const sourceTitle = String(input.source_title || '').trim().slice(0, 240);
    const verifiedAt = String(input.verified_at || '').trim();
    const detailsText = String(input.details_text || '').trim();
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('A fonte deve começar com http:// ou https://.');
    if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) throw new Error('A data de verificação deve usar AAAA-MM-DD.');
    if (detailsText.length > 12000) throw new Error('A resposta detalhada excede o tamanho permitido.');
    const caption = captionAnalysis({ response_text: responseText, source_url: sourceUrl, source_title: sourceTitle, verified_at: verifiedAt, attachment });
    if (attachment && caption.status === 'blocked') throw new Error(`A legenda com resposta e fonte possui ${caption.totalCharacters} caracteres. O limite máximo de envio com anexo é ${caption.hardLimit}. Encurte a resposta principal ou remova o anexo.`);
    return {
      title, topic, response_text: responseText, details_text: detailsText, source_url: sourceUrl, source_title: sourceTitle, verified_at: verifiedAt,
      trigger, scope, tags, attachment,
      priority: Math.max(-100, Math.min(100, Number(input.priority || 0))),
      sort_order: Math.max(0, Math.min(100000000, Number(input.sort_order || 0))),
      archived: Boolean(input.archived || input.status === 'archived'),
      active: input.active === undefined ? true : Boolean(input.active)
    };
  }
  mapAutomaticMessage(row) {
    if (!row) return null;
    const draft = row.draft_json ? parseJson(row.draft_json, null) : null;
    const { trigger_json, draft_json, tags_json, attachment_json, package_snapshot_json, pending_package_json, ...rest } = row;
    const mappedDraft = draft ? {
      ...draft,
      active: Boolean(draft.active), archived: Boolean(draft.archived), sort_order: Number(draft.sort_order || 0),
      scope: ['both', 'group', 'private'].includes(draft.scope) ? draft.scope : 'both',
      tags: [],
      attachment: draft.attachment && typeof draft.attachment === 'object' ? draft.attachment : null,
      details_text: String(draft.details_text || ''), source_url: String(draft.source_url || ''),
      source_title: String(draft.source_title || ''), verified_at: String(draft.verified_at || ''),
      trigger: normalizeTriggerRules(draft.trigger)
    } : null;
    return {
      ...rest, active: Boolean(row.active), archived: Boolean(row.archived), sort_order: Number(row.sort_order || 0), published: Boolean(row.published), is_example: Boolean(row.is_example),
      source_type: ['hub_package', 'administrator', 'teacher_import'].includes(row.source_type) ? row.source_type : 'administrator',
      package_key: String(row.package_key || ''), customized: Boolean(row.customized),
      package_snapshot: parseJson(package_snapshot_json || '', null), pending_package_update: parseJson(pending_package_json || '', null),
      scope: ['both', 'group', 'private'].includes(row.scope) ? row.scope : 'both',
      tags: [], attachment: (() => { const value = parseJson(attachment_json || '{}', null); return value?.stored_name ? value : null; })(),
      trigger: normalizeTriggerRules(parseJson(trigger_json, {})),
      draft: mappedDraft,
      has_draft: Boolean(draft)
    };
  }
  listAutomaticMessages({ activeOnly = false, search = '', cloneResult = true } = {}) {
    if (activeOnly && !search && this.cache.activeMessages) return cloneResult ? clone(this.cache.activeMessages) : this.cache.activeMessages;
    let sql = 'SELECT * FROM automatic_messages'; const where = []; const params = [];
    if (activeOnly) where.push('published=1 AND active=1 AND archived=0');
    if (search) { where.push('(title LIKE ? OR response_text LIKE ? OR details_text LIKE ? OR source_url LIKE ? OR source_title LIKE ? OR trigger_json LIKE ? OR draft_json LIKE ?)'); const term = `%${search}%`; params.push(term, term, term, term, term, term, term); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY archived ASC,sort_order ASC,published DESC,active DESC,priority DESC,title COLLATE NOCASE';
    const rows = this.db.prepare(sql).all(...params).map(row => this.mapAutomaticMessage(row));
    if (activeOnly && !search) this.cache.activeMessages = rows;
    return cloneResult ? clone(rows) : rows;
  }
  automaticMessageSummary(item) {
    const effective = item?.draft || item || {};
    const trigger = normalizeTriggerRules(effective.trigger || {});
    const response = String(effective.response_text || '');
    const triggerTokens = [...new Set([
      ...trigger.sentences, ...trigger.keywords, ...trigger.required_words, ...trigger.exact_phrases
    ].flatMap(value => normalizeText(value).split(' ').filter(Boolean)))];
    const searchable = [effective.title || '', response.slice(0, 800), ...triggerTokens].join(' ');
    return {
      id: Number(item.id), title: effective.title || '', priority: Number(effective.priority || 0),
      sort_order: Number(effective.sort_order || 0), active: effective.active !== false,
      archived: Boolean(effective.archived), published: item.published !== false,
      is_example: Boolean(item.is_example), has_draft: Boolean(item.has_draft),
      source_type: item.source_type || 'administrator', package_key: item.package_key || '',
      customized: Boolean(item.customized), has_package_update: Boolean(item.pending_package_update),
      scope: ['both','group','private'].includes(effective.scope) ? effective.scope : 'both',
      attachment: (() => { const value = effective.attachment || item.attachment || null; return value ? { file_name: value.file_name || '', mime_type: value.mime_type || '', size_bytes: Number(value.size_bytes || 0), kind: value.kind || 'document' } : null; })(),
      response_text: response.slice(0, 360), response_truncated: response.length > 360,
      source_url: String(effective.source_url || ''), source_title: String(effective.source_title || ''), verified_at: String(effective.verified_at || ''),
      trigger: {
        sentences: trigger.sentences.slice(0, 4), keywords: trigger.keywords.slice(0, 4),
        regex_pattern: trigger.regex_pattern || ''
      },
      trigger_counts: {
        sentences: trigger.sentences.length, keywords: trigger.keywords.length,
        required_words: trigger.required_words.length, exact_phrases: trigger.exact_phrases.length
      },
      search_text: normalizeText(searchable).slice(0, 2400), updated_at: item.updated_at || ''
    };
  }
  listAutomaticMessageSummaries({ search = '' } = {}) {
    if (!search && this.cache.messageSummaries) return clone(this.cache.messageSummaries);
    const summaries = this.listAutomaticMessages({ search }).map(item => this.automaticMessageSummary(item));
    if (!search) this.cache.messageSummaries = summaries;
    return clone(summaries);
  }
  listAutomaticMessageSummaryPage({ search = '', limit = 30, cursor = '', status = 'current', origin = '', conflictsOnly = false } = {}) {
    const safeLimit = Math.max(10, Math.min(100, Number(limit || 30)));
    let offset = 0;
    try {
      const decoded = Buffer.from(String(cursor || ''), 'base64url').toString('utf8');
      offset = Math.max(0, Number(JSON.parse(decoded).offset || 0));
    } catch { offset = Math.max(0, Number(cursor || 0)); }
    const where = [];
    const params = [];
    const normalizedStatus = String(status || 'current');
    if (normalizedStatus === 'current') where.push('archived=0');
    else if (normalizedStatus === 'active') where.push('archived=0 AND active=1');
    else if (normalizedStatus === 'inactive') where.push('archived=0 AND active=0');
    else if (normalizedStatus === 'archived') where.push('archived=1');
    if (origin) { where.push('source_type=?'); params.push(String(origin)); }
    if (search) {
      where.push('(title LIKE ? OR response_text LIKE ? OR trigger_json LIKE ? OR draft_json LIKE ?)');
      const term = `%${String(search).slice(0, 200)}%`;
      params.push(term, term, term, term);
    }
    if (conflictsOnly) {
      const ids = [...new Set(this.getConflictReport().conflicts.flatMap(item => item.items || []).map(Number).filter(Boolean))];
      if (!ids.length) return { items: [], total: 0, nextCursor: '', offset: 0, limit: safeLimit };
      where.push(`id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM automatic_messages${clause}`).get(...params)?.count || 0);
    const rows = this.db.prepare(`SELECT * FROM automatic_messages${clause}
      ORDER BY archived ASC,sort_order ASC,published DESC,active DESC,priority DESC,title COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(...params, safeLimit, offset)
      .map(row => this.automaticMessageSummary(this.mapAutomaticMessage(row)));
    const nextOffset = offset + rows.length;
    const nextCursor = nextOffset < total ? Buffer.from(JSON.stringify({ offset: nextOffset })).toString('base64url') : '';
    return { items: rows, total, nextCursor, offset, limit: safeLimit };
  }
  getAutomaticMessage(id) { return this.mapAutomaticMessage(this.db.prepare('SELECT * FROM automatic_messages WHERE id=?').get(Number(id))); }
  automaticMessageSnapshot(item) {
    if (!item) return null;
    return {
      title: item.title, topic: item.topic || '', response_text: item.response_text || '', trigger: item.trigger || {},
      priority: Number(item.priority || 0), sort_order: Number(item.sort_order || 0), active: item.active !== false, archived: Boolean(item.archived),
      scope: ['both', 'group', 'private'].includes(item.scope) ? item.scope : 'both',
      tags: Array.isArray(item.tags) ? item.tags : [], attachment: item.attachment || null,
      details_text: String(item.details_text || ''), source_url: String(item.source_url || ''),
      source_title: String(item.source_title || ''), verified_at: String(item.verified_at || '')
    };
  }
  archiveAutomaticMessage(item, action = 'updated') {
    const snapshot = this.automaticMessageSnapshot(item);
    if (!snapshot || !item?.id) return null;
    const result = this.db.prepare('INSERT INTO automatic_message_history(message_id,action,snapshot_json,created_at) VALUES (?,?,?,?)')
      .run(Number(item.id), String(action || 'updated').slice(0, 60), JSON.stringify(snapshot), nowIso());
    this.db.prepare(`DELETE FROM automatic_message_history WHERE message_id=? AND id NOT IN (
      SELECT id FROM automatic_message_history WHERE message_id=? ORDER BY id DESC LIMIT 50
    )`).run(Number(item.id), Number(item.id));
    return Number(result.lastInsertRowid);
  }
  listAutomaticMessageHistory(messageId, limit = 50) {
    return this.db.prepare('SELECT id,message_id,action,snapshot_json,created_at FROM automatic_message_history WHERE message_id=? ORDER BY id DESC LIMIT ?')
      .all(Number(messageId), Math.max(1, Math.min(100, Number(limit || 50))))
      .map(row => ({ ...row, snapshot: parseJson(row.snapshot_json, {}) || {} }));
  }
  restoreAutomaticMessageHistory(messageId, historyId) {
    const current = this.getAutomaticMessage(messageId); if (!current) throw new Error('Mensagem automática não encontrada.');
    const row = this.db.prepare('SELECT * FROM automatic_message_history WHERE id=? AND message_id=?').get(Number(historyId), Number(messageId));
    if (!row) throw new Error('Versão do histórico não encontrada.');
    const snapshot = parseJson(row.snapshot_json, null); if (!snapshot) throw new Error('Versão do histórico inválida.');
    this.archiveAutomaticMessage(current, 'before-restore');
    const restored = this.validateAutomaticMessage(snapshot); const timestamp = nowIso();
    this.db.prepare(`UPDATE automatic_messages SET title=?,topic=?,response_text=?,details_text=?,source_url=?,source_title=?,verified_at=?,trigger_json=?,priority=?,sort_order=?,active=?,archived=?,published=1,published_at=?,draft_json='',scope=?,tags_json=?,attachment_json=?,customized=CASE WHEN source_type='hub_package' THEN 1 ELSE customized END,updated_at=? WHERE id=?`)
      .run(restored.title, restored.topic, restored.response_text, restored.details_text, restored.source_url, restored.source_title, restored.verified_at, JSON.stringify(restored.trigger), restored.priority, restored.sort_order, boolToDb(restored.active), boolToDb(restored.archived), timestamp,
        restored.scope, JSON.stringify(restored.tags), JSON.stringify(restored.attachment || {}), timestamp, Number(messageId));
    this.invalidate('activeMessages'); return this.getAutomaticMessage(messageId);
  }
  duplicateAutomaticMessage(id) {
    const source = this.getAutomaticMessage(id); if (!source) throw new Error('Mensagem automática não encontrada.');
    const copy = this.saveAutomaticMessage({
      ...this.automaticMessageSnapshot(source), title: `Cópia de ${source.title}`.slice(0, 180), active: false, archived: false, sort_order: this.nextAutomaticMessageSortOrder()
    });
    this.archiveAutomaticMessage(copy, `duplicated-from:${source.id}`);
    return copy;
  }
  setAutomaticMessageAttachment(id, attachment) {
    const current = this.getAutomaticMessage(id); if (!current) throw new Error('Mensagem automática não encontrada.');
    this.archiveAutomaticMessage(current, 'before-attachment-change');
    const timestamp = nowIso();
    this.db.prepare("UPDATE automatic_messages SET attachment_json=?,draft_json='',customized=CASE WHEN source_type='hub_package' THEN 1 ELSE customized END,updated_at=? WHERE id=?")
      .run(JSON.stringify(attachment || {}), timestamp, Number(id));
    this.invalidate('activeMessages'); return this.getAutomaticMessage(id);
  }
  clearAutomaticMessageAttachment(id) { return this.setAutomaticMessageAttachment(id, null); }
  referencedAttachmentNames() {
    const names = new Set();
    const add = value => { if (value?.stored_name) names.add(String(value.stored_name)); };
    for (const item of this.listAutomaticMessages()) { add(item.attachment); add(item.draft?.attachment); }
    for (const row of this.db.prepare('SELECT snapshot_json FROM automatic_message_history').all()) add(parseJson(row.snapshot_json, {})?.attachment);
    return names;
  }
  saveAutomaticMessageDraft(input, id = null) {
    const draft = this.validateAutomaticMessage(input); const timestamp = nowIso();
    if (id) {
      if (!this.getAutomaticMessage(id)) throw new Error('Mensagem automática não encontrada.');
      const current = this.getAutomaticMessage(id);
      this.archiveAutomaticMessage(current, 'before-update');
      if (draft.attachment === null && current?.attachment) draft.attachment = current.attachment;
      this.db.prepare('UPDATE automatic_messages SET draft_json=?,updated_at=? WHERE id=?').run(JSON.stringify(draft), timestamp, Number(id));
      this.invalidate('activeMessages'); return this.getAutomaticMessage(id);
    }
    const result = this.db.prepare(`INSERT INTO automatic_messages(title,topic,response_text,trigger_json,priority,sort_order,active,archived,published,published_at,draft_json,scope,tags_json,attachment_json,created_at,updated_at) VALUES (?,?,?,'{}',0,?,0,0,0,'',?,?,?,?,?,?)`)
      .run(draft.title, draft.topic, draft.response_text, draft.sort_order || this.nextAutomaticMessageSortOrder(), JSON.stringify(draft), draft.scope, JSON.stringify(draft.tags), JSON.stringify(draft.attachment || {}), timestamp, timestamp);
    this.invalidate('activeMessages'); return this.getAutomaticMessage(result.lastInsertRowid);
  }
  publishAutomaticMessage(id) {
    const current = this.getAutomaticMessage(id); if (!current) throw new Error('Mensagem automática não encontrada.');
    const item = this.validateAutomaticMessage(current.draft || current); const timestamp = nowIso();
    const customized = current.source_type === 'hub_package'
      ? !messageSnapshotsEqual(item, current.package_snapshot || {})
      : true;
    this.db.prepare(`UPDATE automatic_messages SET title=?,topic=?,response_text=?,details_text=?,source_url=?,source_title=?,verified_at=?,trigger_json=?,priority=?,sort_order=?,active=?,archived=?,published=1,published_at=?,draft_json='',scope=?,tags_json=?,attachment_json=?,customized=?,updated_at=?,link_status='unchecked',link_checked_at='',link_http_status=0,link_error='' WHERE id=?`)
      .run(item.title, item.topic, item.response_text, item.details_text, item.source_url, item.source_title, item.verified_at, JSON.stringify(item.trigger), item.priority, item.sort_order || current.sort_order || this.nextAutomaticMessageSortOrder(), boolToDb(item.active), boolToDb(item.archived), timestamp, item.scope, JSON.stringify(item.tags), JSON.stringify(item.attachment || {}), boolToDb(customized), timestamp, Number(id));
    this.invalidate('activeMessages'); return this.getAutomaticMessage(id);
  }
  discardAutomaticMessageDraft(id) { const current = this.getAutomaticMessage(id); if (!current) return false; if (!current.published) return this.deleteAutomaticMessage(id); return Boolean(this.db.prepare("UPDATE automatic_messages SET draft_json='',updated_at=? WHERE id=?").run(nowIso(), Number(id)).changes); }
  deleteAutomaticMessage(id) { const deleted = Boolean(this.db.prepare('DELETE FROM automatic_messages WHERE id=?').run(Number(id)).changes); if (deleted) this.invalidate('activeMessages'); return deleted; }
  saveAutomaticMessage(input, id = null) { const saved = this.saveAutomaticMessageDraft(input, id); return this.publishAutomaticMessage(saved.id); }
  upsertAutomaticMessageByTitle(input, { publish = false } = {}) { const title = String(input.title || '').trim(); const found = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(title); const item = this.saveAutomaticMessageDraft(input, found?.id || null); return { item: publish ? this.publishAutomaticMessage(item.id) : item, created: !found }; }

  stagePackageAutomaticMessage(packageKey, input) {
    const key = String(packageKey || '').trim() || packageKeyFor(input?.title || 'mensagem');
    const official = this.validateAutomaticMessage(input);
    const officialSnapshot = comparableMessageSnapshot(official);
    const row = this.db.prepare('SELECT id FROM automatic_messages WHERE package_key=? OR lower(title)=lower(?) ORDER BY package_key=? DESC LIMIT 1')
      .get(key, official.title, key);
    if (!row) {
      const created = this.saveAutomaticMessage(official);
      this.db.prepare(`UPDATE automatic_messages SET source_type='hub_package',package_key=?,package_snapshot_json=?,pending_package_json='',customized=0,updated_at=? WHERE id=?`)
        .run(key, JSON.stringify(officialSnapshot), nowIso(), Number(created.id));
      this.invalidate('activeMessages');
      return { action: 'created', item: this.getAutomaticMessage(created.id) };
    }
    const current = this.getAutomaticMessage(row.id);
    if (!current) throw new Error('Mensagem do pacote não encontrada.');
    if (current.package_snapshot && messageSnapshotsEqual(current.package_snapshot, officialSnapshot)) {
      return { action: 'unchanged', item: current };
    }
    const customized = current.customized || !messageSnapshotsEqual(current, current.package_snapshot || officialSnapshot);
    if (customized) {
      this.db.prepare(`UPDATE automatic_messages SET source_type='hub_package',package_key=?,pending_package_json=?,customized=1,updated_at=? WHERE id=?`)
        .run(key, JSON.stringify(officialSnapshot), nowIso(), Number(current.id));
      this.invalidate('activeMessages');
      return { action: 'pending', item: this.getAutomaticMessage(current.id) };
    }
    this.archiveAutomaticMessage(current, 'package-update');
    const timestamp = nowIso();
    const nextAttachment = current.attachment || official.attachment || null;
    const attachmentCustomized = !messageSnapshotsEqual({ ...official, attachment: nextAttachment }, official);
    this.db.prepare(`UPDATE automatic_messages SET title=?,topic='',response_text=?,details_text=?,source_url=?,source_title=?,verified_at=?,trigger_json=?,priority=?,active=?,archived=?,published=1,published_at=?,draft_json='',scope=?,tags_json=?,attachment_json=?,source_type='hub_package',package_key=?,package_snapshot_json=?,pending_package_json='',customized=?,updated_at=? WHERE id=?`)
      .run(official.title, official.response_text, official.details_text, official.source_url, official.source_title, official.verified_at, JSON.stringify(official.trigger), official.priority, boolToDb(official.active), boolToDb(official.archived), timestamp,
        official.scope, JSON.stringify(official.tags), JSON.stringify(nextAttachment || {}), key, JSON.stringify(officialSnapshot), boolToDb(attachmentCustomized), timestamp, Number(current.id));
    this.invalidate('activeMessages');
    return { action: 'updated', item: this.getAutomaticMessage(current.id) };
  }

  resolvePackageAutomaticMessageUpdate(id, strategy) {
    const current = this.getAutomaticMessage(id); if (!current) throw new Error('Mensagem automática não encontrada.');
    const pending = current.pending_package_update;
    if (!pending) throw new Error('Esta mensagem não possui atualização pendente.');
    const choice = String(strategy || '').toLowerCase();
    if (choice === 'keep') {
      this.db.prepare(`UPDATE automatic_messages SET package_snapshot_json=?,pending_package_json='',customized=1,updated_at=? WHERE id=?`)
        .run(JSON.stringify(comparableMessageSnapshot(pending)), nowIso(), Number(id));
      this.invalidate('activeMessages');
      return this.getAutomaticMessage(id);
    }
    if (choice !== 'use') throw new Error('Escolha “keep” ou “use”.');
    const official = this.validateAutomaticMessage(pending);
    this.archiveAutomaticMessage(current, 'before-package-update');
    const timestamp = nowIso(); const snapshot = comparableMessageSnapshot(official);
    const nextAttachment = current.attachment || official.attachment || null;
    const attachmentCustomized = !messageSnapshotsEqual({ ...official, attachment: nextAttachment }, official);
    this.db.prepare(`UPDATE automatic_messages SET title=?,topic='',response_text=?,details_text=?,source_url=?,source_title=?,verified_at=?,trigger_json=?,priority=?,active=?,archived=?,published=1,published_at=?,draft_json='',scope=?,tags_json=?,attachment_json=?,package_snapshot_json=?,pending_package_json='',customized=?,updated_at=? WHERE id=?`)
      .run(official.title, official.response_text, official.details_text, official.source_url, official.source_title, official.verified_at, JSON.stringify(official.trigger), official.priority, boolToDb(official.active), boolToDb(official.archived), timestamp,
        official.scope, JSON.stringify(official.tags), JSON.stringify(nextAttachment || {}), JSON.stringify(snapshot), boolToDb(attachmentCustomized), timestamp, Number(id));
    this.invalidate('activeMessages');
    return this.getAutomaticMessage(id);
  }

  findProfessorMessageForImport(record) {
    const title = `Professor — ${String(record?.name || '').trim()}`;
    let row = this.db.prepare('SELECT id FROM automatic_messages WHERE lower(title)=lower(?)').get(title);
    if (row) return this.getAutomaticMessage(row.id);
    const email = String(record?.email || '').trim().toLowerCase();
    if (email) {
      row = this.db.prepare("SELECT id FROM automatic_messages WHERE lower(response_text) LIKE ? AND lower(title) LIKE 'professor — %' LIMIT 1").get(`%${email}%`);
      if (row) return this.getAutomaticMessage(row.id);
    }
    const normalizedName = normalizeText(record?.name || '');
    return this.listAutomaticMessages().find(item => normalizeText(String(item.title || '').replace(/^professor\s*[—-]\s*/i, '')) === normalizedName) || null;
  }

  previewProfessorScheduleImport(records = []) {
    const clean = Array.isArray(records) ? records : [];
    const periods = [...new Set(clean.map(record => String(record.academic_period || '').trim()).filter(Boolean))];
    const currentEntries = periods.flatMap(period => this.listProfessorScheduleEntries({ academicPeriod: period, activeOnly: true }));
    const plan = buildProfessorScheduleImportPlan(clean, currentEntries);
    const disciplineOwners = new Map();
    for (const record of clean) for (const entry of record.classes || []) {
      const key = normalizeText(entry.discipline);
      const owners = disciplineOwners.get(key) || new Set(); owners.add(normalizeText(record.name)); disciplineOwners.set(key, owners);
    }
    const items = clean.map(record => {
      const current = this.findProfessorMessageForImport(record);
      const shared = (record.classes || []).filter(entry => (disciplineOwners.get(normalizeText(entry.discipline))?.size || 0) > 1).map(entry => entry.discipline);
      const professor = plan.professors.find(item => normalizeText(item.name) === normalizeText(record.name) && String(item.academic_period || '') === String(record.academic_period || ''));
      return {
        name: record.name, email: record.email || '', academic_period: record.academic_period || '',
        classes: (record.classes || []).length, action: current ? 'update' : 'create', current_id: current?.id || null,
        preserves_custom_triggers: Boolean(current), preserves_attachment: Boolean(current?.attachment),
        change_ids: professor?.changes || [], changes: (professor?.changes || []).length,
        shared_disciplines: [...new Set(shared)]
      };
    });
    return {
      total: clean.length,
      creates: items.filter(item => item.action === 'create').length,
      updates: items.filter(item => item.action === 'update').length,
      shared_disciplines: [...new Set(items.flatMap(item => item.shared_disciplines))],
      items,
      plan
    };
  }

  syncStructuredTeacherFromSchedule(record = {}) {
    const importedEmail = String(record.email || '').trim().toLowerCase();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(importedEmail);
    const existingRow = emailValid ? this.db.prepare('SELECT id FROM teachers WHERE lower(email)=? ORDER BY id LIMIT 1').get(importedEmail) : null;
    const byName = existingRow ? null : this.listTeachers().find(item => normalizeText(item.name) === normalizeText(record.name));
    const existing = existingRow ? this.mapTeacher(this.db.prepare('SELECT * FROM teachers WHERE id=?').get(existingRow.id)) : byName;
    const email = emailValid ? importedEmail : String(existing?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    const disciplines = [...new Set((record.classes || []).map(entry => String(entry.discipline || '').trim()).filter(Boolean))];
    const schedule = (record.classes || []).map(entry => ({
      discipline: String(entry.discipline || '').trim(), semester: String(entry.semester || '').trim(),
      day: String(entry.day || '').trim(), hours: String(entry.hours || '').trim(), room: String(entry.room || '').trim(),
      description: String(entry.room || '').trim() ? `Sala: ${String(entry.room).trim()}` : ''
    }));
    return this.saveTeacher({
      ...(existing || {}), name: String(record.name || existing?.name || '').trim(), email,
      aliases: existing?.aliases || [], notes: existing?.notes || '', room: existing?.room || '',
      building: existing?.building || '', room_confirmed_at: existing?.room_confirmed_at || '',
      room_source: existing?.room_source || '', disciplines, schedule,
      academic_period: String(record.academic_period || existing?.academic_period || '').trim(), active: existing?.active !== false
    }, existing?.id || null);
  }

  applyProfessorScheduleImport(records = [], selectedChangeIds = null) {
    const clean = Array.isArray(records) ? records : [];
    if (!clean.length) throw new Error('Nenhum professor válido foi encontrado na planilha.');
    const periods = [...new Set(clean.map(record => String(record.academic_period || '').trim()).filter(Boolean))];
    const currentEntries = periods.flatMap(period => this.listProfessorScheduleEntries({ academicPeriod: period, activeOnly: true }));
    const effective = buildEffectiveProfessorScheduleRecords(clean, currentEntries, selectedChangeIds);
    if (!effective.records.length) return {
      total: clean.length, created: 0, updated: 0, skipped: clean.length, errors: [], preservedTriggers: 0,
      appliedChanges: 0, selectedChangeIds: effective.selected_change_ids
    };
    const report = { total: clean.length, created: 0, updated: 0, skipped: clean.length - effective.records.length, errors: [], preservedTriggers: 0, appliedChanges: 0, selectedChangeIds: effective.selected_change_ids };
    const disciplineOwners = new Map();
    for (const record of clean) for (const entry of record.classes || []) {
      const key = normalizeText(entry.discipline);
      const owners = disciplineOwners.get(key) || new Set(); owners.add(normalizeText(record.name)); disciplineOwners.set(key, owners);
    }
    for (const record of effective.records) {
      try {
        const current = this.findProfessorMessageForImport(record);
        const response = buildProfessorScheduleResponse(record);
        if (current) {
          this.archiveAutomaticMessage(current, 'teacher-schedule-import');
          let draftJson = this.db.prepare('SELECT draft_json FROM automatic_messages WHERE id=?').get(Number(current.id))?.draft_json || '';
          if (draftJson) {
            const draft = parseJson(draftJson, null);
            if (draft && typeof draft === 'object') {
              draft.title = `Professor — ${record.name}`;
              draft.response_text = response;
              delete draft.tags;
              draftJson = JSON.stringify(draft);
            }
          }
          // Gatilhos, escopo, prioridade, anexos e demais personalizações não
          // entram neste UPDATE. A importação altera somente título e conteúdo
          // derivado do quadro, preservando o restante do card.
          this.db.prepare(`UPDATE automatic_messages SET title=?,response_text=?,tags_json='[]',active=1,archived=0,published=1,draft_json=?,customized=1,updated_at=? WHERE id=?`)
            .run(`Professor — ${record.name}`, response, draftJson, nowIso(), Number(current.id));
          report.updated += 1; report.preservedTriggers += 1;
        } else {
          const professorShape = {
            name: record.name, email: record.email || '', semesters: record.semesters || [],
            classes: (record.classes || []).map(entry => [entry.discipline, entry.semester, entry.day, entry.hours, entry.room || ''])
          };
          const sentences = [...new Set(buildSiProfessorNameTriggerSentences(professorShape))];
          const created = this.saveAutomaticMessage({
            title: `Professor — ${record.name}`, response_text: response, priority: 35, active: true, archived: false, scope: 'both',
            trigger: { match_mode: 'all', sentences, keywords: [], required_words: [], require_question_mark: false,
              typo_tolerance: 1, excluded_words: [], exact_phrases: [], synonym_group_ids: [], negative_examples: [] }
          });
          this.db.prepare("UPDATE automatic_messages SET source_type='teacher_import',customized=1,updated_at=? WHERE id=?").run(nowIso(), Number(created.id));
          report.created += 1;
        }
        this.syncStructuredTeacherFromSchedule(record);
        this.syncProfessorScheduleRecord(record, {
          academic_period: record.academic_period || '',
          source_title: record.source_title || 'Quadro docente importado pelo painel',
          source_version: record.source_version || '',
          source_date: record.source_date || new Date().toISOString().slice(0, 10)
        });
        report.appliedChanges += (record.selected_change_ids || []).length;
      } catch (error) { report.errors.push({ professor: record?.name || '', error: error.message }); }
    }
    this.invalidate('activeMessages', 'conflictReport');
    return report;
  }
  nextAutomaticMessageSortOrder() {
    return Number(this.db.prepare('SELECT COALESCE(MAX(sort_order),0)+10 AS value FROM automatic_messages').get().value || 10);
  }
  reorderAutomaticMessages(ids = []) {
    const clean = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))];
    const update = this.db.prepare('UPDATE automatic_messages SET sort_order=?,updated_at=? WHERE id=?');
    this.db.exec('BEGIN');
    try {
      clean.forEach((id, index) => update.run((index + 1) * 10, nowIso(), id));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.invalidate('activeMessages');
    return this.listAutomaticMessages();
  }
  bulkAutomaticMessages(ids = [], action = '', value = '') {
    const clean = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isInteger))];
    if (!clean.length) throw new Error('Selecione ao menos uma mensagem.');
    const placeholders = clean.map(() => '?').join(',');
    const timestamp = nowIso();
    this.db.exec('BEGIN');
    try {
      for (const id of clean) { const current = this.getAutomaticMessage(id); if (current) this.archiveAutomaticMessage(current, `bulk-${action}`); }
      if (action === 'activate') this.db.prepare(`UPDATE automatic_messages SET active=1,archived=0,updated_at=? WHERE id IN (${placeholders})`).run(timestamp, ...clean);
      else if (action === 'deactivate') this.db.prepare(`UPDATE automatic_messages SET active=0,archived=0,updated_at=? WHERE id IN (${placeholders})`).run(timestamp, ...clean);
      else if (action === 'archive') this.db.prepare(`UPDATE automatic_messages SET archived=1,active=0,updated_at=? WHERE id IN (${placeholders})`).run(timestamp, ...clean);
      else if (action === 'unarchive') this.db.prepare(`UPDATE automatic_messages SET archived=0,updated_at=? WHERE id IN (${placeholders})`).run(timestamp, ...clean);
      else if (action === 'delete') this.db.prepare(`DELETE FROM automatic_messages WHERE id IN (${placeholders})`).run(...clean);
      else throw new Error('Ação em lote inválida.');
      if (action !== 'delete') this.db.prepare(`UPDATE automatic_messages SET customized=1 WHERE source_type='hub_package' AND id IN (${placeholders})`).run(...clean);
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    this.invalidate('activeMessages');
    return { changed: clean.length, action };
  }
  exportAutomaticMessages(ids = []) {
    const selected = new Set((Array.isArray(ids) ? ids : []).map(Number));
    return this.listAutomaticMessages().filter(item => selected.has(Number(item.id)));
  }
  validateAutomaticMessageRules(input, ignoreId = null) {
    const errors = []; const warnings = [];
    let candidate;
    try { candidate = this.validateAutomaticMessage(input); } catch (error) { return { valid: false, errors: [error.message], warnings }; }
    const trigger = candidate.trigger || {};
    const generic = new Set(['contato','email','ajuda','documento','link','professor','professora','curso','calendario','informacao','info','oi','ola','sim','nao']);
    for (const term of [...(trigger.sentences || []), ...(trigger.keywords || [])]) {
      const normalized = normalizeText(term);
      if (generic.has(normalized)) warnings.push(`O gatilho “${term}” é muito genérico e pode responder fora de contexto.`);
      if (normalized.length === 1 && !['?','!'].includes(String(term).trim())) warnings.push(`O gatilho “${term}” é curto demais.`);
    }
    const candidateTerms = [...(trigger.sentences || []), ...(trigger.keywords || [])].map(normalizeText).filter(Boolean);
    for (const item of this.listAutomaticMessages()) {
      if (Number(item.id) === Number(ignoreId) || item.archived) continue;
      const other = item.draft || item; const otherTerms = [...(other.trigger?.sentences || []), ...(other.trigger?.keywords || [])].map(normalizeText).filter(Boolean);
      const shared = candidateTerms.filter(term => otherTerms.includes(term));
      if (shared.length) warnings.push(`Pode conflitar com “${other.title}”: ${shared.slice(0,3).join(', ')}.`);
    }
    const caption = captionAnalysis(candidate);
    if (candidate.attachment && caption.status === 'warning') warnings.push(`A legenda terá ${caption.totalCharacters} caracteres; prefira até ${caption.safeLimit}. ${caption.suggestion}`);
    for (const example of candidate.trigger?.negative_examples || []) {
      const evaluated = require('./trigger-rules').evaluateTrigger(example, candidate, this.listSynonymGroups({ activeOnly: true }));
      if (evaluated.matched) errors.push(`O exemplo negativo “${example}” ainda ativa este card.`);
    }
    return { valid: !errors.length, errors, warnings: [...new Set(warnings)].slice(0, 20), normalized: candidate, caption };
  }

  listLinksForCheck() {
    return this.listAutomaticMessages({ activeOnly: true }).flatMap(item => {
      const urls = [...new Set([
        String(item.source_url || '').trim(),
        ...(String(item.response_text || '').match(/https?:\/\/[^\s<>]+/gi) || []),
        ...(String(item.details_text || '').match(/https?:\/\/[^\s<>]+/gi) || []),
      ].filter(Boolean).map(url => url.replace(/[),.;!?]+$/, '')))];
      return urls.slice(0, 3).map(url => ({ id: item.id, title: item.title, url }));
    });
  }
  updateLinkHealth(id, status) {
    const result = this.db.prepare('UPDATE automatic_messages SET link_status=?,link_checked_at=?,link_http_status=?,link_error=? WHERE id=?')
      .run(String(status.status || 'error'), status.checkedAt || nowIso(), Number(status.httpStatus || 0), String(status.error || '').slice(0, 500), Number(id));
    if (result.changes) { this.touchWrite(); this.invalidate('activeMessages'); }
    return this.getAutomaticMessage(id);
  }

  applyLinkHealthBatch(updates = []) {
    const rows = Array.isArray(updates) ? updates.slice(0, 10_000) : [];
    const select = this.db.prepare('SELECT response_text,details_text,source_url FROM automatic_messages WHERE id=?');
    const update = this.db.prepare('UPDATE automatic_messages SET link_status=?,link_checked_at=?,link_http_status=?,link_error=? WHERE id=?');
    let applied = 0; let stale = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of rows) {
        const id = Number(item?.id); const url = String(item?.url || '');
        if (!Number.isInteger(id) || id <= 0) continue;
        const current = select.get(id);
        if (!current) continue;
        if (url) {
          const currentUrls = [...new Set([
            String(current.source_url || '').trim(),
            ...(String(current.response_text || '').match(/https?:\/\/[^\s<>]+/gi) || []),
            ...(String(current.details_text || '').match(/https?:\/\/[^\s<>]+/gi) || [])
          ].filter(Boolean).map(value => value.replace(/[),.;!?]+$/, '')))];
          if (!currentUrls.includes(url)) { stale += 1; continue; }
        }
        const result = update.run(String(item.status || 'error'), item.checkedAt || nowIso(), Number(item.httpStatus || 0), String(item.error || '').slice(0, 500), id);
        applied += Number(result.changes || 0);
      }
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    if (applied) { this.touchWrite(); this.invalidate('activeMessages'); }
    return { applied, stale, received: rows.length };
  }

  };
};
