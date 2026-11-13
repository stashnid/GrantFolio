> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

# GrantFolio: OOAD course alignment and architecture corrections

Status: DONE_WITH_CONCERNS. Advisory, 12 November 2026. No project edits, exercises, deployments or provisioning. Read OOAD AGENTS.md, INDEX.md and the full relevant primary page transcriptions of Modules 2–4 (plus Module 1 logistics/constraints), not only the index. The existing architecture memo is a proposal, not an approved implementation. This report supersedes its folder layout and default persistence/RPC recommendation where noted below.

## What the materials actually support

- **Modular monolith means enforced boundaries, not named folders.** One deployable, capability-owned tables/schemas and public interfaces; CI fails on cross-module internals. Sources: Module 2 pp.2–3; Module 3 pp.9 and 11–14, 23, 25, 29–33.
- **Features first, layers inside each feature** is the course's default scale. Each feature has transport/API, plain business use cases/ports, persistence adapter/models. `shared/` contains technical cross-cutting concerns, not business policy. Sources: Module 3 pp.29–31; Module 4 pp.25–31.
- **Rules and transaction intent belong to business; SQL/session mechanics belong to persistence.** Authentication is at the edge; fine authorization/ownership remains an application concern; DB constraints are a backstop. Domain errors are translated to HTTP only at the API. Sources: Module 4 pp.9–19.
- **Buy commodity services** such as auth, files and model access. A monolith may run API and worker processes from the same code/image without becoming a set of independently designed microservices. Sources: Module 3 pp.14, 26–27.
- **Test per boundary**, with business rules testable using fake repositories/provider ports, database tests on PostgreSQL, and a few deployed end-to-end checks. Source: Module 4 pp.17 and 20.

## Actual changes to the prior recommendation

1. Replace root-level `routes/services/ai/documents/...` organization with capability modules that each contain their layers. A routes-folder plus a services-folder alone does not satisfy the stated modular-monolith claim.
2. Give each capability one public module contract and one owned database schema. Other modules call that contract and receive DTOs; they do not import repositories or query another module's tables. An `application` capability owns documents, case facts, budgets and draft/export snapshots so the critical consistency transaction stays inside one boundary.
3. Add enforceable dependency checks and one deliberate violation fixture. The CI check must fail for `assistant -> applications/repository`, `service -> Express/Supabase/pg`, `http -> repository`, and cyclic capability imports. Documentation alone is insufficient.
4. Change the default product-data adapter from Supabase REST caller-JWT commands plus a business-heavy SQL RPC to a backend-only PostgreSQL repository + Unit of Work. This gives one home for deterministic budget formulas in plain TypeScript business code. Supabase remains the proposed Auth/Postgres/Storage provider.
5. Keep the API schema, public/domain DTO and database row shapes distinct. The browser cannot set `owner_id`, internal validation flags, revisions, model/provider metadata or export completion states by adding fields to JSON.

These are design corrections before code exists, not a migration already executed.

## Concrete module map

| Capability | Owns | Public contract examples | Permitted module dependencies |
|---|---|---|---|
| business | profile and confirmed reusable business data; schema `business` | getConfirmedProfile, updateProfile | none |
| grants | source registry, published rounds/requirements and ingestion state; schema `grants` | listPublishedRounds, assessMatch, getVersionedRequirements | none; matching receives a profile DTO |
| applications | cases, uploaded-document metadata/extraction facts, exact budget input, drafts, immutable exports; schema `applications` | createCase, attachDocument, confirmFact, changeBudget, prepareExport | business/public, grants/public |
| assistant | conversation, proposals and model-call orchestration state; schema `assistant` | sendMessage, getConversation | business/public, grants/public, applications/public |
| notifications | subscriptions and delivery/deduplication log; schema `notifications` | subscribe, notifyMatches | business/public, grants/public; no need to read their tables |

Provider identity verification, configuration, DB connection factory, storage/model/email transports and common request tracing live in technical infrastructure, wired at the composition root. They do not contain grant-eligibility rules or price formulas. Jobs live with the capability whose work they represent; queue claim/lease mechanics can be shared technical code. Keep the number of capabilities at five initially, rather than making a service for every table.

Grant/program data is copied into a case as an immutable versioned requirements snapshot by calling grants/public. Profile data used in a case is a confirmed snapshot with its source revision. This avoids applications repositories joining business/grants internals. A later changed source version triggers a recheck through public contracts; it does not silently rewrite a submitted package. Cross-module consistency is explicit and versioned.

## Proposed tree and import rules

```
backend/src/
  bootstrap.ts                 # composition root only: concrete wiring
  modules/
    applications/
      public.ts                # callable contract + DTOs, not HTTP router
      http.ts                  # Express routes, input/output schema, errors
      schemas.ts
      service.ts               # use cases, exact budgets, ownership, states
      domain.ts                # plain values/errors
      ports.ts                 # repository, UoW, files, extraction interfaces
      repository.ts            # SQL and row mapping, only own schema
      uow.ts                   # application transaction adapter if needed
      tests/
    business/                  # same small shape as needed
    grants/
    assistant/
    notifications/
  infrastructure/              # technical provider adapters and DB factory
frontend/
infra/{migrations,Dockerfile,render.yaml,...}
```

Do not create empty ceremonial files for unused layers. Across modules, only `modules/X/public` is allowed, and the declared dependency graph must be acyclic. Inside a module, HTTP calls service/public, service depends on plain types/ports and other allowed public contracts, repository depends on data libraries and plain types. Infrastructure composition wires implementations to ports. TypeScript structural interfaces permit repository implementations without making repository code import the use-case implementation. The one authorized composition root is exempt from internal dependency restrictions so it can instantiate objects; the exemption is narrow and tested.

For TypeScript use dependency-cruiser (or equivalently enforced ESLint imports plus resolved-path boundary tests) rather than copying Python `.importlinter` configuration verbatim. Check resolved TS aliases too. Forbid Express, `pg`, SQL builders and provider SDK imports in service/domain files; forbid repository imports in route handlers. No generic `shared/services` backdoor. Official tool capability reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md .

## Transaction/RLS decision: rules in TypeScript, mechanics in PostgreSQL

**Recommended default, replacing the earlier large business SQL RPC:**

1. Backend verifies the incoming Auth JWT and derives an immutable Actor. Client body owner fields are ignored/rejected.
2. A backend-only `app_runtime` Postgres login has only required table/schema rights, is not an owner/superuser and has no BYPASSRLS. A separate migration credential owns DDL. Private module schemas are not exposed for browser Data API access; revoke anon/authenticated direct write grants. Browser keeps the provider SDK for Auth (and only specifically admitted Storage operations), not private product-state writes.
3. Repository/UoW borrows **one** database client. It begins a transaction and binds the verified actor with transaction-local context (`set_config` using a parameter, e.g. `app.actor_id`). RLS uses that context to scope rows; repository predicates and business ownership checks remain explicit. Missing actor fails closed. The actor is supplied from verified server identity, not passed directly from request JSON. No manually decoded unverified claims and no session-level actor setting on pooled connections.
4. `ApplicationsService.changeBudget` owns the use case: open UoW; load owned case with lock/version; validate expected revision; run the one pure exact-decimal/minor-unit budget function; persist raw lines, increment revision and mark derived state by its pinned revision; save idempotency result; commit together. DB constraints prevent invalid primitive states and concurrency conflicts, not grant-specific calculations duplicated in SQL.
5. Export service opens a UoW to capture the authorized current facts, exact budget result, narrative, requirement version and source revision as one immutable snapshot plus an export job. It commits before calling model/storage/PDF networks. Worker processes that snapshot. A later case change leaves the resulting export historical, not current. No network waits while row locks are held.
6. Rollback/cleanup happens on the same client; releasing it clears transaction-local actor state. Even owner-scoped reads may use a short READ ONLY transaction in this design to safely bind pooled security context. That is an explicit adapter need, not a claim that every GET semantically needs a business transaction.

RLS is defense in depth here, not an automatic property of merely connecting to Supabase. Test the real `app_runtime` role, missing actor, a reused pooled connection, another user's id, and unauthorized direct Data API writes. Parameterize SQL. Do not run production queries as `postgres` or service_role and claim RLS protected them. The custom-role/pool/security setup needs an early integration spike before implementation is considered locked.

Official mechanics checked: PostgreSQL RLS behavior and BYPASSRLS/owner caveats (https://www.postgresql.org/docs/17/ddl-rowsecurity.html); transaction-local settings (https://www.postgresql.org/docs/15/sql-set.html); Supabase roles/service-specific DB users (https://supabase.com/docs/guides/database/postgres/roles); grants plus RLS (https://supabase.com/docs/guides/database/postgres/row-level-security); node-postgres requires the same client for a transaction (https://node-postgres.com/features/transactions). This combination is a proposed design, not a locally tested Supabase deployment.

### Alternative if retaining REST/RPC is important

A small raw-write RPC can remain behind a repository port while the service owns formulas and policy; SQL handles locking, expectedRevision and constraints only. But a caller-JWT RPC callable by any authenticated browser is not a server-only canonical validation gate. Protecting completion/export validation flags then requires restrictive execution rights and a trusted server credential, plus explicit owner checks because privilege may bypass RLS. This is possible, but do not hide the tradeoff or duplicate formulas in TS and SQL. For the course-aligned design, the backend-only UoW is clearer.

## Python and AWS: requirement or example?

**No explicit Python/AWS mandate was found for the supplied 19 November prototype assignment.** Its stated criteria are the three top-level folders + README, HTTPS signup/sign-in, and a real-user feedback report. They do not name a programming language or cloud.

The lectures intentionally compare languages and cloud providers: Module 2 pp.8–10 compares TS/Python/Java and says choose using team/ecosystem/NFRs; Module 3 pp.20–21 and 33 says AWS is not destiny and shows alternative container runtimes; Module 4 p.8 says code structure outlives runtime choice. This supports keeping TS and a portable container if justified by the team/deadline.

Nuance: Module 4 p.33 **does explicitly require FastAPI/.importlinter/Alembic for its separate Lab 4** and names its own deadline (before Lab 5). Module 2 p.20 says Claude/AWS/GCP will be used in the course, and Module 1 p.6 lists course tools/credits and says labs from module 3 ship as containers. These are course context and distinct lab instructions. Do not transfer the Lab 4 grading checklist or its stack to the new Module 11 prototype submission without an actual instruction. Preserve Docker in the recommendation, which already aligns with that course context. No Lab 4 exercise was executed or added to GrantFolio scope.

## Unchanged choices and implications

- Keep one backend codebase/image, React frontend, managed Auth/Postgres/private file storage, deterministic calculations, pinned source versions and one supported program first.
- Keep a durable job mechanism for long model/extraction/export work; a worker can invoke the same public services with an explicitly scoped trusted actor/job context.
- Keep provider APIs behind ports, strict user isolation, CI, migration history applied once per deploy, and real-user validation before the 19 November demo.
- Keep Render/Supabase as proposed vendors, not approved provisioning. Course alignment does not justify more vendors or a forced AWS rewrite.
- Backend API+worker share module contracts/code but should not share mutable per-user process state. Same database does not grant a module permission to query another capability's tables.

## Minimum verification added by the course refinement

1. Boundary lint fails on an intentionally forbidden import and passes for public-contract imports.
2. Budget service tests use fake repository/UoW/model ports and catch rounding, missing confirmations and stale revisions without HTTP or a real DB.
3. API tests check token rejection, input/output shape and domain-error mapping, not duplicate domain formula assertions.
4. PostgreSQL integration tests prove atomic rollback, compare-and-swap/idempotency, private schema grants/RLS and pooled actor isolation with the actual runtime role.
5. A deployed signup -> case -> price change -> export journey confirms the same services work through HTTPS; migrations can build an empty DB in CI.

## Local course source references

- /Users/stashnidyk/Documents/ChatGPT/OOAD/course-materials/02-architecture-styles.md — pages 2–3, 6, 8–10, 14–20.
- /Users/stashnidyk/Documents/ChatGPT/OOAD/course-materials/03-monolith-modular-monolith-microservices.md — pages 9, 11–14, 19–21, 23–33.
- /Users/stashnidyk/Documents/ChatGPT/OOAD/course-materials/04-code-structure-layers-migrations.md — pages 8–21, 24–33.
- /Users/stashnidyk/Documents/ChatGPT/OOAD/course-materials/01-software-development-3.0.md — pages 4–6, 20–21, 27–31.

Read content is primary lecture transcription; this memo makes no claim of exact completeness of all source PDFs/images. Architectural recommendations are applications to GrantFolio, not lecturer-mandated extra deliverables.
