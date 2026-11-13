# Незалежна перевірка локальних auth, cases і budget

- Агент: Sol (`gpt-6.1-sol`), незалежний reviewer; координатор Astra, реалізація Terra.
- Дата: 13.11.2026; branch `feat/local-auth-profile`, base `aba38d8`.
- Fresh remote check: власний `git ls-remote --heads origin` підтвердив main `bd4cef3865daf9f8e88b2a78087c668e920136a5`, research `aba38d8f519dc62e1961bb8682b42428921544be`, ECC `ddf4de561efb021cd1adffdb4f2e49d7d7abf041`. Інтеграцію upstream не виконував.
- Статус: done. Блокувальних дефектів у перевіреному локальному зрізі не виявлено.
- Межі: read-only review auth, SQL owner isolation, конфігурації emulator, команд бюджету, UI retry/conflict і runtime packaging. У власності лише цей звіт; application files не редагував.

## Перевірені правила й виправлення

Прочитано AGENTS, STATUS, DECISIONS, BACKLOG, architecture, актуальний handoff, collaboration і ECC security-review. Офіційна [Firebase документація](https://firebase.google.com/docs/emulator-suite/connect_auth) підтверджує: emulator environment дозволяє Admin SDK приймати unsigned tokens. Конфігурація backend відхиляє emulator у production до initializeApp; локальні приклади використовують demo-project. Generic рекомендацію skill про cookies не нав'язував: архітектура явно обирає Firebase SDK persistence та Bearer ID tokens.

Backend отримує UID лише з verifyIdToken. Profile та case SQL параметризовані; приватні case reads/updates містять owner_id. Чужа справа повертає 404, список іншого користувача порожній. Firebase UID зберігається TEXT. Strict schemas відхиляють невідомі поля й некоректні числа. Private responses мають no-store.

Budget command блокує owner-scoped case FOR UPDATE, звіряє idempotency request через JSONB equality, зберігає відповідь повтору. Revision update, history і command атомарні в одній транзакції. Обчислення minor units перевіряє safe integer для кожного добутку й суми. Немає model arithmetic або офіційних грантових тверджень.

Передано Terra зауваження про default Express error exposure, loopback binding, очікування listening у тесті, private caching, race tests та UI pending retry. У поточних файлах є generic JSON errors, local loopback default, awaited listening, no-store, race tests. UI зберігає idempotency key після network/5xx failure; conflict залишає draft, блокує повторне збереження до reload. Cases component keyed за UID. Створення справи недоступне до завершення першого завантаження списку.

Docker runtime копіює migrations, має migrate:prod та запускається non-root; .gitignore зберігає приватні patterns. Production image/deploy тут не запускав.

## Фактичні перевірки

- Власний `npm test`: 3/3 pass на локальних Firebase Auth emulator і PostgreSQL. Перевірено два користувачі, missing/malformed/expired/wrong-scheme token, profile field validation та owner injection, production emulator guard.
- Case integration: чужий GET/PUT 404 і порожній список; одночасний identical retry повертає однакову revision/response; повтор ключа з іншим payload дає 409; дві різні команди на однакову revision дають один 200 й один 409; дробова ціна та unsafe total дають 400; історія містить рівно revisions 1 і 2.
- Власний `npm run typecheck`: pass. `git diff --check`: pass.
- Browser сценарій не дублював; координатор повідомив про перевірку create/save/change/reload. Це окреме свідчення координатора, не власний browser test reviewer.

## Передача

Локальний auth/case/budget зріз придатний до handoff у перевірених межах. Це не підтвердження production Firebase credentials/IAM, HTTPS deployment, офіційної грантової форми, AI або відгуків користувачів. Платних дій, публікації чи комітів reviewer не виконував. STATUS/WORKLOG/BACKLOG інтегрує координатор.
