'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function checksum(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function ensureLedger(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0
  )`);
}
function runVersionedMigrations(database, directory = path.join(__dirname, 'versions')) {
  ensureLedger(database.db);
  const files = fs.readdirSync(directory).filter(name => /^\d+.*\.js$/u.test(name)).sort();
  const applied = [];
  for (const name of files) {
    const file = path.join(directory, name); const migration = require(file);
    const id = String(migration.id || name.replace(/\.js$/u, '')); const sum = checksum(file);
    const existing = database.db.prepare('SELECT checksum FROM schema_migrations WHERE migration_id=?').get(id);
    if (existing) {
      if (existing.checksum !== sum) throw new Error(`Checksum alterado da migração ${id}.`);
      continue;
    }
    const started = Date.now();
    database.db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(database.db, database);
      database.db.prepare('INSERT INTO schema_migrations(migration_id,checksum,applied_at,duration_ms) VALUES (?,?,?,?)')
        .run(id, sum, new Date().toISOString(), Date.now() - started);
      database.db.exec('COMMIT'); applied.push(id);
    } catch (error) { try { database.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  return applied;
}
module.exports = { runVersionedMigrations, checksum };
