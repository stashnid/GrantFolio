# V1 case details backend

2026-11-14. Base `1b74afc` on `fix/plain-product-copy`; remote heads verified. Coordinator assigned backend case details, migration, tests and this report. Owned paths: `backend/src/cases.ts`, `backend/src/project-details.ts`, `backend/migrations/003_case_details.sql`, `backend/test/`, this report. No package changes or publication.

Implemented five saved text fields with empty defaults, strict trimmed validation and owner-scoped transactional updates. Details and budgets share a revision; separate command records replay the original details response. Readiness reflects saved fields and a nonempty budget only; it makes no grant eligibility claim. Existing budget command history is unchanged. Integration checks cover isolation, validation, revision conflicts, retries, reloading and missing fields.

API contract: `PUT /api/cases/:id/details` takes `expectedRevision`, UUID `idempotencyKey` and all five `details` fields and returns `{case}`. Each field is trimmed and limited to 3000 characters. Identical retries replay the original response; changed payload or stale revision returns 409; foreign cases return 404. `GET /api/cases/:id/readiness` returns `{revision,checks,disclaimer}` with five detail checks and one budget check. Historical budget command responses are not rewritten and can lack `details`.

Checks: backend TypeScript check and `git diff --check` passed. Integration test execution awaits coordinator-managed database migration and emulator services.
