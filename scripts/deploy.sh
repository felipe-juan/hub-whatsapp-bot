#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-}"
VERSION="${2:-$(cat "$(dirname "$0")/../VERSION")}" 
ZIP="${3:-$HOME/Downloads/hub-whatsapp-bot-v${VERSION}.zip}"
NAME="hub-whatsapp-bot-v${VERSION}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

usage(){ echo "Uso: $0 local|github|oracle [versão] [zip]" >&2; exit 2; }
[[ "$MODE" =~ ^(local|github|oracle)$ ]] || usage
[[ -f "$ZIP" ]] || { echo "ZIP não encontrado: $ZIP" >&2; exit 1; }
unzip -q "$ZIP" -d "$TMP/release"
SRC="$TMP/release/$NAME"
[[ -d "$SRC" ]] || { echo "Pasta $NAME ausente no ZIP." >&2; exit 1; }
HUB_VERIFY_ARCHIVE=1 node "$SRC/scripts/verify-release.js"

resolve_node22() {
  local candidate resolved
  local candidates=(
    "${HUB_NODE_BIN:-}"
    node-22
    node22
    nodejs22
    /usr/bin/node-22
    /usr/bin/node22
    /usr/local/bin/node-22
    node
  )
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    if [[ "$candidate" == */* ]]; then
      [[ -x "$candidate" ]] || continue
      resolved="$candidate"
    else
      resolved="$(command -v "$candidate" 2>/dev/null || true)"
      [[ -n "$resolved" ]] || continue
    fi
    if "$resolved" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===22 && b>=13 ? 0 : 1)' >/dev/null 2>&1; then
      printf '%s\n' "$resolved"
      return 0
    fi
  done
  return 1
}

run_npm_ci() {
  local project="$1" node_bin="$2" npm_path npm_real
  npm_path="$(command -v npm 2>/dev/null || true)"
  [[ -n "$npm_path" ]] || { echo 'npm não encontrado.' >&2; return 1; }
  npm_real="$(readlink -f "$npm_path" 2>/dev/null || printf '%s' "$npm_path")"
  if "$node_bin" "$npm_real" --version >/dev/null 2>&1; then
    (cd "$project" && "$node_bin" "$npm_real" ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps)
  else
    (cd "$project" && npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps)
  fi
}

prepare_dependencies() {
  local candidate="$1" current="$2" node_bin="$3"
  if run_npm_ci "$candidate" "$node_bin"; then
    return 0
  fi
  echo 'npm ci não pôde concluir; tentando reutilizar as dependências compatíveis da instalação atual.' >&2
  rm -rf "$candidate/node_modules"
  if [[ -d "$current/node_modules" ]]; then
    cp -a "$current/node_modules" "$candidate/node_modules"
    HUB_PROJECT_ROOT="$candidate" "$node_bin" "$candidate/scripts/check-installed-dependencies.js"
    return 0
  fi
  echo 'Não há node_modules anterior compatível para recuperação.' >&2
  return 1
}

require_node22() {
  local current
  current="$(node -p 'process.versions.node' 2>/dev/null || echo ausente)"
  cat >&2 <<MSG
Node.js 22.13 ou superior da família 22.x não foi encontrado.
Node padrão atual: $current
Instale/ative o Node.js 22 ou informe o executável, por exemplo:
  HUB_NODE_BIN=/caminho/para/node-22 $0 $MODE "$VERSION" "$ZIP"
MSG
  exit 1
}

copy_preserved_runtime() {
  local from="$1" to="$2"
  mkdir -p "$to/data"
  [[ -f "$from/.env" ]] && cp -a "$from/.env" "$to/.env"
  [[ -f "$from/private-content.json" ]] && cp -a "$from/private-content.json" "$to/private-content.json"
  [[ -d "$from/data" ]] && rsync -a --delete "$from/data/" "$to/data/"
  [[ -f "$to/.env" ]] || cp "$to/.env.example" "$to/.env"
  [[ ! -f "$to/private-content.json" ]] || chmod 600 "$to/private-content.json"
}

case "$MODE" in
  local)
    NODE_BIN="$(resolve_node22)" || require_node22
    DEST="$HOME/.local/share/hub-whatsapp-bot"
    BASE="$HOME/.local/share"
    CANDIDATE="$BASE/.hub-whatsapp-bot-next-$$"
    BACKUP_ROOT="$BASE/hub-whatsapp-bot-backups"
    BACKUP="$BACKUP_ROOT/code-pre-v${VERSION}-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$CANDIDATE" "$BACKUP_ROOT"
    rsync -a --delete --exclude='.git/' --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$SRC/" "$CANDIDATE/"
    [[ -d "$DEST" ]] && copy_preserved_runtime "$DEST" "$CANDIDATE" || { mkdir -p "$CANDIDATE/data"; cp "$CANDIDATE/.env.example" "$CANDIDATE/.env"; }
    prepare_dependencies "$CANDIDATE" "$DEST" "$NODE_BIN"
    (cd "$CANDIDATE" && "$NODE_BIN" scripts/check.js)

    was_active=false
    systemctl --user is-active --quiet hub-whatsapp-bot.service 2>/dev/null && was_active=true
    systemctl --user stop hub-whatsapp-bot.service 2>/dev/null || true
    [[ -d "$DEST" ]] && copy_preserved_runtime "$DEST" "$CANDIDATE"
    [[ -d "$DEST" ]] && mv "$DEST" "$BACKUP"
    mv "$CANDIDATE" "$DEST"
    if $was_active; then
      if ! systemctl --user start hub-whatsapp-bot.service || ! timeout 20s bash -c 'until systemctl --user is-active --quiet hub-whatsapp-bot.service; do sleep 1; done'; then
        failed="$BASE/.hub-whatsapp-bot-failed-$(date +%s)"
        mv "$DEST" "$failed" || true
        [[ -d "$BACKUP" ]] && mv "$BACKUP" "$DEST"
        systemctl --user start hub-whatsapp-bot.service 2>/dev/null || true
        echo "Falha ao iniciar a nova versão; instalação anterior restaurada." >&2
        exit 1
      fi
    fi
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'code-pre-v*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | tail -n +4 | cut -d' ' -f2- | xargs -r rm -rf
    echo "Versão: $("$NODE_BIN" -p "require('$DEST/package.json').version")"
    if $was_active; then
      echo "Serviço local: $(systemctl --user is-active hub-whatsapp-bot.service)"
    else
      echo 'Serviço local: preservado-inativo'
    fi
    ;;

  github)
    DEST="$HOME/Documents/hub-whatsapp-bot-github"
    [[ -d "$DEST/.git" ]] || { echo "Repositório Git ausente: $DEST" >&2; exit 1; }
    OLD_HEAD="$(git -C "$DEST" rev-parse HEAD)"
    mkdir -p "$TMP/github-backup"
    rsync -a --delete --exclude='.git/' "$DEST/" "$TMP/github-backup/"
    rollback_git(){ git -C "$DEST" reset --hard "$OLD_HEAD" >/dev/null 2>&1 || true; rsync -a --delete --exclude='.git/' "$TMP/github-backup/" "$DEST/" || true; }
    trap 'rollback_git; rm -rf "$TMP"' ERR
    rsync -a --delete --exclude='.git/' --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$SRC/" "$DEST/"
    git -C "$DEST" add -A
    if git -C "$DEST" diff --cached --quiet; then
      echo "Repositório já atualizado."
    else
      git -C "$DEST" commit -m "Release v$VERSION"
      git -C "$DEST" push
    fi
    trap 'rm -rf "$TMP"' EXIT
    echo "GitHub preparado/publicado na versão v$VERSION."
    ;;

  oracle)
    SSH_OPTS=(-o ConnectTimeout=10 -o ConnectionAttempts=1 -o ServerAliveInterval=15 -o ServerAliveCountMax=2)
    resolve_oracle_target() {
      local target_file="$HOME/.config/hub-whatsapp-bot/oracle-ssh-target"
      local configured=''
      if [[ -n "${HUB_ORACLE_SSH_TARGET:-}" ]]; then
        printf '%s\n' "$HUB_ORACLE_SSH_TARGET"
        return 0
      fi
      if [[ -s "$target_file" ]]; then
        configured="$(sed -n '/[^[:space:]]/{s/^[[:space:]]*//;s/[[:space:]]*$//;p;q;}' "$target_file")"
        if [[ -n "$configured" ]]; then
          printf '%s\n' "$configured"
          return 0
        fi
      fi
      if [[ -f "$HOME/.ssh/config" ]] && awk '
        BEGIN { IGNORECASE=1; found=0 }
        /^[[:space:]]*Host[[:space:]]+/ {
          for (i=2; i<=NF; i++) if ($i == "hub-oracle") found=1
        }
        END { exit(found ? 0 : 1) }
      ' "$HOME/.ssh/config"; then
        printf '%s\n' 'hub-oracle'
        return 0
      fi
      cat >&2 <<'MSG'
Destino SSH da Oracle não encontrado.
Informe-o na execução:
  HUB_ORACLE_SSH_TARGET=ubuntu@IP ... release oracle ...
ou salve o destino em:
  ~/.config/hub-whatsapp-bot/oracle-ssh-target
MSG
      return 1
    }
    ORACLE_TARGET="$(resolve_oracle_target)" || exit 1
    REMOTE_HOME="${HUB_ORACLE_REMOTE_HOME:-/home/ubuntu}"
    REMOTE_STAGE="$REMOTE_HOME/$NAME"
    rsync -az --info=progress2 -e "ssh ${SSH_OPTS[*]}" --delete --exclude='.git/' --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$SRC/" "$ORACLE_TARGET:$REMOTE_STAGE/"
    ssh "${SSH_OPTS[@]}" "$ORACLE_TARGET" "VERSION='$VERSION' NAME='$NAME' bash -s" <<'REMOTE'
set -Eeuo pipefail
DEST="$HOME/hub-whatsapp-bot"
STAGE="$HOME/$NAME"
CANDIDATE="$HOME/.hub-whatsapp-bot-next-$$"
BACKUP_ROOT="$HOME/hub-whatsapp-backups"
BACKUP="$BACKUP_ROOT/code-pre-v${VERSION}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$CANDIDATE" "$BACKUP_ROOT"
cleanup(){ rm -rf "$STAGE" "$CANDIDATE"; }
trap cleanup EXIT

resolve_node22(){
  local candidate resolved
  local candidates=("${HUB_NODE_BIN:-}" node-22 node22 nodejs22 /usr/bin/node-22 /usr/bin/node22 /usr/local/bin/node-22 node)
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    if [[ "$candidate" == */* ]]; then [[ -x "$candidate" ]] || continue; resolved="$candidate";
    else resolved="$(command -v "$candidate" 2>/dev/null || true)"; [[ -n "$resolved" ]] || continue; fi
    if "$resolved" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===22 && b>=13 ? 0 : 1)' >/dev/null 2>&1; then printf '%s\n' "$resolved"; return 0; fi
  done
  return 1
}
run_npm_ci(){
  local project="$1" node_bin="$2" npm_path npm_real
  npm_path="$(command -v npm 2>/dev/null || true)"; [[ -n "$npm_path" ]] || return 1
  npm_real="$(readlink -f "$npm_path" 2>/dev/null || printf '%s' "$npm_path")"
  if "$node_bin" "$npm_real" --version >/dev/null 2>&1; then
    (cd "$project" && "$node_bin" "$npm_real" ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps)
  else
    (cd "$project" && npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps)
  fi
}
prepare_dependencies(){
  local candidate="$1" current="$2" node_bin="$3"
  if run_npm_ci "$candidate" "$node_bin"; then return 0; fi
  echo 'npm ci não pôde concluir; tentando reutilizar as dependências compatíveis da instalação atual.' >&2
  rm -rf "$candidate/node_modules"
  if [[ -d "$current/node_modules" ]]; then
    cp -a "$current/node_modules" "$candidate/node_modules"
    HUB_PROJECT_ROOT="$candidate" "$node_bin" "$candidate/scripts/check-installed-dependencies.js"
    return 0
  fi
  echo 'Não há node_modules anterior compatível para recuperação.' >&2
  return 1
}
copy_runtime(){
  local from="$1" to="$2"
  mkdir -p "$to/data"
  [[ -f "$from/.env" ]] && cp -a "$from/.env" "$to/.env"
  [[ -f "$from/private-content.json" ]] && cp -a "$from/private-content.json" "$to/private-content.json"
  [[ -d "$from/data" ]] && rsync -a --delete "$from/data/" "$to/data/"
  [[ -f "$to/.env" ]] || cp "$to/.env.example" "$to/.env"
  [[ ! -f "$to/private-content.json" ]] || chmod 600 "$to/private-content.json"
}
NODE_BIN="$(resolve_node22)" || { echo 'Node.js 22.13+ da família 22.x não encontrado na Oracle.' >&2; exit 1; }
rsync -a --delete --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$STAGE/" "$CANDIDATE/"
[[ -d "$DEST" ]] && copy_runtime "$DEST" "$CANDIDATE" || { mkdir -p "$CANDIDATE/data"; cp "$CANDIDATE/.env.example" "$CANDIDATE/.env"; }
prepare_dependencies "$CANDIDATE" "$DEST" "$NODE_BIN"
(cd "$CANDIDATE" && "$NODE_BIN" scripts/check.js)

sudo systemctl stop hub-whatsapp-bot.service
[[ -d "$DEST" ]] && copy_runtime "$DEST" "$CANDIDATE"
[[ -d "$DEST" ]] && mv "$DEST" "$BACKUP"
mv "$CANDIDATE" "$DEST"
rollback(){
  sudo systemctl stop hub-whatsapp-bot.service 2>/dev/null || true
  failed="$HOME/.hub-whatsapp-bot-failed-$(date +%s)"
  [[ -d "$DEST" ]] && mv "$DEST" "$failed" || true
  [[ -d "$BACKUP" ]] && mv "$BACKUP" "$DEST"
  sudo systemctl start hub-whatsapp-bot.service 2>/dev/null || true
}
if ! sudo systemctl start hub-whatsapp-bot.service || ! timeout 30s bash -c 'until sudo systemctl is-active --quiet hub-whatsapp-bot.service; do sleep 1; done'; then
  rollback
  echo 'Falha ao iniciar a nova versão; instalação anterior restaurada.' >&2
  exit 1
fi
trap - EXIT
rm -rf "$STAGE" "$CANDIDATE"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'code-pre-v*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | tail -n +4 | cut -d' ' -f2- | xargs -r rm -rf
echo "Versão: $("$NODE_BIN" -p "require('$DEST/package.json').version")"
echo "Serviço: $(sudo systemctl is-active hub-whatsapp-bot.service)"
REMOTE
    ;;
esac
