#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = process.env.HUB_PROJECT_ROOT ? path.resolve(process.env.HUB_PROJECT_ROOT) : path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, expected] of Object.entries(pkg.dependencies || {})) {
  const packagePath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`Dependência instalada ausente: ${name}.`);
  const installed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (String(installed.version || '') !== String(expected)) {
    throw new Error(`Versão instalada divergente para ${name}: ${installed.version || 'desconhecida'}; esperada ${expected}.`);
  }
}
console.log('Dependências diretas instaladas e compatíveis com package.json.');
