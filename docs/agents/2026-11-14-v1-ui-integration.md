# V1 UI integration

- Agent: Terra, focused frontend integration.
- Date: 2026-11-14; branch `feat/test-version-preparation`; base `1b74afc`. Remote heads checked with `git ls-remote`; coordinator reports fresh fetch and no new relevant commits.
- Status: done with browser verification outstanding.
- Scope: `frontend/src/main.tsx`, `PilotProgram.tsx`, `PilotProgram.css`, `frontend/tsconfig.json`, this report. Cases editor owned separately.

The workspace tracks the last saved profile and the Cases dirty callback. Logging out requests confirmation when either has unsaved changes; browser navigation also receives the standard unsaved-changes warning. The cases view includes a pilot card based on the checked-in official source record, explicitly identifying the round as unconfirmed and the plan as a draft rather than an official application. No model calls were made.

`npx tsc -p frontend/tsconfig.json` and `npm run build` passed. Vite warned that the JS chunk exceeds 500 kB. No browser interaction test was performed. An initial attempt used the wrong working directory and made no edits; its build therefore verified only the prior state, and both checks were repeated after the changes.

Coordinator should perform integrated browser verification and update STATUS/WORKLOG; those files are outside this agent's ownership. No commit or push.
