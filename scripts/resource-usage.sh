#!/usr/bin/env bash
set -euo pipefail
SERVICE="hub-whatsapp-bot.service"

if ! systemctl --user is-active --quiet "$SERVICE"; then
  echo "O HUB WhatsApp Bot está parado."
  exit 0
fi

props="$(systemctl --user show "$SERVICE" \
  -p ActiveState -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec -p TasksCurrent -p MainPID -p ControlGroup)"

value() {
  printf '%s\n' "$props" | sed -n "s/^$1=//p"
}

human_bytes() {
  local bytes="$1"
  if [[ "$bytes" =~ ^[0-9]+$ ]]; then
    numfmt --to=iec-i --suffix=B "$bytes"
  else
    printf 'indisponível'
  fi
}

memory="$(value MemoryCurrent)"
peak="$(value MemoryPeak)"
cpu_ns="$(value CPUUsageNSec)"
tasks="$(value TasksCurrent)"
pid="$(value MainPID)"
control_group="$(value ControlGroup)"

printf 'Estado: %s\n' "$(value ActiveState)"
printf 'Memória atual do serviço (Node.js + WebSocket): %s\n' "$(human_bytes "$memory")"
printf 'Pico de memória: %s\n' "$(human_bytes "$peak")"
printf 'Processos/threads no serviço: %s\n' "${tasks:-indisponível}"
printf 'PID principal: %s\n' "${pid:-indisponível}"
if [[ "$cpu_ns" =~ ^[0-9]+$ ]]; then
  awk -v ns="$cpu_ns" 'BEGIN { printf "CPU acumulada desde o início: %.1f s\\n", ns/1000000000 }'
fi

echo
echo "Processos que mais usam memória dentro do serviço:"
cgroup_file="/sys/fs/cgroup${control_group}/cgroup.procs"
if [[ -n "$control_group" && -r "$cgroup_file" ]]; then
  mapfile -t pids < "$cgroup_file"
  if ((${#pids[@]})); then
    ps -o pid,comm,rss,%cpu --sort=-rss -p "$(IFS=,; echo "${pids[*]}")" | head -12
  fi
else
  systemctl --user status "$SERVICE" --no-pager
fi
