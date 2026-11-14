# Independent review: local prototype

- Agent/model: gpt-6.1-sol; independent reviewer.
- Date: 2026-11-13; branch `fix/plain-product-copy`; base `b6afb25`. Fresh remote verified by coordinator before delegation; no independent fetch or Git mutation.
- Status: done_with_concerns. Starting-code findings; implementation agents own fixes and execution checks.
- Owned output: `docs/agents/2026-11-13-independent-review.md` only. Direct write blocked by filesystem permission; prepared here for coordinator to copy.

## Scope and checks

Read AGENTS, original assignment, README, STATUS, decisions, backlog, architecture and linked handoff. Inspected frontend/backend source, integration tests, case migration, Compose and ignore rules. Applied installed ECC security-review skill at `~/.codex/plugins/cache/ecc/ecc/2.2.3/skills/security-review/SKILL.md` to applicable identity, validation, SQL and error boundaries. Generic cookie, Supabase and blockchain recommendations were not imposed on Firebase bearer-token auth.

No installs, paid calls, cloud actions, application edits or Git mutations. Source review only; no browser/integration/audit execution. A Node measurement confirmed the body-size finding below. Assignment deliverables remain deployed HTTPS sign-up/sign-in and actual user feedback/PDF; extra academic methods and training are not required.

## Findings sent to owners

1. **P1: Unsaved budget silently lost on navigation.** `frontend/src/main.tsx:238` unmounts Cases on Profile navigation, losing rows and pending retry command. `frontend/src/Cases.tsx:54–65` overwrites edits on selecting even the current case; `:83–89` replaces draft after creating another case. Preserve state or guard dirty navigation/case creation/page exit. Sent to coordinator and frontend owner.

2. **P2: Parser rejects schema-valid budget size.** `backend/src/app.ts:21` sets 16 KiB JSON limit, while schema accepts 100 names of 160 characters. Payload with 100 Ukrainian 160-character names measured **36,888 UTF-8 bytes** using Node Buffer.byteLength. Align bounded parser size and test 100-row Ukrainian input plus 413 above envelope. Sent to backend owner.

3. **P2: Saved notice survives unsaved edits.** `frontend/src/Cases.tsx:263–278` add/delete retains success, create retains old notice; `frontend/src/main.tsx:269–294` profile inputs retain success after changes. Clear success on every edit or show dirty state. Independently confirmed by UX reviewer.

4. **P2: Editing uncertain save discards retry identity.** `frontend/src/Cases.tsx:168–178` keeps command on network failure, but edit/add/delete clears it. If original command committed and reply was lost, a new save uses old revision and conflicts. Resolve retained command before editing or provide deliberate recovery preserving current draft. Sent to frontend owner.

5. **P2: Retry state misleading.** `frontend/src/Cases.tsx:41–49` does not clear old load errors on retry/success. `:206–209` offers retry during initial loading and allows overlapping requests. Use distinct loading/error state and clear stale error. Also independently found by UX reviewer.

## Security observations and limits

No concrete cross-owner read/write bypass found. Verified Firebase token supplies UID; profile/case SQL binds owner to that UID. Budget locks owned case before access to command history. SQL uses parameters; strict schemas reject extra fields; error responses hide stack traces; React renders text without raw HTML. Production config rejects emulator and Compose publishes loopback-only ports. These are source observations, not runtime certification.

Public deployment still needs abuse controls, response security headers and verified cloud configuration. These are deployment concerns rather than localhost blockers. Dependency audit, secret history scan and production Firebase verification were not performed.

## Handoff

Coordinator/backend/frontend owners received actionable findings. Recheck navigation/dirty state, saved notices, uncertain-write recovery and accepted 100-row request after fixes. Coordinator owns STATUS/WORKLOG integration. No public HTTPS demo or factual feedback PDF was established by this review.
