'use strict';

module.exports = {
  id: '0160-conversation-recovery',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_pending_choices (
        context_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL DEFAULT '{}',
        expires_at INTEGER NOT NULL,
        grace_until INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pending_choice_expiry ON conversation_pending_choices(expires_at,grace_until);

      CREATE TABLE IF NOT EXISTS conversation_recovery_state (
        context_key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        original_message TEXT NOT NULL DEFAULT '',
        last_message TEXT NOT NULL DEFAULT '',
        last_intent TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_state_expiry ON conversation_recovery_state(expires_at);

      CREATE TABLE IF NOT EXISTS conversation_recovery_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_key TEXT NOT NULL DEFAULT '',
        chat_type TEXT NOT NULL DEFAULT 'private',
        original_message TEXT NOT NULL DEFAULT '',
        stage INTEGER NOT NULL DEFAULT 0,
        outcome TEXT NOT NULL DEFAULT '',
        intent TEXT NOT NULL DEFAULT '',
        entity_type TEXT NOT NULL DEFAULT '',
        entity_id TEXT NOT NULL DEFAULT '',
        option_count INTEGER NOT NULL DEFAULT 0,
        selected_option TEXT NOT NULL DEFAULT '',
        messages_to_resolution INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_events_created ON conversation_recovery_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_recovery_events_outcome ON conversation_recovery_events(outcome,created_at DESC);

      CREATE TABLE IF NOT EXISTS private_user_profiles (
        context_key TEXT PRIMARY KEY,
        last_seen_at TEXT NOT NULL DEFAULT '',
        welcome_sent_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const calendarColumns = new Set(db.prepare('PRAGMA table_info(academic_calendar_events)').all().map(row => row.name));
    if (!calendarColumns.has('responsible')) db.exec("ALTER TABLE academic_calendar_events ADD COLUMN responsible TEXT NOT NULL DEFAULT ''");


    const settings = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
    const defaults = {
      recovery_enabled: 'true',
      recovery_context_seconds: '300',
      recovery_recent_expired_seconds: '600',
      recovery_max_suggestions: '3',
      recovery_private_welcome_days: '60',
      recovery_metrics_enabled: 'true',
      recovery_common_reply_enabled: 'true'
    };
    for (const [key, value] of Object.entries(defaults)) settings.run(key, value);
  }
};
