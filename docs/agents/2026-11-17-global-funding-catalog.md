# Глобальний каталог фінансування та автоматичне виявлення

- Координатор: Antigravity / Gemini 3.8 Flash; дослідницькі та оглядові агенти code-reviewer та security-reviewer.
- Дата: 17.11.2026; branch `feat/global-funding-catalog`; base `be024cc`. Fresh fetch origin успішний. Включає редизайн робочого простору (PR #5) та нові фічі каталогу й моніторингу.
- Статус: completed.
- Задача: масштабне розширення каталогу фінансування для українського бізнесу (зокрема підтримка жінок-підприємиць, стартапів, грантів без повернення, міжнародних та державних програм), розподіл за категоріями, автоматичний моніторинг нових грантів через EU Search API та RSS, підготовка до об'єднання гілок для деплою.
- Власність: повний комплекс змін (backend, frontend, migrations, tests, docs).

## Реалізовані та перевірені рішення

1. **Глибокий ресьорч та розширений каталог (68 програм):**
   - Додано `backend/src/expanded-funding-catalog.ts` з детальними верифікованими даними (`docs/research/2026-11-17-*.json`).
   - Підтримка жінок-підприємиць (10 програм): Women TechEU 2 EIC (€75 000 non-dilutive grant), European Prize for Women Innovators 2027 (€100k/€70k/€50k), Cartier Women's Initiative (Regional & Science Pioneer Awards, $100k/$60k/$30k), СТВОРЮЙ! від Мінекономіки/UMAEF/KSE (до $15 000 для жінок у переробці), Початок 2 (ваучери до 270 000 грн від ООН Жінки та Дія.Бізнес), Тревел-гранти та міні-гранти «Жіночі можливості в Україні», «Мрій та досягай», «Жіноча справа» від Ощадбанку.
   - Державні та єРобота програми (Власна справа, переробне підприємство, ветеранські гранти, гранти для молоді, садівництво, тепличні комплекси).
   - Міжнародні програми та інновації: Horizon Europe, EIC Accelerator, EIT Food, Seeds of Bravery, USAID, EBRD, IOM, UMAEF тощо.

2. **Категоризація та фільтрація в застосунку:**
   - 15 категорій: `erobota`, `veteran`, `production`, `agro`, `international`, `startup`, `women`, `social`, `green`, `export`, `finance`, `creative`, `digital`, `regional`, `displaced`.
   - 15 типів фінансування: `grant`, `prize`, `voucher`, `in-kind`, `recoverable-grant`, `blended`, `loan`, `equity`, `guarantee`, `leasing`, `factoring`, `insurance` тощо.
   - Повнотекстовий пошук з миттєвим оновленням результатів, фільтр тільки підтверджених відкритих наборів, детальні сторінки з умовами участі українського бізнесу та зобов'язаннями щодо повернення.

3. **Автоматичний моніторинг та виявлення нових грантів:**
   - Модулі `funding-monitor.ts`, `funding-feed.ts` та CLI `funding-monitor-cli.ts`.
   - Джерела: офіційний публічний EU Funding & Tenders API (SEDIA) за запитом `Ukraine` (до 5 сторінок по 50 конкурсів) + цільовий RSS бізнесових грантів з Громадського Простору.
   - Захищене парсування: суворий XML parser без DTD/XXE, перевірка лімітів розміру тіла (до 4 MiB), ліміт сторінок, захист від SSRF, фільтрація тільки довірених URL.
   - Збереження у PostgreSQL (міграція `015_funding_discovery.sql`): таблиці `funding_discovery_sources` та `funding_discovery_candidates`.
   - Інтеграція в сервер: щогодинний фоновий sync джерел + раз на 6 годин discovery нових конкурсів; ручний запуск через `npm run grants:discover`.
   - Захист: автоматично знайдені гранти маркуються як `needs-review` («Потребує перевірки») і не потрапляють у пряму підготовку до верифікації оператором.

## Перевірки

- Unit tests: 27/27 PASS (`backend/test/grant-catalog.test.ts`, `backend/test/grant-availability.test.ts`, `backend/test/funding-feed.test.ts`, `backend/test/funding-monitor.test.ts`).
- TypeScript check (`npm run typecheck`): PASS (без помилок компіляції backend та frontend).
- Production build (`npm run build`): PASS (Vite bundle згенеровано успішно).
- Diff check (`git diff --check`): PASS (без артефактів та зайвих пробілів).
- Безпека: перевірено стійкість до XXE, SSRF, bounded memory, advisory locks для запобігання race conditions.
