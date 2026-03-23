#!/usr/bin/env bash
# =============================================================================
# Iron Ledger — Production Restart Script
#
# Usage:
#   ./scripts/restart.sh [level] [--api-only | --web-only]
#
# Levels:
#   soft    Zero-downtime graceful reload. Does NOT pick up new env vars.
#           Use after a code deploy when .env hasn't changed.
#           API: rolling (cluster workers replaced one by one, no dropped reqs)
#           Web: brief interruption (~1s, single fork process)
#
#   med     Delete + start from ecosystem.config.js. Picks up env vars and
#           ecosystem config changes. ~3s downtime per process.
#           Use after: .env changes, ecosystem.config.js changes.
#
#   hard    Kill anything holding ports 3000/3001, then med restart.
#           Clears EADDRINUSE port conflicts and stuck orphan processes.
#           Use after: a bad manual restart left processes in a bad state.
#
#   nuclear Kill the PM2 daemon entirely, then start fresh from scratch.
#           Use when PM2 itself is broken or in an unrecoverable state.
#
# Flags:
#   --api-only   Restart only ironledger-api
#   --web-only   Restart only ironledger-web
#   (default: both)
#
# Examples:
#   ./scripts/restart.sh soft           # rolling reload, both processes
#   ./scripts/restart.sh med            # fresh start, both processes
#   ./scripts/restart.sh hard           # clear port conflicts, both processes
#   ./scripts/restart.sh nuclear        # full PM2 daemon reset
#   ./scripts/restart.sh med --web-only # restart web only after env change
# =============================================================================

set -euo pipefail

APP_DIR="/home/ironledger/app"
ENV_FILE="${APP_DIR}/.env"
ECOSYSTEM="${APP_DIR}/ecosystem.config.js"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${GREEN}[restart]${NC} $*"; }
warn()    { echo -e "${YELLOW}[restart]${NC} $*"; }
err()     { echo -e "${RED}[restart]${NC} $*" >&2; }

# ── Args ─────────────────────────────────────────────────────────────────────
LEVEL="${1:-med}"
SCOPE="${2:-}"

case "$LEVEL" in
  soft|med|hard|nuclear|status) ;;
  *)
    err "Unknown level: $LEVEL"
    err "Valid levels: soft  med  hard  nuclear  status"
    exit 1
    ;;
esac

# Decide which PM2 process names to operate on
if [[ "$SCOPE" == "--api-only" ]]; then
  PROCS=("ironledger-api")
elif [[ "$SCOPE" == "--web-only" ]]; then
  PROCS=("ironledger-web")
else
  PROCS=("ironledger-api" "ironledger-web")
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

source_env() {
  if [[ -f "$ENV_FILE" ]]; then
    info "Loading env from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  else
    warn "No .env file found at $ENV_FILE — using current shell environment"
  fi
}

pm2_exists() {
  pm2 describe "$1" &>/dev/null
}

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    warn "Killing processes on port $port: $pids"
    echo "$pids" | xargs -r kill -9
    sleep 1
  fi
}

wait_up() {
  local name="$1" port="$2"
  local attempts=0
  info "Waiting for $name on port $port..."
  while ! curl -sf "http://localhost:${port}/" &>/dev/null; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge 20 ]]; then
      err "$name did not come up on port $port after 20s"
      pm2 logs "$name" --lines 20 --nostream
      return 1
    fi
    sleep 1
  done
  info "$name is up (${attempts}s)"
}

# ── Status ────────────────────────────────────────────────────────────────────
if [[ "$LEVEL" == "status" ]]; then
  pm2 status
  echo ""
  info "Port 3000 (API):"
  lsof -ti :3000 | xargs -r ps -p --no-headers -o pid,comm,args 2>/dev/null || echo "  (nothing)"
  info "Port 3001 (Web):"
  lsof -ti :3001 | xargs -r ps -p --no-headers -o pid,comm,args 2>/dev/null || echo "  (nothing)"
  exit 0
fi

# ── Soft ─────────────────────────────────────────────────────────────────────
if [[ "$LEVEL" == "soft" ]]; then
  info "=== SOFT RELOAD (no env update) ==="
  for proc in "${PROCS[@]}"; do
    if pm2_exists "$proc"; then
      info "Reloading $proc..."
      pm2 reload "$proc"
    else
      warn "$proc not found in PM2 — skipping (run 'med' to start from scratch)"
    fi
  done
  pm2 status
  info "Done."
  exit 0
fi

# ── Med ───────────────────────────────────────────────────────────────────────
if [[ "$LEVEL" == "med" ]]; then
  info "=== MEDIUM RESTART (env + ecosystem reload) ==="
  source_env
  for proc in "${PROCS[@]}"; do
    if pm2_exists "$proc"; then
      info "Deleting $proc..."
      pm2 delete "$proc"
    fi
  done
  info "Starting from ecosystem config..."
  if [[ ${#PROCS[@]} -eq 2 ]]; then
    pm2 start "$ECOSYSTEM"
  else
    # Start only the requested process(es)
    for proc in "${PROCS[@]}"; do
      pm2 start "$ECOSYSTEM" --only "$proc"
    done
  fi
  pm2 save
  pm2 status
  info "Done."
  exit 0
fi

# ── Hard ─────────────────────────────────────────────────────────────────────
if [[ "$LEVEL" == "hard" ]]; then
  info "=== HARD RESTART (clear port conflicts + full reset) ==="
  source_env

  # Kill any processes holding our ports before PM2 tries to bind
  kill_port 3000
  kill_port 3001

  for proc in "${PROCS[@]}"; do
    if pm2_exists "$proc"; then
      info "Deleting $proc..."
      pm2 delete "$proc" || true
    fi
  done

  info "Starting from ecosystem config..."
  if [[ ${#PROCS[@]} -eq 2 ]]; then
    pm2 start "$ECOSYSTEM"
  else
    for proc in "${PROCS[@]}"; do
      pm2 start "$ECOSYSTEM" --only "$proc"
    done
  fi
  pm2 save
  pm2 status
  info "Done."
  exit 0
fi

# ── Nuclear ───────────────────────────────────────────────────────────────────
if [[ "$LEVEL" == "nuclear" ]]; then
  warn "=== NUCLEAR (kill PM2 daemon + full restart) ==="
  warn "This will cause a brief outage for all processes."
  read -r -p "Are you sure? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }

  source_env

  info "Killing PM2 daemon..."
  pm2 kill || true
  sleep 2

  # Also clear any orphan processes on the ports
  kill_port 3000
  kill_port 3001

  info "Starting fresh from ecosystem config..."
  pm2 start "$ECOSYSTEM"
  pm2 save
  pm2 startup || true   # re-register system startup hook if needed
  pm2 status
  info "Done."
  exit 0
fi
