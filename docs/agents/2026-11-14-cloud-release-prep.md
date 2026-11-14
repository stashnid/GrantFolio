# Звіт: Google Cloud release preparation

- Автор: execution subagent; coordinator owns final review/integration.
- Дата: 2026-11-14. Branch `feat/test-version-preparation`; base `390b95a972ed88ba71446ff0d971fa66ee12ce40`.
- Fresh remote check: own `git ls-remote --heads origin` failed DNS; coordinator reports successful fresh fetch at base 390b95a. No cached refs presented as fresh evidence.
- Статус: done_with_concerns — deployment package prepared; actual cloud release blocked on project/tooling/coverage and assistant decision.
- Межі: only `infra/README.md`, `infra/preflight.sh`, this report. No install/login, resource creation, billing changes, publication or model calls authorized/performed.

## Результат

Read AGENTS, assignment, current state/decisions/backlog/architecture, root README, Dockerfile, Compose, env example and actual backend/firebase/assistant code. Replaced infra stub with ordered parameterized provisioning/build/migration/deploy/acceptance/rollback instructions. Added a read-only preflight that does not source local secrets or expose credentials. The runbook blocks spending actions pending concrete approved resource scope and evidence of free/credit coverage; exact tier is a required input, no invented project or unverified price quote.

Minimal resource proposal follows the existing synchronous implementation. Broader architecture components are deferred until code needs them. SQL costs persist when web scales to zero; credits and budget alerts are not a guarantee of no cash exposure. Firebase client config is public, DB URL remains a pinned Secret Manager version. A separate migration job deploys the identical digest before web starts.

Critical limitation confirmed directly in `backend/src/assistant.ts`: URL allowlist accepts loopback port 20128 only. The Mac gateway is unreachable through a cloud container's localhost; a remote URL is rejected. Gateway hosting or a changed internal AI route is a separate pending implementation/approval. This release recipe explicitly has assistant disabled. If cloud AI is required, release must wait for that decision and verification.

## Перевірки і джерела

Official docs consulted: [Cloud SQL connection](https://docs.cloud.google.com/sql/docs/postgres/connect-run), [Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets), [Run deploy](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy), [Jobs deploy](https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy), [Firebase passwords](https://firebase.google.com/docs/auth/web/password-auth), [Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features), [budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets). SQL trial mentioned only as account-dependent possibility, not assumed entitlement.

Checks: `bash -n infra/preflight.sh` PASS. Running preflight exited blocked as expected for missing gcloud/project/Firebase inputs; Docker engine was unavailable in this execution context. No secret values were printed. No cloud deployment or runtime Cloud SQL/Firebase integration verified. Coordinator will independently review commands before publication. No STATUS/WORKLOG edits made here due to assigned path ownership; coordinator owns those updates.

## Передача

Obtain actual project/region and Firebase app; verify credentials, APIs/IAM, quotas, SQL tier and all covered costs privately. Resolve whether the initial HTTPS release may show assistant unavailable or must include a separately hosted gateway/provider integration. Only after concrete approval install/authenticate tools if required and run the reviewed steps. Record actual digest/revision/URL only after success; collect real user feedback separately.
