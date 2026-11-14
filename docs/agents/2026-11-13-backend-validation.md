# Backend validation: auth, isolation and budget

- Agent: Terra (implementation and review), 13 November 2026.
- Branch/base: coordinated checkout, base `b6afb25`; coordinator verified fresh remote heads before delegation.
- Scope: `backend/src/*`, `backend/test/*`, this report. No schema, deployment, provider calls or configuration changes.
- Status: done for the bounded local review.

## Findings and change

Reviewed Firebase token verification, owner-scoped profile/case queries, budget validation, transaction locking, revision and idempotency, and existing integration tests. Queries use the verified Firebase UID and parameterized owner conditions; commands lock the owned case before looking up a saved result. This is a focused review, not a comprehensive security audit.

Independent review found the 16 KB JSON limit rejected valid budgets with 100 multi-byte item names. Increased the bounded limit to 128 KB; added tests for 100 maximum-length Ukrainian names and rejection of an oversized request. Added checks that retrying an old command after a later revision returns the original result without overwriting current state, and that another identity cannot replay it. Existing tests cover concurrent retries, competing revisions, invalid sums and two-user isolation.

## Checks and handoff

Integration tests: 3 passed using local PostgreSQL and Firebase Auth Emulator, including the new checks. The initial restricted run could not bind a local test server (EPERM); the authorized rerun passed. Formatting checked with Prettier. Build and typecheck are being run by the coordinator. No cloud calls or deployments were made.
