'use strict';

const { STATIC_DISCIPLINE_CATALOG } = require('../../../discipline-catalog');
const { normalizeText } = require('../../../text');

function addColumn(db, table, name, definition) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
  if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

module.exports = {
  id: '0180-unified-understanding',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS academic_disciplines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        speech_aliases_json TEXT NOT NULL DEFAULT '[]',
        common_typos_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL DEFAULT 'bundled',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(normalized_name)
      );
      CREATE INDEX IF NOT EXISTS idx_academic_disciplines_code ON academic_disciplines(code,active);

      CREATE TABLE IF NOT EXISTS academic_periods (
        period TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'draft',
        starts_on TEXT NOT NULL DEFAULT '',
        ends_on TEXT NOT NULL DEFAULT '',
        source_title TEXT NOT NULL DEFAULT '',
        source_date TEXT NOT NULL DEFAULT '',
        imported_at TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        entry_count INTEGER NOT NULL DEFAULT 0,
        previous_period TEXT NOT NULL DEFAULT '',
        summary_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversation_simulations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        messages_json TEXT NOT NULL DEFAULT '[]',
        results_json TEXT NOT NULL DEFAULT '[]',
        saved_as_test INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_impact_previews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_type TEXT NOT NULL,
        suggestion_id INTEGER NOT NULL,
        impact_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_learning_impact_suggestion ON learning_impact_previews(suggestion_type,suggestion_id,created_at DESC);

      CREATE TABLE IF NOT EXISTS intent_metric_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_key TEXT NOT NULL DEFAULT '',
        chat_type TEXT NOT NULL DEFAULT 'private',
        intent TEXT NOT NULL DEFAULT '',
        outcome TEXT NOT NULL DEFAULT '',
        missing_field TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_intent_metrics_created ON intent_metric_events(created_at DESC,intent,outcome);
    `);

    for (const [table, columns] of Object.entries({
      professor_schedule_entries: [
        ['valid_from', "TEXT NOT NULL DEFAULT ''"], ['valid_until', "TEXT NOT NULL DEFAULT ''"],
        ['precedence', 'INTEGER NOT NULL DEFAULT 50'], ['exception_type', "TEXT NOT NULL DEFAULT 'regular'"]
      ],
      academic_calendar_events: [
        ['precedence', 'INTEGER NOT NULL DEFAULT 100'], ['source_verified_at', "TEXT NOT NULL DEFAULT ''"]
      ],
      negative_example_suggestions: [
        ['explanation_json', "TEXT NOT NULL DEFAULT '{}'"], ['pattern_json', "TEXT NOT NULL DEFAULT '{}'"],
        ['expires_at', "TEXT NOT NULL DEFAULT ''"], ['archived_at', "TEXT NOT NULL DEFAULT ''"]
      ],
      discipline_alias_suggestions: [
        ['variants_json', "TEXT NOT NULL DEFAULT '[]'"], ['confidence', 'REAL NOT NULL DEFAULT 0'],
        ['expires_at', "TEXT NOT NULL DEFAULT ''"], ['archived_at', "TEXT NOT NULL DEFAULT ''"]
      ],
      unrecognized_suggestions: [
        ['explanation_json', "TEXT NOT NULL DEFAULT '{}'"], ['expires_at', "TEXT NOT NULL DEFAULT ''"],
        ['archived_at', "TEXT NOT NULL DEFAULT ''"]
      ],
      message_corpus: [
        ['category', "TEXT NOT NULL DEFAULT 'single-message'"], ['conversation_json', "TEXT NOT NULL DEFAULT '[]'"],
        ['expected_json', "TEXT NOT NULL DEFAULT '{}'"], ['anonymized', 'INTEGER NOT NULL DEFAULT 1']
      ]
    })) {
      const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) continue;
      for (const [name, definition] of columns) addColumn(db, table, name, definition);
    }

    const timestamp = new Date().toISOString();
    const upsert = db.prepare(`INSERT INTO academic_disciplines
      (code,name,normalized_name,aliases_json,speech_aliases_json,common_typos_json,source,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT(normalized_name) DO UPDATE SET
        code=CASE WHEN excluded.code<>'' THEN excluded.code ELSE academic_disciplines.code END,
        aliases_json=excluded.aliases_json,speech_aliases_json=excluded.speech_aliases_json,
        common_typos_json=excluded.common_typos_json,active=1,updated_at=excluded.updated_at`);
    for (const item of STATIC_DISCIPLINE_CATALOG) {
      upsert.run(String(item.code || '').toUpperCase(), item.name, normalizeText(item.name), JSON.stringify(item.aliases || []),
        JSON.stringify(item.speechAliases || []), JSON.stringify(item.commonTypos || []), 'bundled-v0180', timestamp, timestamp);
    }
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='professor_schedule_entries'").get()) {
      const rows = db.prepare(`SELECT DISTINCT discipline_code,discipline_name FROM professor_schedule_entries
        WHERE trim(discipline_name)<>''`).all();
      for (const row of rows) upsert.run(String(row.discipline_code || '').toUpperCase(), row.discipline_name, normalizeText(row.discipline_name), '[]', '[]', '[]', 'schedule-import', timestamp, timestamp);
      const periods = db.prepare(`SELECT academic_period,COUNT(*) AS count,MAX(source_title) AS source_title,MAX(source_date) AS source_date
        FROM professor_schedule_entries WHERE trim(academic_period)<>'' GROUP BY academic_period`).all();
      const insertPeriod = db.prepare(`INSERT OR IGNORE INTO academic_periods
        (period,state,source_title,source_date,imported_at,entry_count,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`);
      for (const row of periods) insertPeriod.run(row.academic_period, 'published', row.source_title || '', row.source_date || '', timestamp, Number(row.count || 0), timestamp, timestamp);
    }

    const settings = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    const defaults = {
      quoted_context_seconds: '86400', fragment_join_enabled: 'true', fragment_join_window_ms: '1500',
      learning_suggestion_expiry_days: '180', learning_impact_preview_enabled: 'true',
      unified_query_model_enabled: 'true', academic_period_history_enabled: 'true',
      content_v0180_unified_understanding: 'true'
    };
    for (const [key, value] of Object.entries(defaults)) settings.run(key, value);
  }
};
