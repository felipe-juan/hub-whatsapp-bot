'use strict';
const createLegacyMixin = require('./legacy');
const { runVersionedMigrations } = require('./runner');
module.exports = function createMigrationsMixin(deps) {
  const Legacy = createLegacyMixin(deps);
  class VersionedMigrations extends Legacy {
    runVersionedMigrations() { return runVersionedMigrations(this); }
    listSchemaMigrations() { return this.db.prepare('SELECT migration_id,checksum,applied_at,duration_ms FROM schema_migrations ORDER BY migration_id').all(); }
  }
  const descriptors = Object.getOwnPropertyDescriptors(Legacy.prototype);
  delete descriptors.constructor;
  Object.defineProperties(VersionedMigrations.prototype, descriptors);
  return VersionedMigrations;
};
