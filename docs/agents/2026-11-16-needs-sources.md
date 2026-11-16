# Needs sources: independent review, 2026-11-16

Role: Sol researcher; report only. Branch feat/conversation-workspace; base 15a8346226f8071181f3479c1de8fa4375477f99. Fresh ls-remote failed DNS; independent remote verification incomplete. Existing dirty changes preserved. Desktop repo write denied by inherited sandbox; staged report for coordinator transfer.

## Findings (official sources checked 2026-11-16)

- [Diia update](https://diia.gov.ua/news/vlasna-sprava-zbilshyly-hranty-na-start-i-masshtabuvannia-biznesu) explicitly includes commercial/production transport. Ask vehicle business purpose; rejecting all auto is incorrect. Personal purchase is not evidence of eligible business use; body style alone is insufficient. Exact personal-car statutory wording remains unverified because Rada retrieval failed. Same update distinguishes base startup (no general job creation obligation) from scaling (at least one job). Current catalog summary/obligations overgeneralize jobs: qualify by direction/contract. Maxima 500,000 UAH startup and 2.5 million scaling agree, but are not entitlements.
- [Diia service](https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy) still states deadline 27 October 2026, already past. Keep unconfirmed; application button does not prove open intake. Online application, official business-plan PDF, signature and bank selection are required. Generic draft is not verified official form.
- [Commission study abroad](https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/studying-abroad): no central student application; start with home university international/Erasmus office. Participating institution enrollment and degree relevance matter. Travel/living contribution varies. Learning and participant grant agreements follow institutional route. Generic card is scheme information, not an actual verified open competition.
- [Commission Mundus students](https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters): apply directly to chosen master institution. Bachelor/final-year applicants must graduate before master begins; recognized equivalent learning can qualify. Most apply October–January for next academic year, but this is not a shared deadline or proof of funded open call. Exact documents/language/deadline/scholarship availability belong to chosen master. Add graduation-before-start qualification.
- [Commission Mundus organizers](https://erasmus-plus.ec.europa.eu/de/opportunities/organisations/cooperation-among-organisations-and-institutions/erasmus-mundus-joint-masters) gives competitive individual scholarship EUR 1,400/month, maximum 24 months. Optional context only; not guaranteed for every applicant. Organizer call deadlines must not become student deadlines.

## Handoff observations

Six curated entries: own business, archived veteran predecessor, processing, gardens, study exchange, Mundus. Not 35 programs, all grants, or six open competitions. Search excludes archive and cautions about intake; UI keeps official titles alongside friendly names.

Readiness relabels education fields but still requires arbitrary itemized budget (backend/src/project-details.ts). Do not call this an official education requirement; budget should depend on actual call. Education readiness needs concrete institution/program/call, academic stage, subject, requested language evidence, funding availability and deadline. Required files must come from selected-call source; generic CV/transcript/reference lists cannot be universal obligations.

Export (backend/src/draft-export.ts) correctly says working draft, not official application, with program documents/steps and user submission. This establishes preparation/external handoff only, not formal end-to-end application: official form, complete attachment validation, language/format compliance, signature and submission evidence remain absent.

Priorities: qualify startup jobs, preserve sourced transport matching, keep scheme/intake uncertainty visible, and describe output as preparation until actual official form/call is mapped. Read AGENTS/STATUS/DECISIONS/BACKLOG/architecture and relevant code. No product edits/tests/paid calls/contact/install/publish. STATUS/WORKLOG coordinator-owned.

## SUPERSEDING SCOPE: business only, 2026-11-16

User clarification supersedes all Erasmus/education product recommendations above: student means young entrepreneur/startup founder. Scholarships and academic mobility are OUTSIDE product scope. Earlier source findings remain historical research, not a request to keep education cards.

Recommended simple catalog route: use existing Власна справа card with explanatory youth condition rather than inventing another independent youth program. Current primary sources confirm +5% for recipients aged 18–25 inclusive; no requirement to be enrolled as a student is stated. Citizenship, age18+, business purpose/plan and program restrictions apply. Startup base is 100–300 thousand UAH, capped with applicable bonuses at500 thousand; scaling base500 thousand–1.5million, capped2.5million, existing business and at least one new job. Being young alone does not justify maximum award. Do not calculate +5% on maximum500k or promise a flat youth grant. Exact approved base and contract obligations must be checked.

Sources checked2026-11-16:

- https://madeinukraine.gov.ua/vlasna-sprava — exact youth quote: “Отримувачам від 18 до 25 років включно”. Shows base versus maximum, business registration, tax/ESV obligations and restrictions. This is business funding, not tuition support.
- https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy — age bonus and age18+ applicants; intake page still shows27October2026, so current opening NOT independently proven. Do not derive from button.
- https://diia.gov.ua/news/vlasna-sprava-zbilshyly-hranty-na-start-i-masshtabuvannia-biznesu — September9 update confirms +5%, current program tiers and startup/scaling job distinction.
- https://www.kmu.gov.ua/news/bilshe-pidtrymky-dlia-biznesu-iak-zminytsia-proekt-vlasna-sprava-u-2026-rotsi — January7 article mentions old youth200k; superseded by later2.0 information, do not use as current rule.
- https://www.kmu.gov.ua/news/vlasna-sprava-onovleno-bilshe-pidtrymky-dlia-startu-rozvytku-ta-masshtabuvannia-biznesu — May7 transition announcement says then-current version lasted untilAugust1; supports historical-rule caution.
- https://usf.com.ua/programs/startup-edge — DeepTech/GreenTech/EdTech startup grant, preseed up toEUR20,000/seed up toEUR40,000. Exact status quote: “Готуйтеся — незабаром відкриття прийому заявок”. Next-call notification is not an open funded application. Full legal eligibility and current deadline not established from overview; do not add as active or route generic café/student request there.
- https://usf.com.ua/student-startup-fund-povertayetsya — datedAugust10,2026, student founder12-week MVP/mentoring/DemoDay program; registration deadlineAugust31. Historical closed intake, potential financing is not a guaranteed cash grant. Not recommended as current catalog grant.

Intake evidence conflict: official ministry business digest search https://mininfra.gov.ua/storage/app/sites/1/uploaded-files/katalog-biznes-listopad.pdf mentionsDecember15,2026, while live Diia service still showsOctober27. Digest was not independently reviewed in full and does not establish a specific live stage. Keep unconfirmed and avoid promising closure/opening on either date until current administrator schedule verified. Existing program is enough to match young-business intent usefully without unsupported expansion.

Suggested plain follow-up: What business do you want to start, how old are you, which region, and what spending/amount do you need? Ask startup versus existing business. Student status should not force any nonbusiness route. Personal auto remains separate from commercial transport.
