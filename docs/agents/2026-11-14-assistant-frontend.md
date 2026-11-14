# Assistant frontend — 14.11.2026

- Role: Terra implementation agent; coordinator: Astra.
- Branch: `feat/test-version-preparation`; base: `02f68e7166241566f5b688f3b0f4295438c781a7`.
- Owned paths: `frontend/src/Assistant.tsx`, `frontend/src/Cases.tsx`, `frontend/src/style.css`, this report.
- Verified `git status` and live `git ls-remote --heads origin`; current branch head matched base. No changes integrated or published.
- Added an explicit user-initiated assistant request for the selected saved case. The UI blocks requests when edits are unsaved, a save is pending, another case operation is busy, or a conflict exists. Requests include case ID and revision; replies remain plain text and are labelled with their revision and stale status. Switching cases unmounts the component. Errors preserve the question.
- Server contract: `POST /api/cases/:id/assistant`, `{ expectedRevision, message }` → `{ reply, revision, stale }`. Provider credentials stay on the server.
- Validation: `npm run typecheck` passed. Browser verification and integration with the real route remain with the coordinator; no paid model request was made.
