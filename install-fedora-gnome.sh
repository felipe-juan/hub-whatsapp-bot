#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HUB_BOT_INSTALL_DIR:-$HOME/.local/share/hub-whatsapp-bot}"
SERVICE_DIR="$HOME/.config/systemd/user"
APPLICATIONS_DIR="$HOME/.local/share/applications"
AUTOSTART_DIR="$HOME/.config/autostart"
LOCAL_BIN="$HOME/.local/bin"
ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
SERVICE_FILE="$SERVICE_DIR/hub-whatsapp-bot.service"
INDICATOR_WRAPPER="$LOCAL_BIN/hub-whatsapp-bot-indicator"
OPEN_WRAPPER="$LOCAL_BIN/hub-whatsapp-bot-open"
DESKTOP_FILE="$APPLICATIONS_DIR/hub-whatsapp-bot.desktop"
AUTOSTART_FILE="$AUTOSTART_DIR/hub-whatsapp-bot-indicator.desktop"
SERVICE_NAME="hub-whatsapp-bot.service"

ROLLBACK_DIR=""
ROLLBACK_READY=0
HAD_INSTALLATION=0
SERVICE_WAS_ACTIVE=0

backup_managed_file() {
  local source="$1"
  local key="$2"
  if [[ -e "$source" || -L "$source" ]]; then
    cp -a -- "$source" "$ROLLBACK_DIR/$key"
    printf '1\n' > "$ROLLBACK_DIR/$key.exists"
  else
    printf '0\n' > "$ROLLBACK_DIR/$key.exists"
  fi
}

restore_managed_file() {
  local destination="$1"
  local key="$2"
  mkdir -p "$(dirname "$destination")"
  if [[ "$(cat "$ROLLBACK_DIR/$key.exists" 2>/dev/null || printf '0')" == '1' ]]; then
    rm -rf -- "$destination"
    cp -a -- "$ROLLBACK_DIR/$key" "$destination"
  else
    rm -rf -- "$destination"
  fi
}

rollback_install() {
  local status=$?
  trap - ERR INT TERM
  set +e
  if [[ "$ROLLBACK_READY" == '1' && -n "$ROLLBACK_DIR" && -d "$ROLLBACK_DIR" ]]; then
    printf '\nA instalação falhou. Restaurando a versão anterior...\n' >&2
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/data"
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
      ! -name data ! -name .env -exec rm -rf -- {} +
    if [[ "$HAD_INSTALLATION" == '1' && -f "$ROLLBACK_DIR/code.tar" ]]; then
      tar -C "$INSTALL_DIR" -xf "$ROLLBACK_DIR/code.tar"
    fi
    if [[ -d "$ROLLBACK_DIR/node_modules" ]]; then
      mv "$ROLLBACK_DIR/node_modules" "$INSTALL_DIR/node_modules"
    fi
    if [[ -f "$ROLLBACK_DIR/env.exists" ]]; then
      if [[ "$(cat "$ROLLBACK_DIR/env.exists")" == '1' ]]; then
        cp -a -- "$ROLLBACK_DIR/env" "$INSTALL_DIR/.env"
      elif [[ "$HAD_INSTALLATION" == '1' ]]; then
        rm -f -- "$INSTALL_DIR/.env"
      fi
    fi
    restore_managed_file "$SERVICE_FILE" service
    restore_managed_file "$INDICATOR_WRAPPER" indicator-wrapper
    restore_managed_file "$OPEN_WRAPPER" open-wrapper
    restore_managed_file "$DESKTOP_FILE" desktop-file
    restore_managed_file "$AUTOSTART_FILE" autostart-file
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    if [[ "$SERVICE_WAS_ACTIVE" == '1' ]]; then
      systemctl --user start "$SERVICE_NAME" >/dev/null 2>&1 || true
    fi
    rm -rf -- "$ROLLBACK_DIR"
    printf 'A versão anterior foi restaurada.\n' >&2
  fi
  exit "${status:-1}"
}

printf '\nHUB WhatsApp Bot — instalação automática\n'
printf 'Você só precisará informar sua senha do Fedora quando solicitado.\n\n'

if ! command -v dnf >/dev/null 2>&1; then
  echo "Este instalador foi preparado para Fedora."
  exit 1
fi

# Descobre uma instalação antiga antes de substituir o serviço. O serviço
# continua ativo durante a instalação de pacotes do sistema e só é interrompido
# depois que o rollback local está pronto.
OLD_PROJECT_DIR="$(systemctl --user show "$SERVICE_NAME" -p WorkingDirectory --value 2>/dev/null || true)"
if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  SERVICE_WAS_ACTIVE=1
fi

printf '[1/5] Instalando os componentes necessários...\n'
sudo dnf install -y \
  nodejs npm unzip \
  python3-gobject gtk3 libayatana-appindicator-gtk3 \
  gnome-shell-extension-appindicator libnotify >/dev/null

NODE_BIN="$(command -v node)"
NODE_VERSION="$($NODE_BIN -p 'process.versions.node')"
if ! "$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=13) ? 0 : 1)'; then
  echo "Node.js $NODE_VERSION encontrado; é necessário Node.js 22.13 ou superior."
  exit 1
fi

printf '[2/5] Instalando o bot em %s...\n' "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")" "$INSTALL_DIR" "$INSTALL_DIR/data" "$SERVICE_DIR" "$APPLICATIONS_DIR" "$AUTOSTART_DIR" "$LOCAL_BIN"

case "$SOURCE_DIR/" in
  "$INSTALL_DIR/"*)
    if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
      echo 'A pasta extraída não pode ficar dentro da pasta de instalação.'
      exit 1
    fi
    ;;
esac

if [[ -f "$INSTALL_DIR/package.json" || -f "$INSTALL_DIR/VERSION" ]]; then
  HAD_INSTALLATION=1
fi
ROLLBACK_DIR="$(mktemp -d "${INSTALL_DIR}.rollback.XXXXXX")"
if [[ "$HAD_INSTALLATION" == '1' ]]; then
  tar --exclude='./node_modules' --exclude='./data' --exclude='./.env' -C "$INSTALL_DIR" -cf "$ROLLBACK_DIR/code.tar" .
fi
if [[ -f "$INSTALL_DIR/package-lock.json" ]]; then
  cp -a -- "$INSTALL_DIR/package-lock.json" "$ROLLBACK_DIR/package-lock.previous"
fi
if [[ -f "$INSTALL_DIR/.env" ]]; then
  cp -a -- "$INSTALL_DIR/.env" "$ROLLBACK_DIR/env"
  printf '1\n' > "$ROLLBACK_DIR/env.exists"
else
  printf '0\n' > "$ROLLBACK_DIR/env.exists"
fi
backup_managed_file "$SERVICE_FILE" service
backup_managed_file "$INDICATOR_WRAPPER" indicator-wrapper
backup_managed_file "$OPEN_WRAPPER" open-wrapper
backup_managed_file "$DESKTOP_FILE" desktop-file
backup_managed_file "$AUTOSTART_FILE" autostart-file

ROLLBACK_READY=1
trap rollback_install ERR INT TERM
systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
if [[ -d "$INSTALL_DIR/node_modules" ]]; then
  mv "$INSTALL_DIR/node_modules" "$ROLLBACK_DIR/node_modules"
fi

# Migração automática: primeiro de uma instalação já registrada no systemd,
# depois da pasta de origem, caso ela já contenha dados de uma versão anterior.
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  if [[ -n "$OLD_PROJECT_DIR" && "$OLD_PROJECT_DIR" != "$INSTALL_DIR" && -f "$OLD_PROJECT_DIR/.env" ]]; then
    cp -a "$OLD_PROJECT_DIR/.env" "$INSTALL_DIR/.env"
  elif [[ -f "$SOURCE_DIR/.env" ]]; then
    cp -a "$SOURCE_DIR/.env" "$INSTALL_DIR/.env"
  fi
fi

if [[ -n "$OLD_PROJECT_DIR" && "$OLD_PROJECT_DIR" != "$INSTALL_DIR" && -d "$OLD_PROJECT_DIR/data" ]]; then
  cp -a "$OLD_PROJECT_DIR/data/." "$INSTALL_DIR/data/"
elif [[ "$SOURCE_DIR" != "$INSTALL_DIR" && -d "$SOURCE_DIR/data" ]]; then
  cp -an "$SOURCE_DIR/data/." "$INSTALL_DIR/data/" 2>/dev/null || true
fi

# Copia somente o programa. Configuração, banco e sessão permanecem no destino.
if [[ "$SOURCE_DIR" != "$INSTALL_DIR" ]]; then
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name data ! -name .env -exec rm -rf -- {} +
  tar \
    --exclude='./node_modules' \
    --exclude='./data' \
    --exclude='./.env' \
    --exclude='./.git' \
    -C "$SOURCE_DIR" -cf - . | tar -C "$INSTALL_DIR" -xf -
fi

cd "$INSTALL_DIR"
# A árvore antiga de dependências foi movida para o rollback. Uma instalação
# limpa evita carregar bibliotecas obsoletas e pode ser revertida sem internet.
rm -rf node_modules
LOCK_REUSED=0
if [[ ! -f package-lock.json && -f "$ROLLBACK_DIR/package-lock.previous" ]]; then
  cp -a -- "$ROLLBACK_DIR/package-lock.previous" package-lock.json
  if node scripts/verify-package-lock.js >/dev/null 2>&1; then
    LOCK_REUSED=1
    echo 'Lockfile compatível da instalação anterior reutilizado.'
  else
    rm -f package-lock.json
  fi
fi
if [[ ! -f package-lock.json ]]; then
  echo 'Gerando package-lock.json para esta versão...'
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps >/dev/null
fi
node scripts/verify-package-lock.js
if ! npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps >/dev/null; then
  if [[ "$LOCK_REUSED" == '1' && -d "$ROLLBACK_DIR/node_modules" ]]; then
    echo 'O registro npm não respondeu; reutilizando as dependências verificadas da instalação anterior.'
    rm -rf node_modules
    cp -a -- "$ROLLBACK_DIR/node_modules" node_modules
    node scripts/check-installed-dependencies.js
  else
    echo 'Não foi possível instalar as dependências e não há uma árvore anterior compatível.' >&2
    false
  fi
fi

if [[ ! -f .env ]]; then
  npm run setup
else
  echo 'Configuração anterior preservada.'
fi

ensure_env() {
  local key="$1"
  local value="$2"
  if ! grep -qE "^${key}=" .env; then
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}
ensure_env GROUP_TOUCH_INTERVAL_SECONDS 600
ensure_env TRAY_POLL_SECONDS 10

printf '[3/5] Verificando a instalação...\n'
npm run check >/dev/null
npm test >/dev/null
npm run desktop:check >/dev/null

# Evita duas instâncias concorrentes quando uma versão antiga estava no PM2.
if command -v pm2 >/dev/null 2>&1 && pm2 describe hub-whatsapp-bot >/dev/null 2>&1; then
  pm2 delete hub-whatsapp-bot >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
fi

printf '[4/5] Ativando execução em segundo plano e ícone...\n'
mkdir -p "$SERVICE_DIR" "$APPLICATIONS_DIR" "$AUTOSTART_DIR" "$LOCAL_BIN" "$ICON_DIR"
cp -f "$INSTALL_DIR"/desktop/icons/*.svg "$ICON_DIR"/
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

SYSTEMD_INSTALL_DIR="$(python3 - "$INSTALL_DIR" <<'PYESC'
import sys
value = sys.argv[1]
value = value.replace('\\', '\\x5c').replace(' ', '\\x20').replace('\t', '\\x09').replace('%', '%%')
print(value)
PYESC
)"

cat > "$SERVICE_FILE" <<EOF_SERVICE
[Unit]
Description=HUB WhatsApp Bot
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=$SYSTEMD_INSTALL_DIR
ExecStart="$NODE_BIN" $SYSTEMD_INSTALL_DIR/src/index.js
Restart=on-failure
RestartSec=8
Environment=NODE_ENV=production
Environment=MALLOC_ARENA_MAX=2
Environment=NODE_OPTIONS=--max-old-space-size=192
Nice=0
CPUWeight=100
IOWeight=100
IOSchedulingClass=best-effort
IOSchedulingPriority=4
MemoryAccounting=yes
CPUAccounting=yes
TasksAccounting=yes
MemoryHigh=384M
MemoryMax=512M
TasksMax=64
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF_SERVICE

cat > "$INDICATOR_WRAPPER" <<EOF_INDICATOR
#!/usr/bin/env bash
exec /usr/bin/python3 "$INSTALL_DIR/desktop/hub-bot-indicator.py"
EOF_INDICATOR
chmod +x "$INDICATOR_WRAPPER" "$INSTALL_DIR/desktop/hub-bot-indicator.py"

ADMIN_PORT="$(grep -E '^ADMIN_PORT=' .env | tail -1 | cut -d= -f2 | tr -d '\"' || true)"
ADMIN_PORT="${ADMIN_PORT:-3210}"
PANEL_URL="http://127.0.0.1:$ADMIN_PORT"

cat > "$OPEN_WRAPPER" <<EOF_OPEN
#!/usr/bin/env bash
systemctl --user start $SERVICE_NAME >/dev/null 2>&1 || true
sleep 2
exec xdg-open "$PANEL_URL"
EOF_OPEN
chmod +x "$OPEN_WRAPPER"

cat > "$DESKTOP_FILE" <<EOF_DESKTOP
[Desktop Entry]
Name=HUB WhatsApp Bot
Comment=Abre o painel do bot comunitário do HUB Arquivos IFBA
Exec=$OPEN_WRAPPER
Icon=hub-whatsapp-bot
Terminal=false
Type=Application
Categories=Network;Utility;
StartupNotify=true
EOF_DESKTOP

cat > "$AUTOSTART_FILE" <<EOF_AUTOSTART
[Desktop Entry]
Name=HUB WhatsApp Bot Indicator
Comment=Mostra e controla o HUB WhatsApp Bot na barra superior
Exec=$INDICATOR_WRAPPER
Icon=hub-whatsapp-bot
Terminal=false
Type=Application
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF_AUTOSTART

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"
sleep 2
if ! systemctl --user is-active --quiet "$SERVICE_NAME"; then
  echo 'O serviço não permaneceu ativo. Últimos registros:'
  journalctl --user -u "$SERVICE_NAME" -n 30 --no-pager || true
  false
fi

# A nova versão já iniciou e passou nas verificações. A partir daqui o rollback
# não é mais necessário.
ROLLBACK_READY=0
trap - ERR INT TERM
rm -rf -- "$ROLLBACK_DIR"
ROLLBACK_DIR=""

gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com >/dev/null 2>&1 || true
pkill -f "$INSTALL_DIR/desktop/hub-bot-indicator.py" >/dev/null 2>&1 || true
nohup "$INDICATOR_WRAPPER" >/dev/null 2>&1 &

printf '[5/5] Abrindo o painel...\n'
PASSWORD="$(grep -E '^ADMIN_PASSWORD=' .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)"
nohup xdg-open "$PANEL_URL" >/dev/null 2>&1 &

printf '\n==============================================\n'
printf 'Instalação concluída.\n'
printf 'Painel: %s\n' "$PANEL_URL"
printf 'Senha: %s\n' "${PASSWORD:-consulte $INSTALL_DIR/.env}"
printf '==============================================\n\n'
printf 'Agora, no painel, leia o novo QR code com:\n'
printf 'WhatsApp > Dispositivos conectados > Conectar um dispositivo\n\n'
printf 'O bot já está em segundo plano. Esta pasta extraída pode ser apagada.\n'
printf 'Para abrir depois, procure por “HUB WhatsApp Bot” no menu de aplicativos.\n'
printf 'Caso o ícone não apareça, saia e entre novamente na sessão GNOME.\n'
