# Profile formats API

- Agent: Terra, implementation; 2026-11-15; branch feat/conversation-workspace; base 15a8346. Remote heads verified by coordinator before delegation.
- Status: done.
- Scope: server validation and normalization for existing profile details, without schema migration. Owned: backend/src/profile-details.ts, backend/test/integration.test.ts, backend/test/profile-details.test.ts, this report. Frontend is owned by another agent.

## Work

Implemented phone, KVED, and monetary syntax checks and normalization; maintained existing remaining fields and optional omission behavior. KVED validation is syntactic, not registry verification. Updated the integration fixture to a complete phone number and added focused tests.

Follow-up aligned the minimum international number length with the contract, added dot and non-breaking space phone formatting, and supported narrow non-breaking spaces in grouped amounts.

## Checks and handoff

npm run typecheck passed. npm test passed all 25 tests with localhost access; the initial sandboxed run failed because binding 127.0.0.1 was denied. The existing integration test continues to cover omitted-details preservation and owner isolation. Coordinator owns shared STATUS and WORKLOG updates.
