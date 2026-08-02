'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readAdminJs(root = path.join(__dirname, '..', '..')) {
  const publicDir = path.join(root, 'public');
  const files = [path.join(publicDir, 'app.js')];
  const modulesDir = path.join(publicDir, 'js');
  if (fs.existsSync(modulesDir)) {
    files.push(...fs.readdirSync(modulesDir)
      .filter((name) => name.endsWith('.js'))
      .sort()
      .map((name) => path.join(modulesDir, name)));
  }
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

module.exports = { readAdminJs };
