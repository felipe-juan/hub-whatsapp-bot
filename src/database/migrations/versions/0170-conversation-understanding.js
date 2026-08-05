'use strict';

module.exports = {
  id: '0170-conversation-understanding',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS negative_example_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_message TEXT NOT NULL,
        message_excerpt TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        message_title TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'suggestion_rejected',
        chat_type TEXT NOT NULL DEFAULT 'private',
        occurrences INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        reviewed_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(message_id) REFERENCES automatic_messages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_negative_examples_state ON negative_example_suggestions(state,last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_negative_examples_pair ON negative_example_suggestions(normalized_message,message_id,state);

      CREATE TABLE IF NOT EXISTS discipline_alias_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_alias TEXT NOT NULL,
        alias TEXT NOT NULL,
        discipline_code TEXT NOT NULL DEFAULT '',
        discipline_name TEXT NOT NULL,
        original_message TEXT NOT NULL DEFAULT '',
        chat_type TEXT NOT NULL DEFAULT 'private',
        occurrences INTEGER NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        reviewed_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_discipline_alias_suggestions_state ON discipline_alias_suggestions(state,last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_discipline_alias_suggestions_pair ON discipline_alias_suggestions(normalized_alias,discipline_name,state);

      CREATE TABLE IF NOT EXISTS discipline_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_alias TEXT NOT NULL,
        alias TEXT NOT NULL,
        discipline_code TEXT NOT NULL DEFAULT '',
        discipline_name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'admin-approved',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(normalized_alias,discipline_name)
      );
      CREATE INDEX IF NOT EXISTS idx_discipline_aliases_active ON discipline_aliases(active,discipline_name);
    `);
  }
};
