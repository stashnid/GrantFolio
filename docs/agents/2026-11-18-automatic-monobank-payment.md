# Автоматичне підтвердження оплати експорту

- Автор/координатор: Codex GPT-6.2 Astra. Реалізація: Terra (`mono_backend`, `mono_checkout_ui`). Дослідження офіційних вимог: Sol (`mono_docs_research`). Незалежне read-only рев’ю: Sol (`payment_review`).
- Дата, branch, base commit: 18.11.2026, `codex/automatic-monobank-payment`, початкова база `f6a2ee0958f7958c239dfec4ee8abaabc91d184f`; перед публікацією гілку fast-forward-ом інтегровано з актуальним `origin/main` `3425198` (адміністраторська зміна збережена).
- Статус: done_with_concerns. Backend/UI реалізовані та зібрані; не production-ready і не deployed.
- Задача: автоматизувати разову оплату **5 грн** за PDF + XLSX через hosted Monobank Acquiring і відкрити експорт лише після підтвердження банку. Не робити реальних платежів/merchant API mutations, не змінювати cloud billing/secrets і не деплоїти.
- Файли: backend payment API/client/config/migration, payment guard усередині обох export queries, case deletion/CLI guard, `frontend/src/GrantApplication.tsx`, `.env.example`, цей звіт, `STATUS.md`, `DECISIONS.md`, `BACKLOG.md`, `WORKLOG.md`.

## План і хід роботи

- Перевірено стан Git, документи проєкту й свіжий `main`; створено окрему task branch.
- Виявлено, що попередній UI лише показував статичну банку та вимагав ручної email-звірки. Автоматичне зіставлення такого переказу з конкретною заявкою неможливе через цей статичний URL.
- За офіційною схемою Monobank Acquiring сервер створює інвойс на 500 копійок, зберігає ID/checkout URL, а підписаний callback відкриває експорт після зіставлення інвойсу, UUID reference, суми та валюти.
- Реалізовано одноразовий hosted invoice, callback з перевіркою ECDSA `X-Sign` на початкових байтах, публічний ключ із кешем/оновленням, owner-scoped статус/checkout і захист PDF/XLSX на рівні owner/program/payment snapshot.
- Checkout reservation використовує блокування справи; видалення справи під час потенційно платного інвойсу відхиляється HTTP 409. Зовнішні виклики Monobank не тримають DB connection.
- Кнопка статусу виконує обмежену звірку через статус інвойсу; polling читає лише локальний статус і не викликає Monobank кожні 4 секунди. Після webhook файли відкриваються автоматично.
- Виправлено callback-гонки, повторні події, порядок `modifiedDate` із точністю банківського timestamp, автоматичне відкликання після `reversed`, unavailable/ambiguous UI та перезапуск опитування після тимчасових помилок.

## Рішення й докази

- Погоджена користувачем сума для файлів — 5 грн. Оплата — за hosted acquiring invoice, не за довільний ручний переказ.
- Для успіху `finalAmount`, який API описує як необов’язковий, приймається відсутнім лише за точного `amount=500`; якщо присутній, він також має бути 500.
- Користувач раніше вказав окрему банку monobank. Acquiring зараховує оплату на merchant business account; зміна одержувача на цей рахунок не погоджена. Тому production checkout не активовано.
- При простроченому/скасованому інвойсі (expired/reversed) поточна реалізація зберігає асоціацію та просить підтримку; автоматичного повторного інвойсу й ledger спроб поки немає. Невизначений таймаут створення без отриманого ID теж вимагає reconciliation; автоматично скидати reservation небезпечно, бо це могло б створити дубль.
- Перед production потрібні: узгодити одержувача, підключити merchant acquiring і зберегти token у Secret Manager, застосувати migration 024, налаштувати публічний HTTPS callback, пройти тестовий/production сценарій та додати безпечний recovery для прострочених/ambiguous інвойсів. Wallet доступність залежить від merchant/device; тестовий режим не показує Apple Pay/Google Pay.

## Змінені файли й перевірки

- Backend: `backend/src/monobank-acquiring.ts`, `backend/src/grant-preparation-pilot.ts`, `backend/src/grant-preparation-pilot-cli.ts`, `backend/src/config.ts`, `backend/src/app.ts`, `backend/src/cases.ts`, `backend/src/grant-application-router.ts`, `backend/src/grant-financial-plan-router.ts`, `backend/src/server.ts`, `backend/migrations/024_monobank_acquiring_payments.sql`, fixture `backend/test/monobank-acquiring.test.ts`, `.env.example`.
- Frontend/docs: `frontend/src/GrantApplication.tsx`, `README.md`, `STATUS.md`, `DECISIONS.md`, `BACKLOG.md`, `WORKLOG.md`.
- `git diff --check`: PASS.
- `npm run typecheck`: PASS.
- `npm run build` звичайним loader не зміг записати тимчасовий Vite config у symlink-ований `node_modules` поза writable worktree (EPERM). Еквівалентні кроки `tsc -p backend/tsconfig.json` та `vite build --config frontend/vite.config.ts --configLoader runner`: PASS; є стандартне попередження про великий JS chunk.
- Автоматичні тести не запускались за правилами сесії. Грошові операції, тестові/production token, browser checkout і deployment не виконувались.
- Незалежний review: export authorization, checkout/delete locking, CLI confirmation під час активного checkout, key-refresh sharing і terminal UI reload були перевірені/виправлені. Залишаються recovery після expiry/ambiguous create та фактичне merchant setup; автоматично скидати невизначену reservation не можна.
- Первинні джерела: [створення інвойсу та webhook](https://monobank.ua/api-docs/acquiring/methods/ia/post--api--merchant--invoice--create), [публічний ключ webhook](https://monobank.ua/api-docs/acquiring/dev/webhooks/get--api--merchant--pubkey), [статус інвойсу](https://monobank.ua/api-docs/acquiring/methods/ia/get--api--merchant--invoice--status), [тестовий режим](https://monobank.ua/api-docs/acquiring/dev/test), [підключення еквайрингу](https://monobank.ua/knowledge-base/acquiring/signup).

## Передача

Відправити task branch/PR після свіжого remote fetch. Не merge і не deploy. Наступна технічна задача: ledger інвойс-спроб і безпечне відновлення після `expired`, ambiguous create та merchant key outage; усунути залишкові legacy confirmation race. Для production — письмово погодити merchant destination і отримати token через захищений канал/Secret Manager.
