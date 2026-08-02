'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readAdminJs } = require('./helpers/admin-assets');

const root = path.resolve(__dirname, '..');
const app = readAdminJs(root);
const css = fs.readFileSync(path.join(root, 'public', 'app.css'), 'utf8');

test('painel localiza e abre diretamente mensagens com conflitos', () => {
  assert.match(app, /function openConflictModal\(/);
  assert.match(app, /Ver conflitos/);
  assert.match(app, /Mostrar envolvidos/);
  assert.match(app, /open-conflict-message/);
  assert.match(app, /view-message-conflicts/);
  assert.match(app, /conflictDetailsHtml/);
  assert.match(css, /\.message-card\.has-conflict/);
  assert.match(css, /\.conflict-terms/);
});
