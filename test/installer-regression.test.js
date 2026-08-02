const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('package does not define recursive npm lifecycle installer scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const name of ['preinstall', 'install', 'postinstall']) {
    assert.equal(pkg.scripts?.[name], undefined, `reserved lifecycle script ${name} must not exist`);
  }
  assert.equal(pkg.scripts?.['setup:fedora'], 'bash INSTALL.sh');
});

test('installer and updater disable dependency lifecycle scripts', () => {
  const installer = fs.readFileSync(path.join(root, 'install-fedora-gnome.sh'), 'utf8');
  const updater = fs.readFileSync(path.join(root, 'src', 'update-manager.js'), 'utf8');
  assert.match(installer, /npm install --package-lock-only --ignore-scripts --no-audit --no-fund/);
  assert.match(installer, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(updater, /npm install --package-lock-only --ignore-scripts --no-audit --no-fund/);
  assert.match(updater, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(updater, /preserve_dependencies/);
  assert.match(updater, /OLD_NODE_MODULES/);
});
