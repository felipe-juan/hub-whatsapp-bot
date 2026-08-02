#!/usr/bin/env python3
"""Indicador de área de notificação do HUB WhatsApp Bot para GNOME/Fedora."""

from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import urllib.error
import urllib.request
import webbrowser

import gi

gi.require_version("Gtk", "3.0")
try:
    gi.require_version("AyatanaAppIndicator3", "0.1")
    from gi.repository import AyatanaAppIndicator3 as AppIndicator3
except (ValueError, ImportError):
    gi.require_version("AppIndicator3", "0.1")
    from gi.repository import AppIndicator3
from gi.repository import GLib, Gtk

APP_ID = "hub-whatsapp-bot"
SERVICE_NAME = "hub-whatsapp-bot.service"
PROJECT_DIR = Path(__file__).resolve().parents[1]
ICON_DIR = PROJECT_DIR / "desktop" / "icons"
CACHE_DIR = Path.home() / ".cache"
LOCK_PATH = CACHE_DIR / "hub-whatsapp-bot-indicator.lock"


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = read_env(PROJECT_DIR / ".env")
ADMIN_PORT = ENV.get("ADMIN_PORT", "3210")
PANEL_URL = f"http://127.0.0.1:{ADMIN_PORT}"
HEALTH_URL = f"{PANEL_URL}/health"
try:
    POLL_SECONDS = max(5, int(ENV.get("TRAY_POLL_SECONDS", "10")))
except ValueError:
    POLL_SECONDS = 10


def run_systemctl(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["systemctl", "--user", *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def service_snapshot() -> dict[str, object]:
    result = run_systemctl(
        "show",
        SERVICE_NAME,
        "--property=ActiveState",
        "--property=UnitFileState",
        "--property=MemoryCurrent",
        "--property=TasksCurrent",
    )
    values: dict[str, str] = {}
    if result.returncode == 0:
        for line in result.stdout.splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                values[key] = value

    memory_raw = values.get("MemoryCurrent", "")
    try:
        memory_bytes = int(memory_raw)
    except (TypeError, ValueError):
        memory_bytes = 0

    tasks_raw = values.get("TasksCurrent", "")
    try:
        tasks = int(tasks_raw)
    except (TypeError, ValueError):
        tasks = 0

    return {
        "active": values.get("ActiveState") == "active",
        "enabled": values.get("UnitFileState") in {"enabled", "enabled-runtime"},
        "memory_bytes": memory_bytes,
        "tasks": tasks,
    }


def health_state(active: bool) -> tuple[str, str]:
    if not active:
        return "stopped", "Bot parado"
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1.25) as response:
            payload = json.loads(response.read().decode("utf-8"))
        state = str(payload.get("whatsapp", "starting"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return "starting", "Serviço iniciado; painel ainda carregando"

    labels = {
        "ready": "WhatsApp conectado",
        "qr": "Aguardando leitura do QR code",
        "authenticated": "Conta autenticada; carregando",
        "loading": "Carregando WhatsApp",
        "starting": "Iniciando WhatsApp",
        "disconnected": "WhatsApp desconectado",
        "auth_failure": "Falha de autenticação",
        "error": "Erro ao iniciar",
        "stopped": "WhatsApp parado",
    }
    return state, labels.get(state, f"Estado: {state}")


def format_usage(memory_bytes: int, tasks: int) -> str:
    if memory_bytes <= 0:
        return "Uso do serviço: indisponível"
    mib = memory_bytes / (1024 * 1024)
    suffix = f" · {tasks} processos/threads" if tasks > 0 else ""
    return f"Uso do serviço: {mib:.0f} MiB{suffix}"


class HubIndicator:
    def __init__(self) -> None:
        self.last_state: str | None = None
        snapshot = service_snapshot()
        self.indicator = AppIndicator3.Indicator.new(
            APP_ID,
            "hub-whatsapp-bot-waiting",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS,
        )
        if hasattr(self.indicator, "set_icon_theme_path"):
            self.indicator.set_icon_theme_path(str(ICON_DIR))
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_title("HUB WhatsApp Bot")

        self.menu = Gtk.Menu()
        self.status_item = Gtk.MenuItem(label="Verificando estado…")
        self.status_item.set_sensitive(False)
        self.menu.append(self.status_item)

        self.resource_item = Gtk.MenuItem(label="Uso do serviço: verificando…")
        self.resource_item.set_sensitive(False)
        self.menu.append(self.resource_item)
        self.menu.append(Gtk.SeparatorMenuItem())

        self.open_panel_item = self.add_item("Abrir painel de administração", self.open_panel)
        self.start_item = self.add_item("Iniciar bot", lambda *_: self.service_action("start"))
        self.stop_item = self.add_item("Parar bot", lambda *_: self.service_action("stop"))
        self.restart_item = self.add_item("Reiniciar bot", lambda *_: self.service_action("restart"))
        self.logs_item = self.add_item("Acompanhar registros", self.open_logs)

        self.autostart_item = Gtk.CheckMenuItem(label="Iniciar bot ao entrar no sistema")
        self.autostart_item.set_active(bool(snapshot["enabled"]))
        self.autostart_handler_id = self.autostart_item.connect("toggled", self.toggle_autostart)
        self.menu.append(self.autostart_item)

        self.menu.append(Gtk.SeparatorMenuItem())
        self.add_item("Abrir pasta do projeto", self.open_project)
        self.add_item("Sair apenas do ícone", self.quit_indicator)

        self.menu.show_all()
        self.indicator.set_menu(self.menu)
        self.refresh_status(notify=False)
        GLib.timeout_add_seconds(POLL_SECONDS, self.refresh_status)

    def add_item(self, label: str, callback) -> Gtk.MenuItem:
        item = Gtk.MenuItem(label=label)
        item.connect("activate", callback)
        self.menu.append(item)
        return item

    def set_icon(self, name: str, description: str) -> None:
        try:
            self.indicator.set_icon_full(name, description)
        except AttributeError:
            self.indicator.set_icon(name)

    def refresh_status(self, notify: bool = True) -> bool:
        snapshot = service_snapshot()
        active = bool(snapshot["active"])
        state, message = health_state(active)
        if state == "ready":
            icon = "hub-whatsapp-bot-connected"
        elif state in {"qr", "authenticated", "loading", "starting"}:
            icon = "hub-whatsapp-bot-waiting"
        else:
            icon = "hub-whatsapp-bot-error"

        self.set_icon(icon, message)
        self.status_item.set_label(message)
        self.resource_item.set_label(format_usage(int(snapshot["memory_bytes"]), int(snapshot["tasks"])))
        self.start_item.set_sensitive(not active)
        self.stop_item.set_sensitive(active)
        self.restart_item.set_sensitive(active)
        self.logs_item.set_sensitive(active)
        self.autostart_item.handler_block(self.autostart_handler_id)
        self.autostart_item.set_active(bool(snapshot["enabled"]))
        self.autostart_item.handler_unblock(self.autostart_handler_id)

        if notify and self.last_state is not None and state != self.last_state:
            self.notify("HUB WhatsApp Bot", message)
        self.last_state = state
        return True

    def service_action(self, action: str) -> None:
        result = run_systemctl(action, SERVICE_NAME)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "Falha desconhecida").strip()
            self.notify("Não foi possível controlar o bot", detail)
        else:
            labels = {
                "start": "Iniciando o bot…",
                "stop": "Parando o bot…",
                "restart": "Reiniciando o bot…",
            }
            self.notify("HUB WhatsApp Bot", labels.get(action, action))
        GLib.timeout_add_seconds(1, self.refresh_status)

    def toggle_autostart(self, item: Gtk.CheckMenuItem) -> None:
        action = "enable" if item.get_active() else "disable"
        result = run_systemctl(action, SERVICE_NAME)
        if result.returncode != 0:
            self.notify("Não foi possível alterar a inicialização automática", (result.stderr or "Erro").strip())
            item.handler_block(self.autostart_handler_id)
            item.set_active(bool(service_snapshot()["enabled"]))
            item.handler_unblock(self.autostart_handler_id)

    def open_panel(self, *_args) -> None:
        webbrowser.open(PANEL_URL, new=2)

    def open_project(self, *_args) -> None:
        subprocess.Popen(["xdg-open", str(PROJECT_DIR)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def open_logs(self, *_args) -> None:
        command = f"journalctl --user -u {SERVICE_NAME} -f --no-hostname"
        candidates = [
            ["ptyxis", "--", "bash", "-lc", command],
            ["kgx", "--", "bash", "-lc", command],
            ["gnome-terminal", "--", "bash", "-lc", command],
            ["xterm", "-e", "bash", "-lc", command],
        ]
        for candidate in candidates:
            if shutil.which(candidate[0]):
                subprocess.Popen(candidate, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
        self.notify("Registros do bot", f"Execute no terminal: {command}")

    def notify(self, title: str, message: str) -> None:
        if shutil.which("notify-send"):
            subprocess.Popen(
                ["notify-send", "--app-name=HUB WhatsApp Bot", title, message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

    def quit_indicator(self, *_args) -> None:
        Gtk.main_quit()


def acquire_single_instance_lock():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    handle = LOCK_PATH.open("w", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("O indicador já está em execução.", file=sys.stderr)
        sys.exit(0)
    handle.write(str(os.getpid()))
    handle.flush()
    return handle


def main() -> int:
    lock_handle = acquire_single_instance_lock()
    _ = lock_handle
    HubIndicator()
    signal.signal(signal.SIGINT, lambda *_: Gtk.main_quit())
    signal.signal(signal.SIGTERM, lambda *_: Gtk.main_quit())
    Gtk.main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
