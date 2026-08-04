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
    DEST="$HOME/.local/share/hub-whatsapp-bot"
    BASE="$HOME/.local/share"
    CANDIDATE="$BASE/.hub-whatsapp-bot-next-$$"
    BACKUP_ROOT="$BASE/hub-whatsapp-bot-backups"
    BACKUP="$BACKUP_ROOT/code-pre-v${VERSION}-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$CANDIDATE" "$BACKUP_ROOT"
    rsync -a --delete --exclude='.git/' --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$SRC/" "$CANDIDATE/"
    [[ -d "$DEST" ]] && copy_preserved_runtime "$DEST" "$CANDIDATE" || { mkdir -p "$CANDIDATE/data"; cp "$CANDIDATE/.env.example" "$CANDIDATE/.env"; }
    (cd "$CANDIDATE" && npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps && node scripts/check.js)

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
    echo "Versão: $(node -p "require('$DEST/package.json').version")"
    echo "Serviço local: $($was_active && systemctl --user is-active hub-whatsapp-bot.service || echo preservado-inativo)"
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
    REMOTE_STAGE="/home/ubuntu/$NAME"
    rsync -az --info=progress2 -e "ssh ${SSH_OPTS[*]}" --delete --exclude='.git/' --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$SRC/" "hub-oracle:$REMOTE_STAGE/"
    ssh "${SSH_OPTS[@]}" hub-oracle "VERSION='$VERSION' NAME='$NAME' bash -s" <<'REMOTE'
set -Eeuo pipefail
DEST="$HOME/hub-whatsapp-bot"
STAGE="$HOME/$NAME"
CANDIDATE="$HOME/.hub-whatsapp-bot-next-$$"
BACKUP_ROOT="$HOME/hub-whatsapp-backups"
BACKUP="$BACKUP_ROOT/code-pre-v${VERSION}-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$CANDIDATE" "$BACKUP_ROOT"
cleanup(){ rm -rf "$STAGE" "$CANDIDATE"; }
trap cleanup EXIT
copy_runtime(){
  local from="$1" to="$2"
  mkdir -p "$to/data"
  [[ -f "$from/.env" ]] && cp -a "$from/.env" "$to/.env"
  [[ -f "$from/private-content.json" ]] && cp -a "$from/private-content.json" "$to/private-content.json"
  [[ -d "$from/data" ]] && rsync -a --delete "$from/data/" "$to/data/"
  [[ -f "$to/.env" ]] || cp "$to/.env.example" "$to/.env"
  [[ ! -f "$to/private-content.json" ]] || chmod 600 "$to/private-content.json"
}
rsync -a --delete --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='private-content.json' "$STAGE/" "$CANDIDATE/"
[[ -d "$DEST" ]] && copy_runtime "$DEST" "$CANDIDATE" || { mkdir -p "$CANDIDATE/data"; cp "$CANDIDATE/.env.example" "$CANDIDATE/.env"; }
(cd "$CANDIDATE" && npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps && node scripts/check.js)

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
echo "Versão: $(node -p "require('$DEST/package.json').version")"
echo "Serviço: $(sudo systemctl is-active hub-whatsapp-bot.service)"
REMOTE
    ;;
esac
