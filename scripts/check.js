const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const [major, minor] = process.versions.node.split('.').map(Number);
let failed = false;

function ok(message) { console.log(`✓ ${message}`); }
function fail(message) { console.error(`✗ ${message}`); failed = true; }

if (major > 22 || (major === 22 && minor >= 13)) ok(`Node.js ${process.versions.node}`);
else fail(`Node.js ${process.versions.node}; instale Node.js 22.13 ou superior.`);

if (fs.existsSync(envPath)) ok('Arquivo .env encontrado.');
else fail('Arquivo .env ausente. Execute: npm run setup');

const dataDir = path.join(root, 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);
  ok('Pasta data com leitura e escrita.');
} catch {
  fail('A pasta data não está acessível para leitura/escrita.');
}

try {
  const pkg = require(path.join(root, 'package.json'));
  if (pkg.dependencies?.['@whiskeysockets/baileys']) ok(`Baileys ${pkg.dependencies['@whiskeysockets/baileys']} configurado (sem Chromium).`);
  else fail('Dependência Baileys ausente no package.json.');
} catch (error) {
  fail(`Não foi possível validar package.json: ${error.message}`);
}

if (failed) process.exit(1);
