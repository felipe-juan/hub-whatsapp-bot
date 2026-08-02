const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('painel administrativo usa tema escuro completo', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(css, /color-scheme\s*:\s*dark/i);
  assert.match(css, /--bg\s*:\s*#0[0-9a-f]{5}/i);
  assert.match(css, /\.login-screen[^}]*linear-gradient\([^)]*#0/i);
  assert.match(css, /dialog\{[^}]*background\s*:\s*var\(--card\)/i);
  assert.match(css, /input,textarea,select\{[^}]*background\s*:\s*var\(--field\)/i);
  assert.match(html, /<meta name="color-scheme" content="dark">/i);
});
