#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const excludedDirectories = new Set(['.git', 'data', 'node_modules']);
const excludedFiles = new Set(['.env', 'UPDATE_MANIFEST.json']);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collect(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute, output);
    else if (entry.isFile()) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!excludedFiles.has(relative)) output.push(relative);
    }
  }
  return output;
}

const files = Object.fromEntries(collect(root).sort().map((relative) => [relative, sha256(path.join(root, relative))]));
const manifest = {
  product: 'hub-whatsapp-bot',
  version,
  minimum_updatable_version: '0.4.0',
  update_type: 'application-code',
  preserves: ['data', '.env', 'node_modules', 'private-content.json'],
  files
};
fs.writeFileSync(path.join(root, 'UPDATE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto ${version} criado com ${Object.keys(files).length} arquivos.`);
