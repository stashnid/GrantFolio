#!/usr/bin/env bash
# Run once as a project administrator after reviewing the bindings below.
set -euo pipefail

project=grantfolio-pp-ua
number=202022033476
region=europe-west1
pool=grantfolio-github
provider=github-main
deployer="grantfolio-deployer@$project.iam.gserviceaccount.com"
runtime="grantfolio-runtime@$project.iam.gserviceaccount.com"
member="serviceAccount:$deployer"
repo_id=1455222744
owner_id=246553830
support_role=grantfolioDeploySupport
release_role=grantfolioRunRelease

[[ "$(gcloud projects describe "$project" --format='value(projectNumber)')" == "$number" ]]
gcloud services enable sts.googleapis.com iamcredentials.googleapis.com --project="$project"

if ! gcloud iam service-accounts describe "$deployer" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create grantfolio-deployer --project="$project" \
    --display-name='GrantFolio GitHub deployment'
fi

if ! gcloud iam workload-identity-pools describe "$pool" --project="$project" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool" --project="$project" --location=global \
    --display-name='GrantFolio GitHub Actions'
fi

mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id'
condition="assertion.repository_id=='$repo_id' && assertion.repository_owner_id=='$owner_id' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='stashnid/GrantFolio/.github/workflows/check.yml@refs/heads/main' && (assertion.event_name=='push' || assertion.event_name=='workflow_dispatch')"
provider_flags=(--project="$project" --location=global --workload-identity-pool="$pool")
if gcloud iam workload-identity-pools providers describe "$provider" "${provider_flags[@]}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$provider" "${provider_flags[@]}" \
    --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" \
    --attribute-condition="$condition"
else
  gcloud iam workload-identity-pools providers create-oidc "$provider" "${provider_flags[@]}" \
    --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="$mapping" \
    --attribute-condition="$condition"
fi

# The global role is limited to reading Firebase app config, polling Cloud Run
# operations, resolving this project, and consuming its API quota.
ensure_role() {
  local id=$1 title=$2 permissions=$3 actual
  if ! gcloud iam roles describe "$id" --project="$project" >/dev/null 2>&1; then
    gcloud iam roles create "$id" --project="$project" --title="$title" \
      --permissions="$permissions" --stage=GA
  fi
  actual=$(gcloud iam roles describe "$id" --project="$project" --format=json \
    | jq -er '.includedPermissions | sort | join(",")')
  [[ "$actual" == "$permissions" ]]
}
ensure_role "$support_role" 'GrantFolio deploy support' \
  'firebase.clients.get,resourcemanager.projects.get,run.operations.get,serviceusage.services.use'
ensure_role "$release_role" 'GrantFolio release existing Cloud Run resources' \
  'run.executions.get,run.jobs.get,run.jobs.run,run.jobs.update,run.services.get,run.services.update'

gcloud projects add-iam-policy-binding "$project" --member="$member" \
  --role="projects/$project/roles/$support_role" --condition=None --format=none
gcloud artifacts repositories add-iam-policy-binding grantfolio --project="$project" \
  --location="$region" --member="$member" --role=roles/artifactregistry.writer --format=none
gcloud run services add-iam-policy-binding grantfolio-web --project="$project" \
  --region="$region" --member="$member" --role="projects/$project/roles/$release_role" --format=none
gcloud run jobs add-iam-policy-binding grantfolio-migrate --project="$project" \
  --region="$region" --member="$member" --role="projects/$project/roles/$release_role" --format=none
gcloud iam service-accounts add-iam-policy-binding "$runtime" --project="$project" \
  --member="$member" --role=roles/iam.serviceAccountUser --format=none
gcloud iam service-accounts add-iam-policy-binding "$deployer" --project="$project" \
  --role=roles/iam.workloadIdentityUser --format=none \
  --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository_id/$repo_id"
