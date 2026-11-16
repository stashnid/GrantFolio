# Grant details research and shared catalog

- Date: 2026-11-16. Actual agent: Sol, focused research/implementation delegated by coordinator.
- Branch: feat/conversation-workspace; base: 15a8346. Coordinator verified fresh remote heads and ownership before delegation. Existing changes preserved.
- Owned paths: backend/src/grant-catalog-data.ts, backend/src/grant-sources.ts, this report.
- Task: give the in-app detail pages useful sourced explanations and align chat context with those pages.

## Evidence and decisions

Opened the current official Diia service pages on 16 November 2026:

- [Start and scale](https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy): displayed stage ends 27 October 2026; therefore intake remains unconfirmed. Published limits: 500,000 start / 2,500,000 scale. The catalog does not encode old 150/250-thousand employment thresholds.
- [Processing](https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo): explicit suspension banner overrides stale stage text. FAQ distinguishes 8 million general / 16 million damaged assets; baseline 50/50 and conditional exceptions. Never present the restoration amount as universally available.
- [Gardens](https://diia.gov.ua/services/grant-na-sad): explicit suspension. Provides land, project, costs, duties and timeline. Diia says up to 70% funding; legal consolidation not successfully fetched directly. The catalog explicitly requires confirmation of the applicable contribution, rather than treating 30% own funds as an established rule.
- [Official Diia closure announcement, 23 July 2026](https://diia.gov.ua/news/vstyhnit-podaty-zaiavku-na-hranty-dlia-biznesu-do-31-lypnia/) states last old-program intake day 31 July. Archived the old veteran card and routed preparation to the new direction; no obsolete million-grant rules remain in chat.
- [Rada 616-2026](https://zakon.rada.gov.ua/laws/show/616-2026-%D0%BF): direct fetch timed out; official indexed search returned current instrument and transition clause. [Rada 738-2022](https://zakon.rada.gov.ua/laws/show/738-2022-%D0%BF) direct fetch also timed out. No claim that every current consolidated eligibility condition was reviewed.

The catalog is explanatory information, not an eligibility rules engine. Official form contents remain unverified. Draft preparation instructions are explicitly recommendations for assembling the project, not additional official document requirements. Legacy ProgramDetails fields are preserved and derived from the shared data; numeric references must not be used as hard eligibility limits. Zero indicates no verified numerical reference.

## Checks and remaining work

Coordinator runs the integrated build/test and journey checks after these files land. No cloud calls, model calls, publication or pushes performed by this agent. Current rounds, exact form mapping, program-specific job counts and unresolved co-financing conditions still require official confirmation before real submission.
