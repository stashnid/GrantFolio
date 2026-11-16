# Profile field controls

- Branch: feat/conversation-workspace; base: 15a8346.
- Role: implementation agent; owned paths: BusinessProfile.tsx, BusinessProfile.css, profile-options.ts, this report.
- Added regional selection, optional searchable suggestions, numeric, phone and URL handling, blur and submit validation, and text guidance. Native datalists retain manual entry. Existing custom regions remain selectable.
- Remote head verified by coordinator; local `git ls-remote` failed due to DNS.
- Verified four example КВЕД labels against the State Statistics Service classifier; suggestions are explicitly partial and link to the official classifier.
- Check: `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json` passed. Native datalist search behavior depends on the browser.
