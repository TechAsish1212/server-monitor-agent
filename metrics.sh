
#!/bin/bash
# Linux Server Metrics Collector
# Outputs a JSON object containing system metrics.

set -euo pipefail

# ---------- CPU Usage ----------
read_cpu() {
  awk '/^cpu / {
    idle = $5 + $6
    total = $2 + $3 + $4 + $5 + $6 + $7 + $8
    print total, idle
  }' /proc/stat
}

read cpu_total1 cpu_idle1 <<< "$(read_cpu)"
sleep 0.3
read cpu_total2 cpu_idle2 <<< "$(read_cpu)"

CPU_DELTA=$((cpu_total2 - cpu_total1))
IDLE_DELTA=$((cpu_idle2 - cpu_idle1))

if (( CPU_DELTA > 0 )); then
  CPU=$(awk -v d="$CPU_DELTA" -v i="$IDLE_DELTA" \
    'BEGIN { printf "%.2f", (1 - i/d) * 100 }')
else
  CPU="0.00"
fi

# ---------- Memory Usage ----------
MEM=$(free | awk '/^Mem:/ {
  if ($2 > 0) printf "%.2f", ($3 / $2) * 100;
  else print "0.00";
}')

# ---------- Disk Usage ----------
DISK=$(df -P / | awk 'NR==2 {
  gsub("%", "", $5);
  print $5;
}')

# ---------- Uptime ----------
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
DAYS=$((UPTIME_SEC / 86400))
HOURS=$(((UPTIME_SEC % 86400) / 3600))
MINUTES=$(((UPTIME_SEC % 3600) / 60))
UPTIME="up ${DAYS} days, ${HOURS} hours, ${MINUTES} minutes"

# ---------- Docker Containers ----------
DOCKER_RUNNING=0
DOCKER_TOTAL=0
CONTAINER_LIST="[]"

# The Docker CLI alone does not provide access to a daemon.
# Only attempt collection if a daemon is actually reachable.
if command -v docker >/dev/null 2>&1 &&
   docker info >/dev/null 2>&1; then

  DOCKER_RUNNING=$(docker ps -q | wc -l | tr -d ' ')
  DOCKER_TOTAL=$(docker ps -aq | wc -l | tr -d ' ')

  # Produce valid JSON using Node.js to escape string values.
  CONTAINER_LIST=$(docker ps -a \
    --format '{{.Names}}|{{.Status}}|{{.Image}}' |
    node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        const containers = input.trim()
          ? input.trim().split("\n").map(line => {
              const [name, status, ...imageParts] = line.split("|");
              return {
                name,
                status,
                image: imageParts.join("|")
              };
            })
          : [];
        process.stdout.write(JSON.stringify(containers));
      });
    ') || CONTAINER_LIST="[]"
fi

# ---------- Load Average ----------
LOAD_AVG=$(awk '{print $1}' /proc/loadavg)

# ---------- Timestamp ----------
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ---------- Output JSON ----------
node -e '
const [cpu, memory, disk, uptime, running, total, containers, load, timestamp] =
  process.argv.slice(1);

console.log(JSON.stringify({
  cpu: Number(cpu),
  memory: Number(memory),
  disk: Number(disk),
  uptime,
  docker: {
    running: Number(running),
    total: Number(total),
    containers: JSON.parse(containers)
  },
  load_avg: Number(load),
  timestamp
}));
' "$CPU" "$MEM" "$DISK" "$UPTIME" \
  "$DOCKER_RUNNING" "$DOCKER_TOTAL" "$CONTAINER_LIST" \
  "$LOAD_AVG" "$TIMESTAMP"
