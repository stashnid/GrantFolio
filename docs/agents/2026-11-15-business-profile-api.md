# Business profile API

2026-11-15. Branch `feat/conversation-workspace`, base `15a8346226f8071181f3479c1de8fa4375477f99`. Implementation: GPT-6.1 Terra. Owned backend profile, assistant, migration, tests and this report; existing frontend and documentation edits preserved. Coordinator verified remote main at base; this agent’s direct remote check failed DNS.

Structured optional profile details are validated and stored in JSONB. Legacy PUT preserves omitted details; empty details are omitted from responses. Assistant snapshots omit contact name, phone and website. Assistant stale detection continues to track case revisions only, not profile edits. No model calls.

## Validation

- `npm run migrate`: applied 009 on local PostgreSQL.
- `npm run typecheck`: passed.
- `npm test`: 23/23 passed, including real Firebase emulator/PostgreSQL profile round-trip, legacy PUT, isolation and invalid input; assistant exclusion uses a controlled responder and mock DB.
- Details replace the complete details object when supplied; `{}` clears it. Omission preserves stored details. No paid calls or publishing.
