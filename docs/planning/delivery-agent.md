> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

> Historical proposal: updated by the OOAD course review. The current consolidated decisions are in [architecture.md](../architecture.md) and [course-alignment.md](../course-alignment.md).

# Delivery lane: GrantFolio, 12–19 November 2026

Status: DONE_WITH_CONCERNS. Advisory only; no resources created, accounts inspected, deployments made, payments incurred, people contacted, or product files changed. Proposed decisions require confirmation at the implementation/deployment step. Official documentation checked 12 November 2026. Planning authority: CREW.md; exempt read-only lane. No approvals recorded for implementation or paid services.

## Recommendation

Use React/Vite/TypeScript + Express/TypeScript as one deployable web application on Render, Supabase for Auth + Postgres + private file Storage, one documented SMTP provider for real-user email, and one scheduled job that invokes backend task code. Frontend/ and backend/ stay separate top-level source directories; a multi-stage container builds the React frontend and Express serves the resulting assets alongside /api. This is one application, not two independent long-running processes in a container. It removes production CORS and frontend/API URL coordination for this week's prototype. This aligns with the architecture lane's proposed stack; it is not an already-approved product decision.

Managed HTTPS is supplied for Render's service URL and custom domains, with automatic HTTP redirection; no domain purchase is required for the demo URL. [Render TLS](https://render.com/docs/tls)

Alternative: Render static frontend + separate Render backend web service + the same Supabase project. This gives independent frontend deploys and static availability during API cold starts, at the cost of CORS, two service settings and separate release checks. Choose it only if the team already has a split deployment preference. Do not add Vercel + AWS + a separate queue vendor for this deadline.

## What infra/ must contain

- `infra/Dockerfile`: reproducible pinned runtime build, frontend compilation, non-root backend runtime, bind the provider's PORT on 0.0.0.0; no secrets copied into images.
- `infra/render.yaml`: web service, health check, build/start settings and optional cron job using the same repository/backend task entry point. The Blueprint file can have a custom configured path rather than being at repository root. [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- `infra/supabase/config.toml`, versioned SQL migrations, RLS/storage policies, non-sensitive seed catalog, local run instructions. Keep a single authoritative migration history, not migrations in both backend/ and infra/.
- `infra/.env.example` or an equivalent root example documents required variables with placeholders. README must name the actual location and explain setup, migration, seed, run, deploy, URL and rollback.
- A small smoke-check runbook: health, signup/signin, owner access, upload, chat request, export, scheduled job status and email check.

Keep CI configuration in `.github/workflows/` as required by GitHub, not under infra/ solely for aesthetic consistency. backend/ contains actual business logic, budget rules, matching, file/AI orchestration and export; frontend/ contains the user's UI, not a second copy of those rules.

## Hosting constraints and budget

Render Free web instances sleep after 15 minutes without traffic and take about a minute to restart. Their filesystem is ephemeral; application data and uploads must therefore remain in external Postgres/Storage. Free Render Postgres expires after 30 days, so it is not a sensible persistent companion when Supabase is already selected. [Render Free limitations](https://render.com/docs/free)

Proposed reliable demo mode: a paid always-on web instance for the user-testing and assessment period, plus a scheduled task if automatic ingestion is included. All spending remains subject to the owner's chosen budget and actual provider checkout; do not provision or silently upgrade. A Free web instance can host a budget-constrained prototype, but the plan and README must clearly admit cold starts and avoid claiming dependable continuous processing inside the sleeping process. Do not use fake keep-alive traffic as an architecture.

Use a scheduled job outside the web process for monitor and mail runs. Render cron can run a backend command from the repository, accepts secrets through environment configuration, uses UTC schedules and guarantees at most one active run of a given job; manual triggering cancels an existing run, so application tasks still need durable progress/idempotency. Cron is billed; get the owner’s budget before creating it. [Render Cron](https://render.com/docs/cronjobs)

For this week, execute small user-triggered document parsing/AI calls inside the API request with explicit input/size limits, timeout, provider-error handling and persisted operation status/idempotency key. Set target bounds during implementation and verify them against actual sample files/provider behavior; do not pretend every uploaded scan can complete synchronously. The UI can retry a failed operation without creating duplicate cases or exports. Export always runs from saved confirmed facts. This avoids introducing a separate queue service/continuous worker before the core user flow works. Re-evaluate a durable worker if actual file/AI operations exceed request lifetimes or repeated retries become common. Scheduled monitoring/digest remains an independently invoked backend command; never rely on an API process timer for it.

If paid cron is declined, GitHub Actions schedule can run the same command as a documented prototype fallback. GitHub explicitly says scheduled runs can be delayed or dropped under load, and run on the default branch; do not sell that as a strict continuous-monitoring guarantee. [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

Supabase Free projects can be paused after a low-activity week. Include owner email monitoring and project availability in the pre-demo check; a later assessor opening the demo must not discover a silently paused project. Paid plans avoid inactivity pausing. [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

## Auth: real users are the test

Recommendation: Supabase email/password signup, email confirmation and custom SMTP. Test this using addresses outside the team's organization before user trials. Supabase's default hosted SMTP only delivers to pre-authorized organization-team addresses, currently with a project-wide limit of 2 messages/hour, and offers no delivery guarantee. It is insufficient for arbitrary real-user signups. Custom SMTP starts with a configurable 30 messages/hour limit. Choose provider/domain and validate sender early; do not assume auth configuration alone delivers email. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Set Site URL to the final HTTPS demo origin; allow exact confirmation/reset callback URLs plus explicit localhost development URLs. Do not leave production redirects pointing at localhost or wildcard arbitrary domains. [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

Backend verifies signed access tokens and token expiry; identity comes from the token, not request JSON. All case/profile/file operations enforce owner identity. Store uploads in private buckets; RLS can restrict storage operations, and service-role access bypasses policies, so it must never reach the browser. [JWT overview](https://supabase.com/docs/guides/auth/jwts), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

Keep public Supabase project URL/publishable key distinguishable from backend-only secrets: AI provider key, SMTP credentials, database/server credentials and scheduler secret. Never prefix server secrets with VITE_. No passwords, tokens, uploaded file content or full chat text in routine logs. If SMTP is unavailable, the owner must consciously choose a supported alternative (e.g. OAuth) or an explicitly unverified-email demo policy; do not silently turn confirmation off and call the original auth plan complete.

## Release, data and rollback

Local development uses seeded sample businesses and sample documents. The hosted demo allows separate real accounts; no shared demo credentials that expose one business to another. Avoid copying user uploads into git or report screenshots. For initial trials use non-sensitive information where possible and keep feedback evidence outside the public repository unless the participant approved disclosure.

Deploy a walking skeleton with real auth on 13 November, before AI or complex extraction is finished. CI should build frontend, run focused budget/ownership tests and validate backend startup. Apply additive versioned migrations explicitly before enabling dependent application code. A failed deployment must keep the previous successful application available. Restore a recent known-good Render build on a bad release; rollback does not magically reverse database contents or schema changes. [Render rollbacks](https://render.com/docs/rollbacks)

Before trials and demo freeze, create a database export and a separate copy of storage objects under protected team-controlled storage. Supabase recommends off-site CLI exports for Free projects; database backups only include storage metadata, not uploaded objects. Do not put backups or business documents in git. Verify one restore/export locally with sample data. [Supabase backups](https://supabase.com/docs/guides/platform/backups)

## Delivery schedule (Europe/Kyiv dates)

| Date | Exit condition | Parallel human work, proposed |
|---|---|---|
| Thu 12 Nov | Agree one supported grant/template; pick vendors/budget; freeze the core scenario and data contract | One team member identifies actual prospective users; the other starts repository/auth/deploy setup. Roles can swap. |
| Fri 13 Nov | HTTPS URL, signup/signin, confirmed profile and separate-user isolation work | Test external signup and confirm SMTP delivery; invite people for sessions on 16–17 Nov. Invitations are sent by the team, not this planning agent. |
| Sat 14 Nov | Catalog → matching explanation → saved case → deterministic budget | Finish UI flow and data/rule integration; support one verified template. |
| Sun 15 Nov | Upload → confirmed facts → draft → price change → revised export works on hosted app | Run internal end-to-end test, error recovery and mobile pass; scheduled ingestion/digest is an isolated module, not a reason to block core user trials. |
| Mon 16 Nov | First real sessions recorded; fix the largest observed blocker | Watch users sign up and complete a concrete task. Record actual completion/failure and quotes with consent. |
| Tue 17 Nov | More sessions and retests of changes; evidence linked to fixes | Keep actual participant count; seek a small relevant group (e.g. 3–5 if feasible), never present this target as lecturer-mandated. |
| Wed 18 Nov | Stable demo frozen; report drafted and checked; repository access verified | Focus on feedback fixes, report evidence, README run/deploy instructions and rehearsing the same path. No broad new feature. |
| Thu 19 Nov | Demo reachable; each team member submits repository URL + demo URL + report PDF | Fresh independent signup smoke check; show prototype and the changes caused by real feedback. |

A technical prototype without real users loses the largest single criterion. Start recruiting before the feature-complete date. If a planned feature misses the deadline, record that honestly in the report rather than substituting fake successful behavior.

## Evidence needed for the report

Keep one factual session log per person: anonymous participant ID/role (identity details only with consent), date, how they were recruited, task, what happened, verbatim quote where recorded, issue, resulting change/commit and any retest. Summary reports the actual number tried and what changed. An in-app feedback form can store user ID, case ID, version and comment; it complements observation rather than pretending to be sufficient alone. No advanced unrequested analyses or extra academic requirements.

Payment/donation is optional bonus. Prefer an already-working lawful donation route if users choose it, and retain a redacted dated confirmation tied to this product test and permission to cite it. Do not invent a price, make a donation yourself and attribute it to a user, or build a payment subsystem before the graded core and sessions work. Whether lecturer accepts a particular evidence format remains a question for the class, not an assumption of this architecture.

## Acceptance checks

1. A stranger gets the README and can identify product, prerequisites, environment names, local commands, migrations/seeds and deployment steps; all three required directories contain real content.
2. A new external email address can sign up, confirm, sign in, refresh and sign out on the public HTTPS URL. Wrong password/expired link is handled clearly. Existing data survives logout and a deploy.
3. Account A cannot read account B's profile, case or object, including by guessed IDs/direct storage URLs; unauthenticated protected requests fail.
4. A real supported scenario reaches downloadable, correctly named files. The sample-data walkthrough is clearly distinguished from a supported actual application template.
5. Provider timeout, missing required fact and rejected upload produce a recoverable status, not a blank screen or false success. Scheduled runs show last-success time and no duplicate notification.
6. A clean deployment and a rollback to a known-good build have been exercised without deleting persistent data.
7. Report statements are supported by session records and actual changes; both team members have identical deliverable URLs and final PDF.
8. Repository is private today. Owner must choose lecturer access (explicit collaborator/access method) or deliberately make a sanitized repo public; an inaccessible private URL fails the spirit of the repository criterion. Do not change visibility automatically.

## Unresolved choices / dependencies

- Specific supported program and exact official template are not selected/validated; export is blocked until that is real.
- Team's existing Render/Supabase/SMTP/AI accounts, sender-domain availability and spending cap are unknown. Architecture selection is a proposal, not evidence of usable credentials.
- Confirm hosting budget; choose reliable always-on mode or openly accept Free cold starts; choose native cron or degraded Actions fallback.
- Decide lecturer repository access without inadvertently exposing business data or secrets.
- Recruit actual entrepreneurs early; this agent did not contact or test any users.

Durable lesson: hosted auth can pass every local test and still block external users because default SMTP recipients are restricted. External signup is a day-one deployment test, not a final demo check.
