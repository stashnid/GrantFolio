# Assistant history backend — 14.11.2026

Executor: Terra; branch `feat/test-version-preparation`, base `390b95a`. Owned `backend/src/assistant.ts`, `backend/migrations/004_assistant_history.sql`, backend tests and this report. Fresh remote heads checked; branch head matched base. No push or commit.

Added owner-scoped storage of successful question/reply exchanges with their case snapshot revision; no prompts or API keys are persisted. POST returns the saved exchange; save failure returns an explicit error. GET reads up to 20 chronological exchanges with a stable `(created_at,id)` cursor, validates cursor ownership, computes stale against the current case revision, and does not invoke a model. Added coordinator-requested official source context and the last two owner-scoped exchanges as bounded, untrusted conversation context; old revisions and truncated entries are marked. Local migration 004 applied to existing development DB.

Verification: TypeScript check and full test suite passed against local PostgreSQL and Firebase Auth emulator (10 tests before final save-failure test). Authenticated coverage checks two-user isolation, foreign cursors, tied-timestamp pagination, revision staleness and no model call on GET. Focused save-failure check added separately; see coordinator handoff for final checks. No live model call was made.
