# Project without a selected grant

- Date: 2026-11-16; role: implementation agent, coordinated integration and browser QA by parent.
- Branch `feat/conversation-workspace`; coordinator verified remote heads at base `15a8346226f8071181f3479c1de8fa4375477f99`.
- Owned `frontend/src/Cases.tsx`, `backend/src/{cases,project-details,draft-export,assistant,gemini}.ts`, migration `014_case_optional_program.sql`, scope tests, and this report. Existing team changes preserved.

Manual creation now asks for a project name and optional need, with no silently selected grant. A project created from an explicit recommendation retains that program. The context panel shows the selected program or that funding can be found later and calls the optional `onFindFunding(need: string)` prop with the current project description. Case program IDs can be null; migration 014 removes the database default and non-null constraint. Export and model context do not assign a program or requirements to an unbound project. Existing save, recovery and revision guards remain in place.

Verification: `npm run typecheck` passed. `node --import tsx --test backend/test/gemini.test.ts backend/test/assistant.test.ts` passed (14 tests), including explicit and absent program contexts. Integration coverage was updated for null creation, generic export and removing a program; it requires the configured database and Firebase emulators and migration 014. A first sandboxed attempt lacked the required environment and local socket access; assistant/Gemini tests were rerun successfully with local socket access. Coordinator owns emulator-backed and browser verification. No live model calls, deployment or publication.

## Existing project funding selection

Funding search now carries the originating project ID, title and revision through `onFindFunding(need, project)`. When `programTarget` accompanies a selected recommendation, the user explicitly confirms binding it to that project instead of creating a second case. The request uses the original revision and is blocked for unsaved edits, recovery, pending saves, conflicts or a changed selected revision. A 409 or unknown response preserves local data and asks for the current version. The assistant receives `programSelected` so its general-project prompts do not imply an existing grant. Frontend typecheck passed; coordinator owns the full browser journey.
