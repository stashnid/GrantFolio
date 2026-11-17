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

Створено HTTPS forwarding rule `grantfolio-https`, глобальну IPv4 `136.81.8.112` та керований сертифікат для `grantfolio.pp.ua`. Сертифікат очікує DNS. Під час переходу до параметрів домену NIC.UA повернув на сторінку входу. Користувачу передано відкриту вкладку для відновлення сесії.

Підготовано `frontend/public/privacy.html`, `frontend/public/terms.html` і спільний стиль. Додано посилання на головній сторінці. Typecheck і production build пройшли, збірка містить обидві сторінки. Google Branding зберіг URL головної сторінки, конфіденційності й умов, а також домен `grantfolio.pp.ua`. Публічну доступність сторінок та верифікацію домену ще треба підтвердити.

Образ із `376932a` підтверджено в Artifact Registry як `sha256:83148bf4ab6120d6d96da009e1d2990f632d5f02ac4d6ad14f129ce75c25f15b`. Він працює в приватній ревізії `grantfolio-web-00002-xd4`. Автентифіковані запити до `/privacy.html` та `/terms.html` повернули 200. Власник опублікував OAuth. Стан Audience тепер `In production`. Для серверного відправника Google показав попередження про чутливий дозвіл `gmail.send`. Власнику передано вкладку для згоди, конфігурація відправника в Secret Manager очікує завершення авторизації.

У NIC.UA збережено apex A `136.81.8.112` і вибрано `ns10/ns11/ns12.uadns.com`. WHOIS показав усі три нові сервери, а `ns10.uadns.com` повернув новий A. Під час перевірки авторитетні сервери батьківської зони `pp.ua` ще повертали старе паркувальне делегування, а сертифікат мав стан `PROVISIONING`. Повторна перевірка має охопити делегування, A-запис і сертифікат.

На приватній ревізії перевірено три GET на сесію (головна, два запити до `/api/grants`), запущено 30 сесій одночасно з Cloud IAM. Перший прогін із новим з’єднанням для кожного запиту отримав 88/90 відповідей, p95 10,44 с і два клієнтські тайм-аути. Повторний прогін із попередньою перевіркою `/api/health` та повторним використанням HTTPS-з’єднань отримав 90/90 відповідей, p95 9,94 с. Після увімкнення Gmail і HTTPS повторити перевірку через публічний домен, включно з реєстрацією та входом.

Повторна перевірка підтвердила делегування на сервери NIC.UA від `ns1.uadns.com` і A-запис `136.81.8.112` від резолвера `8.8.8.8`. Сертифікат лишається `PROVISIONING`. Код і стан релізу опубліковано в пул-реквесті №8 зі статусом Draft.

Власник підтвердив доступ акаунта `grantfoliomanager@gmail.com` до застосунку OAuth. Конфігурацію без читання значення перевірено в Secret Manager. `grantfolio-runtime@grantfolio-pp-ua.iam.gserviceaccount.com` отримав роль Secret Accessor лише на `grantfolio-email-login-code`. Ревізія Cloud Run `grantfolio-web-00003-n9g` використовує цю версію як `EMAIL_LOGIN_CODE_CONFIG` і має `EMAIL_LOGIN_CODE_REQUIRED=true`. У `/api/health` отримано `{"status":"ok"}`. Фактичний лист і публічну реєстрацію ще не тестували через стан HTTPS-сертифіката `FAILED_NOT_VISIBLE`.

Під час перевірки приватної ревізії Firebase відхилив реєстрацію з паролем. Увімкнено Firebase Email/Password. Після зміни тимчасова реєстрація повернула HTTP 200, статус коду мав `required: true`, приватний `/api/me` до введення коду повернув HTTP 403, а Gmail прийняв запит на надсилання тестового коду на скриньку GrantFolio, про що свідчить HTTP 204 від `/api/auth/email-code/send`. Тимчасовий Firebase-акаунт видалено. Отримання листа та введення коду в браузері ще не перевірено. Для HTTPS звірено всі три авторитетні сервери NIC.UA, публічні резолвери й прив'язку сертифіката до порту 443. Google ще повторює перевірку домену.

Перший сертифікат залишався в `PROVISIONING`. У Certificate Manager створено `grantfolio-domain-auth` з перевіркою через CNAME в NIC.UA. Сертифікат `grantfolio-dns-cert` перейшов у `ACTIVE`, а карту `grantfolio-site-certs` підключено до `grantfolio-https-proxy`. Після успішної перевірки TLS відкрито публічний доступ до поточної ревізії через балансувальник з ingress `internal-and-cloud-load-balancing`. Пряма адреса Cloud Run повертає HTTP 404.

Публічний `/api/health`, головна сторінка, каталог з 74 програмами, політика конфіденційності й умови доступні через HTTPS. Запит до `/api/me` без облікових даних повертає HTTP 401. Тест 30 паралельних сесій читання дав 90/90 відповідей, p95 10,94 с. У браузері тимчасовий користувач зареєструвався з паролем, отримав лист у Gmail, ввів код і відкрив кабінет. Тимчасовий Firebase-акаунт видалено. Повний вхід через Google і сценарії запису під навантаженням ще не перевірено.
