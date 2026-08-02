#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockPath = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockPath)) throw new Error('package-lock.json ausente. Gere-o com npm install --package-lock-only.');
const raw = fs.readFileSync(lockPath);
const lock = JSON.parse(raw);
if (Number(lock.lockfileVersion || 0) < 3) throw new Error('O package-lock.json precisa usar lockfileVersion 3.');
const rootPackage = lock.packages?.[''] || {};
for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
  if (rootPackage.dependencies?.[name] !== version) throw new Error(`Dependência divergente no lockfile: ${name}.`);
  if (!lock.packages?.[`node_modules/${name}`]) throw new Error(`Dependência ausente no lockfile: ${name}.`);
}
const hash = crypto.createHash('sha256').update(raw).digest('hex');
console.log(`package-lock.json válido · SHA-256 ${hash}`);
