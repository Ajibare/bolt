#!/usr/bin/env bash
# Non-Docker local development launcher for Trading Bolt.
#
# Requires:
#   - Node.js >= 20
#   - pnpm
#   - A reachable PostgreSQL instance (see DATABASE_URL in .env)
#   - A reachable Redis instance (see REDIS_URL in .env)
#
# Usage:
#   ./scripts/dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js >= 20 is required but was not found on PATH." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is required but was not found on PATH." >&2
  echo "Install it with: npm install -g pnpm" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Edit DATABASE_URL and REDIS_URL in .env to point at your local PostgreSQL and Redis, then re-run this script."
  exit 1
fi

if ! grep -q "DATABASE_URL=[^[:space:]]" .env 2>/dev/null; then
  echo "error: DATABASE_URL is empty in .env. Set it to a reachable PostgreSQL connection string." >&2
  exit 1
fi

if ! grep -q "REDIS_URL=[^[:space:]]" .env 2>/dev/null; then
  echo "error: REDIS_URL is empty in .env. Set it to a reachable Redis connection string." >&2
  exit 1
fi

echo "Starting Trading Bolt..."
echo "  Web:    http://localhost:3000"
echo "  API:    http://localhost:4000"
echo "  Health: http://localhost:4000/api/health"
echo "  Ready:  http://localhost:4000/api/ready"
echo
pnpm dev