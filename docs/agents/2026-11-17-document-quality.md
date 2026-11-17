# Document quality audit

- Agent: delegated document-quality implementation; 2026-11-17; branch `feat/assistant-document-quality`, base `fe378fe92b9caeedbe9fbedb5aa8726e9b310b8f`. Coordinator verified remote heads.
- Scope: draft export, basic readiness and print content; no model calls or publication. Owned files: `backend/src/draft-export.ts`, `backend/src/project-details.ts`, `frontend/src/Cases.tsx`, `backend/test/document-quality.test.ts`, this report. Readiness response shape unchanged.

## Findings and changes

A nonempty field previously passed regardless of whether it contained useful content, and any budget item passed despite zero prices. Text and print exports did not identify the source of project data or enumerate blocks needing attention. Basic deterministic checks now flag short text, obvious placeholders, invalid budget entries, zero prices and mismatched stored totals. These checks cannot establish factual correctness, consistency of narrative claims, eligibility, or grant approval. Export identifies user-supplied data, revision, unfinished blocks and source check dates; it directs the applicant to verify current official requirements. Print output adds the same provenance and saved-version checklist when available. No predictions or official submission claims were introduced.

## Verification and handoff

Typecheck and focused tests to be recorded by coordinator. Browser print/PDF inspection is delegated separately. Coordinator owns shared status and publication.
