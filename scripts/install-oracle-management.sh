#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "Execute com sudo." >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -o root -g root -m 0755 "$ROOT/scripts/hub-whatsapp-bot-control" /usr/local/sbin/hub-whatsapp-bot-control
cat > /etc/sudoers.d/hub-whatsapp-bot <<'SUDOERS'
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control status
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control start
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control stop
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control restart
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control logs *
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hub-whatsapp-bot-control apply *
SUDOERS
chmod 0440 /etc/sudoers.d/hub-whatsapp-bot
visudo -cf /etc/sudoers.d/hub-whatsapp-bot >/dev/null
echo "Integração Oracle/systemd instalada."
