# Discovery search refinement — 2026-11-16

- Branch: `feat/conversation-workspace`; base reported by coordinator: `15a8346`.
- Owned paths: `backend/src/grant-discovery.ts`, `backend/test/grant-discovery.test.ts`, this report. Existing uncommitted work preserved. Contract unchanged.
- Read project instructions and ECC backend-patterns. Local `git ls-remote --heads origin` failed because DNS could not resolve github.com; coordinator separately verified the remote.
- Replaced the broad `авто` prefix with explicit vehicle terms so автоклав, автоматизація and автосервіс do not imply a vehicle purchase. Service activity maps to business/equipment. Added limited English study/business/vehicle synonyms and direct single-token negation handling. Personal-vehicle intent no longer removes unrelated study/business matches.
- Verification: `node --import tsx --test backend/test/grant-discovery.test.ts` passed (2 tests). Includes existing use cases and regression checks for ambiguous words, personal-car/study mixed need, direct negation, English terms and student entrepreneur.
- Limits: this is a small deterministic vocabulary and local negation rule, not general language understanding; complex negation and ambiguous personal/business use still need clarification. Budget amounts are not parsed or used for eligibility. No external calls or catalog fact edits.

## Catalog follow-up

- Additional owned paths: `frontend/src/GrantCatalog.tsx` and `frontend/src/GrantCatalog.css`. Blank search now lists every catalog entry including archived. Track and intake-state filters expose completed/paused/unconfirmed status without claiming an open intake. Cards use the existing sourced target audience and eligible costs; sources and official name remain in the detail view. Search reason and caveat remain visible for queries; discussion handoff is available for any nonempty query. Resetting filters preserves the query; a separate control clears it. Detail navigation and filter state remain intact. Education detail CTA says “Підготувати матеріали”.
- A student who asks to start a business no longer automatically receives education recommendations unless an education need is also stated. Regression tests cover both cases.
- Verification: discovery tests 2/2 and `npm run typecheck` passed. Browser verification not performed in this subtask; coordinator should verify the end-to-end handoff and current catalog data.

## Education readiness and export

- Additional owned paths: `backend/src/project-details.ts`, `backend/src/draft-export.ts`, `backend/test/education-preparation.test.ts`. Regression first failed because education had six checks including missing budget; after correction it passes for both Erasmus directions. All five labels now match the education workspace; budget is optional in the preparation checklist. Business still has six checks including budget.
- Education TXT includes the existing sourced document and step guidance, official catalog source URLs, and a note that actual document, funding and deadline requirements depend on the chosen institution or call. It remains a working draft, not a formal application. Existing business formatting unchanged.
- Validation: education tests 2/2 and typecheck passed. Source research: `/tmp/2026-11-16-needs-sources.md` (coordinator received findings).

## Negation regression follow-up

- Corrected the three reproduced cases: negated education plus auto, negated auto plus education, and student business with a separate explicitly negated education need. Added `навчатися` recognition and tests for `вчитися`. Negation is scoped to punctuation or contrast conjunction clauses; this remains a small heuristic rather than general conversation understanding.
- Focused discovery tests: 3/3 passed. `npm run typecheck`: passed. No source or catalog facts changed; no live generation.

## Novice phrasing correction

- Added failing-first regressions for uncertainty about grants, learning without experience and a vehicle without credit. Narrowed negation to nearby expressions that negate the need itself; unrelated «не знаю» and «без досвіду/кредиту» preserve the positive intent. Previous negation regressions remain passing. This is still a bounded phrase heuristic, not general semantic understanding.
- Focused discovery tests 4/4 passed; `npm run typecheck` passed. No live generation or catalog fact changes.

## Business-only scope correction

- User clarified GrantFolio is solely for business. Removed education recommendations from discovery; student/youth is an applicant characteristic and never proof of age or eligibility. A general business direction asks for age, idea and stage. Explicit personal education alone returns an out-of-scope explanation; staff training with a business purpose remains a business query. Added startup and innovation vocabulary without inventing programs. Transport, typo and negation checks retained.
- The earlier education-search and education-preparation notes describe superseded scope, not current product direction. Catalog removal is coordinator-owned.
- Focused discovery tests 4/4 and `npm run typecheck` passed. No model calls or catalog fact changes.

## Available-program catalog UI

- Owned `frontend/src/GrantPrograms.tsx`, `GrantCatalog.tsx`, and `GrantCatalog.css`. Added public GET-backed provider with static seed for existing projects, 15-second timeout, in-flight guard, 60-second and visibility refresh, abort/cleanup and basic response validation. Available list uses the shared availability predicate and a one-minute clock so expired data leaves the list. No POST or live model calls.
- Catalog displays only currently available programs, useful category filters, deadline/rolling and last-check/source evidence; urgent deadlines are highlighted. Inactive deep links retain details but cannot initiate preparation. Error/retry and empty states are visible.
- At handoff typecheck expected TS2554 on two-argument `searchGrants` until coordinator adds the agreed optional programs argument. Coordinator owns provider integration, API, data and end-to-end browser checks.
