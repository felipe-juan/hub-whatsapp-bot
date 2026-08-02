#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HUB_BOT_INSTALL_DIR:-$HOME/.local/share/hub-whatsapp-bot}"

systemctl --user disable --now hub-whatsapp-bot.service >/dev/null 2>&1 || true
rm -f "$HOME/.config/systemd/user/hub-whatsapp-bot.service"
systemctl --user daemon-reload
pkill -f "$INSTALL_DIR/desktop/hub-bot-indicator.py" >/dev/null 2>&1 || true
rm -f "$HOME/.local/bin/hub-whatsapp-bot-indicator"
rm -f "$HOME/.local/bin/hub-whatsapp-bot-open"
rm -f "$HOME/.local/share/applications/hub-whatsapp-bot.desktop"
rm -f "$HOME/.config/autostart/hub-whatsapp-bot-indicator.desktop"
rm -f "$HOME/.local/share/icons/hicolor/scalable/apps/hub-whatsapp-bot"*.svg

echo "Integração com o Fedora GNOME removida."
echo "Os dados permanecem em: $INSTALL_DIR"
echo "Para apagar tudo, remova essa pasta manualmente."
