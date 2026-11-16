# Novice advisor review — 2026-11-16

- Branch `feat/conversation-workspace`, base `15a8346226f8071181f3479c1de8fa4375477f99`; coordinated ownership: `frontend/src/Advisor.tsx`, `frontend/src/Advisor.css`, `backend/src/advisor.ts`, `backend/test/advisor.test.ts`, this report. Existing uncommitted team changes preserved.
- Local status inspected. `git ls-remote --heads origin` failed in this agent environment because github.com could not resolve; remote verification from this environment is incomplete.
- Read repository instructions, current status, decisions, backlog, architecture and relevant local ECC frontend/react/e2e skill instructions. No live model calls or paid services.
- Fixed unsent draft loss when switching advisor conversations: drafts stay in memory per conversation, quick prompts append to an existing draft, and retry identifiers remain associated with the relevant conversation. Dirty state includes drafts in other conversations. Drafts are not durable across a reload or closing the page.
- Guided fallback now uses conversation facts when choosing the next question. It retains a delivery vehicle request across amount/location follow-ups, asks about business status when still missing, and moves to preparation after supplied facts. Study and personal vehicle branches avoid business questions. The API response shape is unchanged.
- Checks: `npm run typecheck` passed; `node --env-file-if-exists=.env --import tsx --test backend/test/advisor.test.ts` passed 4/4, with a mocked failing responder, owner isolation and retry checks. No browser test performed by this agent.
- Remaining constraints: deterministic question selection uses simple phrase matching and can misunderstand unusual wording; provider output quality and current program eligibility/intake were not verified. Simultaneous cross-process duplicate request insertion can return 409 instead of replay, although sequential retries replay successfully.

## Project assistant follow-up

- Coordinated ownership extended to `frontend/src/Assistant.tsx` and `frontend/src/Assistant.css`. Added optional parent-supplied next-step and document review callbacks, rendered in the scrollable conversation rather than covering the composer. Callbacks do not apply generated text or construct links.
- Added optional education track, goal text and welcome text. Education starters address motivation, university, documents and study plans; business remains the default. Existing draft, stale-response and import handling were left intact.
- `npm run typecheck` passed after the change. No browser test performed by this agent; coordinator owns integration and browser verification.

## Scope correction — business support only

The user's later instruction supersedes the education-track guidance described above. The advisor now treats student status as background, asks for a business idea when none is provided, and explains that personal study scholarships are outside this service. It does not infer age from student status. Educational starter/follow-up chips were removed from the advisor. The business-only catalog/discovery and project forms are being handled by the coordinating agents.

Checks: `npm run typecheck` passed; focused `advisor.test.ts` passed 5/5 with a mocked responder, including student café, unspecified student grants, and personal education requests. No live model calls. Keyword-based distinction remains heuristic.
