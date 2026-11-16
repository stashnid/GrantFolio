# Structured business profile independent review

- Agent/model: independent reviewer, GPT-6.1 Sol (`gpt-6.1-sol`).
- Date/branch/base: 2026-11-15, `feat/conversation-workspace`, `15a8346226f8071181f3479c1de8fa4375477f99` (coordinator supplied).
- Fresh remote verification: coordinator confirms same remote main head before delegation. Earlier independent attempt failed DNS; not relying on cached refs as independent proof.
- Scope/ownership: this report only; no implementation edits. All profile fields optional; no identity-document collection or paid calls.
- Status: done, source findings corrected and re-reviewed.

## Source findings

Backend adds all fourteen requested structured fields. Legacy PUT omitting details preserves existing JSONB; explicit details replaces that object and empty object clears it. GET/PUT and assistant profile lookup derive owner_id from verified Firebase UID. Assistant excludes contactName, phone and website before responder invocation. Auth email is displayed read-only by UI and is absent from this profile snapshot.

Added integration test exercises all fourteen fields round-trip, whitespace normalization, legacy preservation, two-owner isolation, invalid fields and explicit clear. Independently ran `node --import tsx --test backend/test/assistant.test.ts`: initial sandbox run failed loopback listen EPERM; escalated rerun passed 5/5 including contact-field exclusion at responder boundary. No paid model call was involved.

UI normalizes missing details into all fourteen ordered string keys for both loaded and saved values. JSON dirty comparison includes every field and avoids false dirty state from omitted empty server details. UI always sends complete structured state, compatible with replacement semantics. Draft profile state persists across app sections. Save/retry errors have role=alert; success has role=status. Label associations and help/error descriptions exist. CSS uses minmax(0,1fr), scrollable section navigation, 900px single-column layout and 520px stacked labels; browser viewport validation remains coordinator-owned.

Concrete findings sent to UI implementer:

1. Year frontend validation only checked four digits; backend additionally enforces 1900 through current year. Frontend accepted invalid years and yielded a generic API failure.
2. Team size frontend accepted integers over 1,000,000 and allowed ten characters, while backend allows max seven and max 1,000,000. Match inline validation to backend.
3. Invalid submit switches section but retained Save focus and had no live error summary. Focus first invalid field after switching or announce an accessible error summary.
4. Validate trimmed optional strings consistently with backend trimming; whitespace-only optional year should not be rejected as a meaningful value.

## Handoff

UI corrections re-reviewed: trimmed validation, matching year/team limits, alert summary and first-invalid-field focus after section change are now present. No remaining concrete source-level backend isolation, privacy, persistence or UI validation issue identified. Integration suite execution and browser mobile/tablet checks remain with coordinator/implementation owners. This is source review, not real-user research or accessibility certification. Shared STATUS/WORKLOG updates are coordinator-owned.
