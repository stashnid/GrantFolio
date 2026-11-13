# Локальний зріз auth і профілю

- Агент: Terra, реалізація за координації Astra; 13.11.2026.
- Branch `feat/local-auth-profile`, base `aba38d8`; координатор перевірив свіжий origin/main `bd4cef3` і окрему гілку ECC `ddf4de5`.
- Статус: in_progress. Дозволено локальну реалізацію; платні ресурси не створюються.
- Власність: application/config (`backend`, `frontend`, `infra`, root package/lock, Dockerfile, `.env.example`, README, `.gitignore`, workflows) та цей звіт. Інші docs належать координатору.
- Контракт: перевірений Firebase ID token; `/api/me` GET/PUT використовує UID з токена; PostgreSQL зберігає профіль власника. Перший зріз не включає гранти або AI.

## Хід і докази

Прочитано поточні рішення, план, handoff і ECC backend/frontend/security. Node 24 підтримується як LTS; Vite підтримує актуальний Node. Firebase документує, що Admin SDK приймає unsigned emulator tokens за `FIREBASE_AUTH_EMULATOR_HOST`; тому emulator дозволений лише в явному локальному режимі.

## Реалізація і перевірки

13.11: створено TypeScript Express API, Firebase Admin token verification, PostgreSQL migration і owner-scoped профіль, React/Vite екран реєстрації/входу та профілю, локальний Compose, production image й інструкції. Auth emulator явно дозволено лише поза production. Публічний web не містить worker чи grant/AI функцій. `.dockerignore` виключає локальні секрети. Контейнер містить SQL migration та окрему команду `npm run migrate:prod`.

Перевірено: `npm run typecheck`, `npm run build`; build попереджає про chunk >500 kB. `npm audit` після оновлень і pinned gRPC override: 0 vulnerabilities. `docker compose up -d --build` спершу не запустив Postgres через зайнятий 5432; перенесено локальний host port на 55432 і повторно запущено. `npm run migrate` успішний. `npm test`: 2 тести пройшли з реальними Auth Emulator і PostgreSQL, включно з двома користувачами, ізоляцією, відхиленням owner поля, неправильним/простроченим токеном, некоректними даними та production emulator guard. Ручна браузерна перевірка координатора ще триває. Часткові рекомендації незалежного security reviewer враховано; повний review не завершено.

## Передача

Локальні сервіси та UI запущені; production HTTPS, реальні Firebase проєкт/авторизація, deployment, відновлення пароля, перевірка email і реальні користувачі ще не перевірені/не реалізовані. Cloud ресурси не створювались. Координатор оновлює STATUS/WORKLOG та виконує фінальну перевірку. Рішення і backlog не змінено цим агентом.

Додатково: код відформатовано Prettier; повторний typecheck пройшов. `docker build -t grantfolio-local-check .` пройшов без production Firebase build arguments, тому це перевірка збирання, а не налаштований production запуск. Docker вивів загальні попередження про ARG для публічної Firebase client configuration; npm dependency audit під час image build показав 0 vulnerabilities.

Браузерна перевірка виявила, що порт 8080 зайнятий іншим Docker/nginx застосунком; dev proxy звертався до нього. Для локального API вибрано 18080 і proxy 127.0.0.1:18080; повторна перевірка браузера триває.

Координатор повторно перевірив у браузері: реєстрація, збереження профілю, reload, вихід і повторний вхід зі збереженим українським профілем пройшли після перенесення API на порт 18080. Node watch замінено на tsx watch через повторні перезапуски. Статус: done_with_concerns — production не розгорнуто; незалежний security review частковий.
