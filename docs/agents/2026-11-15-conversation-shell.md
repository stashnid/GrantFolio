# Conversation workspace shell

- Date: 2026-11-15
- Role: implementation agent, GPT-6 (actual model as provided by the session)
- Branch: `feat/conversation-workspace`; base: `15a8346226f8071181f3479c1de8fa4375477f99`
- Owned paths: `frontend/src/main.tsx`, `frontend/src/Cases.tsx`, `frontend/src/workspace.css`, this report.
- Remote: coordinator confirmed current remote head at the base; this agent's independent `git ls-remote` attempt failed DNS resolution.

The authenticated shell now presents assistant/projects as the primary destination. A compact project selector and disclosed creation form replace the persistent list and creation form. Existing projects open in the assistant, and the first project opens after the list loads. The project context rail shows the saved program, budget, version and readiness with links to editing and export. Existing editor, save/retry, conflict, print and export paths remain in place. The assistant stays mounted while navigating the project tabs so its local conversation is retained. The rail moves below the main content on narrow screens.

Checks: `npx tsc --noEmit -p frontend/tsconfig.json` passed after the changes. Browser and responsive visual checks were not performed by this agent.
