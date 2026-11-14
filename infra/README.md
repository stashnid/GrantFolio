# Google Cloud release runbook

Status: **prepared, not deployed** (14 November 2026). These are reviewable commands for the existing Dockerfile, not evidence of cloud resources. Local run instructions remain in the [root README](../README.md). Commands below assume Bash from the repository root. Do not paste the whole document into a terminal.

## Stop conditions and required decisions

The user permits credits/free usage only, with no real-money spend. **Do not execute provisioning, image push, migration or deployment until the exact project, account, region, resource settings and applicable credit/free coverage have been verified and the concrete scope approved.** A previous trial balance is not evidence that every service or AI provider is covered. Do not upgrade billing, attach a payment method or enable automatic paid continuation to follow this runbook. If cash exposure cannot be excluded, stop and present the uncovered item.

Proposed smallest release: one public Cloud Run web service (frontend + API), one Cloud Run migration job, one same-region single-zone Cloud SQL PostgreSQL instance/database/user, Firebase email/password, one Artifact Registry Docker repository, Secret Manager and one dedicated runtime service account. No worker, Tasks, Scheduler, bucket, paid AI or CI infrastructure is needed for the implemented synchronous draft/TXT flow. This is a proposal; it does not remove the full product scope.

Cloud SQL has continuing compute/storage/backup costs independently of Cloud Run scaling. Check whether this account qualifies for a specific Cloud SQL trial; do not assume perpetual free SQL. Include registry, networking, logs, secret access, image storage and migration execution in the reviewed estimate. Budget alerts and max instances are **not hard spending caps**. Record credit expiry, covered SKUs/services and the agreed shutdown time outside Git; no balances or account secrets belong here. See [Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features) and [billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets).

**Product assistant uses direct Gemini REST, optionally.** Without server-side GEMINI_API_KEY it returns 503; history remains accessible. Gemini Flash-Lite has been tested locally, not on Cloud Run. This release recipe intentionally leaves AI disabled unless the API project free-tier/billing scope is separately verified and its key is mounted as a dedicated Secret Manager secret. Never use OmniRoute or a developer coding-gateway key for the application. See the root README.

## Inputs and read-only preflight

No Google Cloud project is known yet; `gcloud` was not installed during preparation. Installation, authentication and project selection are separate actions, not performed by this package. Obtain these actual values from the selected Google Cloud/Firebase project. Names such as `grantfolio-web` are optional examples, not existing resources.

Export `PROJECT_ID`, `REGION`, `SERVICE`, `MIGRATION_JOB`, `SQL_INSTANCE`, `DB_NAME`, `DB_USER`, `RUNTIME_SA_ID`, `AR_REPOSITORY`, `DB_SECRET`, `DB_SECRET_VERSION` (numeric version), and the four `VITE_FIREBASE_*` values from the Firebase web app. Use the same Firebase/GCP project for this runbook. Choose a region supporting both Run and SQL; `europe-west1` is a proposal to review, not a required or provisioned region. Firebase web config is public configuration; DB URLs/passwords and gateway keys are secrets.

```bash
bash infra/preflight.sh
# Further read-only checks after credentials/project are available:
gcloud services list --enabled --project="$PROJECT_ID"
gcloud billing projects describe "$PROJECT_ID"
gcloud sql instances list --project="$PROJECT_ID"
gcloud run services list --project="$PROJECT_ID" --region="$REGION"
```

The script never reads `.env`, prints credentials, installs tools, logs in, changes billing or creates resources. Missing tools/inputs/network access produce a nonzero exit. It does not verify credit eligibility or complete deployment permissions. Verify billing/credits privately in Console, API availability and regional quotas. Operator needs API/service provisioning permissions, artifact push, Run deploy/job execute, service account use and the reviewed IAM grants; do not solve missing permissions by granting Owner.

## Provision only after concrete approval

Require approved values for `SQL_TIER`, `SQL_STORAGE_GB`, `SQL_BACKUP_START_TIME` and `RELEASE_APPROVED=yes`; the approval variable is an execution reminder, not user authorization. Review the exact tier in the pricing calculator/Console first. PostgreSQL 17 matches the local major version. The commands below provision normal Cloud SQL, **not a special trial instance**; if coverage relies on a trial, use its documented enrollment/provisioning flow instead and inspect the resulting connection name/settings.

```bash
set -euo pipefail
: "${RELEASE_APPROVED:?Concrete user approval required}"
[[ "$RELEASE_APPROVED" == yes ]] || exit 1
bash infra/preflight.sh
: "${SQL_TIER:?Approved SQL tier required}" "${SQL_STORAGE_GB:?Approved storage required}" "${SQL_BACKUP_START_TIME:?Approved UTC backup time required}"
RUNTIME_SA="$RUNTIME_SA_ID@$PROJECT_ID.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts create "$RUNTIME_SA_ID" --project="$PROJECT_ID"
gcloud artifacts repositories create "$AR_REPOSITORY" --repository-format=docker --location="$REGION" --project="$PROJECT_ID"
gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_17 --edition=ENTERPRISE --tier="$SQL_TIER" --region="$REGION" --availability-type=zonal --storage-size="$SQL_STORAGE_GB" --storage-type=SSD --no-storage-auto-increase --assign-ip --backup-start-time="$SQL_BACKUP_START_TIME" --project="$PROJECT_ID"
gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME_SA" --role=roles/cloudsql.client
```

Use the SQL Console to create the dedicated `DB_USER` with a generated password; do not put it in a terminal argument/history or use the `postgres` administrator for the application. This first prototype uses the same dedicated database owner for migrations/runtime; separate grants can be introduced with a reviewed schema policy. Cloud SQL public IP here is used through the authenticated/encrypted Run Cloud SQL connection; add **no authorized external networks**. Choose/review backup retention and deletion protection before creation; deleting a service does not delete SQL or its backups.

In Firebase Console, add Firebase to this same project if absent, register a Web app and enable Authentication → Email/Password. Review authentication quotas and any plan changes; do not enable Identity Platform paid features as a workaround. Obtain the four public web config fields. See [password authentication](https://firebase.google.com/docs/auth/web/password-auth).

Get the instance connection name (not its IP) and create a private file outside the checkout containing only the following connection string, replacing the user/password/database with **percent-encoded** values. `pg` consumes this Unix socket URL; the web process already has pool max 5.

```text
postgresql://ENCODED_USER:ENCODED_PASSWORD@localhost/ENCODED_DB?host=/cloudsql/PROJECT:REGION:INSTANCE
```

```bash
SQL_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')
: "${DATABASE_URL_FILE:?Path to private file outside checkout required}"
[[ -f "$DATABASE_URL_FILE" ]] || exit 1
# Restrict file permissions before use; never print it or enable shell tracing.
gcloud secrets create "$DB_SECRET" --replication-policy=automatic --data-file="$DATABASE_URL_FILE" --project="$PROJECT_ID"
gcloud secrets add-iam-policy-binding "$DB_SECRET" --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor --project="$PROJECT_ID"
# Confirm the numeric enabled version, without reading its payload:
gcloud secrets versions list "$DB_SECRET" --project="$PROJECT_ID" --format='table(name,state)'
```

Pin the confirmed numeric `DB_SECRET_VERSION` in both job and service. Never use `latest` for a reproducible release; no service account JSON key is needed. Review [Run SQL connection](https://docs.cloud.google.com/sql/docs/postgres/connect-run) and [secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## Build once, migrate, then deploy the same digest

Keep Firebase build inputs exported. Do not use `.env.example` values or emulator variables. Docker excludes `.env*` and `.local`; inspect the build context before push. `--platform linux/amd64` is needed when building on Apple Silicon. These commands publish an image and can incur costs; execute only within the approved scope.

```bash
: "${RELEASE_APPROVED:?Concrete user approval required}"
[[ "$RELEASE_APPROVED" == yes ]] || exit 1
bash infra/preflight.sh
RUNTIME_SA="$RUNTIME_SA_ID@$PROJECT_ID.iam.gserviceaccount.com"
SQL_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')
RELEASE_TAG=$(git rev-parse HEAD)
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit/review the release tree before building'; exit 1; }
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPOSITORY/web:$RELEASE_TAG"
docker build --platform linux/amd64 --build-arg VITE_FIREBASE_API_KEY --build-arg VITE_FIREBASE_AUTH_DOMAIN --build-arg VITE_FIREBASE_PROJECT_ID --build-arg VITE_FIREBASE_APP_ID -t "$IMAGE" .
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker push "$IMAGE"
DIGEST=$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT_ID" --format='value(image_summary.digest)')
[[ "$DIGEST" == sha256:* ]] || exit 1
IMAGE_DIGEST="${IMAGE%:*}@$DIGEST"
gcloud run jobs deploy "$MIGRATION_JOB" --image="$IMAGE_DIGEST" --region="$REGION" --project="$PROJECT_ID" --service-account="$RUNTIME_SA" --set-cloudsql-instances="$SQL_CONNECTION" --set-secrets="DATABASE_URL=$DB_SECRET:$DB_SECRET_VERSION" --command=npm --args=run,migrate:prod --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s --cpu=1 --memory=512Mi
gcloud run jobs execute "$MIGRATION_JOB" --wait --region="$REGION" --project="$PROJECT_ID"
# Stop here on any failed migration. Never start web with an unverified schema.
gcloud run deploy "$SERVICE" --image="$IMAGE_DIGEST" --region="$REGION" --project="$PROJECT_ID" --service-account="$RUNTIME_SA" --execution-environment=gen2 --set-cloudsql-instances="$SQL_CONNECTION" --set-secrets="DATABASE_URL=$DB_SECRET:$DB_SECRET_VERSION" --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=$PROJECT_ID" --port=8080 --cpu=1 --memory=512Mi --min=0 --max=1 --concurrency=20 --timeout=60s --allow-unauthenticated
SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')
curl --fail --silent --show-error "$SERVICE_URL/api/health"
```

`--set-env-vars` replaces ordinary environment variables: no emulator variables are carried into this release. ADC uses the runtime identity. Public access is required for the login page; private `/api` data still requires a verified Firebase token. The health endpoint proves process reachability only, not SQL/auth correctness. Service `--max=1` limits aggregate service instances, but it is not a hard billing cap. Before reusing this on an existing service, inspect its traffic/environment/IAM first; replacing unrelated settings is outside this initial-release runbook.

For future releases, deploy with `--no-traffic --tag=candidate`, test the candidate URL, then use `gcloud run services update-traffic "$SERVICE" --to-revisions="$APPROVED_REVISION=100" ...` with an explicitly verified revision. Do not combine a database-breaking migration with old live revisions. Current additive migrations are tracked in `schema_migrations`; the job has an advisory lock and is run separately from web startup.

## Release acceptance and rollback

Add the returned HTTPS hostname to Firebase Authentication authorized domains and review password-reset/action-link domains; keep `authDomain` from Firebase config. With two real test accounts, verify signup/signin, reload/logout, profile save, case/details/budget save, TXT export and cross-user isolation (including direct API attempts). Invalid/missing tokens must fail. Check the migration execution succeeded, logs have no credentials, and no emulator calls occur. Assistant-unavailable must remain explicit; do not report cloud AI as tested. Record actual URL, image digest, revision and evidence in the handoff only after they exist. Real user feedback and its PDF are separate assignment deliverables, not generated by this deployment.

Before each update, record the current ready revision and traffic split with `gcloud run services describe`/`gcloud run revisions list`. A code rollback is `gcloud run services update-traffic "$SERVICE" --to-revisions="$PREVIOUS_REVISION=100" --project="$PROJECT_ID" --region="$REGION"` after verifying that revision and schema compatibility. Do not automatically reverse SQL migrations or delete data. If no previous successful revision exists, pause public testing and fix forward. Agree a shutdown date before launching; review SQL, backups, registry, secrets and logs at cleanup because web min0 does not stop their charges. Destructive cleanup requires separate explicit authorization.

## Verified command references

Checked 14 November 2026 against official documentation; commands were not cloud-executed: [Run deploy](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy), [Run Jobs deploy](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy), [SQL instance create](https://docs.cloud.google.com/sdk/gcloud/reference/sql/instances/create), [Artifact Registry images describe](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/images/describe). Recheck available tiers, trial eligibility and permissions for the chosen project at execution time.
