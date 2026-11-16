# Text suggestions UI — 2026-11-16

Scope: `frontend/src/Assistant.tsx`, `frontend/src/Assistant.css`; coordinator reports base `15a8346` and fresh remote heads. Existing team changes preserved. No package installs or live model calls.

Assistant accepts optional structured suggestions and exports `FieldKey` / `DraftSuggestion`. Each suggestion opens a keyboard-accessible comparison dialog containing the captured current text and proposed text. Explicit replace/append actions pass the captured value to the parent; rejected changes show a conflict/length message and a refresh comparison action. Buttons are disabled for stale or revision-mismatched responses and when the parent disallows application. Successful application says it was moved to the draft and requires saving. Escape, focus trapping/return and mobile layout provided; text is rendered as React text.

`npm run typecheck` passed. Browser verification and integration with parent callback/server contract belong to coordinator and Cases agent. This UI does not itself persist text or decide append length.
