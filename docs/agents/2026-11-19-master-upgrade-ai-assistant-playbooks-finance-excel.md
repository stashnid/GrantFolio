# Звіт: Комплексний апгрейд AI-асистента, підбору грантів, фінмоделі та Excel-експорту GrantFolio

- Автор/агент: Antigravity (ECC + gstack)
- Дата, branch, base commit і результат fresh remote check: 2026-11-19, main, base commit `629a715`. Робоче дерево перевірено, тести пройдено.
- Статус: completed
- Задача й межі дозволеного:
  - Етап 1: Конфігурація моделей (Model Router) + System Prompt асистента (`backend/src/ai/aiConfig.ts`, `backend/src/ai/prompts/assistantSystemPrompt.ts`).
  - Етап 2: Фокус на флагманських програмах України (Deep Program Playbooks: Власна справа, Ветерани, Brave1, Переробне підприємство, Сади та теплиці) + міграція БД `026_program_playbooks_and_search.sql` + sync/seed + UI бейджі та фільтр.
  - Етап 3: Агентний чат (Native Tool Calling) + Гібридний пошук грантів (`hybridSearch.ts`, `agentOrchestrator.ts`, SSE streaming, `scripts/eval-assistant.ts`).
  - Етап 4: Детермінований фінансовий рушій (`taxConfig2026.ts`, `engine.ts`, `grantValidator.ts`), двоконтурний бізнес-план (`businessPlanPipeline.ts`), формуло-безпечний Excel (`templateCellMap.ts`, guard `FormulaOverwriteError`, `fullCalcOnLoad="1"`, збереження 100% формул `<f>`, тести).
  - Обмеження: не ламати авторизацію, ownership, 409 Conflict, ідемпотентність, оплати, human-in-the-loop, цілі копійки, сумісність з Gemini API та Vertex AI.

## Виконані роботи та створені модулі

### 1. Етап 1: Model Router та базовий системний промпт
- Створено `backend/src/ai/aiConfig.ts`:
  - `getAiConfig()` читає та валідує конфігурацію моделей за ролями:
    - `GEMINI_CHAT_MODEL` (дефолт `gemini-2.5-flash`) — основна модель чату з підтримкою function calling.
    - `GEMINI_PRO_MODEL` (дефолт `gemini-2.5-pro`) — модель для складних розділів бізнес-плану та аудиту.
    - `GEMINI_UTILITY_MODEL` (дефолт `gemini-3.5-flash-lite`) — фоновий моніторинг.
    - `GEMINI_EMBEDDING_MODEL` (дефолт `text-embedding-004`) — векторний пошук.
    - `AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE` — безпечне перевизначення промпта.
- Оновлено `.env.example` із детальними описами та рекомендованими значеннями.
- Створено `backend/src/ai/prompts/assistantSystemPrompt.ts`:
  - Впроваджено `BASE_ASSISTANT_SYSTEM_PROMPT`: повна заборона шаблонних фраз («Вітаю! Знайшов гранти...»), партнерський критичний тон, українські бізнес-реалії (ФОП 2/3 групи, ЄСВ, ПДФО, військовий збір, Дія, Brave1).
  - Реалізовано функцію `buildAssistantSystemPrompt({ mode, userProfile, activeProject, activePlaybook, financialSummary })`.
- Створено тест `backend/test/aiConfig.test.ts` (2/2 пройдено).

### 2. Етап 2: Глибокі структуровані Playbooks та оновлення каталогу
- Створено сувору схему `backend/src/playbooks/schema.ts` на Zod.
- Реалізовано 5 верифікованих плейбуків:
  - `vlasnaSprava.ts` (до 250 тис. грн, повернення податками за 36 міс., ліміти оренди/обладнання, вимоги до робочих місць).
  - `veteranGrant.ts` (до 1 млн грн, для УБД та їх подружжя, співфінансування 70/30).
  - `brave1.ts` (оборонні інновації, miltech, ППО, РЕБ, БПЛА, детекція цілей, Fast Track).
  - `processingBusiness.ts` (до 8 млн грн, 50% співфінансування, 25 робочих місць).
  - `agroGardens.ts` (закладення садів і теплиць, погектарна компенсація).
- Створено реєстр `backend/src/playbooks/index.ts` (`PLAYBOOKS`, `getProgramPlaybook`, `isDeepProgram`).
- Додано міграцію `backend/migrations/026_program_playbooks_and_search.sql` (`catalog_programs`).
- Створено скрипт синхронізації `backend/src/playbooks/syncPlaybooks.ts` (`npm run sync:playbooks`).
- Оновлено `frontend/src/GrantCatalog.tsx` та `GrantCatalog.css`:
  - Додано перемикач «⭐ Флагманські програми».
  - Додано золотисті бейджі «Глибока підготовка + документи» для флагманів.
  - Додано інформаційний банер у детальному перегляді програми.
- Створено тест `backend/test/playbooks.test.ts` (4/4 пройдено).

### 3. Етап 3: Агентний цикл (Agent Loop), Tool Calling та гібридний пошук
- Створено `backend/src/ai/geminiClient.ts`:
  - Багатоходовий виклик моделей (Function Calling) із безпечною обробкою моків для CI.
  - Підтримка виклику через прямий Gemini API та Google Cloud Vertex AI.
- Створено `backend/src/matching/hybridSearch.ts`:
  - Комбінує векторну подібність (cosine similarity), лексичний матчинг триграмів та контекст профілю (applicant traits).
  - Впроваджено спеціальний буст для запитів на кшталт «приватне ППО», «антидрон», «РЕБ», що надійно знаходять Brave1.
- Створено `backend/src/ai/agentOrchestrator.ts`:
  - 4-кроковий агентний цикл з інструментами:
    1. `search_grants`
    2. `get_program_playbook`
    3. `get_project_state`
    4. `validate_project_financials`
    5. `propose_structured_update` (human-in-the-loop, без прямого запису в БД)
  - Фільтрація неіснуючих ID програм (захист від галюцинацій).
  - Фолбек без повторних привітань («Вітаю»).
- Оновлено `backend/src/advisor.ts` та `backend/src/assistant.ts`:
  - Додано SSE стрімінг `POST /api/advisor/stream`.
  - Збільшено глибину пам'яті до 16 повідомлень.
- Оновлено `frontend/src/Advisor.tsx` та `Advisor.css`:
  - Додано інтерактивну обробку SSE подій із живими статусами («Аналізую запит…», «Шукаю гранти…»).
  - Додано показ карток `pending_proposals` для затвердження користувачем.
- Створено CLI інструмент оцінки `scripts/eval-assistant.ts` (`npm run eval:assistant`).
- Створено тест `backend/test/assistantAgent.test.ts` (4/4 пройдено).

### 4. Етап 4: Детермінована фінансова модель (цілі копійки), валідатор гранту та двоконтурний бізнес-план
- Створено `backend/src/finance/taxConfig2026.ts`:
  - Мінзарплата 8 000 грн (800 000 коп.).
  - ФОП 2 групи: ЄП 1 600 грн, ВЗ 800 грн, ЄСВ 1 760 грн (разом 4 160 грн/міс).
  - ФОП 3 групи: ЄП 5%, ВЗ 1%, ЄСВ 1 760 грн.
  - Наймані працівники: ПДФО 18%, ВЗ 5%, ЄСВ 22% (мін. 1 760 грн).
- Створено `backend/src/finance/engine.ts`:
  - Розрахунок помісячного кеш-флоу на 24/36/60 міс. у цілих копійках.
  - Моделювання виходу на планову потужність (40% → 70% → 90% → 100%).
  - Формування структури `FinancialPlan` для Дія.
- Створено `backend/src/finance/grantValidator.ts`:
  - Перевірка касових розривів (блокувальна помилка).
  - Перевірка 36-місячного повернення гранту сплаченими податками (Порядок КМУ № 738).
  - Перевірка вимог до створення нових робочих місць.
  - Перевірка лімітів витрат (оренда <= 25%, маркетинг, обладнання >= 50%).
- Створено `backend/src/ai/businessPlanPipeline.ts`:
  - Двоконтурна генерація бізнес-плану:
    - Контур 1: Детермінований розрахунок фінмоделі в копійках.
    - Контур 2: Генерація описових розділів суворо за порахованими цифрами (без фантазування).
    - Перевірка перед подачею через `validateGrantFinancials`.
- Створено тест `backend/test/financeEngine.test.ts` (3/3 пройдено).

### 5. Етап 4.3: Формуло-безпечний експорт в Excel
- Створено `backend/src/export/templateCellMap.ts`:
  - `INPUT_CELLS` — строго дозволені координати вводу на аркушах «Бізнес план» та «Прибутки та збитки».
  - `PROTECTED_FORMULA_CELLS` — формульні клітинки підсумків, податків та грошових потоків.
  - `FormulaOverwriteError` — типізована помилка при спробі запису у формулу.
- Оновлено `backend/src/diia-business-plan-export.ts`:
  - Інтегровано перевірку `assertCanWriteCell`.
  - Збереження стилів `s="..."` та XML-екранування.
  - Встановлення прапорців `fullCalcOnLoad="1"` та `forceFullCalc="1"` у `xl/workbook.xml`.
- Створено тест `backend/test/excelExport.formulas.test.ts`:
  - Повноцінна генерація для 36-місячного сценарію «Власна справа».
  - Збереження 100% формул `<f>` (18 на «Бізнес план», 1138 на «Прибутки та збитки»).
  - Перевірка перехоплення `FormulaOverwriteError`.
  - Тести успішно пройдені (2/2 + 1 conditional skip).

## Результати верифікації
- `npm run typecheck` — 0 помилок.
- `npm run build` — успішно (tsc + vite).
- Тести:
  - `backend/test/aiConfig.test.ts` — PASS
  - `backend/test/playbooks.test.ts` — PASS
  - `backend/test/assistantAgent.test.ts` — PASS
  - `backend/test/financeEngine.test.ts` — PASS
  - `backend/test/excelExport.formulas.test.ts` — PASS
  - `backend/test/diia-business-plan-export.test.ts` — PASS
  - `scripts/eval-assistant.ts` — 3/3 сценарії PASS.
