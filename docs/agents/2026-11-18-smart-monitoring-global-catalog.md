# Звіт: Розумний щоденний моніторинг грантів (per-program + ШІ-екстрактор) і розширення глобального каталогу до 97 програм

- Автор/агент: Координатор Antigravity + делеговані ECC-агенти (`architect`, `ECC Global Grants Catalog Engineer`, `ECC Smart Monitor Engineer`, `code-reviewer`, `security-reviewer`).
- Дата, branch, base commit і результат fresh remote check: 2026-11-18; task branch `feat/smart-monitoring-global-catalog` від `main` (`b9f15d0`); перевірка remote heads перед публікацією виконується через `git fetch origin --prune`.
- Статус: `done`.
- Задача й межі дозволеного:
  1. Проаналізувати поточний механізм підбору й моніторингу грантів та спроєктувати/реалізувати індивідуальний щоденний моніторинг кожної програми з ШІ-обробкою та детермінованою верифікацією доказів (без живих платних викликів Gemini без окремого дозволу користувача — ШІ-екстрактор вимкнено за замовчуванням до явного `SMART_MONITOR_AI_ENABLED=true`).
  2. Розширити каталог перевіреними міжнародними та українськими програмами фінансування бізнесу й стартапів без вигаданих дедлайнів, фейкових URL чи освітніх стипендій.
  3. Зберегти локальну зміну користувача в `scripts/dev-local.sh` недоторканою.
- Файли у власності; погоджені контракти:
  - `backend/src/global-funding-additions.ts` (новий)
  - `backend/src/grant-catalog-data.ts`
  - `backend/test/grant-catalog.test.ts`
  - `backend/migrations/017_smart_grant_monitoring.sql` (новий)
  - `backend/src/program-monitor-profiles.ts` (новий)
  - `backend/src/smart-monitor-verifier.ts` (новий)
  - `backend/src/smart-grant-monitor.ts` (новий)
  - `backend/src/smart-monitor-cli.ts` (новий)
  - `backend/test/smart-grant-monitor.test.ts` (новий)
  - `package.json` (скрипт `grants:smart-sync`)
  - `docs/STATUS.md`, `docs/WORKLOG.md`, `docs/agents/2026-11-18-smart-monitoring-global-catalog.md`

## План і хід роботи

1. **Хвиля 1 (паралельно)**:
   - ECC `architect` (`Monitoring & AI Pipeline Architect`) проаналізував поточні `grant-sync.ts`, `funding-monitor.ts`, `funding-feed.ts`, `grant-availability.ts`, `grant-discovery.ts` та спроєктував чотириетапний конвеєр індивідуального щоденного моніторингу: HTTPS-завантаження → SHA-256 content-hash гейт → індивідуальний профіль витягу + Gemini 3.5 Flash-Lite (JSON) → детермінована верифікація дослівних цитат-доказів + безпечне розділення автопромоції доступності та ручного рев’ю змін умов.
   - `ECC Global Grants Catalog Engineer` додав **29 верифікованих програм** (`backend/src/global-funding-additions.ts`, сумарно **97 програм** у `GRANT_CATALOG`) із офіційними URL, чесними статусами `programKind: "program"`, `intakeStatus: "unconfirmed"`, `reviewStatus: "curated"` та оновив інваріанти в `backend/test/grant-catalog.test.ts`.
2. **Хвиля 2**:
   - `ECC Smart Monitor Engineer` реалізував міграцію `017_smart_grant_monitoring.sql` (`grant_program_snapshots`, `grant_change_proposals`), 22 індивідуальні профілі (`backend/src/program-monitor-profiles.ts`), рушій моніторингу (`backend/src/smart-grant-monitor.ts`), CLI (`backend/src/smart-monitor-cli.ts`, `npm run grants:smart-sync`) і 16 юніт-тестів.
3. **Хвиля 3 (незалежний аудит і виправлення)**:
   - ECC `code-reviewer` виявив 1 CRITICAL (`handleUnmodified` не оновлював `validUntil` у `grant_source_checks` після 36 год), 3 HIGH (типографські лапки/апострофи у перевірці цитат, порожній масив `requiredDocuments: []`, `state: "unknown"` із `stateEvidenceQuote: null`), 3 MEDIUM (дублікати пропозицій при незміненому значенні, транзакція відкрита під час мережевого I/O, файл >800 рядків) та 1 LOW (дати формату `YYYY-MM-DD`).
   - ECC `security-reviewer` виявив 1 HIGH (IPv4-compatible IPv6 / NAT64 обхід у `isBlockedIpv6`) та 2 MEDIUM (regex для екранування `</untrusted_source_content>` із пробілами/атрибутами, відкрита DB-транзакція під час мережевих запитів).
   - Усі 10 зауважень виправлено за один прохід: логіку верифікації винесено в `backend/src/smart-monitor-verifier.ts` (489 рядків), `smart-grant-monitor.ts` скорочено до 764 рядків, додано 8 регресійних тестів (`24/24` тестів у `smart-grant-monitor.test.ts`).

## Рішення й докази

- **Розділення глобальних рамкових програм і підтверджених відкритих конкурсів**: 29 нових програм (Y Combinator, Techstars, 500 Global, Startup Wise Guys, MassChallenge, MIT Solve, Google for Startups Ukraine Fund & Cloud Program, AWS Activate, Microsoft Founders Hub, NVIDIA Inception, Seeds of Bravery, Eureka Eurostars, EUIPO SME Fund, EU Single Market Programme, EEN Ukraine, EIT Community Hub Ukraine, EYE/EYE4UA, Ukraine Investment Framework, EBRD ASB & Women in Business, UMAEF, MIGA SURE, U.S. DFC, UNIDO, USF, IOM, DRC, Mercy Corps UASP) додано як `programKind: "program"`, `intakeStatus: "unconfirmed"`, щоб не видавати неперевірений прийом за гарантовано відкритий конкурс.
- **Антигалюцинаційний контракт ШІ-моніторингу**: модель Gemini 3.5 Flash-Lite викликається лише при зміні SHA-256 хеша сторінки та лише за явного `SMART_MONITOR_AI_ENABLED=true`. Кожне поле має супроводжуватися дослівною цитатою (`evidenceQuote` ≥ 8 символів), наявність якої перевіряється детерміновано в коді. Зміни сум, критеріїв чи документів ніколи не перезаписують каталог автоматично, а потрапляють у `grant_change_proposals` зі статусом `pending_review`.
- **Межа перевірки**: виконано детерміновані та мок-тести без живих платних викликів Gemini, без міграції продакшн БД і без оновлення Cloud Scheduler (потребують окремого дозволу користувача).

## Змінені файли й перевірки

- `npm run typecheck` — **PASS** (0 помилок, backend + frontend).
- `npm run build` — **PASS** (`tsc` + `vite build`).
- `git diff --check -- backend package.json docs` — **PASS**.
- `npx tsx --test` (11 наборів юніт-тестів включно з `smart-grant-monitor.test.ts`, `grant-catalog.test.ts`, `grant-discovery.test.ts`, `grant-availability.test.ts`, `business-scope.test.ts`, `funding-feed.test.ts`, `email-templates.test.ts`, `profile-extractor.test.ts`, `profile-details.test.ts`, `advice-quality.test.ts`, `document-quality.test.ts`) — **74/74 PASS** (`0` помилок).
- Перевірка узгодженості: `97` програм у `GRANT_CATALOG`, `22/22` `PROGRAM_MONITOR_PROFILES` мають відповідний `programId` у каталозі, `0` дублікатів ID, `0` ID із префіксом `erasmus-`.
- Не виконано в цій задачі: живий запуск `grants:smart-sync` із `SMART_MONITOR_AI_ENABLED=true`, застосування міграції `017` у Cloud SQL, створення/оновлення щоденного Cloud Scheduler завдання (потребують явного погодження користувача щодо витрат/деплою).

## Передача

- Оновлено `docs/STATUS.md` і `docs/WORKLOG.md`.
- Наступний крок після погодження користувача:
  1. Застосувати міграцію `017_smart_grant_monitoring.sql` і прогнати `npm run grants:smart-sync` у dry-run (`SMART_MONITOR_AI_ENABLED=false`) та на 2–3 пілотних програмах із `SMART_MONITOR_AI_ENABLED=true`.
  2. Налаштувати щоденний Cloud Run Job + Cloud Scheduler (`0 2 * * *` UTC = 04:00 за Києвом) і додати простий UI/ендпоінт перегляду черги `grant_change_proposals` (`pending_review`).
