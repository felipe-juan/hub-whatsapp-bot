const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REQUIRED_CHECKSUM_FILES = [
  'package.json', 'VERSION', 'src/index.js', 'src/admin-server.js', 'src/database.js', 'public/app.js'
];
const MAX_UPDATE_ENTRIES = 3000;
const MAX_UPDATE_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error('Versão inválida no pacote.');
  return match.slice(1).map(Number);
}
function compareVersions(a, b) {
  const first = parseVersion(a); const second = parseVersion(b);
  for (let i = 0; i < 3; i += 1) if (first[i] !== second[i]) return first[i] > second[i] ? 1 : -1;
  return 0;
}
function shellQuote(value) { return `'${String(value).replace(/'/g, `'"'"'`)}'`; }
function sha256(filePath) {
  const hash = crypto.createHash('sha256'); hash.update(fs.readFileSync(filePath)); return hash.digest('hex');
}
function safeRelativeFile(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  return Boolean(normalized) && !normalized.startsWith('/') && !normalized.split('/').includes('..') && !normalized.endsWith('/');
}

class UpdateManager {
  constructor({ rootDir, dataDir, serviceName = 'hub-whatsapp-bot.service', commandRunner = execFileSync }) {
    this.rootDir = rootDir;
    this.dataDir = dataDir;
    this.serviceName = serviceName;
    this.commandRunner = commandRunner;
    this.statusPath = path.join(dataDir, 'update-status.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.currentVersion = this.readCurrentVersion();
  }
  readCurrentVersion() { try { return fs.readFileSync(path.join(this.rootDir, 'VERSION'), 'utf8').trim(); } catch { return '0.0.0'; } }
  writeStatus(patch) {
    const previous = this.status();
    const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
    const temporary = `${this.statusPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.statusPath);
    return next;
  }
  status() {
    try { return { currentVersion: this.readCurrentVersion(), ...JSON.parse(fs.readFileSync(this.statusPath, 'utf8')) }; }
    catch { return { currentVersion: this.readCurrentVersion(), state: 'idle', message: 'Nenhuma atualização iniciada pelo painel.', updatedAt: '' }; }
  }
  packageRoot(extractDir) {
    const candidates = [extractDir, ...fs.readdirSync(extractDir, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => path.join(extractDir, item.name))];
    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'UPDATE_MANIFEST.json')) && fs.existsSync(path.join(candidate, 'package.json')) && fs.existsSync(path.join(candidate, 'VERSION')));
  }
  validateEntries(zipPath) {
    const listing = this.commandRunner('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const entries = listing.split(/\r?\n/).filter(Boolean);
    if (!entries.length) throw new Error('O ZIP está vazio.');
    if (entries.length > MAX_UPDATE_ENTRIES) throw new Error(`O ZIP excede o limite de ${MAX_UPDATE_ENTRIES} entradas.`);
    for (const entry of entries) {
      const normalized = entry.replace(/\\/g, '/');
      if (normalized.length > 1024 || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error('O ZIP contém caminho inseguro.');
    }
    const detailed = this.commandRunner('unzip', ['-Z', '-l', zipPath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    for (const line of String(detailed).split(/\r?\n/)) {
      const mode = line.trimStart().match(/^([bcdlps-])[rwxStTs-]{9}\s/);
      if (mode && !['-', 'd'].includes(mode[1])) throw new Error('O ZIP contém link simbólico ou arquivo especial, o que não é permitido.');
    }
    const summary = this.commandRunner('unzip', ['-Z', '-t', zipPath], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const match = String(summary).match(/(\d+)\s+files?,\s+(\d+)\s+bytes uncompressed/i);
    if (!match) throw new Error('Não foi possível verificar o tamanho descompactado do ZIP.');
    const count = Number(match[1]); const uncompressedBytes = Number(match[2]);
    if (count > MAX_UPDATE_ENTRIES || uncompressedBytes > MAX_UPDATE_UNCOMPRESSED_BYTES) {
      throw new Error('O conteúdo descompactado do ZIP excede os limites de segurança.');
    }
    return { entries: count, uncompressedBytes };
  }
  validateExtractedTree(packageRoot) {
    const root = fs.realpathSync(packageRoot); const stack = [packageRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name); const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) throw new Error('O pacote contém link simbólico, o que não é permitido.');
        const real = fs.realpathSync(filePath);
        if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error('O pacote contém caminho fora da pasta permitida.');
        if (stat.isDirectory()) stack.push(filePath);
      }
    }
  }
  validateManifest(packageRoot, manifest) {
    if (manifest.product !== 'hub-whatsapp-bot') throw new Error('Produto incorreto no manifesto de atualização.');
    if (manifest.update_type !== 'application-code') throw new Error('Tipo de atualização não suportado.');
    const targetVersion = String(manifest.version || '').trim();
    const versionFile = fs.readFileSync(path.join(packageRoot, 'VERSION'), 'utf8').trim();
    const packageVersion = String(JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version || '').trim();
    if (!targetVersion || targetVersion !== versionFile || targetVersion !== packageVersion) throw new Error('A versão do manifesto não coincide com VERSION e package.json.');
    if (compareVersions(targetVersion, this.readCurrentVersion()) <= 0) throw new Error(`A versão ${targetVersion} não é mais nova que a instalada.`);
    if (manifest.minimum_updatable_version && compareVersions(this.readCurrentVersion(), manifest.minimum_updatable_version) < 0) {
      throw new Error(`Esta atualização exige pelo menos a versão ${manifest.minimum_updatable_version}.`);
    }
    const files = manifest.files;
    if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('O manifesto não contém a lista de verificações SHA-256.');
    for (const required of REQUIRED_CHECKSUM_FILES) if (!files[required]) throw new Error(`Checksum obrigatório ausente: ${required}.`);
    const declared = new Set(Object.keys(files));
    for (const [relative, expected] of Object.entries(files)) {
      if (!safeRelativeFile(relative)) throw new Error(`Caminho inválido no manifesto: ${relative}.`);
      if (!/^[a-f0-9]{64}$/i.test(String(expected))) throw new Error(`SHA-256 inválido para ${relative}.`);
      const filePath = path.resolve(packageRoot, relative); const root = `${path.resolve(packageRoot)}${path.sep}`;
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`Arquivo declarado não encontrado: ${relative}.`);
      if (sha256(filePath) !== String(expected).toLowerCase()) throw new Error(`Falha de integridade em ${relative}.`);
    }
    const actual = [];
    const stack = [packageRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(filePath);
        else if (entry.isFile()) {
          const relative = path.relative(packageRoot, filePath).split(path.sep).join('/');
          if (relative !== 'UPDATE_MANIFEST.json') actual.push(relative);
        }
      }
    }
    const undeclared = actual.filter(relative => !declared.has(relative));
    if (undeclared.length) throw new Error(`O pacote contém arquivo não declarado no manifesto: ${undeclared[0]}.`);
    return targetVersion;
  }
  createApplyScript(sourceDir, targetVersion, workspace) {
    const scriptPath = path.join(this.dataDir, `apply-update-${Date.now()}.sh`);
    const statusPath = this.statusPath;
    const backupPath = path.join(this.dataDir, `code-before-${this.readCurrentVersion()}-${Date.now()}.tar.gz`);
    const script = `#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=${shellQuote(this.rootDir)}
SOURCE=${shellQuote(sourceDir)}
STATUS=${shellQuote(statusPath)}
BACKUP=${shellQuote(backupPath)}
BACKUP_TMP="\${BACKUP}.partial"
WORKSPACE=${shellQuote(workspace)}
SERVICE=${shellQuote(this.serviceName)}
TARGET=${shellQuote(targetVersion)}
OLD_NODE_MODULES="$WORKSPACE/node_modules-before"
OLD_LOCKFILE="$WORKSPACE/package-lock-before.json"
BACKUP_READY=0
SERVICE_STOPPED=0
DEPENDENCIES_BACKUP_READY=0
DEPENDENCIES_REPLACED=0
write_status() {
  local state="$1" message="$2"
  node - "$STATUS" "$state" "$message" "$TARGET" <<'NODE'
const fs=require('fs'); const [file,state,message,target]=process.argv.slice(2); let old={}; try{old=JSON.parse(fs.readFileSync(file,'utf8'))}catch{} const tmp=file+'.tmp-'+process.pid+'-'+Date.now(); fs.writeFileSync(tmp,JSON.stringify({...old,state,message,targetVersion:target,updatedAt:new Date().toISOString()},null,2),{mode:0o600}); fs.renameSync(tmp,file);
NODE
}
clean_code() {
  find "$ROOT" -mindepth 1 -maxdepth 1 \\
    ! -name data ! -name node_modules ! -name .env ! -name private-content.json \\
    -exec rm -rf -- {} +
}
preserve_dependencies() {
  if [[ -f "$ROOT/package-lock.json" ]]; then
    cp -a "$ROOT/package-lock.json" "$OLD_LOCKFILE"
  fi
  if [[ -d "$ROOT/node_modules" ]]; then
    rm -rf "$OLD_NODE_MODULES"
    mv "$ROOT/node_modules" "$OLD_NODE_MODULES"
    DEPENDENCIES_BACKUP_READY=1
  fi
}
install_dependencies() {
  cd "$ROOT"
  DEPENDENCIES_REPLACED=1
  rm -rf node_modules
  local lock_reused=0
  if [[ ! -f package-lock.json ]] && [[ -f "$OLD_LOCKFILE" ]]; then
    cp -a "$OLD_LOCKFILE" package-lock.json
    if node scripts/verify-package-lock.js >/dev/null 2>&1; then
      lock_reused=1
    else
      rm -f package-lock.json
    fi
  fi
  if [[ ! -f package-lock.json ]]; then
    timeout 15m npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps
  fi
  node scripts/verify-package-lock.js
  if ! timeout 15m npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps; then
    if [[ "$lock_reused" == "1" ]] && [[ -d "$OLD_NODE_MODULES" ]]; then
      rm -rf node_modules
      cp -a "$OLD_NODE_MODULES" node_modules
      node scripts/check-installed-dependencies.js
    else
      return 1
    fi
  fi
}
rollback() {
  trap - ERR
  set +e
  rm -f "$BACKUP_TMP"
  if [[ "$BACKUP_READY" == "1" ]] && [[ -s "$BACKUP" ]] && tar -tzf "$BACKUP" >/dev/null 2>&1; then
    write_status rolling-back "Falha durante a atualização; restaurando a versão anterior."
    systemctl --user stop "$SERVICE" >/dev/null 2>&1
    clean_code
    if tar -C "$ROOT" -xzf "$BACKUP"; then
      if [[ "$DEPENDENCIES_BACKUP_READY" == "1" ]] && [[ -d "$OLD_NODE_MODULES" ]]; then
        rm -rf "$ROOT/node_modules"
        mv "$OLD_NODE_MODULES" "$ROOT/node_modules"
      elif [[ "$DEPENDENCIES_REPLACED" == "1" ]]; then
        install_dependencies >/dev/null 2>&1
      fi
      systemctl --user start "$SERVICE" >/dev/null 2>&1
      write_status failed "A atualização falhou e a versão anterior foi restaurada. Consulte os registros da unidade de atualização."
    else
      write_status failed "A atualização falhou e o backup anterior não pôde ser restaurado automaticamente."
    fi
  else
    if [[ "$SERVICE_STOPPED" == "1" ]]; then systemctl --user start "$SERVICE" >/dev/null 2>&1; fi
    write_status failed "A atualização foi interrompida antes da criação de um backup válido; a instalação existente não foi apagada."
  fi
  rm -rf "$WORKSPACE"
  exit 1
}
trap rollback ERR
sleep 2
write_status applying "Parando o bot e preparando um backup verificável."
systemctl --user stop "$SERVICE"
SERVICE_STOPPED=1
rm -f "$BACKUP_TMP"
tar --exclude='./data' --exclude='./node_modules' --exclude='./.env' -C "$ROOT" -czf "$BACKUP_TMP" .
tar -tzf "$BACKUP_TMP" >/dev/null
mv -f "$BACKUP_TMP" "$BACKUP"
BACKUP_READY=1
preserve_dependencies
write_status applying "Backup validado; aplicando a nova versão."
clean_code
tar --exclude='./data' --exclude='./node_modules' --exclude='./.env' --exclude='./.git' -C "$SOURCE" -cf - . | tar -C "$ROOT" -xf -
install_dependencies
timeout 3m npm run syntax
timeout 8m npm test
write_status restarting "Atualização instalada; reiniciando o bot."
systemctl --user start "$SERVICE"
SERVICE_STOPPED=0
sleep 2
systemctl --user is-active --quiet "$SERVICE"
write_status completed "Atualização concluída com sucesso."
rm -rf "$OLD_NODE_MODULES"
rm -rf "$WORKSPACE"
find ${shellQuote(this.dataDir)} -maxdepth 1 -name 'code-before-*.tar.gz' -printf '%T@ %p\n' | sort -nr | tail -n +3 | cut -d' ' -f2- | xargs -r rm -f
`;
    fs.writeFileSync(scriptPath, script, { mode: 0o700 });
    return scriptPath;
  }

  stageAndApply(buffer, fileName = 'update.zip') {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Pacote de atualização vazio.');
    if (buffer.length > 100 * 1024 * 1024) throw new Error('O pacote deve ter no máximo 100 MiB.');
    if (!/\.zip$/i.test(fileName)) throw new Error('Selecione um arquivo ZIP de atualização.');
    const workspace = fs.mkdtempSync(path.join(this.dataDir, 'update-stage-'));
    const zipPath = path.join(workspace, 'update.zip'); const extractDir = path.join(workspace, 'extracted');
    fs.writeFileSync(zipPath, buffer, { mode: 0o600 }); fs.mkdirSync(extractDir);
    try {
      this.validateEntries(zipPath);
      this.commandRunner('unzip', ['-q', zipPath, '-d', extractDir]);
      const packageRoot = this.packageRoot(extractDir); if (!packageRoot) throw new Error('O ZIP não é um pacote reconhecido do HUB WhatsApp Bot.');
      this.validateExtractedTree(packageRoot);
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'UPDATE_MANIFEST.json'), 'utf8'));
      const targetVersion = this.validateManifest(packageRoot, manifest);
      const scriptPath = this.createApplyScript(packageRoot, targetVersion, workspace);
      this.writeStatus({ state: 'staged', message: `Versão ${targetVersion} validada. A instalação será iniciada.`, targetVersion, fileName });
      const unit = `hub-whatsapp-bot-update-${Date.now()}`;
      this.commandRunner('systemd-run', ['--user', `--unit=${unit}`, '--collect', '/bin/bash', scriptPath], { encoding: 'utf8' });
      return { accepted: true, targetVersion, unit, message: 'Atualização aceita. O painel ficará indisponível por alguns instantes.' };
    } catch (error) {
      this.writeStatus({ state: 'failed', message: error.message, fileName });
      try { fs.rmSync(workspace, { recursive: true, force: true }); } catch {}
      throw error;
    }
  }
}

module.exports = { UpdateManager, compareVersions, sha256, REQUIRED_CHECKSUM_FILES, MAX_UPDATE_ENTRIES, MAX_UPDATE_UNCOMPRESSED_BYTES };
