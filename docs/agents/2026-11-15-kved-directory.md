# KVED-2010 directory handoff

- Task: obtain complete official Ukrainian KVED-2010 class directory and a reproducible updater.
- Branch: `feat/conversation-workspace`; base: `15a8346`. Remote heads checked with `git ls-remote`; main was `15a8346`.
- Owned paths: `frontend/src/data/kved-2010.json`, `scripts/update-kved-directory.py`, `docs/data/kved-2010.md`, this report. Existing concurrent edits preserved.
- Source: Ukrstat index and linked section, division and group pages. Retrieval 2026-11-15 UTC: 21 sections, 88 divisions, 272 groups, 615 classes; zero crawl failures.
- Checks: unique sorted codes; official URLs and labels checked against individual pages for 23.41, 56.10, 62.01 and 47.91. Updater enforces parent membership and duplicate rejection and only replaces output after a successful complete crawl.
- Next: consume the JSON in the profile interface; no other files changed as part of this task.
