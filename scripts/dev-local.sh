#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
assistant=false
if [[ "${1:-}" == "--assistant" ]]; then
  assistant=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: scripts/dev-local.sh [--assistant]" >&2
  exit 2
fi
command -v node >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
[[ -d node_modules ]] || { echo "Run npm ci first." >&2; exit 1; }
[[ -f .env ]] || { echo "Create .env from .env.example first." >&2; exit 1; }
gateway_pid=""
cleanup() {
  if [[ -n "$gateway_pid" ]]; then kill "$gateway_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
if [[ "$assistant" == true ]]; then
  runtime=".local/model-gateways/runtime/node_modules/omniroute/dist/server.js"
  runtime_env=".local/model-gateways/omniroute-data/runtime.env"
  assistant_env=".local/model-gateways/omniroute-data/assistant.env"
  for required in "$runtime" "$runtime_env" "$assistant_env"; do
    [[ -f "$required" ]] || { echo "Missing local assistant setup. See docs/omniroute-setup.md." >&2; exit 1; }
  done
  if ! curl --silent --fail --max-time 2 --output /dev/null http://127.0.0.1:20128/; then
    node --env-file="$runtime_env" "$runtime" > .local/model-gateways/omniroute-data/server.log 2>&1 &
    gateway_pid=$!
    gateway_ready=false
    for attempt in $(seq 1 30); do
      if curl --silent --fail --max-time 2 --output /dev/null http://127.0.0.1:20128/; then gateway_ready=true; break; fi
      kill -0 "$gateway_pid" 2>/dev/null || { echo "OmniRoute did not start. Inspect its private server.log." >&2; exit 1; }
      sleep 1
    done
    [[ "$gateway_ready" == true ]] || { echo "OmniRoute startup timed out." >&2; exit 1; }
  fi
fi
docker compose up -d
services_ready=false
for attempt in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U grantfolio >/dev/null 2>&1 && curl --silent --fail --max-time 2 --output /dev/null http://127.0.0.1:9099/; then services_ready=true; break; fi
  sleep 1
done
[[ "$services_ready" == true ]] || { echo "Local services are not ready." >&2; exit 1; }
npm run migrate
if [[ "$assistant" == true ]]; then
  node --env-file=.env --env-file="$assistant_env" node_modules/concurrently/dist/bin/concurrently.js -k -n api,web npm:dev:api npm:dev:web
else
  npm run dev
fi
