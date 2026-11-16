# Advisor session draft recovery — 2026-11-16

Scope: `frontend/src/Advisor.tsx`, `frontend/src/advisor-session.ts`, `backend/test/advisor-session.test.ts`; coordinator verified remote heads at base `15a8346`. Existing changes preserved. No live model calls.

Session storage is scoped by encoded Firebase UID and current tab. It stores up to 30 conversation UUIDs with drafts of at most 2,000 characters and matching retry UUIDs, expiring seven days after save. Invalid JSON, version, timestamps, UUIDs, oversized or inconsistent data are ignored. Local selected conversation with a draft wins over server fallback, including unsent conversations with no history. Draft changes are debounced 250 ms and flushed on unload/unmount; attempt IDs are persisted before POST, retained after failure, dropped on edit or successful send. The interface reports restoration or storage failure; recovery never automatically sends.

Focused pure tests passed (2/2); `npm run typecheck` passed. Coordinator owns browser verification including reload, new conversation, switching, failure/retry and user isolation.
