'use strict';
const { DatabaseSync } = require('node:sqlite');
function openDatabase(file) { return new DatabaseSync(file); }
module.exports = { openDatabase, DatabaseSync };
