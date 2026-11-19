# Повний апгрейд асистента за новою специфікацією

- Запит користувача: виправити сайт і продуктового агента за документом «Виправлення асистента.md» та делегувати роботу.
- Дата: 19.11.2026. Гілка: `codex/assistant-master-upgrade`; початкова база та свіжа production main: `3739621f2e30dbd86c9663cbbbcca80fd74e6650`.
- `git fetch origin` після дозволу успішний. Checkout чистий до початку. Старі гілки без новіших платежів не використовуються як база.
- Статус: in_progress. Production у цій задачі не змінювався. Живі/платні модельні виклики не виконувалися.
- Ролі: Terra — модельна конфігурація/адаптер; Sol — офіційні джерела, playbooks та незалежний review; Terra — фінанси/Excel. Координатор — інтеграція, API/UI, hybrid search, acceptance gates і спільні документи.
- Власність узгоджується поетапно: виконавці працюють у окремих checkout/гілках, спільні маршрути й контракти змінюються через координатора. Локальні залежності та інструменти до Git не включаються.

## Етапи та критерії приймання

1. **Model router і промпт:** окремі chat/pro/utility/embedding ролі, full Flash за замовчуванням для чату, Pro fallback на chat, server-only override, прямий API та Vertex, новий prompt/context builder. Gate: typecheck та повний mock/local test run.
2. **Playbooks і каталог:** чотири версійовані записи з першоджерелами, typed rules і явними прогалинами; PostgreSQL knowledge/search/embedding metadata та sync; UI розрізняє глибину знань, реальні документи й прийом. Gate: schema/data/DB/sync tests та typecheck.
3. **Агентний чат:** один оркестратор для discovery/project; нативні function calls та обмежений цикл; hybrid search/embedding cache з offline fallback; останні 20 повідомлень у ролях; тільки підтверджені API-операції застосовують пропозиції; JSON-сумісність та SSE progress; окремий opt-in live eval script. Gate: tool call/retry/history/safety/proposal/owner/payment tests та UI-перевірка.
4. **Фінанси й Excel:** source/version-aware 2026 tax configuration, точні копійки, підтверджені припущення та ручні overrides; cash flow/profit/tax/grant validation; facts-first business-plan pipeline й audit; declared input/protected formula maps, cache invalidation, LibreOffice recalculation, all-sheet formula/error/total reconciliation. Gate: typecheck, build, повний test run із реальною PDF/XLSX-конвертацією.

Обсяг документа не дає дозволу вигадувати поточні грантові правила, позначати неперевірений пакет офіційним, змінювати оплату або запускати нові платні виклики. Нейтральний довідковий пошук Brave1 збережено; спеціалізована допомога з підготовки озброєнь не надається.

## Початковий аудит

Шаблонні відповіді/питання й каталожна склейка знаходяться у `backend/src/advisor.ts`; legacy prompt/adapters — у `backend/src/gemini.ts`; project chat використовує окремий `assistant.ts`, лише дві попередні відповіді. Обидва мають зійтися на один bounded agent orchestrator із реальними tools. Існують auth/OTP, SQL limiter, owner/revision checks, оплата до роботи, проєктні й анкетні ручні підтвердження — їх потрібно зберегти.

У поточному Excel вже є mapping і захист запису `<f>`, але повертається неперерахований XLSX, тоді як LibreOffice генерує PDF з копії. Поточна фінансова модель не має повного налаштовуваного податкового рушія.

Перевірка джерел виявила застарілі припущення специфікації: нова Власна справа має напрями start/scale й строк 24/36/60 місяців; окрема ветеранська програма завершила прийом. Історичні пороги не стають чинними правилами. У саду потрібен зовнішній підписаний план висадки; наявність knowledge JSON не дорівнює генерації всього комплекту. Правила й фактичні capabilities мають незалежні поля.

## Етап 1 — хід роботи

Terra опублікував `4a2c177`, інтегровано як `19eb297`: конфігурація ролей і prompt builder, direct/Vertex, utility adapters. Його 55 цільових перевірок і typecheck пройшли. Повний інтеграційний прогін виявив зайву лапку в `GEMINI_VERTEX_PROJECT` у `.env.example`, яка робила project ID невалідним; виправлено, повний gate повторюється. Це помилка конфігураційного прикладу, не причина послаблювати тести адаптера.

Повторний gate етапу 1: **273/273 tests pass, 0 skip**, включно з локальними PostgreSQL/Firebase та LibreOffice; typecheck PASS. Дозволено перехід до етапу 2.

## Межі доказів і наступний крок

Усі поточні модельні перевірки mock-only. Моделі/квоти для конкретного акаунта, якість живого діалогу, податкові винятки конкретного заявника, технічне приймання документів порталом і новий production rollout не підтверджені. Новий етап починається тільки після gate попереднього; завершення всього запиту не заявляється за одним зеленим набором тестів.

## Етап 2 — інтегровано

Sol опублікував `551cb17`, інтегровано як `90b592a`: чотири strict Zod playbooks, міграція `026_grant_program_knowledge`, атомарний ідемпотентний sync і перевірка embedding cache. UI/API показують support tier, версію/прогалини й фільтр поглибленої підготовки; вектори не відправляються публічному клієнту. Typecheck PASS; 7/7 playbook/catalog tests PASS, включно з реальною ізольованою PostgreSQL. Джерельні правила мають перевагу над застарілими числами вкладення. Етап 3 дозволено після цього gate.
