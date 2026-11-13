> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

> Historical proposal: updated by the OOAD course review. The current consolidated decisions are in [architecture.md](../architecture.md) and [course-alignment.md](../course-alignment.md).

# GrantFolio: application architecture proposal

Status: DONE_WITH_CONCERNS. Advisory only, 12 November 2026. No implementation or vendor provisioning. Parent verified clean repository and fresh origin/main at 74b9bdd. Only README and .gitignore exist. Vendor selection and supported grant template remain proposed.

## Recommendation

Use one TypeScript modular application: React + Vite frontend, Express backend, Supabase Auth/Postgres/private Storage. Build the SPA into the same Docker image and serve it through the Node server alongside /api. One HTTPS origin reduces deployment/CORS configuration. The required backend/, frontend/, infra/ directories remain real, separately testable parts. A scheduled command/worker can reuse backend modules; it is not a separate independently designed microservice.

Alternative: React + FastAPI with the same Supabase services. Choose it only if one teammate already knows Python backend development substantially better, or a necessary document-extraction library has no practical Node equivalent. Otherwise two runtimes and duplicate contracts add avoidable work in seven days. This is a recommendation, not evidence of the team's skills.

Official support checked: Vite builds static assets; Express serves static files; Render builds a repository Dockerfile. This combination is our design inference, not a prebuilt integration tested here.

## Components and responsibility

```
Browser (React UI; Supabase Auth SDK)
   | bearer JWT, /api requests; HTTPS
   v
One Node/Express web service
   |-- verify JWT, validate inputs, enforce ownership and quotas
   |-- profile/catalog/case APIs
   |-- assistant orchestration: propose -> user confirms -> apply
   |-- budget/check/export deterministic services
   |-- file admission + evidence extraction adapters
   |-- source ingestion + notification modules (scheduled command)
   |-- serves compiled frontend static assets
   |
   +-> Supabase Auth: account and session identity
   +-> Supabase Postgres: structured product state, RLS
   +-> Supabase private Storage: originals and generated exports
   +-> model provider: only minimum required case material
   +-> email provider: subscription/delivery, when enabled
```

No agent framework, vector DB, Redis, Kubernetes, custom password system or separate search cluster is necessary for the first supported program. Add search infrastructure only when a measured catalog/context limitation needs it. An application assistant is one bounded orchestration loop, unlike the development agents planning this work.

## First end-to-end scenario

Sign up -> sign in -> describe business -> confirm profile facts -> see explained matches in a small source-verified catalog -> create a case for the one supported template -> upload a supported small document -> confirm extracted values -> generate a draft and deterministic budget -> change one supplier price -> see changed budget plus affected narrative -> confirm/rebuild -> export and reload the case in a new session. Other catalog programs must clearly disclose their limited preparation support.

## Minimum data model

| Table | Key data and access |
|---|---|
| businesses | id, owner_id=auth user, confirmed profile JSON, revision, timestamps; owner only |
| grant_rounds | program_key, round_key, source_url, last_verified_at, publication_state, dates, versioned eligibility and document schema; published rows readable; writes server/admin only |
| application_cases | id, owner_id, business_id, grant_round_id, pinned requirement_version, state, revision, confirmed case facts; owner only |
| messages | id, owner_id, case_id or business_id, role, content, request_id, created_at; owner only |
| documents | id, owner_id, case_id, private object key, checksum, admitted MIME/size, extraction_state, extracted suggestions + page/snippet references; owner only |
| budget_lines | id, owner_id, case_id, description, quantity, amount in integer minor units, currency, document/fact reference, revision; owner only |
| draft_versions | id, owner_id, case_id, case_revision, requirement_version, structured content, validation findings, export object key; owner only; older snapshots retained |
| jobs | kind, owner_id when private, entity id, input revision, deduplication key, status, attempts, lease expiry, last error; server worker only |
| subscriptions | owner_id, business_id, enabled, preferences, verified email linkage; owner only through validated API |
| feedback | owner_id, consent choice, task, comment, submitted_at, release id; user creates own; restricted team read for report |

Keep source adapters / source registry / ingestion run log small and separate from user data. Do not mix public grant documents with private business uploads. A program and its rounds are distinct identifiers even if initially represented in one table; a new round is not a changed deadline.

Use SQL migrations in infra/supabase/migrations. Unique keys cover source round deduplication and retry idempotency. Index owner_id + case_id and grant state/deadline. Enforce ownership-consistent foreign keys for private child objects, not only an owner_id field supplied by the browser. Store UTC timestamps, display Kyiv time; date-only deadlines need explicit program timezone/interpretation. Money uses integer minor units or exact decimal, never binary floats.

## Authentication and isolation

1. Browser signs up/signs in using Supabase Auth; the backend never stores passwords.
2. Browser attaches its access token to /api. Backend verifies signature/expiry and correct issuer/audience using the official SDK or maintained JWT library, not a decoded token alone. Derive user id from verified subject; ignore body owner_id.
3. Backend creates user-scoped Supabase requests with that caller's JWT, so database RLS applies. Every private row policy checks auth.uid() against owner_id, including WITH CHECK for inserts/updates and referenced parent ownership.
4. Never use a service-role/secret key for ordinary case reads/writes. Privileged source ingestion and server jobs have separate narrowly exposed code paths. Those keys cannot enter frontend bundles, responses or logs.
5. Private storage path starts with validated user id and case id. Storage policies enforce ownership, not merely the difficulty of guessing a path. Backend authorizes every download/signing request. Signed URL expiry is short and URLs stay out of analytics.
6. RLS protects one user from another; database constraints and guarded transactional operations enforce important business invariants. Do not pretend hiding frontend buttons prevents API edits. Restrict direct table writes for protected transitions; apply a case revision and budget change in one explicitly authorized SQL transaction/RPC. Any privileged function must validate auth.uid(), pin its search path and allowlist fields.
7. SPA auth tokens in browser storage imply an XSS boundary: render markdown as text/sanitized markup, never execute file/web text, apply a restrictive content policy, and avoid injecting raw generated HTML. Cookie/BFF sessions are a later alternative if existing requirements justify their extra auth plumbing.

Supabase docs distinguish getClaims (signature/expiry validation) from getUser (current Auth record). Session revocation is not necessarily observed instantly by local JWT verification. For sensitive account operations revalidate with Auth; ordinary short-lived JWT access is the documented model.

## Proposed API contract

Auth is provider-managed. Application API, all scoped to verified identity except published catalog/health:

- GET/PATCH /api/businesses/:id
- GET /api/grants, GET /api/grants/:id, POST /api/grants/:id/match
- POST /api/cases, GET /api/cases/:id
- GET/POST /api/cases/:id/messages (bounded assistant request and persisted response)
- POST /api/cases/:id/proposals/:id/confirm (allowlisted field patch, expectedRevision, idempotency key)
- POST /api/cases/:id/documents, GET /api/documents/:id/status, DELETE /api/documents/:id
- PATCH /api/cases/:id/budget (expectedRevision), GET /api/cases/:id/checks
- POST /api/cases/:id/exports, GET /api/jobs/:id, GET /api/exports/:id/download
- PUT /api/subscription, POST /api/feedback
- GET /healthz and GET /readyz

Use one typed validation schema per command and consistent {code,message,fieldErrors,requestId} errors. Return 401 expired/missing identity, 404 absent/not-owned private object, 409 stale expectedRevision, 413 size too large, 422 invalid payload, 429 quota, 503 provider unavailable. Proposed route names can be frozen on day one; exact route count is not a requirement.

## State, reliability and model boundary

Facts carry value, source_type (user/document), document/page reference when available, and confirmed_at. Extraction produces suggestions, never confirmed facts. A proposal references the case revision it read. Applying it must detect a changed revision; no silent overwrite of another tab. A new revision marks derived draft sections stale; an export is bound to case+requirements revisions and remains a snapshot. Do not export a stale narrative as a fresh validated package.

Persist chat request id and answer before reporting success. Retry-safe document and export jobs use unique deduplication keys. Use a DB-backed queue/lease only for operations exceeding safe request duration; do not add Redis. Small prototype operations can be bounded synchronous requests if actual timeouts permit, with a saved failure state and explicit retry. Parent must choose the worker hosting alongside delivery plan; in-memory background promises do not survive restarts.

### Concrete atomic mutation/export rule

Use a narrowly scoped apply_case_change(case_id, expected_revision, idempotency_key, allowlisted_patch) database RPC. It checks auth.uid(), selects the owned case FOR UPDATE, rejects mismatched revision, validates and writes changed facts/budget lines, recomputes exact totals and increments revision in the same transaction. Latest draft freshness is derived from draft.case_revision == case.revision and matching requirement version; no asynchronous flag update can leave a stale draft looking current. Idempotency record/result can live in jobs/command metadata with a unique owner+command key. Grant normal authenticated users read-own policies; revoke direct writes to critical case/budget/version state and expose only guarded mutation RPCs. If a SECURITY DEFINER function is used for that restricted write, explicitly validate auth.uid(), set a fixed safe search_path, qualify relations, revoke PUBLIC execution, allow only authenticated execution, and validate every parent owner. A server route that merely adds owner_id while using a bypass key is not equivalent.

Export creation also uses a guarded transaction: check current case revision, current requirement version, unresolved mandatory checks and current confirmed draft; create an immutable draft_versions snapshot containing both narrative and exact budget/facts; enqueue export bound to that snapshot. The worker uses that immutable snapshot, never a new live budget mixed with an old narrative. A change during generation makes the completed file a historical snapshot, not the current ready-to-submit package. Downloads enforce owner and show the snapshot's revision. No claim of automated official-form completeness until that one template has been verified.

## Proposed two-person ownership

Assign roles after the team confirms, rather than attaching a person's name without agreement. Track A owns frontend pages, signup/login UI, case progress/confirmation, upload/export interactions and real-user session recording. Track B owns DB migrations/RLS, API, assistant/document/budget/export services and deployment. Both first agree on typed command schemas and one golden case. Integrate daily on the deployed vertical slice; cross-review auth isolation and the price-change scenario. Parent can redistribute AI/ingestion work to development agents later; this memo authorizes no implementation lanes.

## Repository and local workflow (planned, not commands implemented)

```
backend/src/{routes,services,ai,documents,grants,jobs,db}
backend/tests/
frontend/src/{pages,components,features,api}
frontend/tests/
infra/{Dockerfile,.dockerignore,render.yaml,supabase/migrations}
infra/supabase/{config.toml,seed.sql}
docs/{architecture.md,user-testing.md}
README.md
.env.example
package.json (npm workspaces)
package-lock.json
.github/workflows/ci.yml
```

Proposed local path: install Node version pinned to selected Vite/backend requirements and Docker; npm ci; start local Supabase with CLI configured from infra/supabase; reset/seed local DB; fill .env from .env.example; npm run dev launches Vite proxying /api to Express. Provide npm run check/test/build and a Docker production smoke command. An external-model adapter can be stubbed for automated tests but the running user demo must disclose provider outages rather than pretend generated output is real. Do not claim these commands work until implemented and tested from a clean clone.

## Acceptance checks with highest value

- Fresh account sign-up/login/logout, reload, expired token and account isolation; another user cannot list/get/mutate/download any private case or document.
- Backend rejects invalid/oversized uploads, unrelated case references, injected owner_id and model tool names.
- A supplier-price change updates exact totals and marks matching text stale; stale exports blocked or clearly marked; a stale second-tab edit gets 409.
- Job retry does not duplicate files, grant rounds or emails; web restart does not lose accepted long work.
- Full user journey on deployed HTTPS from an incognito browser; no secrets in bundle/source/repository; a clean clone can follow README.

## Risks and unresolved decisions

- Team's preferred language, provider accounts, budget, model provider and exact grant template are unknown. Do not provision based on this memo.
- Full catalog breadth and template-perfect export for many programs exceed a seven-day first delivery. First program must be selected and its official form tested immediately.
- A free sleeping web host cannot itself run reliable always-on loops. Render Free sleeps after idle; choose managed scheduling/durable work and show last successful source check, or use an approved always-on plan. Do not label it guaranteed 24/7 coverage.
- Email confirmation/reset and subscription delivery need SMTP/provider configuration; test using real external addresses before inviting testers.
- One-week work must leave time before 19 November for actual users and fixes. A technically impressive app with no real-user report misses the highest-weight criterion.

## Sources checked on 12 November 2026

- Vite build/static workflow: https://vite.dev/guide/
- Express static assets: https://expressjs.com/en/starter/static-files/
- Supabase token verification: https://supabase.com/docs/guides/auth/jwts and https://supabase.com/docs/reference/javascript/auth-getclaims
- Verification/revocation distinction: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- Supabase RLS and service-key bypass: https://supabase.com/docs/guides/database/postgres/row-level-security
- Private buckets and access rules: https://supabase.com/docs/guides/storage/buckets/fundamentals and https://supabase.com/docs/guides/storage/security/access-control
- Docker/health checks and free-service limitations: https://render.com/docs/docker ; https://render.com/docs/health-checks ; https://render.com/docs/free

Documentation supports capabilities, not a tested GrantFolio deployment. No formal gstack engineering-review certification or implementation approval is claimed.
