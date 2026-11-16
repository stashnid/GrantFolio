# Conversation workspace independent UX review

- Agent/model: independent reviewer, GPT-6.1 Sol (`gpt-6.1-sol`).
- Date: 2026-11-15. Branch: `feat/conversation-workspace`. Base: `15a8346226f8071181f3479c1de8fa4375477f99` (coordinator supplied).
- Remote: coordinator reports fresh check confirmed before delegation. Independent `git ls-remote --heads origin` failed DNS resolution; own verification incomplete.
- Status: done_with_concerns (remaining items sent to implementers/coordinator).
- Ownership: only this report. Scope: data preservation, accessibility, history, keyboard and responsive behavior. No paid calls.

## Evidence and boundaries

Read AGENTS.md, STATUS, DECISIONS, BACKLOG, architecture and report template. Inspected in-progress Cases.tsx/main.tsx/workspace.css and existing Assistant.tsx. Source review is not real-user research. Coordinator's Vluchai observation covers its authenticated applications list, not a conversation screen; deeper inspection blocked by disabled Safari JavaScript. No further competitor testing claimed.

## Initial findings sent to implementation agents

1. Keep Assistant mounted between project sections: conditional mounting loses typed chat text and aborts pending responses. Shell implementation now uses hidden wrapper.
2. Correct tablist semantics: shell now uses labelled group of pressed buttons.
3. Auto-select only initially: refreshing project list must not switch active project unexpectedly. Shell guarded auto-selection.
4. Preserve scroll when prepending older history; unconditional bottom scroll defeats older-history navigation.
5. Guard Enter during IME composition; await clipboard writes before announcing success.
6. Apply prefills after case initialization so reset effect cannot erase the question.
7. Resolve missing assistant section aria-labelledby target. Shell wrapper now has aria-label.

## CSS review

`main:not(.workspace)` avoids inherited public landing grid. Later `.workspace .panel` resets base max-width 1200px and padding correctly. Fixed 230px sidebar matches workspace margin. At 900px sidebar becomes static, margin resets, context moves below conversation; at 520px select min-width resets. Inherited case-workspace padding-top 24px remains a minor spacing detail. These are static cascade checks, not browser layout measurements.

## Checks and handoff

Final Assistant source review completed against the in-progress rewrite; follow-up fixes may supersede the findings below. Responsive/browser verification remains with coordinator. No browser execution or paid AI calls performed here. STATUS/WORKLOG coordinator-owned. Initial report write was sandbox-blocked because delegated Desktop checkout differs from writable Documents checkout; escalated write explicitly scoped to assigned report.

## Assistant implementation review

Observed the rewritten Assistant.tsx/Assistant.css. Verified source guards IME Enter, awaits clipboard with visible failure, applies prefills after reset, exposes history retry, preserves saved-version warning, and blocks importing/sending while project changes are unsaved. Prompt cards fill the composer and focus its labelled textarea instead of immediately sending.

Remaining finding sent to chat implementation agent: scrolling only on loading=true leaves the appended long response below the viewport and initial persisted history positioned at its oldest loaded turn. Scroll to recent content on initial load/successful submission while preserving older-history prepend position. Existing import callback silently rejects >100 total budget rows while Assistant unconditionally reports success; sent to both agents for contract consideration.

CSS notes: message text wraps and composer scroll area uses min-height:0. The mobile chat min-height of 440px permits document scrolling on short screens; full keyboard/viewport behavior still requires browser verification. This reviewer did not execute browser or claim accessibility certification.
