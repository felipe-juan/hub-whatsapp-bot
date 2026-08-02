const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');
const runtimeDir = path.resolve(process.env.XDG_RUNTIME_DIR || dataDir);
const adminPassword = String(process.env.ADMIN_PASSWORD || '');
if (!adminPassword || adminPassword === 'troque-esta-senha') {
  console.error('ADMIN_PASSWORD não configurada. Execute "npm run setup" ou edite o arquivo .env.');
  process.exit(1);
}

module.exports = {
  rootDir,
  dataDir,
  dbPath: path.join(dataDir, 'hub-bot.sqlite'),
  authDir: path.join(dataDir, '.baileys_auth'),
  legacyAuthDir: path.join(dataDir, '.wwebjs_auth'),
  backupDir: path.join(dataDir, 'backups'),
  attachmentsDir: path.join(dataDir, 'attachments'),
  ruleSnapshotPath: path.join(dataDir, 'compiled-rules.snapshot.json'),
  ipcSocketPath: path.join(runtimeDir, `hub-whatsapp-bot-${typeof process.getuid === 'function' ? process.getuid() : 'user'}.sock`),
  publicDir: path.join(rootDir, 'public'),
  adminPassword,
  adminHost: process.env.ADMIN_HOST || '127.0.0.1',
  adminPort: Number(process.env.ADMIN_PORT || 3210),
  sessionHours: Math.max(1, Number(process.env.SESSION_HOURS || 12)),
  groupTouchIntervalSeconds: Math.max(30, Number(process.env.GROUP_TOUCH_INTERVAL_SECONDS || 600))
};
