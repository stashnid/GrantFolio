#!/usr/bin/env bash
# Idempotently deploy/update the GrantFolio daily smart grant monitor Cloud Run Job
# and its Cloud Scheduler trigger. Run as a project administrator after review.
set -euo pipefail

project=grantfolio-pp-ua
number=202022033476
region=europe-west1
service=grantfolio-web
job=grantfolio-smart-monitor
scheduler_job=grantfolio-smart-monitor-daily
sql_instance="$project:$region:grantfolio-db"
runtime_sa="grantfolio-runtime@$project.iam.gserviceaccount.com"
deployer_sa="grantfolio-deployer@$project.iam.gserviceaccount.com"
scheduler_sa="${SCHEDULER_SA:-$runtime_sa}"
release_role="projects/$project/roles/grantfolioRunRelease"

[[ "$(gcloud projects describe "$project" --format='value(projectNumber)')" == "$number" ]]

run_flags=(--project="$project" --region="$region" --quiet)
service_json=$(gcloud run services describe "$service" "${run_flags[@]}" --format=json)

release_image=$(jq -er '.spec.template.spec.containers[0].image | strings | select(length > 0)' <<< "$service_json")
[[ "$release_image" =~ @sha256:[a-f0-9]{64}$ ]]

db_secret_ref="${DB_SECRET_REF:-$(jq -er '
  .spec.template.spec.containers[0].env[]
  | select(.name == "DATABASE_URL")
  | .valueFrom.secretKeyRef
  | "\(.name):\(.key)"
' <<< "$service_json")}"
[[ -n "$db_secret_ref" ]]

gcloud services enable run.googleapis.com cloudscheduler.googleapis.com --project="$project"

job_flags=(
  "${run_flags[@]}"
  --image="$release_image"
  --command=node
  --args=backend/dist/smart-monitor-cli.js
  --service-account="$runtime_sa"
  --set-cloudsql-instances="$sql_instance"
  --set-secrets="DATABASE_URL=$db_secret_ref"
  --set-env-vars="NODE_ENV=production,GEMINI_VERTEX_PROJECT=$project,GEMINI_MODEL=gemini-3.5-flash-lite,SMART_MONITOR_AI_ENABLED=true"
  --tasks=1
  --parallelism=1
  --task-timeout=300s
  --max-retries=1
  --cpu=1
  --memory=512Mi
)

if gcloud run jobs describe "$job" "${run_flags[@]}" >/dev/null 2>&1; then
  gcloud run jobs update "$job" "${job_flags[@]}"
else
  gcloud run jobs create "$job" "${job_flags[@]}"
fi

gcloud run jobs add-iam-policy-binding "$job" \
  --project="$project" --region="$region" \
  --member="serviceAccount:$deployer_sa" \
  --role="$release_role" --format=none

gcloud run jobs add-iam-policy-binding "$job" \
  --project="$project" --region="$region" \
  --member="serviceAccount:$scheduler_sa" \
  --role=roles/run.invoker --format=none

run_uri="https://$region-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$project/jobs/$job:run"
scheduler_flags=(
  --project="$project"
  --location="$region"
  --schedule="0 4 * * *"
  --time-zone="Europe/Kyiv"
  --uri="$run_uri"
  --http-method=POST
  --oauth-service-account-email="$scheduler_sa"
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
  --quiet
)

if gcloud scheduler jobs describe "$scheduler_job" --project="$project" --location="$region" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$scheduler_job" "${scheduler_flags[@]}"
else
  gcloud scheduler jobs create http "$scheduler_job" "${scheduler_flags[@]}"
fi

printf 'Configured Cloud Run Job %s (%s) and Cloud Scheduler %s (0 4 * * * Europe/Kyiv)\n' \
  "$job" "$release_image" "$scheduler_job"
