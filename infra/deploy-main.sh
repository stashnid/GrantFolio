#!/usr/bin/env bash
set -euo pipefail

project=grantfolio-pp-ua
region=europe-west1
service=grantfolio-web
migration_job=grantfolio-migrate
registry="$region-docker.pkg.dev"
image="$registry/$project/grantfolio/web"
firebase_app='1:202022033476:web:20a37d3a3d861ece98c411'

if [[ "${GITHUB_REF:-}" != refs/heads/main ||
      "${GITHUB_REPOSITORY_ID:-}" != 1455222744 ||
      "${GITHUB_REPOSITORY:-}" != stashnid/GrantFolio ||
      "${GITHUB_SHA:-}" != "$(git rev-parse HEAD)" ||
      ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ||
      ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]; then
  echo "Deployment requires the checked main commit in the GrantFolio GitHub workflow." >&2
  exit 1
fi

main_is_current() {
  local head
  head=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha) || return 2
  [[ "$head" == "$GITHUB_SHA" ]]
}

skip_if_superseded() {
  local result=0
  main_is_current || result=$?
  if [[ "$result" == 1 ]]; then
    echo "A newer main commit is available. Skipping $GITHUB_SHA."
    exit 0
  fi
  [[ "$result" == 0 ]]
}

skip_if_superseded

# Firebase web config goes into the public client bundle. Keep the cloud token
# in memory and exclude the Actions credential file from the Docker context.
config=$(curl -fsS --max-time 30 --config - \
  "https://firebase.googleapis.com/v1beta1/projects/$project/webApps/$firebase_app/config" <<CURL
header = "Authorization: Bearer $(gcloud auth print-access-token)"
header = "x-goog-user-project: $project"
CURL
)
VITE_FIREBASE_PROJECT_ID=$(jq -er '.projectId | strings | select(length > 0)' <<< "$config")
VITE_FIREBASE_APP_ID=$(jq -er '.appId | strings | select(length > 0)' <<< "$config")
VITE_FIREBASE_AUTH_DOMAIN=$(jq -er '.authDomain | strings | select(length > 0)' <<< "$config")
VITE_FIREBASE_API_KEY=$(jq -er '.apiKey | strings | select(length > 0)' <<< "$config")
[[ "$VITE_FIREBASE_PROJECT_ID" == "$project" && "$VITE_FIREBASE_APP_ID" == "$firebase_app" ]]
export VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_API_KEY

tag="$image:$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
docker build --platform linux/amd64 --tag "$tag" \
  --build-arg VITE_FIREBASE_PROJECT_ID --build-arg VITE_FIREBASE_APP_ID \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN --build-arg VITE_FIREBASE_API_KEY .
gcloud auth configure-docker "$registry" --quiet
docker push "$tag"
digest=$(gcloud artifacts docker images describe "$tag" --project="$project" --format='value(image_summary.digest)')
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]
release_image="$image@$digest"

skip_if_superseded

run_flags=(--project="$project" --region="$region" --quiet)
traffic=$(gcloud run services describe "$service" "${run_flags[@]}" --format=json)
previous=$(jq -er '[.status.traffic[] | select(.percent > 0)] | select(length == 1 and .[0].percent == 100) | .[0].revisionName' <<< "$traffic")
suffix="gh-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
revision="$service-$suffix"

gcloud run jobs update "$migration_job" "${run_flags[@]}" --image="$release_image"
gcloud run jobs execute "$migration_job" "${run_flags[@]}" --wait
gcloud run services update "$service" "${run_flags[@]}" --image="$release_image" \
  --revision-suffix="$suffix" --no-traffic

skip_if_superseded
current=$(gcloud run services describe "$service" "${run_flags[@]}" --format=json)
jq -e --arg previous "$previous" \
  '[.status.traffic[] | select(.percent > 0)] | length == 1 and .[0].percent == 100 and .[0].revisionName == $previous' \
  <<< "$current" >/dev/null
gcloud run services update-traffic "$service" "${run_flags[@]}" --to-revisions="$revision=100"
if ! curl -fsS --max-time 10 --retry 4 --retry-all-errors https://grantfolio.pp.ua/api/health \
  | jq -e '.status == "ok"' >/dev/null; then
  echo "Public health check failed after switching to $revision. Restoring $previous." >&2
  gcloud run services update-traffic "$service" "${run_flags[@]}" --to-revisions="$previous=100"
  exit 1
fi
printf 'Deployed %s as %s using %s\n' "$GITHUB_SHA" "$revision" "$release_image"
