#!/usr/bin/env bash
# Read-only checks. Never source .env, print credentials, log in or create resources.
set -euo pipefail
cd "$(dirname "$0")/.."
failed=0
fail() { printf 'BLOCKED: %s\n' "$1"; failed=1; }
for file in Dockerfile package-lock.json backend/src/migrate.ts; do
  [[ -f "$file" ]] || fail "Required repository file missing: $file"
done
for tool in node npm docker gcloud; do
  command -v "$tool" >/dev/null 2>&1 || fail "Install/setup required separately: $tool"
done
if command -v node >/dev/null 2>&1; then
  [[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]] || fail 'Node.js 24 required'
fi
for name in PROJECT_ID REGION SERVICE MIGRATION_JOB SQL_INSTANCE DB_NAME DB_USER RUNTIME_SA_ID AR_REPOSITORY DB_SECRET DB_SECRET_VERSION VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
  [[ -n "${!name:-}" ]] || fail "Missing exported input: $name"
done
[[ -z "${FIREBASE_AUTH_EMULATOR_HOST:-}" ]] || fail 'Unset production Firebase emulator host'
[[ "${AUTH_MODE:-}" != emulator && "${VITE_AUTH_MODE:-}" != emulator ]] || fail 'Unset emulator modes'
[[ -z "${PROJECT_ID:-}" || "${PROJECT_ID:-}" == "${VITE_FIREBASE_PROJECT_ID:-}" ]] || fail 'Firebase and GCP project must match for this runbook'
[[ -z "${DB_SECRET_VERSION:-}" || "${DB_SECRET_VERSION:-}" =~ ^[1-9][0-9]*$ ]] || fail 'Use a numeric Secret Manager version'
if command -v docker >/dev/null 2>&1; then
  docker info >/dev/null 2>&1 || fail 'Docker engine unavailable'
fi
if command -v gcloud >/dev/null 2>&1; then
  if accounts=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null) && [[ -n "$accounts" ]]; then
    printf 'PASS: active gcloud credential exists (identity omitted)\n'
  else
    fail 'No active gcloud credential; authenticate separately after approval'
  fi
  unset accounts
  if [[ -n "${PROJECT_ID:-}" ]]; then
    gcloud projects describe "$PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1 || fail 'Project cannot be verified with current credential/network'
  fi
fi
printf 'Preflight checks configuration only; no credit coverage, IAM, SQL, image or live deployment readiness is certified.\n'
exit "$failed"
