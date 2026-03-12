#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Iron Ledger — Deploy script
#
# Run from your LOCAL machine to deploy to the IONOS VPS.
# Requires SSH access to the server as the ironledger user.
#
# Usage:
#   ./infra/scripts/deploy.sh [--skip-tests]
#
# What this does:
#   1. Runs the full test suite locally (skip with --skip-tests)
#   2. SSHs to the server
#   3. Pulls latest code from git
#   4. Installs production dependencies
#   5. Builds TypeScript
#   6. Runs database migrations (before restarting — schema-first deploy)
#   7. Reloads PM2 (zero-downtime rolling restart)
#   8. Health checks the live server
#   9. Rolls back if the health check fails
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SERVER="ironledger@YOUR_IONOS_VPS_IP"     # change to your server IP or hostname
APP_DIR="/home/ironledger/app"
APP_URL="https://YOURDOMAIN.COM"          # change to your domain
HEALTH_URL="$APP_URL/health"
HEALTH_RETRIES=10
HEALTH_DELAY=3                            # seconds between retries
# ─────────────────────────────────────────────────────────────────────────────

SKIP_TESTS=false
for arg in "$@"; do
  [[ "$arg" == "--skip-tests" ]] && SKIP_TESTS=true
done

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}▶${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}❌${NC} $*" >&2; }
success() { echo -e "${GREEN}✅${NC} $*"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [[ "$(git status --porcelain)" != "" ]]; then
  error "Working directory has uncommitted changes. Commit or stash them first."
  git status --short
  exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  warn "You are on branch '$CURRENT_BRANCH', not 'main'. Continue? [y/N]"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 1
fi

COMMIT=$(git rev-parse --short HEAD)
info "Deploying commit $COMMIT from branch $CURRENT_BRANCH"

# ── Local tests ───────────────────────────────────────────────────────────────
if [[ "$SKIP_TESTS" == "false" ]]; then
  info "Running tests..."
  npm test --workspace=apps/api
  success "Tests passed."
else
  warn "Skipping tests (--skip-tests)."
fi

# ── Deploy ────────────────────────────────────────────────────────────────────
info "Connecting to $SERVER..."

ssh "$SERVER" bash -s -- "$APP_DIR" "$COMMIT" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
COMMIT="$2"

echo "  ▶ Pulling latest code..."
cd "$APP_DIR"
git fetch origin main
git reset --hard origin/main

echo "  ▶ Installing dependencies..."
# Use --omit=dev to skip devDependencies in production
npm ci --omit=dev --workspace=apps/api

echo "  ▶ Building TypeScript..."
npm run build --workspace=apps/api

echo "  ▶ Running database migrations..."
# Migrations run BEFORE the new app starts (schema-first deploy)
npm run migrate --workspace=apps/api

echo "  ▶ Saving previous PM2 state for rollback..."
pm2 save --force

echo "  ▶ Reloading application (zero-downtime)..."
# pm2 reload sends SIGINT to old workers, starts new ones, waits for them to be ready
pm2 reload ironledger --update-env

echo "  ✅ Remote steps complete. Deployed commit $COMMIT."
REMOTE

# ── Health check ──────────────────────────────────────────────────────────────
info "Health checking $HEALTH_URL..."
sleep "$HEALTH_DELAY"

for i in $(seq 1 "$HEALTH_RETRIES"); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    success "Health check passed (attempt $i). Deploy complete!"
    echo ""
    echo "  Commit:  $COMMIT"
    echo "  URL:     $APP_URL"
    exit 0
  fi

  warn "Health check attempt $i/$HEALTH_RETRIES — got HTTP $HTTP_CODE. Retrying..."
  sleep "$HEALTH_DELAY"
done

# ── Rollback ──────────────────────────────────────────────────────────────────
error "Health check failed after $HEALTH_RETRIES attempts. Rolling back..."

ssh "$SERVER" bash -c "
  cd $APP_DIR
  git rev-parse --short HEAD~1 | xargs -I{} echo 'Rolling back to {}'
  git reset --hard HEAD~1
  npm ci --omit=dev --workspace=apps/api
  npm run build --workspace=apps/api
  pm2 reload ironledger --update-env
"

error "Rolled back. Check server logs: pm2 logs ironledger"
exit 1
