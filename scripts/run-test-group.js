#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const testDir = path.join(root, 'test');
const allFiles = fs.readdirSync(testDir).filter(name => name.endsWith('.test.js')).sort();

function groupFor(name) {
  if (/performance|concurrency|stability|responsiveness|v0(?:87|88|90|91|92)/iu.test(name)) return 'performance';
  if (/migration|update|backup|restore|manifest|install|rollback|schema/iu.test(name)) return 'migrations';
  if (/content|professor|sector|schedule|calendar|card|trigger|caens|room|institutional|bsi|discipline|campus|semester|v01513|v0155/iu.test(name)) return 'content';
  if (/text|matcher|calculator|template|question|format|parser|caption|title|regex|normaliz|policy|corpus/iu.test(name)) return 'unit';
  return 'integration';
}
const groups = Object.fromEntries(['unit','integration','content','migrations','performance'].map(group => [group, allFiles.filter(name => groupFor(name) === group)]));
function ensureContentTemplate() {
  const template = path.join(root, 'test', '.cache', 'bundled-content.sqlite');
  if (!fs.existsSync(template)) {
    const prepare = spawnSync(process.execPath, [path.join('scripts', 'prepare-test-database.js')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, HUB_TEST_DB_TEMPLATE: '' }
    });
    if (prepare.status) return { error: Number(prepare.status), template: '' };
  }
  return { error: 0, template };
}
function executeFiles(group, files, extraEnv = {}) {
  if (!files.length) return 0;
  // Cada arquivo é executado em um processo Node exclusivo. Isso impede que
  // bancos temporários, variáveis de ambiente e servidores de um cenário
  // interfiram em outro teste quando a suíte é executada em paralelo.
  for (const name of files) {
    const args = ['--test', '--test-force-exit', '--test-concurrency', '1', path.join('test', name)];
    const env = {
      ...process.env,
      HUB_TEST_RUN_ID: `${group}-${name}-${process.pid}-${Date.now()}`,
      HUB_SKIP_BUNDLED_CONTENT: group === 'content' ? '0' : (process.env.HUB_SKIP_BUNDLED_CONTENT || '1'),
      ...extraEnv
    };
    console.log(`\n--- ${name} ---`);
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env });
    if (result.status) return Number(result.status || 1);
  }
  return 0;
}

function run(group) {
  const files = groups[group] || [];
  if (!files.length) { console.log(`${group}: nenhum teste.`); return 0; }
  console.log(`\n=== ${group}: ${files.length} arquivo(s) ===`);
  if (group !== 'content') return executeFiles(group, files);

  const contentTemplate = ensureContentTemplate();
  if (contentTemplate.error) return contentTemplate.error;
  const migrationSensitive = files.filter(name => /migrat|UPDATE\s+settings|content_v0|seedBundledContent\s*:\s*false/iu.test(fs.readFileSync(path.join(testDir, name), 'utf8')));
  const templateSafe = files.filter(name => !migrationSensitive.includes(name));
  console.log(`Conteúdo com banco-template: ${templateSafe.length}; cenários de migração isolados: ${migrationSensitive.length}.`);
  const fastStatus = executeFiles(group, templateSafe, { HUB_TEST_DB_TEMPLATE: contentTemplate.template });
  if (fastStatus) return fastStatus;
  return executeFiles(group, migrationSensitive, { HUB_TEST_DB_TEMPLATE: '' });
}
const requested = String(process.argv[2] || 'all').toLowerCase();
if (requested !== 'all' && !groups[requested]) { console.error(`Grupo inválido: ${requested}`); process.exit(2); }
const selected = requested === 'all' ? Object.keys(groups) : [requested];
for (const group of selected) { const status = run(group); if (status) process.exit(status); }
