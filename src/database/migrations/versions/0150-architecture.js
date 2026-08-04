'use strict';
module.exports = {
  id: '0150-architecture',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(automatic_messages)').all().map(row => row.name);
    const add = (name, sql) => { if (!columns.includes(name)) db.exec(`ALTER TABLE automatic_messages ADD COLUMN ${sql}`); };
    add('structured_kind', "structured_kind TEXT NOT NULL DEFAULT ''");
    add('structured_key', "structured_key TEXT NOT NULL DEFAULT ''");
    add('trigger_policy_json', "trigger_policy_json TEXT NOT NULL DEFAULT '{}'");
    add('observation_mode', 'observation_mode INTEGER NOT NULL DEFAULT 0');
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_contexts (
        context_key TEXT PRIMARY KEY, reply_key TEXT NOT NULL DEFAULT '', subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_context_expiry ON conversation_contexts(expires_at);
      CREATE TABLE IF NOT EXISTS trigger_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER, message_excerpt TEXT NOT NULL,
        normalized_message TEXT NOT NULL, chat_type TEXT NOT NULL DEFAULT 'private', reasons_json TEXT NOT NULL DEFAULT '[]',
        occurrences INTEGER NOT NULL DEFAULT 1, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', FOREIGN KEY(message_id) REFERENCES automatic_messages(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trigger_observation_unique ON trigger_observations(message_id,normalized_message);
      CREATE TABLE IF NOT EXISTS false_positive_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, original_message TEXT NOT NULL DEFAULT '', matched_message_id INTEGER,
        matched_title TEXT NOT NULL DEFAULT '', response_excerpt TEXT NOT NULL DEFAULT '', feedback_text TEXT NOT NULL,
        chat_type TEXT NOT NULL DEFAULT 'private', state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
        reviewed_at TEXT NOT NULL DEFAULT '', FOREIGN KEY(matched_message_id) REFERENCES automatic_messages(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS academic_data_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, academic_period TEXT NOT NULL, source_title TEXT NOT NULL DEFAULT '',
        source_version TEXT NOT NULL DEFAULT '', source_date TEXT NOT NULL DEFAULT '', imported_at TEXT NOT NULL,
        entry_count INTEGER NOT NULL DEFAULT 0, checksum TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS message_corpus (
        id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, expected_intent TEXT NOT NULL DEFAULT '',
        expected_entity TEXT NOT NULL DEFAULT '', expected_title TEXT NOT NULL DEFAULT '', must_respond INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_corpus_active ON message_corpus(active,id);
    `);
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    for (const [key, value] of Object.entries({
      academic_source_stale_days: '120', trigger_observation_enabled: 'true', false_positive_feedback_enabled: 'true',
      persistent_context_enabled: 'true', content_v0150_architecture: 'true'
    })) insertSetting.run(key, value);
    db.prepare("UPDATE automatic_messages SET structured_kind='semester',structured_key=package_key WHERE title LIKE 'BSI — Aulas e horários do %'").run();
    db.prepare("UPDATE automatic_messages SET structured_kind='professor',structured_key=title WHERE title LIKE 'Professor — %'").run();
  }
};
