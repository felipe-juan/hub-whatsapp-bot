#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { runtimeCompatibility } = require('../src/runtime-compatibility');
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
let failed = false;
function ok(message) { console.log(`✓ ${message}`); }
function fail(message) { console.error(`✗ ${message}`); failed = true; }
const runtime = runtimeCompatibility();
if (runtime.supported) ok(runtime.message); else fail(runtime.message);
if (fs.existsSync(envPath)) ok('Arquivo .env encontrado.'); else fail('Arquivo .env ausente. Execute: npm run setup');
try { fs.mkdirSync(path.join(root, 'data'), { recursive: true }); fs.accessSync(path.join(root, 'data'), fs.constants.R_OK | fs.constants.W_OK); ok('Pasta data com leitura e escrita.'); } catch { fail('A pasta data não está acessível para leitura/escrita.'); }
try { require('./verify-package-lock'); ok('Lockfile e proveniência das dependências conferidos.'); } catch (error) { fail(`Lockfile inválido: ${error.message}`); }
try {
  const pkg = require(path.join(root, 'package.json'));
  if (pkg.dependencies?.['@whiskeysockets/baileys'] === '7.0.0-rc13') ok('Baileys 7.0.0-rc13 fixado.');
  else fail('Versão esperada do Baileys não está fixada.');
} catch (error) { fail(`Não foi possível validar package.json: ${error.message}`); }
if (failed) process.exit(1);
