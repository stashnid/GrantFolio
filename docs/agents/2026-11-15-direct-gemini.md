# Звіт: Прямий серверний адаптер Gemini для продуктового асистента GrantFolio

- Автор/агент: Terra / Codex Agent
- Дата, branch, base commit і результат fresh remote check: 2026-11-15, `feat/test-version-preparation`, `94acc4b`, fresh remote verification complete.
- Статус: done
- Задача й межі дозволеного: Реалізувати опціональний прямий серверний адаптер Gemini (`backend/src/gemini.ts`), тести (`backend/test/gemini.test.ts`), підключення в `backend/src/cases.ts`, поля в `.env.example`, та звіт у `docs/agents/2026-11-15-direct-gemini.md`. OmniRoute та шлюзи повністю видалені та не використовуються. Повні і вільні квоти прототипу без живих викликів або білінгу під час тестування (використано stub fetch для тестів).
- Файли у власності; погоджені контракти: `backend/src/gemini.ts`, `backend/test/gemini.test.ts`, `backend/src/cases.ts`, `.env.example`, `docs/agents/2026-11-15-direct-gemini.md`. Офіційний контракт REST `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

## План і хід роботи

1. Перевірено локальний статус гілки та вимоги до прямого серверного адаптера Gemini.
2. Створено `backend/src/gemini.ts` з підтримкою `configuredGeminiResponder()`, системним промптом українською мовою для бізнес/грант асистента, передачею `savedCase`, `question`, `grantSourceContext`, обміном через REST API Gemini (`x-goog-api-key`, `generationConfig.maxOutputTokens: 1200`, перевіркою `finishReason`, обмеженням розміру відповіді `<=64KiB` та довжини тексту `<=12000chars`, перенаправленнями `redirect: "error"`, та передачею `AbortSignal`).
3. Оновлено `.env.example` додаванням опціональних серверних змінних `GEMINI_API_KEY` та `GEMINI_MODEL=gemini-3.5-flash-lite`.
4. Підключено адаптер в `backend/src/cases.ts` через `assistantRouter(db, configuredGeminiResponder())`.
5. Створено ізольовані Node-тести у `backend/test/gemini.test.ts` (невизначений або невалідний провайдер, точний POST заголовок/тіло та включення бюджету/історії/джерел, відмова/транкейтка/пустий/не-200 статус, надмірне тіло, передача abort signal з використанням stub fetch).
6. Виконано перевірку типізації (`npm run typecheck`).

## Рішення й докази

- Використано прямий REST API Gemini (`v1beta/models/{model}:generateContent`) замість будь-яких сторонніх шлюзів (OmniRoute повністю вилучено).
- Якщо `GEMINI_API_KEY` відсутній або модель не відповідає дозволеній (`gemini-3.5-flash-lite`), `configuredGeminiResponder()` повертає `undefined`, що викликає існуючу поведінку `assistantRouter` (повернення статусу 503 `assistant_unavailable`).
- Реальна якість моделі та статус безкоштовного рівня не доведені лише стаб-тестами; живі виклики не виконувалися згідно з обмеженнями прототипу та відсутністю авторизації платних дій.

## Змінені файли й перевірки

- `backend/src/gemini.ts` (новий)
- `backend/test/gemini.test.ts` (новий)
- `backend/src/cases.ts` (оновлено wiring)
- `.env.example` (додано конфігурацію Gemini)
- `docs/agents/2026-11-15-direct-gemini.md` (цей звіт)
- Перевірки: `npm run typecheck` успішно пройдено.

## Передача

- Адаптер повністю готовий та інтегрований у `casesRouter`.
- Залишається опціональне заповнення `GEMINI_API_KEY` при запуску на реальному середовищі з вільними квотами.


Уточнення координатора: реалізацію зміцнено потоковим лімітом, strict STOP і фільтром thought parts; реальний browser-виклик пройшов. Код написаний зовнішнім Codex через OmniRoute/Gemini й перевірений координатором. Остаточні докази в prototype-integration.md.
