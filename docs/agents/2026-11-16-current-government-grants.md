# Current government grant intake — source audit, 2026-11-16

- Role: independent Sol research; report-only. Branch feat/conversation-workspace, base15a8346. Root independently verified fresh unchanged remote heads. No product files changed, accounts accessed, submissions, paid calls or publication.
- Status: done_with_concerns. Scope strictly business.

## Correction that changes catalog eligibility

**Власна справа has a current statutory intake window16–27November2026.** Earlier research incorrectly treated stale Diia service deadline27October as sufficient to leave intake unconfirmed. The current Ministry order22July2026№2, in force since1September2026, contains a recurring monthly calendar. Its appendix explicitly lists November1–12 and16–27, December1–15. Raw official HTML successfully fetched HTTP200 on16November2026; document status says current/in force. This is a calendar-based opening, not inference from an application button. A service outage or later suspension would override operational availability; authenticated submission was not attempted.

Primary current calendar: https://zakon.rada.gov.ua/laws/show/z1185-26

Parser anchor: final appendix heading `Кінцеві строки подання заяв на отримання гранту на започаткування або масштабування власної справи в межах календарного року`; HTML table has month, opening day, closing day. Relevant normalized cells: monthЛистопад opening01 closing12 opening16 closing27; monthГрудень opening01 closing15. Apply current calendar year and Europe/Kyiv dates; do not parse a different appendix or use article publication date as deadline.

Current service: https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy still shows27October2026. Record source conflict and prefer current normative calendar for planned window. Service confirms current tier maxima500k startup/2.5m scaling and age18–25 bonus5%; September2.0 facts are supported, unlike assumption that all later intakes were unannounced. https://madeinukraine.gov.ua/vlasna-sprava confirms base100–300k startup /500k–1.5m scaling and maximum ceilings with bonuses.

## Veterans: support continues; old independent application differs

Do not display all veteran support as ended. The previous standalone Diia grant ended its former intake31July2026 and merged into updated own-business support. Primary notice23July2026: https://diia.gov.ua/news/vstyhnit-podaty-zaiavku-na-hranty-dlia-biznesu-do-31-lypnia/ . Old standalone service URL returned404 in this check. Updated own-business route has20% uplift for subjects of veteran entrepreneurship and shares current16–27November window. Current business status must be verified; old spouse eligibility cannot be automatically transferred.

Additional genuine continuing support: https://veteranfund.com.ua/projects/20000-2/ . UVF compensates up to20,000UAH of documented already-incurred business goods purchases for qualifying veterans registered as entrepreneurs/independent professionals with veteran enterprise status. Current page requires fresh status extract, excludes future purchases/credit repayments and repeat compensation, pays subject to budget availability in queue. Stated duration is until martial law ends. This is reimbursement, not advance grant; no fixed calendar deadline stated. For a strict dated-only catalog, omit it rather than invent a date, or obtain explicit agreement to show rolling opportunities with their real endpoint. A dated obligation in a submitted claim is not an application deadline.

UVF2026 competitive programs are separate: https://veteranfund.com.ua/contests/varto-krok-vpered/ . Do not interpret past award announcements or active contracts as a new open competition. No new currently dated UVF competition was independently established here.

## Processing: exclude from open catalog now

Current primary service https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo includes explicit paused-intake warning. Its linked current2026 schedule https://diia.gov.ua/kincevi-stroki-podannya-zayav-na-otrimannya-granitiv ends with17–30October2026 and contains no November stage. The same URL with double slash has stale search cache rows through27November: normalize URLs and fetch canonical current content, do not trust cached snippets.

Ministry8October2026 notice explicitly identifies30October as last2026 application opportunity, next wave2027: https://www.me.gov.ua/News/Detail/5ee42be8-6b2e-4755-b186-132b988d23e5?lang=uk-UA&title=Nagadumo-PriiomZaiavokNaGrantiNaPererobkuTaGrantiNaVidnovlenniaTrivaDo30-Zhovtnia

Old February amendment https://zakon.rada.gov.ua/laws/show/z0255-26 included13–27November but is an amending instrument, not necessarily current consolidated calendar. Do not independently make it current against later schedule and suspension. Application should fail closed on this conflict.

## Gardens: exclude from open catalog now

Current service https://diia.gov.ua/services/grant-na-sad explicitly pauses intake. Administrator DAR notice6October2026 states pause from16October2026, last application15October inclusive, planned resumptionQ1 2027: https://www.dar.gov.ua/news-list/tymchasovo-pryzupynyayetsya-pryjom-zayav-na-granty-dlya-sadiv-i-teplycz/ . Planned quarter is not an exact application deadline or proof of reopening. Existing grants being paid do not prove new applications accepted.

## Automatic source access and raw evidence

Verified publicly retrievable UTF-8 HTML with HTTP200: Rada normative calendar, Diia service/calendar pages, DAR notice, UVF program. These are sufficient for deterministic HTML extraction; no login/browser session required for public facts. No public status API or RSS endpoint was verified; do not invent API URLs or assert feed support. RSS/news alerts alone would not establish a current deadline. DCZ /grants returned near-empty extracted HTML in web tool and needs client-runtime inspection before choosing as parser input.

Raw fetched16November2026 in /tmp (public pages, no private data):

- /tmp/grant-own-law.html (398522bytes); /tmp/grant-own-law.txt contains normalized text.
- /tmp/grant-own-service.html (113598bytes), SHA256cc1b9c9432ca40f8aaef1a605a99f535ee1a8728795f366cda6267762d46b6bc
- /tmp/grant-processing-calendar.html (85501bytes)
- /tmp/grant-processing-service.html (118274bytes), SHA2565bf5fb2ae6b8629073d1b8ad1e8b971b4ce274ca5263a48b82ba3f4e80ec7a50
- /tmp/grant-garden-service.html (119305bytes), SHA25678179a0078fd86f4d2cadf8727a80309bb1a07b7dba50d80e30f269c4fd60e52
- /tmp/grant-garden-pause.html (80611bytes), SHA256d604dab3e25c094e03e5adf55d2715d1f58cfa1daf7e045c0db8303f505e70f3
- /tmp/grant-veteran.html (194660bytes)

Reproducible parser expectations: own-business current window includes2026-11-16 and closes2026-11-27; processing explicit pause overrides past rows; garden explicit pause overrides button; UVF reimbursement has rolling endpoint and no fixed date. Preserve program identity versus call identity, source retrieval timestamp, document effective date/version, explicit suspension and deadline type. When extraction changes/errors, do not renew checkedAt or mark open. Publication dates and dates in latest-news footers are not application dates.

No product tests run for report-only research. Root owns implementation and STATUS/WORKLOG handoff. Raw artifacts remain /tmp; report copied to assigned repository path.


## BLOOM SME extension conflict — checked16November2026

Status: **official extension announcement verified; donor application deadline not independently retrievable**. Do not describe this as resolved directly against a readable donor call. Do not discard the extension merely because an older Mercy Corps page quoted30September.

Full official Poltava OVA article, published6November2026 at14:06, explicitly reports extension to30November2026, SME support17–30thousandUSD in UAH equivalent for productive fixed assets, social business model and employment for displaced/local people: https://poda.gov.ua/news/283514 . Its short link https://lnk.ua/n8yndmpmo could not be resolved: web inaccessible and raw HTTP403, no destination established.

Independent full official municipal notice, published/updated11November2026, explicitly repeats30November extension and directly points at new donor portal https://bloom.prosperglobal.org/ : https://srvk.gov.ua/ua/share-news/pg/111126365331706_n/ . It distinguishes10–49 employees (17–23thousandUSD) versus50–249 (17–30thousandUSD), social impact, productive fixed assets,11 named regions excluding unsafe/inaccessible areas. These conditions need donor verification before deterministic eligibility. Direct readable municipal source supports date; no reliance on cached snippets.

Donor continuity established from full donor page https://www.prosperglobal.org/ukraine-response : BLOOM SME range17–30thousandUSD, consortium Prosper Global/Swisscontact/R2P, UKAid funding, direct link to new BLOOM portal. Donor general page says12regions whereas specific municipal call says11: scheme geography is not call geography. Rebrand officially announced9September2026: https://www.prosperglobal.org/en-gb/press-room/releases/mercy-corps-is-now-prosper-global .

Old link https://bloom.mercycorps.org/en_GB/about/gJmqxeVR redirected in current web fetch to https://bloom.prosperglobal.org/ and returned JavaScript application shell. The old21July–30September text therefore cannot be treated as a freshly retrieved current deadline. New-domain about path and shortlink yieldedHTTP403/inaccessible on read-only raw requests. No login/submission attempted. No browser connector or installed Playwright/Puppeteer available to render dynamic call here; no installation performed.

Catalog decision depends on root's declared source policy: if official government partner announcements qualify, date30November is supported with transparent source level and donor confirmation outstanding. If only donor-hosted current deadline qualifies, keep excluded until a readable dated call/form is obtained. Do not claim closed because old30September, or donor-confirmed open because button/rootportal exists. Raw accessible sources staged /tmp/grant-bloom-ova.html, /tmp/grant-bloom-council.html, /tmp/grant-bloom-donor.html when fetch succeeded; fetch outputs identify failures. Follow-up: render public donor portal read-only, select SME stream, record actual call identifier/date, and map to OVA extension; do not submit.
