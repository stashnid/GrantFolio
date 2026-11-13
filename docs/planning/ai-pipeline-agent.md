> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

> Historical proposal: updated by the OOAD course review. The current consolidated decisions are in [architecture.md](../architecture.md) and [course-alignment.md](../course-alignment.md).

# GrantFolio AI, documents and monitoring plan

Status: DONE_WITH_CONCERNS. Advisory recommendation, 12 November 2026. No implementation, paid request, grant integration test or deployment ran. Parent gstack captain coordinates this lane; no separate formal engineering review is claimed.

## Recommendation and boundary

Use one backend application with ordinary service modules, persisted operation records and one scheduled task. Start user-driven extraction/generation/export as bounded synchronous request/response operations for small supported files. No persistent worker or always-on hosting budget is assumed. No autonomous runtime, multi-agent orchestration in the product, fine-tuning, vector database, Redis or web-wide live search is needed for the first supported grant. Development agents planning the product are distinct from the product architecture.

One official program/round with a checked form and approved rules is the end-to-end target. Keep the README vision, but explicitly label unimplemented parts. A generic generated PDF is a useful draft, not a complete official submission package. Exact template, required formats and annex list must be checked against primary program documents before the application calls the case ready.

Candidate AI provider: OpenAI Responses API, server-side only. Official docs support structured output/function calling and file input, including PDF text and page images on suitable models. These capabilities were researched, not tested with this project's credentials. Select a currently accessible model via a configuration variable after checking quality on representative Ukrainian documents and account limits; no model identifier or price is assumed.

Alternative: another hosted model API behind the same small `AIProvider` interface, with equivalent structured output capability. Switching can reduce access/account friction but is not a task for this week unless the first provider is unavailable. Self-hosting a model adds deployment work without advancing the assignment.

## End-to-end chat flow

1. Auth middleware identifies the user. Backend creates/loads a conversation and saves the user message with a client-generated request ID unique within that user.
2. Backend retrieves that user's confirmed profile, selected case revision, unresolved questions, approved program rule version and a bounded number of source excerpts. It does not send unrelated users' data or the whole document store.
3. Model returns a typed result: answer, candidate facts, questions, cited evidence IDs, and proposed next action. Extractions include explicit `unknown` values. Server verifies schemas, IDs, field types and ownership.
4. Read operations run only through named, narrow application services. A model output cannot supply SQL, arbitrary network addresses, a user ID override or a storage path.
5. UI presents candidate changes with the old value, proposed value and source. Only an explicit user confirmation calls the normal authenticated mutation endpoint. Model-generated confirmation text is not consent.
6. Backend commits an immutable revision, recalculates affected totals/checks and saves the resulting assistant message. On next login, the state comes from the database, not the model provider's chat memory.

Use a server-generated conversation summary only to reduce tokens. It never replaces confirmed profile/case fields, source evidence, unresolved issues or immutable revisions.

## Minimal contracts

| Operation | Input | Backend result and guard |
|---|---|---|
| `get_case_context` | case ID | Owner-authorized confirmed revision and sources; not arbitrary case access |
| `find_grants` | business need and known criteria | Rule-engine checks returning eligible/ineligible/unknown with reasons and source IDs |
| `propose_fact_patch` | typed patch, base revision, evidence IDs | Pending proposal; cannot mutate confirmed facts |
| `confirm_fact_patch` | proposal ID, expected revision | User action, revalidated ownership; transaction fails on stale revision |
| `calculate_budget` | confirmed budget revision | Deterministic totals and rule violations; no model arithmetic |
| `draft_section` | case revision, template section | Draft with fact/evidence references and unresolved fields |
| `export_case` | case revision, template version | Bounded operation ID/result; export is tied to the exact input revision |

The normal app endpoints own mutations; exposing mutating tools to the model is unnecessary initially. Even schema-valid model output can be factually wrong and needs domain validation.

## Persistent facts, matching and budgets

Suggested records in addition to core users/business/cases: `fact_proposals`, `case_revisions`, `documents`, `document_extractions`, `program_rule_versions`, `draft_sections`, `operations` and `exports`. Ownership flows through business/case foreign keys; the backend resolves it from authentication. Evidence is a small record `{document_id, page_or_cell, excerpt, file_hash}` or `{program_source_id, field, excerpt, checked_at}`. User-entered facts have user-confirmation provenance. An extracted confidence number is not proof.

For the small catalog use SQL predicates and approved rule JSON: applicant type, geography, allowed purpose, amount limits, co-funding, open status/deadline. Return unknown if the source or user fact is missing. Do not call an unexplained LLM match score an eligibility decision. Model explains the engine's result using the supplied rule excerpts.

Store money as integer minor units (or exact database decimal), quantity with an explicit scale, and currency per budget. Start with one currency per case. Validate nonnegative amounts, totals, grant share and own share with ordinary code and checked program rules.

Price change flow: propose the changed price and source -> user confirms against `expected_revision` -> single transaction saves revision and new totals -> mark dependent narrative sections and exports stale -> show an impact summary -> regenerate affected draft sections against the new revision -> user reviews -> create a new export. An old export remains a dated snapshot and must not appear as the latest ready package. Submitted snapshots never get overwritten.

## Document and export pipeline

Upload -> private object storage -> saved operation -> bounded extraction request -> candidate facts -> confirmation -> case revision. Validate declared and actual type, size/page count and storage ownership; use a private download endpoint or short-lived signed URL. Suggested initial accepted inputs: bounded PDFs plus JPEG/PNG supplier quotes. Set the initial size/page limits and timeout after measuring actual sample files against the selected hosting request limit. DOCX/XLSX uploads can be added only if needed for the chosen scenario; formulas in a received spreadsheet are not authoritative numbers without validation. Do not claim OCR quality without testing representative scans.

For a short PDF, direct model file input is a viable option; the documented PDF path includes extracted text and page images on vision-capable models. Text-only parsing locally is cheaper for readable PDFs and preserves page references. Use the model for semantic extraction, not attachment authenticity. Add an explicit needs-review state for unreadable, encrypted or incomplete files. Keep the original file and hash; do not replace it with a generated rendition.

Use ordinary backend templates and libraries for the final PDF/XLSX generation. The model drafts narrative values only; backend code fills approved fields and calculates numbers. Export metadata includes case revision, rule/template version, generated timestamp and unresolved issues. Verify required formats carry the same approved values. Readiness requires checked required-field/attachment completeness plus user review; unknown mandatory information blocks readiness, while a draft export remains available.

## Monitoring and email

Do not crawl every website on demand inside chat. Initial catalog is reviewed seed data plus one or two integrations proved readable early in the week. Candidate primary sources from existing discussion: official program pages and donor announcements. These pages and any EU API have not been live-tested in this lane; choosing actual adapters remains a dependency. If a source needs browser rendering or access approval, use reviewed import for it and choose another simple source for automatic polling.

Every 30–60 minutes a scheduler triggers a short protected ingestion job. Backend fetches allowlisted URLs with timeouts and response-size limits, records content hash/ETag when available, extracts candidate fields and compares them to the last seen snapshot. Source text is untrusted. The first release should send changed critical rules/dates to admin review instead of automatically treating an LLM extraction as an authoritative program rule.

Records: `sources(last_attempt_at,last_success_at,error)`, `programs`, `grant_rounds`, `source_aliases`, `source_snapshots`, `ingestion_runs`, `subscriptions`, `notification_outbox`. Program identity differs from round identity. Same announcement on two sites links to one round; deadline extension updates a round, a new call creates a new round. If dates are date-only or timezone is unspecified, store that uncertainty rather than invent an exact closing instant.

Publication of a verified new round triggers matching. A unique database constraint on `(user_id,round_id,notification_type)` prevents duplicates indefinitely. Recheck consent and round status before sending. Send a bounded digest only when there are new matches; include an authenticated management link or unguessable signed unsubscribe token. Store send status/provider ID. Never log private attachments in mail diagnostics.

Resend is one candidate mail provider. Its documented idempotency keys are retained for 24 hours, so provider idempotency supplements rather than replaces the permanent database constraint. Domain/sender setup and real recipient delivery must be verified before promising working email in the demo. No sender/domain has been provisioned here.

If Supabase is chosen by the core architecture, Cron is a documented scheduler option: SQL/function jobs or HTTP calls with run history. Cron can invoke a protected job endpoint; a publishable project key alone must not authorize privileged ingestion. Keep cron credentials in server-side secret storage. Choose exactly one scheduler in infra rather than adding overlapping host and database cron jobs. Supabase recommends short jobs; batch work should be checkpointed. Hosting availability and idle behavior need the delivery lane's final decision.

## Errors, cost and trust boundaries

### Concrete fit to the core lane's proposed stack

Align with React/Vite/TypeScript + Express/TypeScript + Supabase Auth/Postgres/private Storage, with one Docker web application on Render. Put `assistant`, `documents`, `budget`, `exports`, `grants` and `jobs` under backend service modules and validate contracts with one shared schema library. This is a recommendation, not an already-approved vendor commitment.

Baseline for this week: user-triggered operations remain synchronous within a measured safe request window. Save `(user_id, idempotency_key, input_hash, case_revision, status, started_at, finished_at, result_ref)` before invoking an external API. The UI shows processing and a clear failure if the request times out. A retry with the same key returns the saved result or the active operation; a different input with the same key is rejected. Commit the result once, only if the expected case revision still applies. Abort external work on an explicit timeout. If the server restarts, stale running operations become visibly interrupted on status read/retry; retain input and require an explicit retry rather than pretending work continues in the background. A disconnected client may find a saved completion or an interrupted operation when it returns. Provider completion after network loss may be uncertain, so cap retries and do not claim exactly-once provider execution/billing.

Conditional upgrade only after a representative supported file repeatedly exceeds that safe window, or users need guaranteed processing after closing the page: return HTTP 202 and poll an owner-authorized operation endpoint; add a small Node worker that drains Postgres jobs. Claims use `FOR UPDATE SKIP LOCKED`, random lease token, expiry/heartbeat and token-checked completion; input hashes and unique keys stop duplicate artifacts. A restart reclaims expired leases. A worker needs an available process or independent scheduled runner; on a sleeping service it cannot promise continuous progress. Decide hosting/cost then, with the owner's approval. This is a contingency, not an implementation prerequisite.

The independent scheduler for grant checks/email is separate from user-request execution and should reuse backend code. Choose one runner in infra and persist each run's status; do not overlap uncoordinated host and database cron schedules. Test a killed request/server restart, duplicate operation submit and duplicate scheduled invocation before user trials.

- Private documents and catalog text remain data in lower-trust input, never instructions in the developer prompt. No arbitrary fetch/shell/send-email tool is available to the model. Catalog ingestion has network allowlists and denies internal/private network destinations, including redirects.
- API keys, mail credentials and privileged database keys stay on backend/worker. Only user-authorized snippets/files necessary for the operation go to the AI provider. Explain this processing to testers before requesting uploads and use non-sensitive/redacted material where possible.
- Baseline operations have persisted state `running/succeeded/failed/interrupted`, attempt count, dedup key and sanitized error. A request restart can return the prior result or safely offer retry; it does not imply a background runner. If the conditional worker is added, extend this to `queued`, lease expiry and atomic claims. Use bounded retries with backoff for timeouts/429/5xx, not malformed input or authentication failures.
- A model timeout, refusal or incomplete response creates a recoverable failed request. Preserve user input; do not save partial extracted facts as confirmed. UI allows retry/manual continuation. Generation is disabled clearly if no configured API key, never represented as successful AI output.
- Rate-limit chat per account and cap input size, output tokens and tool rounds. Record aggregate usage by operation and request ID without logging full documents. Limit concurrency. No autonomous retry loop can generate unbounded paid traffic.
- Export operations check that the input revision is still current before labeling the result current. Stale completed exports are retained as snapshots; this prevents a slow generation from overwriting a later user correction.

## Must demonstrate by 19 November

Required working product path: authenticated user -> persisted profile -> explained catalog match -> one case -> one bounded upload -> confirmed extraction -> deterministic budget -> price-change consistency check -> draft/checked-template export -> return later and resume. The central useful behavior must run against real backend state, not canned screen transitions.

README scope also includes monitoring and email; implement a thin, honestly described version on a limited number of proven sources, with last-check status and one real delivery test. If these cannot be completed, explicitly mark them pending and prioritize the end-to-end workflow and actual user trials; any scope adjustment is the owner's decision.

Later: many templates, web-wide discovery, automatic publication of complex changed rules, interview rehearsal, post-award obligations, fine-tuning, embeddings at scale, multi-business consultant teams, payment integration. Payment is optional assignment bonus and should not displace real-user testing.

## Acceptance checks

1. User B cannot access user A's case/document/extraction/export by swapping an ID or object path.
2. A scanned quote with a wrong extracted price remains pending until confirmed; no invented amount is silently accepted.
3. Missing eligibility input returns unknown with a question and linked rule, not an eligible verdict.
4. Price change updates exact totals; stale narrative/export is marked; old submitted snapshot remains unchanged; concurrent edit gets a conflict.
5. PDF containing instructions to ignore rules cannot call privileged tools, change confirmed facts or leak another case.
6. Model timeout/retry and web-server restart preserve input, expose interrupted operations and do not duplicate confirmed messages, case revisions or exports. Test lease recovery additionally only if the conditional worker is implemented.
7. Same round arriving twice creates one catalog entry/one notification; extension changes deadline; closed round is withheld; unsubscribe prevents queued delivery.
8. Export is readable in a normal viewer, meets the checked template's required parts, contains current numbers in all generated formats, and visibly lists unresolved items for drafts.
9. A real new user signs in, resumes their work later, and can complete the selected scenario; observations and resulting fixes go to the report without invented metrics.

## Verified primary documentation

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): schema-constrained outputs and programmatically detectable refusals/incomplete outputs; semantic correctness still requires validation.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): application-owned tool execution workflow.
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs): PDF text/images and format-specific file processing, subject to endpoint/model support.
- [OpenAI agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety): treat untrusted data separately and constrain data flow. The recommendation here does not use Agent Builder.
- [Supabase Cron](https://supabase.com/docs/guides/cron): Postgres scheduling, HTTP/function invocation, execution history and short-job guidance.
- [Resend idempotency keys](https://resend.com/changelog/idempotency-keys): provider dedup retention of 24 hours.

## Open decisions and lesson

Owner needs to choose/accept the supported official program and the proposed hosting/AI/mail vendors before implementation/provisioning. Budget for external APIs and any always-on hosting is unapproved. Exact template, account access, source readability, deliverability and extraction quality remain unverified.

Lesson: the persistent case revision is the unit of correctness. Store it independently from chat memory and tie calculations, generated text and exports to it; otherwise the product's key price-change scenario can silently mix old and new facts.

Approvals: no implementation approvals recorded by this lane. Scope is advisory only under the owner's quoted planning request in CREW.md. Cost: no paid API requests or provisioned resources.
