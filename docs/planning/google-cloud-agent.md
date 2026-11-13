> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

# Google Cloud delivery option for GrantFolio

Status: advisory recommendation, checked 12 November 2026; no credentials inspected, resources created, services enabled, paid calls made or repository files edited. User's new constraint: deploy on AWS or Google Cloud using permanent educational accounts with credits. This replaces the earlier Render/Supabase default. Account permanence is confirmed; exact project rights, remaining credit, expiry, eligible services and model access are not yet verified.

## Recommended GCP shape by 19 November

Keep React/Vite/TypeScript + Express/TypeScript as the proposed code stack, package SPA assets and `/api` in one image, and run one Cloud Run web service. Use **Firebase Authentication / Identity Platform**, **Cloud SQL for PostgreSQL**, **private Cloud Storage**, **Secret Manager**, and **Artifact Registry**. For scheduled ingestion/digest use **Cloud Scheduler → Cloud Run Job**, reusing the backend image with a task command. Long per-user AI/document work can use **Cloud Tasks → private Cloud Run worker service**, also the same code/image; short chat can stream within its HTTP request. These are execution boundaries in one codebase, not a new microservice decomposition.

| Concern | Service and boundary |
|---|---|
| Browser UI + business API | Cloud Run web service, public HTTPS frontend; protected application routes verify user identity. |
| Accounts | Firebase Auth email/password with verification/reset; optional Google sign-in later. No custom password implementation. |
| Profiles/cases/budgets/revisions | Cloud SQL Postgres accessed by backend only, explicit owner-scoped queries and transactions. |
| Uploads/exports | Private Cloud Storage buckets, server ownership checks, short-lived signed URLs or API-mediated download. |
| User-triggered long work | Cloud Tasks pushes authenticated HTTP requests to a private worker; result/status persisted in SQL. |
| Periodic source/mail processing | Cloud Scheduler invokes a Cloud Run Job; durable run records, leases/idempotency and source checkpoints in SQL. |
| LLM | Provider adapter; prefer Google-hosted Gemini API through the cloud project if account/model/credit checks pass. Exact model remains configurable. |

Cloud Run services receive a stable managed HTTPS URL; the prototype does not need custom DNS, an external load balancer or a separate frontend hosting service. [Cloud Run HTTPS](https://docs.cloud.google.com/run/docs/triggering/https-request)

## The authentication trap to avoid

**Cloud Run IAM is not application signup/signin.** External entrepreneurs normally have no GCP IAM role. The public Cloud Run service serves the login screen; Firebase/Identity Platform handles the account; frontend sends the Firebase ID token; the backend uses Firebase Admin SDK to verify it and derives the owner UID from the verified token. An `ownerId` in the body never authorizes access. Google explicitly documents this pattern. [End-user auth](https://docs.cloud.google.com/run/docs/authenticating/end-users), [Verify Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

Cloud Run defaults to private IAM access. Make only the web service public using the supported public-access setting (current docs recommend disabling its invoker IAM check); educational organization policy and deployment permissions must allow this. Keep the task worker private with a dedicated task-invoker identity. Do not grant all users access to SQL, bucket or worker simply to make the login page reachable. [Public access configuration](https://docs.cloud.google.com/run/docs/authenticating/public)

Firebase email/password supports real accounts. Enable the provider, add the final application domain/redirect settings, test confirmation, password reset and an address outside the team before user trials. Firebase Auth has its own email/action and abuse quotas; email-link sign-in has much lower free-plan limits than email/password verification, so choose email/password initially. The previous Supabase-specific SMTP limitation no longer applies. [Password auth](https://firebase.google.com/docs/auth/web/password-auth), [Auth limits](https://firebase.google.com/docs/auth/limits)

Grant subscription/digest email is **separate** from authentication email. It still needs a functioning sender service/domain and consent/unsubscribe handling. Do not assume Firebase Auth's mailer sends arbitrary grant digests or that a third-party email provider is covered by GCP educational credit.

## SQL and files without VPC sprawl

Choose Cloud SQL Postgres in the same supported region as the application. For this prototype, the documented Cloud Run Cloud SQL connector/managed Unix-socket public-IP connection avoids adding a VPC connector solely for database access; connections are encrypted and runtime identity needs Cloud SQL Client permissions. Keep DB credentials in Secret Manager and do not open authorized networks to `0.0.0.0/0`. A private-IP setup is a later/constraint-driven option, not automatically required for one educational demo. Use a bounded connection pool and small Cloud Run maximum instance count so autoscaling does not exhaust SQL connections. [Cloud Run → Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/connect-run)

Cloud SQL adds provisioned compute/storage cost even when the application has little traffic; it does not simply inherit Cloud Run's scale-to-zero economics. Stopping SQL still leaves storage charges. Select a modest supported instance explicitly rather than accepting an oversized console default, record the chosen cost estimate/credit balance, and keep it running through assessment. [SQL pricing](https://cloud.google.com/sql/pricing), [SQL storage charges](https://docs.cloud.google.com/sql/docs/postgres/faq)

Cloud Storage object names and metadata map to SQL ownership and revision records. Signed URLs are bearer capabilities usable by anyone who obtains them while valid; therefore short expiry, ownership checks before issuing and no signed URLs in routine logs. Storage objects need their own backup/version/lifecycle plan; DB backup alone is insufficient. [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)

## Requests, durable jobs and 24/7 monitoring

Default request-based Cloud Run billing allocates CPU during requests, startup and shutdown. Do not return `202` and then rely on an unawaited Node task/timer continuing indefinitely. Instance-based billing permits CPU outside requests, but it changes costs and an instance may still terminate; it does not make an in-memory queue durable. Jobs use instance-based billing for their actual execution. [Cloud Run billing/CPU](https://docs.cloud.google.com/run/docs/configuring/billing-settings)

For slow extraction/generation/export: API writes a SQL job/outbox record and returns a job ID; dispatcher enqueues Cloud Tasks; private worker processes to completion before acknowledging HTTP success; UI polls SQL-backed status. Limit dispatch rate/retries, use an idempotency key and atomically mark done. Reconcile pending outbox records because SQL commit + task creation is not an atomic transaction. The worker is a second deployment target of the same backend image, not a separate business service. [Cloud Tasks with private Cloud Run](https://docs.cloud.google.com/run/docs/triggering/using-tasks)

For periodic monitor/digest: Cloud Scheduler calls the Run Jobs API with a dedicated service account and **OAuth** token, not the OIDC token used when calling a private Cloud Run HTTP worker. A scheduled job exits when its batch is done; use one task initially. Prevent overlapping batch application with an SQL lease/unique run key, since job executions or retries must not create duplicate grants or emails. This works without a user's browser/laptop being open; “24/7” means scheduled checks of the connected, tested sources, not every grant worldwide. [Run Jobs schedule](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule), [Scheduler auth: OAuth for googleapis.com](https://docs.cloud.google.com/scheduler/docs/http-target-auth), [Run Job configuration](https://docs.cloud.google.com/run/docs/create-jobs)

## AI and credit compatibility

Keep a small LLM adapter with timeout, bounded tokens and structured validation. Put confirmed business facts, catalog records and relevant case text directly in the request; no vector database, Agent Builder, custom training or multiple-agent product runtime is needed for one supported program. Budgets remain deterministic code, and model outputs remain proposals until validated/confirmed.

A native Google-hosted Gemini endpoint under the same billed GCP project is the first option to check because it keeps auth/billing in that project. Verify current API/product name, available stable model, region, quota, data policy and service-account permission using official setup instructions; do not copy an unverified model ID. The older Vertex AI quickstart currently redirects to Google's renamed model-platform documentation, so avoid freezing legacy API assumptions in the plan. This is about accessing a hosted model API, not adopting an enterprise agent orchestration product. [Official model API setup](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start)

Google's education-credit docs say genuine course education credits are Cloud Billing allowance for Google Cloud services, but the team's actual promotion and linked billing account still need verification. A developer-program credit, dedicated GenAI credit and education credit have different terms; a permanent account alone does not prove every SKU is covered. Do not assume direct AI Studio/API keys, external Anthropic/OpenAI subscriptions or partner-marketplace Claude usage spend the same credit. If native Gemini is unavailable, select an already-authorized provider only after checking its separate cost/access. [Education credits](https://docs.cloud.google.com/billing/docs/how-to/edu-grants), [Examples of distinct developer/GenAI credit terms](https://developers.google.com/profile/help/benefits)

## IaC and delivery scope

Terraform under `infra/` should define the actual chosen GCP resources: required APIs, dedicated runtime/invoker identities and least-privilege bindings, Artifact Registry, Cloud Run service/worker/job, Cloud SQL, bucket, scheduler, task queue, secrets references and outputs. Firebase/Auth configuration must also be captured where provider/API supports it, with explicit documented bootstrap gaps. Use a remote locked/protected state and reviewed saved plan; do not put secret values, tfstate or uploads in git. Local dev can use Postgres + Firebase Auth emulator; demo uses separate cloud data. Keep one migration authority and avoid replacing a DB during routine application release.

The existing schedule survives the provider change: 12 Nov choose cloud/project and verify capabilities; 13 Nov HTTPS plus external signup; 14–15 Nov complete one supported case with budget/change/export and durable task path; 16–17 Nov real users and corrections; 18 Nov clean deployment rehearsal, report and freeze; 19 Nov demo and submission. No multi-region/HA/GKE/platform expansion before those graded outcomes.

## Tradeoff versus AWS

My recommendation is **GCP if both permanent accounts have the necessary services/permissions/credit**: the same container maps directly to Cloud Run service/job, with managed HTTPS and Firebase's documented external-user auth pattern. This is a setup-simplicity judgment, not a claim that AWS cannot do the same. AWS's alternative is equally valid if team familiarity, instructor permissions or available model access favors it; keep one provider rather than combining both. Cloud SQL's always-provisioned baseline cost and separate identity/task settings are GCP's main practical tradeoffs here. Account preflight can overturn this recommendation without changing the domain model or UI.

## Preflight to resolve before any paid deployment

Record selected project/billing credit amount+expiry+eligible SKUs; API-enablement and resource-creation permissions; allowed region; public web access policy; Firebase external signup ability; SQL instance/network feasibility; runtime IAM for storage/tasks/model; specific model availability/quota; CI federation/deploy rights; sender/domain availability for digests. These are read-only checks first, not permission to deploy every available service. Neither credit exhaustion protection nor a billing alert should be assumed to be a hard stop for every resource; use explicit application limits and the actual account's spend-control capabilities.
