# Chat history and readability — 2026-11-16

Owned `frontend/src/Advisor.tsx`, `Advisor.css`, `Assistant.tsx`, `Assistant.css`; coordinator verified remote heads and branch base `15a8346`. Existing team changes preserved.

Replaced the conversation select with a searchable history, active state, new conversation action, and draft indicators. Local unsent conversations use the draft's first words as a title. Desktop history portals into the coordinator's `#advisor-history-slot` inside the main sidebar, with an internal fallback if absent; mobile uses a drawer with Escape, focus containment and focus return. Existing session recovery and retry flow were retained. Improved reply typography, semantic headings and ordered lists while keeping text rendered safely by React. Suggestion preview remains intact.

Verification: `npm run typecheck`, `npm run build`, and advisor-session tests 2/2 passed. Browser, mobile and shared-sidebar integration checks remain coordinator-owned; no live generation.

## New-goal prefill correction

`Advisor` accepts optional `prefillConversationId`. Once the current conversation is ready and no send is in progress, a prefilled goal first switches to that conversation (preserving the previous draft), then fills the composer and clears the prefill request. It does not send automatically. The coordinator owns generation/passing of the new UUID and browser verification.
