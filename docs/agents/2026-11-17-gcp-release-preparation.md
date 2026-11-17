# Підготовка розгортання GrantFolio

- Codex. Гілка `codex/gcp-release-preparation` від `438553d`, звірено із GitHub `main`. Локальні незатрекані файли збережено.
- Власність цієї зміни охоплює `frontend/src/App.tsx`, `frontend/README.md`, `backend/src/config.ts`, `backend/src/server.ts`, `infra/README.md`, STATUS, WORKLOG і цей звіт. Контракт приватного API використовує Firebase ID token.

## Результати 17.11.2026

- Користувач обрав окремий новий Google Cloud проєкт. В обліковому записі підтверджено наявний сторонній Cloud Run сервіс. У формі створення проєкту поза організацією є лише один обов’язковий варіант Cloud Billing. Він уже має платний режим і показує активний Welcome credit для певного використання. Ресурсів і DNS-записів не створювали. Зовнішній DNS `grantfolio.pp.ua` зараз делегований паркувальним серверам.
- Додано кнопку **Продовжити через Google** у формі входу та реєстрації. `npm run typecheck`, `npm run build` і `git diff --check` пройшли. Реальний OAuth потребує налаштованого Firebase проєкту та дозволеного домену.
- Чинний код має прямий email/password без одноразового коду. До публічного релізу потрібно реалізувати й перевірити серверний OTP-крок, перевірку доступу до приватного API та доставку від погодженої пошти. Каталог поточно запускає два таймери у вебпроцесі. Для Cloud Run треба винести їх у заплановані задачі.

## Передача

Після команди продовжити відновлено авторизацію Google Cloud CLI та створено `grantfolio-pp-ua`. CLI підтвердив `billingEnabled=False`. Firebase Management API ввімкнено. REST-виклик додавання Firebase повернув 403, після чого майстер Firebase Console успішно додав Firebase без Analytics і показав план Spark. Зареєстровано GrantFolio Web та ініціалізовано Firebase Authentication. Єдина доступна адреса підтримки для провайдера Google належить оператору. Провайдер не збережено, адресу для публічного використання слід погодити. Cloud Run, Cloud SQL, Load Balancer і DNS залишаються етапами розгортання.

Додано `CATALOG_REFRESH_MODE=scheduled` для запуску синхронізації зовнішніми завданнями. Локальний режим продовжує використовувати вбудовані таймери за замовчуванням. Оновлено інструкцію для Cloud Scheduler і HTTPS. Typecheck та production build пройшли, хмарні завдання ще не запускалися. Поточний стан оновлено в STATUS і WORKLOG.

Користувач сам прив’язав білінг до `grantfolio-pp-ua`. Google Cloud CLI підтвердив `billingEnabled=True` і стан проєкту `ACTIVE`. Увімкнено й перевірено API Cloud Run, Compute Engine, Cloud SQL, Artifact Registry, Secret Manager, Cloud Scheduler і Certificate Manager. Інстанси й балансувальник ще не створено.

Після підтвердження політики Google OAuth зберіг `grantfoliomanager@gmail.com` як адресу підтримки. Роль OAuth Config Editor цього акаунта знято. IAM підтверджує власника `m.stepaniuk.pn@ucu.edu.ua`. У Firebase провайдер Google має стан Enabled, а `grantfolio.pp.ua` є в Authorized domains. Вхід через Google на розгорнутому сайті ще не перевіряли.

Користувач дозволив до $40 власних коштів для перших 30 днів. У Cloud Billing створено й перевірено бюджет сповіщень за 17.11–16.12.2026 тільки для `grantfolio-pp-ua`, з урахуванням застосованих кредитів і порогами $10, $20, $30 та $40. Бюджет надсилає сповіщення, а ресурси мають окремий життєвий цикл. Погодження покриває перші 30 днів.

Створено приватний Docker-реєстр `grantfolio` і запущено створення `grantfolio-db` у `europe-west1` з PostgreSQL 17 Enterprise, `db-f1-micro`, 10 GiB SSD і щоденними копіями. Створено службову ідентичність `grantfolio-runtime` із дозволом Cloud SQL Client і доступом до конкретного секрету підключення. Образ `linux/amd64` зібрано з `cdf2408` і конфігурації зареєстрованого Firebase Web App. Artifact Registry підтвердив `sha256:9eca9fe3ab813864cc920aee0ad21a4d6e5d6adba6dd36012d6653459a0bf1fd`. Завдання `grantfolio-migrate` розгорнуто з цього digest. Публічна перевірка чекає коду підтвердження email, TLS і налаштування домену. Після цього перевірити обидва способи входу, ізоляцію даних і навантаження 30 користувачів.

Cloud SQL завершив створення. Cloud Run execution `grantfolio-migrate-bhb7h` застосував міграції до 015. Приватна ревізія `grantfolio-web-00001-44k` повернула `{"status":"ok"}` на авторизований запит `/api/health`. Cloud Scheduler має два активні погодинні завдання `grantfolio-grant-sync` та `grantfolio-funding-monitor`.

Додано `backend/src/email-login-code.ts`, міграцію 016 і `frontend/src/EmailLoginCode.tsx`. Модуль перевіряє код перед доступом до приватного API, зберігає стан і ліміти в PostgreSQL та видає підписану cookie після використання коду. Typecheck, production build і 14 цільових тестів із локальними PostgreSQL, Firebase Emulator та підставним поштовим транспортом пройшли. Образ з `3bf6952` підтверджено в Artifact Registry як `sha256:9f7604c514645852bc19b68f43de63c2f6f5f76ce7fbbf203636e922fb39a0e7`. Хмарне виконання `grantfolio-migrate-2s8rp` із цим образом успішно застосувало міграцію 016. Вебсервіс поки використовує приватну ревізію 00001.

Після виправлення URL ручні тригери Cloud Scheduler запустили успішні виконання `grantfolio-grant-sync-8nrg6` і `grantfolio-funding-monitor-7cx86`. Для HTTPS створено `grantfolio-web-neg`, `grantfolio-web-backend` і `grantfolio-web-map`. Публічне правило пересилання та DNS ще не налаштовано.

Увімкнено Gmail API. Власник створив клієнт OAuth `GrantFolio Mail Authorization`. OAuth Audience має статус Testing, а кнопка Publish app вимагає завершити Branding. Потрібно завершити Branding, отримати згоду відправника на `gmail.send`, зберегти конфігурацію в Secret Manager, перевірити доставку, публічний HTTPS і тест 30 користувачів.
