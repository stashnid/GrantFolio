# Автоматичне виявлення конкурсів фінансування

- Агент: international_research, дочірній агент координатора; модель успадкована, без незалежного model override.
- Дата: 17.11.2026. Branch `feat/global-funding-catalog`, base `be024cc`; координатор виконав fresh remote fetch перед розподілом. Дослідження та реалізація розподілені користувачем явно.
- Статус: done_with_concerns — локальна реалізація і live smoke перевірені; production scheduler не розгортався.
- Власність: `backend/src/funding-monitor.ts`, `backend/src/funding-monitor-cli.ts`, `backend/migrations/015_funding_discovery.sql`, `backend/test/funding-monitor.test.ts`, цей звіт. Координатор інтегрує server/package та тип каталогу; інший агент відповідає за `funding-feed.ts`.

## Межі й поведінка

EU Funding & Tenders Search API (`api.tech.ec.europa.eu/search-api/prod/rest/search`, публічний `SEDIA`) працює через POST multipart, query — JSON Blob, не текстове form field. Фільтри type 1, planned/open source statuses, language en; text `Ukraine`. Збираємо максимум 5 сторінок по 50, явно показуємо truncated. Пошук за згадкою України не гарантує повноту всіх доступних українському бізнесу конкурсів. Джерело містить також небізнесові topics; кандидати потребують ручної перевірки.

Друге джерело: business-only RSS `https://www.prostir.ua/feed/?post_type=grants` (логіка parsing/whitelist у `funding-feed.ts`). Це агрегатор, остаточні умови перевіряються в донора.

Нова знахідка має `reviewStatus: needs-review`, `intakeStatus: unconfirmed`, availability unknown та явно невідому eligibility України. Ніякий source status чи збіг слова Ukraine не переводить конкурс у перевірені/відкриті. Не виводимо суму, бюджетний ліміт, eligible costs або зобов’язання із search metadata. Після невдачі старі записи та останній успішний час зберігаються; невдача не подовжує актуальність старого доказу. Закінчення дедлайну не робить запис придатним.

Збереження у PostgreSQL: `funding_discovery_candidates` за source+external ID, `funding_discovery_sources` для видимої діагностики. Знайдені дані після hydrate приєднуються до спільного GRANT_CATALOG (API/AI використовують один масив). Повторний запуск стабільний; curated official topic URL та approved dynamic ID не перезаписуються. Зовнішні назви/URL/тип metadata перевіряються, FAQ/інші мови/невідомі URL відхиляються. Дозволені лише HTTPS topic URLs `ec.europa.eu`; мережевий endpoint фіксований, redirect:error, 4 MiB на сторінку, timeout 10 s. PostgreSQL advisory transaction locks координують кілька процесів; невдачу повторює наступний цикл.

## Запуск

Після `npm run migrate`:

- `node --env-file-if-exists=.env --import tsx backend/src/funding-monitor-cli.ts` — один цикл, JSON результат і окремі source statuses; exit code 1 при source failure.
- Координатор додає npm команду та integration в наявний refresh.
- Server interval — кожні 6 годин і при старті; це in-process schedule, працює лише коли процес живий. Cloud Scheduler/production deployment не налаштовано цією зміною.

Не потрібні платний API-ключ або модель. Публічний SEDIA — не секрет. Не обіцяємо повний світовий індекс чи автоматичне підтвердження умов.

## Перевірки

Фінальний зріз: 11/11 mock unit tests PASS та backend TypeScript check PASS. Перевірено strict shape, мови/FAQ/host/identifier, Blob і query-фільтри, дедуплікацію/repeat/hydrate, needs-review, expiry, помилки й last success, atomic fetch-all-before-write, pagination cap/truncated, media/body/redirect guards, locks/concurrent refresh, збереження curated. PostgreSQL SELECT 1 PASS; 015 застосовано координатором. Два реальні запуски CLI PASS: checked2 failed0 skipped0 discovered5 truncatedfalse. EU зберіг5 кандидатів, поточний RSS не містив business-only збігів (0) — успішне читання не означає нові знахідки. Повторний запуск зберіг ті самі стабільні ID. Перевірено незалежність помилок двох джерел, expiry, timeout за fetch що ігнорує abort, curated доданий після hydration. Незалежний агент переглянув monitor: actionable P1/P2 не виявив.

## Передача

Server/package/API status integration, загальний type/catalog і STATUS/WORKLOG — у координатора. Файли агента не commit/push окремо, за явним розподілом координатора; публікацію всього логічного change виконує координатор.
