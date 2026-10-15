#!/bin/bash
# Linux Server Metrics Collector
# Outputs a single-line JSON object with system stats.

set -euo pipefail

# ---------- CPU Usage ----------
# Reads /proc/stat twice and calculates the delta for an accurate %
read_cpu() {
  awk '/^cpu / {print $2+$3+$4+$5+$6+$7+$8, $5}' /proc/stat
}

read cpu_total1 cpu_idle1 <<< "$(read_cpu)"
sleep 0.3
read cpu_total2 cpu_idle2 <<< "$(read_cpu)"

CPU_DELTA=$((cpu_total2 - cpu_total1))
IDLE_DELTA=$((cpu_idle2 - cpu_idle1))

if [ "$CPU_DELTA" -gt 0 ]; then
  CPU=$(awk -v d="$CPU_DELTA" -v i="$IDLE_DELTA" 'BEGIN {printf "%.2f", (1 - i/d) * 100}')
else
  CPU="0.00"
fi

# ---------- Memory Usage ----------
MEM=$(free | awk '/^Mem:/ {printf "%.2f", $3*100/$2}')

# ---------- Disk Usage (root) ----------
DISK=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')

# ---------- Uptime ----------
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
DAYS=$((UPTIME_SEC / 86400))
HOURS=$(((UPTIME_SEC % 86400) / 3600))
MINUTES=$(((UPTIME_SEC % 3600) / 60))
UPTIME="up ${DAYS} days, ${HOURS} hours, ${MINUTES} minutes"

# ---------- Docker Containers ----------
if command -v docker >/dev/null 2>&1; then
  # Get count
  DOCKER_RUNNING=$(docker ps -q 2>/dev/null | wc -l | tr -d ' ')
  DOCKER_TOTAL=$(docker ps -aq 2>/dev/null | wc -l | tr -d ' ')

  # Get container list as JSON array
  # We use docker ps with a format string and manually build JSON
  CONTAINER_LIST=$(docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}' | \
    awk -F'|' 'BEGIN{printf "["} {printf "%s{\"name\":\"%s\",\"status\":\"%s\",\"image\":\"%s\"}", (NR>1?",":""), $1, $2, $3} END{printf "]"}')
else
  DOCKER_RUNNING=0
  DOCKER_TOTAL=0
  CONTAINER_LIST="[]"
fi

# ---------- Load Average ----------
LOAD_AVG=$(awk '{print $1}' /proc/loadavg)

# ---------- Timestamp ----------
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ---------- Output JSON ----------
cat <<EOF
{
  "cpu": ${CPU},
  "memory": ${MEM},
  "disk": ${DISK},
  "uptime": "${UPTIME}",
"docker": {
  "running": ${DOCKER_RUNNING},
  "total": ${DOCKER_TOTAL},
  "containers": ${CONTAINER_LIST}
},
"load_avg": ${LOAD_AVG},
  "timestamp": "${TIMESTAMP}"
}
EOF