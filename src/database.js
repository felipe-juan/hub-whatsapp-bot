const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { parseList, normalizeText } = require('./text');
const { toPortugueseTitleCase } = require('./title-case');
const { normalizeTriggerRules, validateRegex } = require('./trigger-rules');
const { SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, buildSiProfessorExactNamePhrases, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2 } = require('./si-professors-2026-2');
const { buildProfessorScheduleResponse } = require('./professor-schedule-import');
const { SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload } = require('./si-support-messages-v083');
const { INSTITUTIONAL_CARDS_V098 } = require('./institutional-cards');
const { FUN_CARDS_V0101 } = require('./content/fun');
const { SEMESTER_WEEKLY_CARDS_V0143 } = require('./content/semester-weekly-cards');
const { CAMPUS_CARDS } = require('./content/campus');
const { captionAnalysis } = require('./caption-policy');
const { felipeJuanPhone, injectFelipeJuanPhone } = require('./private-content');
const createMigrationsMixin = require('./database/migrations');
const createCardsRepositoryMixin = require('./database/cards-repository');
const createDirectoriesRepositoryMixin = require('./database/directories-repository');
const createDeliveriesRepositoryMixin = require('./database/deliveries-repository');
const createBackupsRepositoryMixin = require('./database/backups-repository');
const createScheduleRepositoryMixin = require('./database/schedule-repository');
const createIncomingRepositoryMixin = require('./database/incoming-repository');
const createLearningRepositoryMixin = require('./database/learning-repository');
const createChangeHistoryRepositoryMixin = require('./database/change-history-repository');

const DEFAULT_SETTINGS = {
  bot_name: 'HUB Bot',
  hub_base_url: '',
  group_only: 'false',
  allow_private_help: 'true',
  group_mode: 'all',
  cooldown_seconds: '0',
  max_hub_results: '2',
  reply_footer: '_Bot comunitário do HUB Arquivos. Não é um canal oficial do IFBA._',
  log_matched_messages: 'true',
  log_retention_days: '30',
  usage_statistics_enabled: 'true',
  calculator_enabled: 'true',
  faq_enabled: 'true',
  automatic_messages_enabled: 'true',
  auto_reconnect: 'true',
  quote_replies: 'true',
  automatic_backups_enabled: 'true',
  backup_interval_hours: '24',
  backup_keep_count: '14',
  disambiguation_enabled: 'true',
  disambiguation_threshold: '1',
  disambiguation_timeout_seconds: '120',
  admin_numbers: '',
  bot_paused: 'false',
  link_check_enabled: 'true',
  link_check_interval_hours: '24',
  link_check_timeout_seconds: '12',
  login_max_attempts: '5',
  login_lock_minutes: '15',
  example_data_seeded: 'false',
  si_professors_2026_2_seeded: 'false',
  si_professors_2026_2_triggers_v082_migrated: 'false',
  si_professors_2026_2_emails_v083_migrated: 'false',
  si_professors_2026_2_luana_email_v084_migrated: 'false',
  si_support_messages_v083_seeded: 'false',
  si_content_v085_migrated: 'false',
  si_triggers_v086_migrated: 'false',
  si_support_triggers_v087_migrated: 'false',
  si_conflicts_v0811_migrated: 'false',
  schedule_board_v0812_seeded: 'false',
  automatic_messages_migrated: 'false',
  diagnostic_enabled: 'true',
  message_ui_v070_migrated: 'false',
  risk_defaults_v070_migrated: 'false',
  delivery_v088_migrated: 'false',
  content_origin_v0813_migrated: 'false',
  conversation_queue_v0813_migrated: 'false',
  sector_full_names_v0814_migrated: 'false',
  room_trigger_conflicts_v096_migrated: 'false',
  professor_directory_v097_seeded: 'false',
  professor_location_v097_migrated: 'false',
  institutional_cards_v098_migrated: 'false',
  structured_sectors_v098_seeded: 'false',
  fun_cards_v0101_seeded: 'false',
  fun_cards_v0102_seeded: 'false',
  fun_cards_v0103_attachment_restored: 'false',
  content_v0104_seeded: 'false',
  calculators_v0104_single_final: 'false',
  professor_cards_v0104_rooms: 'false',
  automatic_messages_v0101_simplified: 'false',
  contextual_followup_seconds: '300',
  risk_guard_enabled: 'false',
  outbound_min_interval_ms: '0',
  max_replies_per_minute: '8',
  max_replies_per_hour: '80',
  max_replies_per_user_per_minute: '3',
  max_outbound_queue: '200',
  max_concurrent_sends: '8',
  max_concurrent_media_sends: '2',
  delivery_queue_mode: 'per_conversation',
  process_append_messages: 'false',
  ignored_bot_numbers: '',
  ignored_message_prefixes: '[BOT]|[HUBBOT]',
  dashboard_cards: 'connection,messages,queue,last_reply,top_rules,errors,memory',
  dashboard_stale_minutes: '120',
  professor_room_stale_days: '180',
  current_academic_period: '2026.2',
  content_v0110_structured_schedule_calendar_typos: 'false',
  content_v0130_management_and_triggers: 'false',
  content_v0140_precision_performance: 'false',
  content_v0142_selective_cards_and_repository: 'false',
  content_v0143_semester_cards_context_intents: 'false',
  content_v0144_direct_short_triggers: 'false',
  private_context_without_reply: 'true',
  external_backups_enabled: 'false',
  external_backup_interval_hours: '24',
  external_backup_remote: '',
  external_backup_daily_keep: '7',
  external_backup_weekly_keep: '4',
  external_backup_preupdate_keep: '3',
  update_github_repository: 'felipejuan/hub-whatsapp-bot',
  update_github_branch: 'main'
};

const DEFAULT_LINKS = [
  {
    title: 'Barema / Atividades Complementares', category: 'Acadêmico', url: '',
    description: 'Consulta de categorias, limites e horas complementares.',
    keywords: ['barema', 'horas complementares', 'atividade complementar', 'certificado', 'curso de inglês', 'estágio', 'dce', 'doação de sangue'],
    priority: 10, active: false
  },
  {
    title: 'Calendário Acadêmico IFBA VCA', category: 'Acadêmico', url: '',
    description: 'Calendário, sábados letivos, recessos, feriados e datas importantes.',
    keywords: ['calendário', 'feriado', 'recesso', 'sábado letivo', 'ano letivo'],
    priority: 8, active: false
  },
  {
    title: 'Fluxograma / Matriz de Sistemas de Informação', category: 'Curso', url: '',
    description: 'Matriz curricular, disciplinas, pré-requisitos e dependências.',
    keywords: ['fluxograma', 'matriz curricular', 'pré-requisito', 'disciplinas', 'bsi', 'sistemas de informação'],
    priority: 8, active: false
  },
  {
    title: 'Documentos Acadêmicos', category: 'Documentos', url: '',
    description: 'Regulamentos, resoluções, portarias, PPCs e outros documentos.',
    keywords: ['regulamento', 'resolução', 'portaria', 'ppc', 'jubilamento', 'trancamento', 'quebra de requisito'],
    priority: 6, active: false
  }
];

const DEFAULT_CALCULATORS = [
  {
    key: 'final',
    label: 'Calculadora de Prova Final',
    command: '!final',
    description: 'Com uma nota, usa a média informada; com várias, calcula a média das unidades e a nota mínima da prova final.',
    enabled: true,
    config: { approval_average: 7, final_minimum_average: 2.5, final_target: 5 }
  }
];

const GROUP_FEATURES = ['help', 'messages', 'calculator'];
const GROUP_FEATURE_COLUMNS = {
  help: 'allow_help', messages: 'allow_messages', calculator: 'allow_calculator'
};

function boolToDb(value) { return value ? 1 : 0; }
function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}
function parseJson(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function parseJsonList(value) { const parsed = parseJson(value || '[]', []); return Array.isArray(parsed) ? parsed : []; }
function nowIso() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function comparableMessageSnapshot(value = {}) {
  const item = value && typeof value === 'object' ? value : {};
  return {
    title: String(item.title || '').trim(),
    response_text: String(item.response_text || '').trim(),
    trigger: normalizeTriggerRules(item.trigger || {}),
    priority: Number(item.priority || 0),
    active: item.active !== false,
    archived: Boolean(item.archived),
    scope: ['both', 'group', 'private'].includes(item.scope) ? item.scope : 'both',
    attachment: item.attachment || null,
    source_url: String(item.source_url || '').trim(),
    source_title: String(item.source_title || '').trim(),
    verified_at: String(item.verified_at || '').trim()
  };
}
function messageSnapshotsEqual(first, second) {
  return JSON.stringify(comparableMessageSnapshot(first)) === JSON.stringify(comparableMessageSnapshot(second));
}
function packageKeyFor(title) {
  return normalizeText(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}
const CONFLICT_VERSION_MARKERS = new Set(['i','ii','iii','iv','v','1','2','3','4','5']);
function tokenSequenceContained(containerTokens, candidateTokens) {
  if (!candidateTokens.length || containerTokens.length < candidateTokens.length) return false;
  for (let start = 0; start <= containerTokens.length - candidateTokens.length; start += 1) {
    let equal = true;
    for (let offset = 0; offset < candidateTokens.length; offset += 1) {
      if (containerTokens[start + offset] !== candidateTokens[offset]) { equal = false; break; }
    }
    if (!equal) continue;
    const nextToken = containerTokens[start + candidateTokens.length];
    const lastCandidate = candidateTokens.at(-1);
    if (nextToken && CONFLICT_VERSION_MARKERS.has(nextToken) && !CONFLICT_VERSION_MARKERS.has(lastCandidate)) continue;
    return true;
  }
  return false;
}
function triggerTermsOverlap(first, second) {
  return tokenSequenceContained(first.tokens, second.tokens) || tokenSequenceContained(second.tokens, first.tokens);
}
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
function normalizeTag(value) {
  return normalizeText(String(value || '').replace(/^#+/, ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
function normalizeTags(value, legacyTopic = '') {
  const values = [...parseList(value), ...(legacyTopic ? [legacyTopic] : [])];
  return [...new Set(values.map(normalizeTag).filter(Boolean))].slice(0, 30);
}

class Database {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.options = options && typeof options === 'object' ? options : {};
    this.cache = { settings: null, activeTeachers: null, activeSectors: null, activeLinks: null, activeFaqs: null, activeMessages: null, messageSummaries: null, conflictReport: null, synonyms: null, calculators: null };
    this.changeEmitter = new EventEmitter();
    this.changeEmitter.setMaxListeners(30);
    this.changeSequence = 0;
    this.closed = false;
    this.logInsertCount = 0;
    this.usageBuffer = new Map();
    this.usageFlushTimer = null;
    this.lastWriteAt = Date.now();
    this.lastCheckpointAt = 0;
    this.prepared = {};
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
      PRAGMA cache_size = -4096;
      PRAGMA auto_vacuum = INCREMENTAL;
    `);
    this.migrate();
    this.seed();
    this.prepareFrequentlyUsedStatements();
    this.startUsageFlushTimer();
    this.pruneLogs();
  }

  prepareFrequentlyUsedStatements() {
    this.prepared = {
      insertLog: this.db.prepare('INSERT INTO message_logs(created_at,chat_id,chat_name,message_excerpt,match_type,matched_item,reply_excerpt) VALUES (?,?,?,?,?,?,?)'),
      incrementUsage: this.db.prepare(`INSERT INTO usage_stats(day,topic,match_type,count) VALUES (?,?,?,?)
        ON CONFLICT(day,topic,match_type) DO UPDATE SET count=count+excluded.count`),
      getOutboundById: this.db.prepare('SELECT * FROM outbound_deliveries WHERE id=?'),
      getOutboundByKey: this.db.prepare("SELECT * FROM outbound_deliveries WHERE idempotency_key=? AND idempotency_key<>''"),
      insertOutbound: this.db.prepare(`INSERT OR IGNORE INTO outbound_deliveries(
        conversation_id,content_json,state,attempts,next_attempt_at,last_error,created_at,updated_at,idempotency_key,priority,source_message_id
      ) VALUES (?,?,'pending',0,'','',?,?,?,?,?)`),
      claimOutbound: this.db.prepare(`UPDATE outbound_deliveries SET state='sending',attempts=attempts+1,claim_token=?,updated_at=?
        WHERE id=? AND state IN ('pending','retry')`),
      markOutboundSent: this.db.prepare(`UPDATE outbound_deliveries SET state='sent',whatsapp_message_id=?,last_error='',claim_token='',sent_at=?,updated_at=?
        WHERE id=? AND state IN ('sending','retry','uncertain') AND (? IS NULL OR attempts=?)`),
      markOutboundRetry: this.db.prepare(`UPDATE outbound_deliveries SET state='retry',next_attempt_at=?,last_error=?,claim_token='',updated_at=?
        WHERE id=? AND state IN ('pending','retry','sending','uncertain') AND (? IS NULL OR attempts=?)`),
      markOutboundFailed: this.db.prepare(`UPDATE outbound_deliveries SET state='failed',last_error=?,claim_token='',updated_at=?
        WHERE id=? AND state IN ('pending','retry','sending','uncertain') AND (? IS NULL OR attempts=?)`),
      markOutboundUncertain: this.db.prepare(`UPDATE outbound_deliveries SET state='uncertain',next_attempt_at='',last_error=?,claim_token='',updated_at=?
        WHERE id=? AND state IN ('sending','retry') AND (? IS NULL OR attempts=?)`),
      outboundStats: this.db.prepare('SELECT state,COUNT(*) AS count FROM outbound_deliveries GROUP BY state'),
      dueOutboundCount: this.db.prepare(`SELECT COUNT(*) AS count FROM outbound_deliveries
        WHERE state IN ('pending','retry') AND (next_attempt_at='' OR next_attempt_at<=?)`),
      activeOutboundOldest: this.db.prepare("SELECT MIN(updated_at) AS oldest FROM outbound_deliveries WHERE state='sending'")
    };
  }

  startUsageFlushTimer() {
    clearInterval(this.usageFlushTimer);
    this.usageFlushTimer = setInterval(() => {
      try { this.flushUsageStats(); } catch (error) { console.warn('Falha ao gravar estatísticas em lote:', error.message); }
    }, 2000);
    this.usageFlushTimer.unref?.();
  }

  touchWrite() { this.lastWriteAt = Date.now(); }

  ruleSourceRevision() {
    const messages = this.db.prepare(`SELECT COUNT(*) AS count,COALESCE(MAX(updated_at),'') AS updated
      FROM automatic_messages WHERE published=1 AND active=1 AND archived=0`).get();
    const synonyms = this.db.prepare(`SELECT COUNT(*) AS count,COALESCE(MAX(updated_at),'') AS updated
      FROM synonym_groups WHERE active=1`).get();
    return `${Number(messages?.count||0)}:${messages?.updated||''}|${Number(synonyms?.count||0)}:${synonyms?.updated||''}`;
  }

  flushUsageStats() {
    if (!this.usageBuffer.size || this.closed) return 0;
    const entries = [...this.usageBuffer.entries()];
    this.usageBuffer.clear();
    this.db.exec('BEGIN');
    try {
      for (const [key, count] of entries) {
        const [day, topic, matchType] = JSON.parse(key);
        this.prepared.incrementUsage.run(day, topic, matchType, Number(count || 0));
      }
      this.db.exec('COMMIT');
      this.touchWrite();
      return entries.length;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      for (const [key, count] of entries) this.usageBuffer.set(key, Number(this.usageBuffer.get(key) || 0) + Number(count || 0));
      throw error;
    }
  }

  maybeCheckpoint({ force = false, idleMs = 30_000 } = {}) {
    if (this.closed) return { skipped: true, reason: 'closed' };
    const now = Date.now();
    if (!force && (now - this.lastWriteAt < Number(idleMs || 0) || now - this.lastCheckpointAt < 10 * 60_000)) {
      return { skipped: true, reason: 'busy-or-recent' };
    }
    try {
      const passive = this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get() || {};
      const logFrames = Number(passive.log || passive[1] || 0);
      let mode = 'PASSIVE';
      let result = passive;
      if (force || logFrames > 4096) {
        result = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() || passive;
        mode = 'TRUNCATE';
      }
      this.lastCheckpointAt = now;
      return { skipped: false, mode, busy: Number(result.busy || result[0] || 0), logFrames, checkpointed: Number(result.checkpointed || result[2] || 0) };
    } catch (error) { return { skipped: false, error: error.message }; }
  }

  outboundHealth() {
    const now = nowIso();
    const due = Number(this.prepared.dueOutboundCount.get(now)?.count || 0);
    const oldest = this.prepared.activeOutboundOldest.get()?.oldest || '';
    return { due, oldestSendingAt: oldest };
  }

  walStatus() {
    try {
      const row = this.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get() || {};
      const pageSize = Number(this.db.prepare('PRAGMA page_size').get()?.page_size || 4096);
      const logFrames = Number(row.log || row[1] || 0);
      const checkpointedFrames = Number(row.checkpointed || row[2] || 0);
      return {
        busy: Number(row.busy || row[0] || 0),
        logFrames,
        checkpointedFrames,
        estimatedBytes: Math.max(0, logFrames * pageSize),
        lastCheckpointAt: this.lastCheckpointAt ? new Date(this.lastCheckpointAt).toISOString() : ''
      };
    } catch (error) { return { error: error.message, logFrames: 0, checkpointedFrames: 0, estimatedBytes: 0 }; }
  }

  tableColumns(table) { return new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)); }
  ensureColumn(table, column, definition) { if (!this.tableColumns(table).has(column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }

  invalidate(...keys) {
    const expanded = new Set(keys);
    if (expanded.has('activeMessages')) { expanded.add('messageSummaries'); expanded.add('conflictReport'); }
    for (const key of expanded) this.cache[key] = null;
    if (expanded.size) {
      const event = { sequence: ++this.changeSequence, keys: [...expanded], createdAt: nowIso() };
      this.changeEmitter.emit('change', event);
    }
  }

  onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    this.changeEmitter.on('change', listener);
    return () => this.changeEmitter.off('change', listener);
  }

  refreshExternalChanges(...keys) {
    const targets = keys.length ? keys : ['settings','activeMessages','activeTeachers','activeSectors','activeLinks','activeFaqs','synonyms','calculators'];
    this.invalidate(...targets);
    return { sequence: this.changeSequence, keys: targets };
  }

  getSettings() {
    if (!this.cache.settings) this.cache.settings = Object.fromEntries(this.db.prepare('SELECT key,value FROM settings ORDER BY key').all().map(row => [row.key, row.value]));
    return { ...this.cache.settings };
  }
  getSetting(key, fallback = '') { const settings = this.getSettings(); return Object.hasOwn(settings, key) ? settings[key] : fallback; }
  setSettings(values, useTransaction = true, options = {}) {
    const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
    const before = this.getSettings();
    const accepted = Object.fromEntries(Object.entries(values || {}).filter(([key]) => allowed.has(key)).map(([key,value]) => [key,String(value)]));
    const stmt = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    if (useTransaction) this.db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(accepted)) stmt.run(key, value);
      if (useTransaction) this.db.exec('COMMIT');
      this.invalidate('settings');
      if (Object.hasOwn(accepted, 'log_retention_days')) this.pruneLogs();
      if (!options.skipHistory && Object.keys(accepted).some(key => before[key] !== accepted[key]) && typeof this.recordChangeHistory === 'function') {
        this.recordChangeHistory({ entity_type:'settings', entity_id:'global', entity_label:'Configurações do bot', action:'updated', source:options.source || 'painel', before:Object.fromEntries(Object.keys(accepted).map(key => [key,before[key]])), after:accepted });
      }
    } catch (error) { if (useTransaction) this.db.exec('ROLLBACK'); throw error; }
    return this.getSettings();
  }

  passwordDigest(password, salt) { return crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64).toString('hex'); }
  passwordDigestAsync(password, salt) {
    return new Promise((resolve, reject) => crypto.scrypt(String(password), Buffer.from(salt, 'hex'), 64, (error, derivedKey) => {
      if (error) reject(error); else resolve(Buffer.from(derivedKey).toString('hex'));
    }));
  }
  initializeAdminPassword(password) {
    const current = this.db.prepare('SELECT * FROM admin_auth WHERE id=1').get();
    if (current) return false;
    const salt = crypto.randomBytes(16).toString('hex');
    this.db.prepare('INSERT INTO admin_auth(id,salt,password_hash,updated_at) VALUES (1,?,?,?)').run(salt, this.passwordDigest(password, salt), nowIso());
    return true;
  }
  verifyAdminPassword(password) {
    const row = this.db.prepare('SELECT * FROM admin_auth WHERE id=1').get();
    if (!row) return false;
    const supplied = Buffer.from(this.passwordDigest(password, row.salt), 'hex');
    const expected = Buffer.from(row.password_hash, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }
  async verifyAdminPasswordAsync(password) {
    const row = this.db.prepare('SELECT * FROM admin_auth WHERE id=1').get();
    if (!row) return false;
    const supplied = Buffer.from(await this.passwordDigestAsync(password, row.salt), 'hex');
    const expected = Buffer.from(row.password_hash, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }
  changeAdminPassword(currentPassword, newPassword) {
    if (!this.verifyAdminPassword(currentPassword)) throw new Error('A senha atual está incorreta.');
    const value = String(newPassword || '');
    if (value.length < 10) throw new Error('A nova senha deve ter ao menos 10 caracteres.');
    if (value.length > 200) throw new Error('A nova senha é longa demais.');
    const salt = crypto.randomBytes(16).toString('hex');
    this.db.prepare('UPDATE admin_auth SET salt=?,password_hash=?,updated_at=? WHERE id=1').run(salt, this.passwordDigest(value, salt), nowIso());
    return true;
  }

  mapSynonym(row) { if (!row) return null; const { terms_json, ...rest } = row; return { ...rest, active: Boolean(row.active), is_example: Boolean(row.is_example), terms: parseJsonList(terms_json) }; }
  listSynonymGroups({ activeOnly = false } = {}) {
    if (activeOnly && this.cache.synonyms) return clone(this.cache.synonyms);
    const rows = this.db.prepare(`SELECT * FROM synonym_groups${activeOnly ? ' WHERE active=1' : ''} ORDER BY active DESC,name COLLATE NOCASE`).all().map(row => this.mapSynonym(row));
    if (activeOnly) this.cache.synonyms = rows;
    return clone(rows);
  }
  saveSynonymGroup(input, id = null) {
    const name = String(input.name || '').trim(); const terms = [...new Set(parseList(input.terms))];
    if (!name) throw new Error('Nome do grupo de sinônimos é obrigatório.');
    if (terms.length < 2) throw new Error('Adicione ao menos dois termos equivalentes.');
    const active = input.active === undefined ? true : Boolean(input.active); const timestamp = nowIso();
    try {
      if (id) {
        const result = this.db.prepare('UPDATE synonym_groups SET name=?,terms_json=?,active=?,updated_at=? WHERE id=?').run(name, JSON.stringify(terms), boolToDb(active), timestamp, Number(id));
        if (!result.changes) throw new Error('Grupo de sinônimos não encontrado.');
      } else {
        id = this.db.prepare('INSERT INTO synonym_groups(name,terms_json,active,created_at,updated_at) VALUES (?,?,?,?,?)').run(name, JSON.stringify(terms), boolToDb(active), timestamp, timestamp).lastInsertRowid;
      }
    } catch (error) { if (/UNIQUE/i.test(error.message)) throw new Error('Já existe um grupo de sinônimos com esse nome.'); throw error; }
    this.invalidate('synonyms', 'activeLinks', 'activeFaqs');
    return this.mapSynonym(this.db.prepare('SELECT * FROM synonym_groups WHERE id=?').get(Number(id)));
  }
  deleteSynonymGroup(id) {
    const numeric = Number(id);
    const referencedMessages = this.listAutomaticMessages().some(item => (item.trigger?.synonym_group_ids || []).includes(numeric) || (item.draft?.trigger?.synonym_group_ids || []).includes(numeric));
    const referencedLinks = this.listHubLinks().some(item => (item.trigger?.synonym_group_ids || []).includes(numeric) || (item.draft?.trigger?.synonym_group_ids || []).includes(numeric));
    const referencedFaqs = this.listFaqs().some(item => (item.trigger?.synonym_group_ids || []).includes(numeric) || (item.draft?.trigger?.synonym_group_ids || []).includes(numeric));
    if (referencedMessages || referencedLinks || referencedFaqs) throw new Error('Este grupo ainda é usado por uma mensagem automática. Remova a referência antes de excluí-lo.');
    const deleted = Boolean(this.db.prepare('DELETE FROM synonym_groups WHERE id=?').run(numeric).changes);
    if (deleted) this.invalidate('synonyms', 'activeMessages');
    return deleted;
  }

  validateTrigger(input, fallbackKeywords = []) {
    const rules = normalizeTriggerRules(input, fallbackKeywords);
    if (rules.regex_pattern) validateRegex(rules.regex_pattern, rules.regex_flags);
    if (!rules.keywords.length && !rules.sentences.length && !rules.exact_phrases.length && !rules.regex_pattern) throw new Error('Adicione sentença, palavra-chave ou expressão regular.');
    const validSynonyms = new Set(this.listSynonymGroups().map(group => Number(group.id)));
    rules.synonym_group_ids = rules.synonym_group_ids.filter(id => validSynonyms.has(Number(id)));
    return rules;
  }

  validateHubLink(input) {
    const title = String(input.title || '').trim(); const category = String(input.category || '').trim(); const url = String(input.url || '').trim();
    if (!title) throw new Error('Título do link é obrigatório.');
    if (url && !/^https?:\/\//i.test(url)) throw new Error('O link deve começar com http:// ou https://.');
    const keywords = parseList(input.keywords || input.trigger?.keywords);
    const trigger = this.validateTrigger(input.trigger || input, keywords);
    return {
      title, category, url, description: String(input.description || '').trim(), keywords: trigger.keywords,
      trigger, response_text: String(input.response_text || '').trim(),
      priority: Math.max(-100, Math.min(100, Number(input.priority || 0))),
      active: input.active === undefined ? true : Boolean(input.active)
    };
  }
  mapHubLink(row) {
    if (!row) return null;
    const draft = row.draft_json ? parseJson(row.draft_json, null) : null;
    const { keywords_json, trigger_json, draft_json, ...rest } = row;
    const keywords = parseJsonList(keywords_json);
    const trigger = normalizeTriggerRules(parseJson(trigger_json, {}), keywords);
    return {
      ...rest, active: Boolean(row.active), archived: Boolean(row.archived), sort_order: Number(row.sort_order || 0), published: Boolean(row.published), is_example: Boolean(row.is_example), keywords, trigger,
      draft: draft ? { ...draft, active: Boolean(draft.active), keywords: parseList(draft.keywords), trigger: normalizeTriggerRules(draft.trigger, draft.keywords) } : null,
      has_draft: Boolean(draft)
    };
  }
  listHubLinks({ activeOnly = false, search = '' } = {}) {
    if (activeOnly && !search && this.cache.activeLinks) return clone(this.cache.activeLinks);
    let sql = 'SELECT * FROM hub_links'; const where = []; const params = [];
    if (activeOnly) where.push('published=1 AND active=1 AND archived=0');
    if (search) { where.push('(title LIKE ? OR category LIKE ? OR description LIKE ? OR keywords_json LIKE ? OR trigger_json LIKE ? OR draft_json LIKE ?)'); const term = `%${search}%`; params.push(term, term, term, term, term, term); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY published DESC,active DESC,priority DESC,title COLLATE NOCASE';
    const items = this.db.prepare(sql).all(...params).map(row => this.mapHubLink(row));
    if (activeOnly && !search) this.cache.activeLinks = items;
    return clone(items);
  }
  getHubLink(id) { return this.mapHubLink(this.db.prepare('SELECT * FROM hub_links WHERE id=?').get(Number(id))); }
  saveHubLinkDraft(input, id = null) {
    const draft = this.validateHubLink(input); const timestamp = nowIso();
    if (id) {
      if (!this.getHubLink(id)) throw new Error('Link não encontrado.');
      this.db.prepare('UPDATE hub_links SET draft_json=?,updated_at=? WHERE id=?').run(JSON.stringify(draft), timestamp, Number(id));
      this.invalidate('activeLinks'); return this.getHubLink(id);
    }
    const result = this.db.prepare(`INSERT INTO hub_links(title,category,url,description,keywords_json,trigger_json,response_text,priority,active,published,published_at,draft_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,0,'',?,?,?)`)
      .run(draft.title, draft.category, draft.url, draft.description, JSON.stringify(draft.keywords), JSON.stringify(draft.trigger), draft.response_text, draft.priority, JSON.stringify(draft), timestamp, timestamp);
    this.invalidate('activeLinks'); return this.getHubLink(result.lastInsertRowid);
  }
  publishHubLink(id) {
    const current = this.getHubLink(id); if (!current) throw new Error('Link não encontrado.');
    const item = this.validateHubLink(current.draft || current); if (item.active && !item.url) throw new Error('Um link ativo precisa de URL.');
    const timestamp = nowIso();
    this.db.prepare(`UPDATE hub_links SET title=?,category=?,url=?,description=?,keywords_json=?,trigger_json=?,response_text=?,priority=?,active=?,published=1,published_at=?,draft_json='',updated_at=?,link_status='unchecked',link_checked_at='',link_http_status=0,link_error='' WHERE id=?`)
      .run(item.title, item.category, item.url, item.description, JSON.stringify(item.keywords), JSON.stringify(item.trigger), item.response_text, item.priority, boolToDb(item.active && Boolean(item.url)), timestamp, timestamp, Number(id));
    this.invalidate('activeLinks'); return this.getHubLink(id);
  }
  discardHubLinkDraft(id) { const current = this.getHubLink(id); if (!current) return false; if (!current.published) return this.deleteHubLink(id); return Boolean(this.db.prepare("UPDATE hub_links SET draft_json='',updated_at=? WHERE id=?").run(nowIso(), Number(id)).changes); }
  saveHubLink(input, id = null) { const saved = this.saveHubLinkDraft(input, id); return this.publishHubLink(saved.id); }
  upsertHubLinkByTitle(input, { publish = false } = {}) { const title = String(input.title || '').trim(); const found = this.db.prepare('SELECT id FROM hub_links WHERE lower(title)=lower(?)').get(title); const item = this.saveHubLinkDraft(input, found?.id || null); return { item: publish ? this.publishHubLink(item.id) : item, created: !found }; }
  deleteHubLink(id) { const deleted = Boolean(this.db.prepare('DELETE FROM hub_links WHERE id=?').run(Number(id)).changes); if (deleted) this.invalidate('activeLinks'); return deleted; }
  validateFaq(input) {
    const title = String(input.title || '').trim(); const topic = String(input.topic || '').trim(); const answer = String(input.answer || '').trim();
    if (!title) throw new Error('Título da FAQ é obrigatório.'); if (!answer) throw new Error('Resposta da FAQ é obrigatória.');
    const trigger = this.validateTrigger(input.trigger || input, parseList(input.keywords || input.trigger?.keywords));
    return { title, topic, answer, trigger, priority: Math.max(-100, Math.min(100, Number(input.priority || 0))), active: input.active === undefined ? true : Boolean(input.active) };
  }
  mapFaq(row) {
    if (!row) return null; const draft = row.draft_json ? parseJson(row.draft_json, null) : null; const { trigger_json, draft_json, ...rest } = row;
    return { ...rest, active: Boolean(row.active), published: Boolean(row.published), is_example: Boolean(row.is_example), trigger: normalizeTriggerRules(parseJson(trigger_json, {})), draft: draft ? { ...draft, active: Boolean(draft.active), trigger: normalizeTriggerRules(draft.trigger) } : null, has_draft: Boolean(draft) };
  }
  listFaqs({ activeOnly = false, search = '' } = {}) {
    if (activeOnly && !search && this.cache.activeFaqs) return clone(this.cache.activeFaqs);
    let sql = 'SELECT * FROM faq_entries'; const where = []; const params = [];
    if (activeOnly) where.push('published=1 AND active=1 AND archived=0');
    if (search) { where.push('(title LIKE ? OR topic LIKE ? OR answer LIKE ? OR trigger_json LIKE ? OR draft_json LIKE ?)'); const term = `%${search}%`; params.push(term, term, term, term, term, term); }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY published DESC,active DESC,priority DESC,title COLLATE NOCASE';
    const rows = this.db.prepare(sql).all(...params).map(row => this.mapFaq(row));
    if (activeOnly && !search) this.cache.activeFaqs = rows;
    return clone(rows);
  }
  getFaq(id) { return this.mapFaq(this.db.prepare('SELECT * FROM faq_entries WHERE id=?').get(Number(id))); }
  saveFaqDraft(input, id = null) {
    const draft = this.validateFaq(input); const timestamp = nowIso();
    if (id) { if (!this.getFaq(id)) throw new Error('FAQ não encontrada.'); this.db.prepare('UPDATE faq_entries SET draft_json=?,updated_at=? WHERE id=?').run(JSON.stringify(draft), timestamp, Number(id)); this.invalidate('activeFaqs'); return this.getFaq(id); }
    const result = this.db.prepare(`INSERT INTO faq_entries(title,topic,answer,trigger_json,priority,active,published,published_at,draft_json,created_at,updated_at) VALUES (?,?,?,'{}',0,0,0,'',?,?,?)`)
      .run(draft.title, draft.topic, draft.answer, JSON.stringify(draft), timestamp, timestamp);
    this.invalidate('activeFaqs'); return this.getFaq(result.lastInsertRowid);
  }
  publishFaq(id) {
    const current = this.getFaq(id); if (!current) throw new Error('FAQ não encontrada.'); const item = this.validateFaq(current.draft || current); const timestamp = nowIso();
    this.db.prepare(`UPDATE faq_entries SET title=?,topic=?,answer=?,trigger_json=?,priority=?,active=?,published=1,published_at=?,draft_json='',updated_at=? WHERE id=?`)
      .run(item.title, item.topic, item.answer, JSON.stringify(item.trigger), item.priority, boolToDb(item.active), timestamp, timestamp, Number(id));
    this.invalidate('activeFaqs'); return this.getFaq(id);
  }
  discardFaqDraft(id) { const current = this.getFaq(id); if (!current) return false; if (!current.published) return this.deleteFaq(id); return Boolean(this.db.prepare("UPDATE faq_entries SET draft_json='',updated_at=? WHERE id=?").run(nowIso(), Number(id)).changes); }
  saveFaq(input, id = null) { const saved = this.saveFaqDraft(input, id); return this.publishFaq(saved.id); }
  deleteFaq(id) { const deleted = Boolean(this.db.prepare('DELETE FROM faq_entries WHERE id=?').run(Number(id)).changes); if (deleted) this.invalidate('activeFaqs'); return deleted; }

  mapCalculator(row) { if (!row) return null; const { config_json, ...rest } = row; return { ...rest, enabled: Boolean(row.enabled), config: parseJson(config_json, {}) || {} }; }
  listCalculators({ enabledOnly = false } = {}) {
    if (enabledOnly && this.cache.calculators) return clone(this.cache.calculators);
    const rows = this.db.prepare(`SELECT * FROM calculators${enabledOnly ? ' WHERE enabled=1' : ''} ORDER BY label COLLATE NOCASE`).all().map(row => this.mapCalculator(row));
    if (enabledOnly) this.cache.calculators = rows;
    return clone(rows);
  }
  saveCalculator(key, input) {
    const current = this.mapCalculator(this.db.prepare('SELECT * FROM calculators WHERE key=?').get(String(key))); if (!current) throw new Error('Calculadora não encontrada.');
    const label = String(input.label ?? current.label).trim(); const command = String(input.command ?? current.command).trim();
    if (!label || !command.startsWith('!')) throw new Error('Informe um nome e um comando iniciado por !.');
    const config = input.config && typeof input.config === 'object' ? input.config : current.config;
    this.db.prepare('UPDATE calculators SET label=?,command=?,description=?,enabled=?,config_json=?,updated_at=? WHERE key=?')
      .run(label, command, String(input.description ?? current.description).trim(), boolToDb(input.enabled === undefined ? current.enabled : Boolean(input.enabled)), JSON.stringify(config), nowIso(), String(key));
    this.invalidate('calculators'); return this.mapCalculator(this.db.prepare('SELECT * FROM calculators WHERE key=?').get(String(key)));
  }

  upsertGroup(whatsappId, name) {
    this.db.prepare(`INSERT INTO groups(whatsapp_id,name,enabled,last_seen_at,allow_help,allow_teachers,allow_links,allow_faqs,allow_calculator,allow_messages) VALUES (?,?,0,?,1,1,1,1,1,1) ON CONFLICT(whatsapp_id) DO UPDATE SET name=excluded.name,last_seen_at=excluded.last_seen_at`)
      .run(String(whatsappId), String(name || ''), nowIso());
  }
  mapGroup(row) { if (!row) return null; return { ...row, enabled: Boolean(row.enabled), allow_help: Boolean(row.allow_help), allow_messages: Boolean(row.allow_messages), allow_teachers: Boolean(row.allow_teachers), allow_links: Boolean(row.allow_links), allow_faqs: Boolean(row.allow_faqs), allow_calculator: Boolean(row.allow_calculator) }; }
  listGroups() { return this.db.prepare('SELECT * FROM groups ORDER BY enabled DESC,name COLLATE NOCASE').all().map(row => this.mapGroup(row)); }
  getGroup(whatsappId) { return this.mapGroup(this.db.prepare('SELECT * FROM groups WHERE whatsapp_id=?').get(String(whatsappId))); }
  setGroupPermissions(whatsappId, input) {
    const current = this.getGroup(whatsappId); if (!current) throw new Error('Grupo não encontrado. Sincronize os grupos primeiro.');
    const fields = ['enabled', 'allow_help', 'allow_messages', 'allow_calculator']; const values = {};
    for (const field of fields) values[field] = input[field] === undefined ? current[field] : Boolean(input[field]);
    this.db.prepare('UPDATE groups SET enabled=?,allow_help=?,allow_messages=?,allow_calculator=? WHERE whatsapp_id=?')
      .run(...fields.map(field => boolToDb(values[field])), String(whatsappId));
    return this.getGroup(whatsappId);
  }
  setGroupEnabled(whatsappId, enabled) { return Boolean(this.setGroupPermissions(whatsappId, { enabled })); }
  isGroupEnabled(whatsappId) { return Boolean(this.getGroup(whatsappId)?.enabled); }
  isFeatureAllowed(whatsappId, feature, groupMode = 'all') {
    if (!GROUP_FEATURES.includes(feature)) return false; const group = this.getGroup(whatsappId);
    if (groupMode === 'selected' && !group?.enabled) return false; if (!group) return groupMode === 'all';
    return Boolean(group[GROUP_FEATURE_COLUMNS[feature]]);
  }

  addLog(log) {
    this.prepared.insertLog.run(nowIso(), log.chatId || '', log.chatName || '', log.message || '', log.matchType || '', log.matchedItem || '', log.reply || '');
    this.touchWrite();
    this.logInsertCount += 1;
    if (this.logInsertCount % 25 === 0) this.pruneLogs();
  }
  pruneLogs(days = Number(this.getSetting('log_retention_days', '30'))) {
    const safeDays = Math.max(0, Math.min(3650, Number(days || 0)));
    if (safeDays > 0) this.db.prepare('DELETE FROM message_logs WHERE created_at<?').run(new Date(Date.now() - safeDays * 86400000).toISOString());
    this.db.prepare('DELETE FROM message_logs WHERE id NOT IN (SELECT id FROM message_logs ORDER BY id DESC LIMIT 10000)').run();
  }
  listLogs(limit = 200) { return this.db.prepare('SELECT * FROM message_logs ORDER BY id DESC LIMIT ?').all(Math.max(1, Math.min(1000, Number(limit || 200)))); }
  clearLogs() { this.db.prepare('DELETE FROM message_logs').run(); }

  recordUsage(topic, matchType, enabled = null) {
    const allowed = enabled === null ? asBool(this.getSetting('usage_statistics_enabled', 'true'), true) : Boolean(enabled);
    if (!allowed) return;
    const safeTopic = String(topic || 'Outros').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Outros';
    const day = new Date().toISOString().slice(0, 10);
    const safeType = String(matchType || 'other').slice(0, 40);
    const key = JSON.stringify([day, safeTopic, safeType]);
    this.usageBuffer.set(key, Number(this.usageBuffer.get(key) || 0) + 1);
    if (this.usageBuffer.size >= 50) setImmediate(() => { try { this.flushUsageStats(); } catch {} });
  }
  getUsageStats(days = 30) {
    this.flushUsageStats();
    const safeDays = Math.max(1, Math.min(3650, Number(days || 30))); const since = new Date(Date.now() - (safeDays - 1) * 86400000).toISOString().slice(0, 10);
    const top = this.db.prepare('SELECT topic,match_type,SUM(count) AS count FROM usage_stats WHERE day>=? GROUP BY topic,match_type ORDER BY count DESC,topic LIMIT 50').all(since);
    const daily = this.db.prepare('SELECT day,SUM(count) AS count FROM usage_stats WHERE day>=? GROUP BY day ORDER BY day').all(since);
    const total = Number(this.db.prepare('SELECT COALESCE(SUM(count),0) AS count FROM usage_stats WHERE day>=?').get(since).count || 0);
    return { days: safeDays, since, total, top, daily };
  }
  clearUsageStats() { this.usageBuffer.clear(); this.db.prepare('DELETE FROM usage_stats').run(); this.touchWrite(); }

  getStats() {
    const scalar = (sql, ...params) => Number(this.db.prepare(sql).get(...params).count || 0); const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      messageCount: scalar('SELECT COUNT(*) AS count FROM automatic_messages WHERE published=1 AND active=1 AND archived=0'),
      inactiveMessageCount: scalar('SELECT COUNT(*) AS count FROM automatic_messages WHERE published=1 AND active=0 AND archived=0'),
      archivedMessageCount: scalar('SELECT COUNT(*) AS count FROM automatic_messages WHERE archived=1'),
      publishedMessageCount: scalar('SELECT COUNT(*) AS count FROM automatic_messages WHERE published=1'),
      draftCount: scalar("SELECT COUNT(*) AS count FROM automatic_messages WHERE draft_json<>'' OR published=0"),
      brokenLinkCount: scalar("SELECT COUNT(*) AS count FROM automatic_messages WHERE published=1 AND active=1 AND archived=0 AND link_status='broken'"),
      groupCount: scalar('SELECT COUNT(*) AS count FROM groups'), enabledGroupCount: scalar('SELECT COUNT(*) AS count FROM groups WHERE enabled=1'),
      exampleCount: scalar('SELECT COUNT(*) AS count FROM automatic_messages WHERE is_example=1'),
      todayLogs: scalar('SELECT COUNT(*) AS count FROM message_logs WHERE created_at>=?', today.toISOString()), totalLogs: scalar('SELECT COUNT(*) AS count FROM message_logs')
    };
  }

  getConflictReport() {
    if (this.cache.conflictReport) return clone(this.cache.conflictReport);
    const contents = this.listAutomaticMessages().map(item => {
      const effective = item.draft || item;
      const trigger = normalizeTriggerRules(effective.trigger);
      const unique = new Map();
      const addTerms = (values, kind) => {
        for (const original of values || []) {
          const normalized = normalizeText(original);
          if (!normalized) continue;
          if (!unique.has(normalized)) unique.set(normalized, { original, kinds: new Set() });
          unique.get(normalized).kinds.add(kind);
        }
      };
      addTerms(trigger.keywords, 'keyword');
      addTerms(trigger.sentences, 'sentence');
      addTerms(trigger.exact_phrases, 'exact');
      addTerms(trigger.required_words, 'required');
      const terms = [...unique.entries()].map(([normalized, data]) => ({
        normalized,
        original: data.original,
        tokens: normalized.split(' ').filter(Boolean),
        exactOnly: data.kinds.size === 1 && data.kinds.has('exact')
      }));
      const termSet = new Set(unique.keys());
      const compact = terms.filter(term => term.normalized.length >= 5 && !term.exactOnly)
        .sort((a, b) => a.normalized.length - b.normalized.length)
        .slice(0, 60);
      return { id: item.id, effective, terms, termSet, compact };
    });
    const conflicts = [];
    for (let i = 0; i < contents.length; i += 1) for (let j = i + 1; j < contents.length; j += 1) {
      const a = contents[i]; const b = contents[j]; const shared = [];
      const smaller = a.terms.length <= b.terms.length ? a : b;
      const larger = smaller === a ? b : a;
      for (const term of smaller.terms) {
        if (larger.termSet.has(term.normalized)) shared.push(`${term.original} ↔ ${larger.terms.find(other => other.normalized === term.normalized)?.original || term.original}`);
        if (shared.length >= 8) break;
      }
      if (shared.length < 8) {
        outer: for (const first of a.compact) for (const second of b.compact) {
          if (first.normalized === second.normalized) continue;
          // Só existe sobreposição quando um gatilho completo aparece como
          // sequência de tokens no outro. Isso evita falsos conflitos como
          // PW × PWI × PWII, IA × IAC, ACE I × ACE III e TCCI × TCCII.
          if (triggerTermsOverlap(first, second)) {
            shared.push(`${first.original} ↔ ${second.original}`);
            if (shared.length >= 8) break outer;
          }
        }
      }
      if (shared.length) conflicts.push({ type: 'message-trigger', severity: 'warning', items: [a.id, b.id], titles: [a.effective.title, b.effective.title], details: [...new Set(shared)].slice(0, 8) });
    }
    const report = { count: conflicts.length, conflicts };
    this.cache.conflictReport = report;
    return clone(report);
  }

  checkpoint() { const result = this.maybeCheckpoint({ force: true, idleMs: 0 }); return !result.error; }

  createAdminTaskRun(taskType) {
    const timestamp = nowIso();
    const result = this.db.prepare(`INSERT INTO admin_task_runs(task_type,state,progress,result_json,error,created_at,updated_at)
      VALUES (?,'queued',0,'','',?,?)`).run(String(taskType || 'task').slice(0, 100), timestamp, timestamp);
    return Number(result.lastInsertRowid);
  }

  updateAdminTaskRun(id, { state, progress, result, error, finished = false } = {}) {
    const current = this.db.prepare('SELECT * FROM admin_task_runs WHERE id=?').get(Number(id));
    if (!current) return null;
    const nextState = String(state || current.state).slice(0, 30);
    const nextProgress = Math.max(0, Math.min(100, Number(progress ?? current.progress ?? 0)));
    const resultJson = result === undefined ? current.result_json : JSON.stringify(result || {});
    const message = error === undefined ? current.error : String(error || '').slice(0, 2000);
    const finishedAt = finished || ['completed','failed','cancelled'].includes(nextState) ? nowIso() : current.finished_at;
    this.db.prepare(`UPDATE admin_task_runs SET state=?,progress=?,result_json=?,error=?,updated_at=?,finished_at=? WHERE id=?`)
      .run(nextState, nextProgress, resultJson, message, nowIso(), finishedAt, Number(id));
    return this.db.prepare('SELECT * FROM admin_task_runs WHERE id=?').get(Number(id));
  }

  listAdminTaskRuns(limit = 30) {
    return this.db.prepare('SELECT * FROM admin_task_runs ORDER BY id DESC LIMIT ?')
      .all(Math.max(1, Math.min(200, Number(limit || 30))))
      .map(row => ({ ...row, id: Number(row.id), progress: Number(row.progress || 0), result: parseJson(row.result_json, {}) || {} }));
  }

  pruneAdminTaskRuns(days = 30) {
    const cutoff = new Date(Date.now() - Math.max(1, Number(days || 30)) * 86400000).toISOString();
    return Number(this.db.prepare("DELETE FROM admin_task_runs WHERE finished_at<>'' AND finished_at<?").run(cutoff).changes || 0);
  }

  healthCheck({ deep = false } = {}) {
    let result = 'ok';
    try {
      if (deep) result = this.db.prepare('PRAGMA quick_check').get()?.quick_check || 'unknown';
      else this.db.prepare('SELECT 1 AS ok').get();
    } catch (error) { result = error.message || 'error'; }
    let sizeBytes = 0;
    try {
      const pageCount = Number(this.db.prepare('PRAGMA page_count').get()?.page_count || 0);
      const pageSize = Number(this.db.prepare('PRAGMA page_size').get()?.page_size || 0);
      sizeBytes = pageCount * pageSize;
    } catch {}
    return { ok: result === 'ok', result, sizeBytes, path: this.dbPath, deep: Boolean(deep) };
  }

  close() {
    if (this.closed) return;
    clearInterval(this.usageFlushTimer);
    this.usageFlushTimer = null;
    try { this.flushUsageStats(); } catch {}
    try { this.maybeCheckpoint({ force: true, idleMs: 0 }); } catch {}
    this.closed = true;
    try { this.changeEmitter.removeAllListeners(); } catch {}
    try { this.db.close(); } catch {}
  }

}
const databaseMixinDependencies = { DEFAULT_SETTINGS, DEFAULT_LINKS, DEFAULT_CALCULATORS, GROUP_FEATURES, GROUP_FEATURE_COLUMNS, boolToDb, asBool, parseJson, parseJsonList, nowIso, clone, comparableMessageSnapshot, messageSnapshotsEqual, packageKeyFor, triggerTermsOverlap, normalizePhone, normalizeTag, normalizeTags, parseList, normalizeText, normalizeTriggerRules, validateRegex, SI_PROFESSORS_2026_2, SI_PENDING_2026_2, SI_PROFESSOR_TRIGGER_ALIASES_2026_2, buildSiProfessorTriggerSentences, buildSiProfessorNameTriggerSentences, buildSiProfessorExactNamePhrases, formatDisciplineLabel, formatDisciplineNamesInText, buildDisciplineTriggerSentences, buildSiProfessorResponse, buildSharedDisciplineCards2026_2, buildProfessorScheduleResponse, SI_SUPPORT_MESSAGES_V083, SCHEDULE_BOARD_V0812, automaticMessagePayload, INSTITUTIONAL_CARDS_V098, FUN_CARDS_V0101, SEMESTER_WEEKLY_CARDS_V0143, CAMPUS_CARDS, captionAnalysis, felipeJuanPhone, injectFelipeJuanPhone, toPortugueseTitleCase, crypto };
for (const createMixin of [createMigrationsMixin, createCardsRepositoryMixin, createDirectoriesRepositoryMixin, createDeliveriesRepositoryMixin, createBackupsRepositoryMixin, createScheduleRepositoryMixin, createIncomingRepositoryMixin, createLearningRepositoryMixin, createChangeHistoryRepositoryMixin]) {
  const descriptors = Object.getOwnPropertyDescriptors(createMixin(databaseMixinDependencies).prototype);
  delete descriptors.constructor;
  Object.defineProperties(Database.prototype, descriptors);
}


module.exports = { Database, DEFAULT_SETTINGS, GROUP_FEATURES, DEFAULT_CALCULATORS, normalizePhone, normalizeTag, normalizeTags };
