# Independent quality review — 16 November 2026

- Reviewer: Sol, independent review agent; coordinator owns integration.
- Branch: `feat/conversation-workspace`; base `15a8346226f8071181f3479c1de8fa4375477f99`.
- Fresh remote verification: local `git ls-remote --heads origin` failed because sandbox DNS could not resolve GitHub. Coordinator reports fresh remote verification; this reviewer does not claim an independent successful remote check.
- Ownership: this report, subsequently authorized `frontend/src/Donations.tsx` and `frontend/src/Feedback.tsx`. Existing dirty/untracked work preserved.
- Status: in progress; review against current mutable working tree, not a committed release.
- Scope: local authentication/API failures, private-data isolation, profile validation/concurrency, catalog and journey. ECC security-review and e2e-testing guidance consulted. No paid provider calls, real payments, user browser sessions, installs or publication.

## Confirmed findings sent to coordinator

1. **P2: profile edits silently overwrite another tab.** Original `backend/src/app.ts:73-79` unconditionally upserts the full profile without an expected version. Synthetic user reads A/B, saves a new business name in A (200), saves only city from B's earlier snapshot (200): final name reverts to original. Suggested fix: return profile revision, conditional update plus 409, preserve form when conflict occurs. Coordinator implementing.
2. **P2: switching program does not change case revision.** Original `backend/src/cases.ts:97` updates program only. Synthetic API create returns revision 0, switch to veteran program returns revision 0. Assistant reviewer confirms freshness depends on case revision, so previous-program responses can remain fresh. Suggested fix: versioned program mutation with expected revision and revision increment; coordinated with backend/frontend owners.
3. **P2: infrastructure failure is labeled invalid authentication.** Isolated server test replaces Firebase verifier with synthetic `app/network-error`; GET `/api/me` returns 401 `unauthorized`. Original `backend/src/app.ts:43-44` catches all errors. Suggested fix: known invalid credentials ->401; temporary verifier failure ->503, with retry UI. No actual external verifier/network outage induced.
4. **P2: unbounded profile requests can leave the form busy indefinitely.** Original frontend profile fetch/save have no timeout; initial hang disables fields, save hang also disables logout. Coordinator implementing shared bounded API handling.
5. **P2: nonexistent project donation destination presented as payment page.** Original Donations included generic `https://send.monobank.ua/` as GrantFolio's official payment destination. Removed that unavailable target; retained existing official charity links without visiting/payment.
6. **P2: donation GET failures silently appear as absent data.** Original load routine ignores non-OK responses. Updated to shared authenticated request handling, visible error and retry. Donation sums/success wording now explicitly describes self-reported entries, not verified payments or assignment proof.

## Changes in owned product files

- Donations and Feedback use coordinator's `authenticatedRequest` / `readableApiError` API contract.
- Donation destination selection uses keyboard-accessible buttons with `aria-pressed`; submission freezes target/amount/note controls.
- Donation loading/error/retry states are visible; removed generic project payment action; clarified reporting and receipt distinction.
- Feedback retains existing request UUID when retrying identical content, uses classified request errors and retains user input on failure.

## Evidence and limits

- `/private/tmp/grantfolio-independent-api.mjs`: synthetic Firebase emulator identities; profile lost-update reproduced (both 200), other identity sees empty profile, other owner's case returns404. Synthetic case deleted after check; no real/private records used.
- `/private/tmp/grantfolio-independent-auth.mts`: isolated local test of verifier `app/network-error`, observed401 before coordinator fix.
- These temporary scripts contain no persisted ID tokens. They are local verification artifacts, not submitted test results from real users.
- Cross-owner SQL reads inspected: profile and case operations use server-derived UID. No confirmed cross-owner exposure found in reviewed routes.
- Donation POST currently has no idempotency key; a lost response followed by retry may create a duplicate self-report. This secondary limitation is not claimed fixed by frontend changes.
- Browser/type verification pending shared API helper integration and coordinator changes.

## Handoff

Coordinator owns STATUS/WORKLOG and contract integration. Request a final independent review of profile/auth patches after they land, then validate donation/feedback error recovery in isolated Chrome with synthetic identities and intercepted local failures.
