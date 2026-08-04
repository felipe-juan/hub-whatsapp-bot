#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const lockPath = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockPath)) throw new Error('package-lock.json ausente.');
const raw = fs.readFileSync(lockPath); const lock = JSON.parse(raw);
if (Number(lock.lockfileVersion || 0) < 3) throw new Error('O package-lock.json precisa usar lockfileVersion 3.');
if (packageJson.version !== version || lock.version !== version) throw new Error('Versão divergente entre package.json, package-lock.json e VERSION.');
const rootPackage = lock.packages?.[''] || {};
for (const [name, spec] of Object.entries(packageJson.dependencies || {})) {
  if (/[~^*xX]/u.test(String(spec))) throw new Error(`Dependência direta não fixada: ${name}=${spec}.`);
  if (rootPackage.dependencies?.[name] !== spec) throw new Error(`Dependência divergente no lockfile: ${name}.`);
  const entry = lock.packages?.[`node_modules/${name}`];
  if (!entry) throw new Error(`Dependência ausente no lockfile: ${name}.`);
  if (String(entry.version || '') !== String(spec)) throw new Error(`Versão resolvida divergente: ${name}.`);
  if (!/^https:\/\//u.test(String(entry.resolved || ''))) throw new Error(`Origem imutável ausente: ${name}.`);
}
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'DEPENDENCY_PROVENANCE.json'), 'utf8'));
if (provenance.critical_dependencies?.['@whiskeysockets/baileys']?.version !== packageJson.dependencies['@whiskeysockets/baileys']) throw new Error('Proveniência do Baileys divergente.');
const hash = crypto.createHash('sha256').update(raw).digest('hex');
console.log(`package-lock.json válido · dependências diretas fixadas · SHA-256 ${hash}`);
