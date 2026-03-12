#!/usr/bin/env bash
# Convenience wrapper around docker compose for local development.
#
# Usage:
#   ./infra/scripts/dev-db.sh up      — start PostgreSQL and Redis
#   ./infra/scripts/dev-db.sh down    — stop and remove containers
#   ./infra/scripts/dev-db.sh reset   — wipe all data and restart fresh
#   ./infra/scripts/dev-db.sh logs    — tail container logs
#   ./infra/scripts/dev-db.sh psql    — open a psql shell as app_admin

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker/docker-compose.yml"
CMD="${1:-up}"

case "$CMD" in
  up)
    echo "▶ Starting local databases..."
    docker compose -f "$COMPOSE_FILE" up -d
    echo ""
    echo "  PostgreSQL → postgres://app_admin:devpassword_admin@localhost:5432/ironledger"
    echo "  Redis      → redis://localhost:6379"
    echo ""
    echo "  Run migrations:  npm run migrate"
    ;;

  down)
    echo "▶ Stopping local databases..."
    docker compose -f "$COMPOSE_FILE" down
    ;;

  reset)
    echo "▶ Wiping all data and restarting..."
    docker compose -f "$COMPOSE_FILE" down -v
    docker compose -f "$COMPOSE_FILE" up -d
    echo "✅ Fresh databases ready. Run: npm run migrate"
    ;;

  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;

  psql)
    docker compose -f "$COMPOSE_FILE" exec postgres \
      psql -U app_admin -d ironledger
    ;;

  *)
    echo "Usage: $0 {up|down|reset|logs|psql}"
    exit 1
    ;;
esac
