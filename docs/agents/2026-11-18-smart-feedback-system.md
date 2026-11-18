# Звіт: Система відгуків, оцінювання, доставки розробникам і розумного аналізу

- Автор/агент: Координатор (Antigravity / Gemini) + делеговані агенти (`code-explorer`, `architect`, `planner`, 3 білдери, `code-reviewer`, `react-reviewer`, `security-reviewer`)
- Дата, branch, base commit і результат fresh remote check: 2026-11-18, `feat/smart-feedback-system`, base `c59239d` (`origin/main` синхронізовано через `git fetch --all --prune`)
- Статус: done
- Задача й межі дозволеного: Реалізація системи збору відгуків та оцінювання для тестувальників усередині застосунку, надійної доставки сповіщень розробникам (Email via Resend/Gmail, опційні HTTPS Webhook та Telegram Bot), адмін-панелі тріажу з фіксацією змін під коміти/PR, двошарового розумного аналізу (детерміновані метрики Шар 1 + заземлений Gemini 3.5 Flash-Lite з перевіркою дослівних цитат Шар 2) та 1-клік експорту фактичного звіту (Markdown/CSV/JSON) прямо під критерій 3 та бонус [assignment.md](file:///Users/stashnidyk/Desktop/GrantFolio/docs/assignment.md) до 19.11.2026.
- Файли у власності; погоджені контракти:
  - Backend: `backend/migrations/023_smart_feedback_system.sql`, `backend/src/feedback.ts`, `backend/src/feedback-notifier.ts`, `backend/src/feedback-ai.ts`, `backend/src/feedback-report.ts`, `backend/src/feedback-admin.ts`, `backend/src/email-templates.ts`, `backend/src/app.ts`, `backend/test/feedback*.test.ts`
  - Frontend: `frontend/src/FeedbackModal.tsx/.css`, `frontend/src/FeedbackPromptBanner.tsx/.css`, `frontend/src/FeedbackAdminDrawer.tsx/.css`, `frontend/src/App.tsx`, `frontend/src/Advisor.tsx`, `frontend/src/Cases.tsx`, `frontend/src/workspace.css`
  - Docs: `docs/agents/2026-11-18-smart-feedback-system.md`, `docs/STATUS.md`, `docs/WORKLOG.md`

## План і хід роботи

1. **Інвентаризація та планування:**
   - Делеговано `code-explorer`, `architect` та `planner` дослідження наявних блоків (`006_user_feedback.sql`, `email-login-code.ts`, `monitor-admin.ts`, `gemini.ts`, `ConfirmDialog.tsx`).
   - Створено й затверджено артефакт `feedback-system-plan.md` з двошаровою моделлю аналізу (правило D06), 2-кроковою формою та адмін-тріажем.
2. **Паралельна реалізація (3 білдери):**
   - **Agent A (Бекенд і доставка):**
     - Міграція `023_smart_feedback_system.sql`: адитивне розширення `user_feedback` (`rating_ux`, `rating_usefulness`, `rating_ai`, `task_outcome`, `would_recommend`, `willingness_to_pay`, `suggested_price_uah`, `category_tags`, `tester_role`, `contact_consent`, `contact_info`, `context_snapshot`, `status`, `priority`, `resolution_note`, `resolved_commit_or_pr`, `notify_status`, `content_hash`, `ai_triage`), створення `feedback_change_links`, `feedback_batch_syntheses` та 5 оптимізованих індексів.
     - `backend/src/feedback-notifier.ts`: асинхронна доставка сповіщень розробникам через Resend API / Gmail OAuth2 fallback (`renderFeedbackNotificationEmail`), захист від CRLF-ін’єкцій, екранування HTML, опційна відправка у HTTPS Webhook (SSRF-захист, блокування loopback/private IP) та Telegram Bot (без витоку токена в логи/помилки).
     - `backend/src/feedback.ts`: розширено `POST /api/feedback` з ідемпотентністю (200 OK на точний повтор, 409 на конфлікт UUID), лімітом 10 запитів / 10 хв, автоматичним очищенням `contact_info` за відсутності згоди, розрахунком `content_hash` та неблокуючим викликом сповіщення. Додано `PATCH /api/feedback/:id` (owner-scoped) для доповнення Кроку 2.
   - **Agent B (Розумна аналітика та адмін-API):**
     - `backend/src/feedback-ai.ts`: opt-in гейт `SMART_FEEDBACK_AI_ENABLED=true`, pinned `gemini-3.5-flash-lite`, захист від prompt-injection (`sanitizeUntrustedFeedbackText`), ліміт відповіді 64 KiB, одиночний тріаж з кешуванням по SHA-256 та пакетний кластерний синтез із детермінованим `verifyBatchSynthesis` (відкидає будь-які галюциновані цитати або вигадані ID, вимагає точного збігу підрядка ≥ 8 символів).
     - `backend/src/feedback-report.ts`: детерміновані метрики (CSAT, NPS-проксі, Task Completion Rate, розріз готовності платити, середня ціна, звірка з `donations` та `grant_preparation_pilot`), генерація чистого Markdown під критерій 3 та безпечного CSV з UTF-8 BOM і нейтралізацією формульних ін’єкцій (`=`, `+`, `-`, `@`, `\t`, `\r` префіксуються `'`).
     - `backend/src/feedback-admin.ts`: захищений маршрутизатор `isMonitorAdmin` (`GET /status`, `GET /metrics`, `GET /`, `PATCH /:id/triage`, `POST /:id/change-links`, `POST /:id/notify`, `POST /:id/ai-triage`, `POST /analyze`, `GET /export`).
   - **Agent C (Фронтенд):**
     - `frontend/src/FeedbackModal.tsx` + `FeedbackModal.css`: 2-крокова модалка (WCAG 2.2 AA, портал `z-index: 1100`, focus trap, 44×44px hit targets, адаптивні питання під розділ і оцінку 1–3★ vs 4–5★, виміри стабільності/UX/користі/ШІ, готовність платити, справедлива сума в грн, згода на зв’язок).
     - `frontend/src/FeedbackPromptBanner.tsx` + `FeedbackPromptBanner.css`: компактний банер із капом 1 показ на milestone (`localStorage`) і 2-годинним кулдауном після відправки.
     - `frontend/src/FeedbackAdminDrawer.tsx` + `FeedbackAdminDrawer.css`: адмін-панель (доступ лише авторизованим адмінам, 3 вкладки: «Огляд і ШІ-аналіз» з KPI-картками й верифікованими цитатами, «Усі відгуки» з фільтрами, зміною статусу, change-links і повтором email, «Експорт для звіту» з 1-клік копіюванням Markdown/CSV).
3. **Інтеграція та виправлення за результатами рев’ю:**
   - Підключено `/api/admin/feedback` до `privateRoutes` у `backend/src/app.ts`.
   - Вмонтовано кнопку «Залишити відгук» у бічну навігацію та мобільне меню `App.tsx`, виклик «Оцінити сервіс» у верхній панелі та посилання для незареєстрованих «Виникли складнощі зі входом? Повідомити команду ↗».
   - Додано показ `FeedbackPromptBanner` на останньому повідомленні з рекомендаціями в `Advisor.tsx` та після експорту чернетки в `Cases.tsx`.
   - **Усунуто всі зауваження `react-reviewer`:**
     - Виправлено критичний баг втрати фокуса під час введення тексту в `FeedbackModal.tsx` (відокремлено ефект відкриття/скролу від Escape-хендлера через `requestCloseRef`, скидання форми обмежено переходом `wasOpenRef`).
     - Збережено `changeLinks: row.changeLinks` у `handleSaveTriage` в `FeedbackAdminDrawer.tsx`.
     - Виконано `React.lazy()` code-splitting для `FeedbackModal` і `FeedbackAdminDrawer` у `App.tsx` (вага головного чанка впала на 103,5 кБ).
     - Обмежено банер у `Advisor.tsx` лише останнім повідомленням (`index === messages.length - 1`).
     - Вирівняно мобільну сітку `.app-sidebar` (`grid-column: 1 / -1`) та додано 44px touch targets для кнопок і пігулок фільтрів на мобільних екранах.
     - Додано `backdropMouseDownRef` для захисту від випадкового закриття адмін-панелі під час виділення тексту.
   - **Усунуто зауваження `code-reviewer`:**
     - Додано `LIMIT 2000` у `loadAllFeedbackItems`.
     - Забезпечено оновлення `businessName` та `region` у відповіді `PATCH /:id/triage`.
     - Додано скасування потоку `response.body?.cancel()` у разі перевищення розміру відповіді ШІ в `readBoundedBody`.

## Рішення й докази

- **Незмінність існуючого контракту (KISS/YAGNI):** `POST /api/feedback` повністю зберіг попередній формат відповіді (200 OK з об’єктом `feedback`), що підтверджено проходженням оригінального тесту `feedback.test.ts`.
- **Двошаровий аналіз (D06):** Шар 1 надає 100% точні математичні метрики з бази даних (CSAT, NPS, Task Completion, реальні донати monobank); Шар 2 запускається за явної потреби (`SMART_FEEDBACK_AI_ENABLED=true`) та гарантує нуль вигаданих цитат завдяки програмному верифікатору `verifyBatchSynthesis`.
- **Безпека й приватність:** fail-closed адмін-доступ, відсутність native `<select>` (100% `CustomSelect`), відсутність `window.confirm` (100% `useConfirm`), нейтралізація формул у CSV, повний захист від XSS та CRLF.

## Змінені файли й перевірки

- `backend/migrations/023_smart_feedback_system.sql`
- `backend/src/app.ts`
- `backend/src/email-templates.ts`
- `backend/src/feedback.ts`
- `backend/src/feedback-notifier.ts`
- `backend/src/feedback-ai.ts`
- `backend/src/feedback-report.ts`
- `backend/src/feedback-admin.ts`
- `backend/test/feedback.test.ts`
- `backend/test/feedback-notifier.test.ts`
- `backend/test/feedback-ai.test.ts`
- `backend/test/feedback-admin.test.ts`
- `frontend/src/FeedbackModal.tsx`
- `frontend/src/FeedbackModal.css`
- `frontend/src/FeedbackPromptBanner.tsx`
- `frontend/src/FeedbackPromptBanner.css`
- `frontend/src/FeedbackAdminDrawer.tsx`
- `frontend/src/FeedbackAdminDrawer.css`
- `frontend/src/App.tsx`
- `frontend/src/Advisor.tsx`
- `frontend/src/Cases.tsx`
- `frontend/src/workspace.css`
- `docs/agents/2026-11-18-smart-feedback-system.md`
- `docs/STATUS.md`
- `docs/WORKLOG.md`

### Результати автоматизованих перевірок:
- `npm run migrate`: **Applied 023_smart_feedback_system.sql** — PASS.
- `node --env-file-if-exists=.env --import tsx --test backend/test/feedback*.test.ts`: **19/19 tests passed** (0 failed) — PASS.
- `npx tsx --test backend/test/email-templates.test.ts`: **6/6 passed** — PASS.
- `npm run typecheck`: **0 errors** (backend + frontend) — PASS.
- `npm run build`: **0 errors**, Vite build production bundle — PASS.
- `git diff --check`: **0 whitespace/format errors** — PASS.
- Рев’ю агентів:
  - `security-reviewer`: **APPROVE** (0 Critical, 0 High, 0 Medium).
  - `code-reviewer`: **APPROVE** (0 Critical, 0 High).
  - `react-reviewer`: **APPROVE** (усі 8 зауважень усунено).

## Передача

Система повністю готова до живого збору відгуків реальних підприємців і тестувальників перед фінальним демо 19.11.2026. Залишилось закомітити зміни та опублікувати гілку `feat/smart-feedback-system` на GitHub.
