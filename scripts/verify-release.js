#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'UPDATE_MANIFEST.json');
const strictArchive = ['1', 'true', 'yes'].includes(String(process.env.HUB_VERIFY_ARCHIVE || '').toLowerCase());
const excludedDirectories = new Set(['.git', '.cache', 'data', 'node_modules']);
const excludedFiles = new Set(['.env', 'private-content.json', 'UPDATE_MANIFEST.json']);

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

if (strictArchive) {
  const forbidden = ['.env', 'private-content.json', 'data', 'node_modules', 'test/.cache'];
  for (const relative of forbidden) {
    if (fs.existsSync(path.join(root, relative))) throw new Error(`Conteúdo de runtime/privado presente no release: ${relative}`);
  }
}

require('./verify-package-lock');
if (!fs.existsSync(manifestPath)) throw new Error('UPDATE_MANIFEST.json ausente.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
if (manifest.version !== version) throw new Error(`Versão do manifesto divergente: ${manifest.version} ≠ ${version}.`);
if (manifest.files?.['private-content.json']) throw new Error('private-content.json não pode entrar no manifesto.');

const expected = Object.keys(manifest.files || {}).sort();
const actual = collect(root).sort();
const missingFromManifest = actual.filter(file => !manifest.files[file]);
const absentFromRelease = expected.filter(file => !fs.existsSync(path.join(root, file)));
if (missingFromManifest.length) throw new Error(`Arquivos sem registro no manifesto: ${missingFromManifest.slice(0, 10).join(', ')}`);
if (absentFromRelease.length) throw new Error(`Arquivos do manifesto ausentes: ${absentFromRelease.slice(0, 10).join(', ')}`);

for (const relative of expected) {
  const actualHash = sha256(path.join(root, relative));
  if (actualHash !== manifest.files[relative]) throw new Error(`Hash divergente: ${relative}`);
}
for (const file of ['package.json', 'package-lock.json', 'DEPENDENCY_PROVENANCE.json', 'README.md']) {
  if (!manifest.files[file]) throw new Error(`Arquivo obrigatório ausente do manifesto: ${file}`);
}
const lockHash = sha256(path.join(root, 'package-lock.json'));
console.log(`Release ${version} verificado · ${expected.length} arquivos íntegros · lock ${lockHash.slice(0, 16)}…`);
