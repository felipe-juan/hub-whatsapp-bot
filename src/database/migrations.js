'use strict';

// Compatibilidade com módulos e ferramentas anteriores à v0.15.0.
// As migrações atuais ficam em src/database/migrations/ e são executadas
// pelo índice versionado, com transação e checksum.
module.exports = require('./migrations/index');
