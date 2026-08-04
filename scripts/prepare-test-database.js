#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Database } = require('../src/database');
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, 'test', '.cache');
const file = path.join(cacheDir, 'bundled-content.sqlite');
fs.mkdirSync(cacheDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
const db = new Database(file, { seedBundledContent: true });
db.checkpoint?.('TRUNCATE');
db.close();
const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(cacheDir, 'bundled-content.json'), `${JSON.stringify({ created_at: new Date().toISOString(), sha256: hash }, null, 2)}\n`);
console.log(`Banco-template criado: ${path.relative(root, file)} · ${hash}`);
