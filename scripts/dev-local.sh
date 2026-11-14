#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 0 ]]; then
  echo "Usage: scripts/dev-local.sh" >&2
  exit 2
fi
command -v node >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
[[ -d node_modules ]] || { echo "Run npm ci first." >&2; exit 1; }
[[ -f .env ]] || { echo "Create .env from .env.example first." >&2; exit 1; }
docker compose up -d
services_ready=false
for attempt in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U grantfolio >/dev/null 2>&1 && curl --silent --fail --max-time 2 --output /dev/null http://127.0.0.1:9099/; then services_ready=true; break; fi
  sleep 1
done
[[ "$services_ready" == true ]] || { echo "Local services are not ready." >&2; exit 1; }
npm run migrate
npm run dev
