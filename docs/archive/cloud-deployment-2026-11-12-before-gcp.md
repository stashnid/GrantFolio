> Історична пропозиція до остаточного вибору Google Cloud. Поточний план: [архітектура](../architecture.md). Не використовувати як інструкцію розгортання.

# GrantFolio: AWS або Google Cloud

Дата: 12 листопада 2026 року. Статус: план, без розгорнутих ресурсів.

## Вихідна умова

Користувач повідомив, що команда має постійні навчальні акаунти AWS і Google Cloud із кредитами, і обрав роботу на одному з цих провайдерів. Це практична вимога проєкту, яка замінює попередню рекомендацію Render/Supabase. Матеріали OOAD — лише довідка; ні їхній покажчик, ні конкретні лекційні інструменти не є вимогами цього плану.

Фактичні залишки й строки кредитів перевірено у Safari 12 листопада; приватний результат збережено локально в .local/cloud-balance-check.md. Покриття потрібних сервісів, права й квоти ще належить перевірити. Облікові дані, номери платіжних акаунтів, скриншоти рахунків і приватні залишки не включаємо в репозиторій.

## Порівняння

| Роль | Google Cloud | AWS |
|---|---|---|
| Образ контейнера | Artifact Registry | ECR |
| Вебінтерфейс і API, HTTPS | Cloud Run service | ECS Express Mode/Fargate з керованою HTTPS-адресою |
| Реєстрація та вхід | Firebase Authentication / Identity Platform | Cognito User Pool |
| PostgreSQL | Cloud SQL | RDS |
| Приватні файли | Cloud Storage | S3 |
| Тривалі операції користувача | Cloud Tasks -> private Cloud Run worker | ECS worker + збережені Postgres jobs |
| Перевірка джерел за розкладом | Cloud Scheduler -> Cloud Run Job | EventBridge Scheduler -> ECS RunTask |
| Модель | Google-hosted model API, якщо підтверджено доступ/кредити | Bedrock, якщо підтверджено доступ/кредити |
| Секрети та журнали | Secret Manager, Cloud Logging | Secrets Manager, CloudWatch |

Умовна рекомендація — Google Cloud, якщо права, кредити й доступ до моделі однаково придатні на обох акаунтах: Cloud Run скорочує обсяг налаштування веброзгортання. AWS також придатний і може виявитися зручнішим за результатом перевірки акаунта або досвіду команди. Остаточний провайдер ще не обраний.

Зберігаємо React/TypeScript + Express, модулі, інтерфейси провайдерів і PostgreSQL. Не розносимо першу версію між двома хмарами лише заради використання двох балансів. Для цього дедлайну один провайдер спрощує дозволи, доставку, мережу й діагностику.

## Технічні уточнення

### Google Cloud

Публічний Cloud Run віддає frontend і /api. Доступ до сторінки входу не вимагає GCP IAM-акаунта підприємця. Firebase ID token перевіряє backend, а бізнес-API застосовує власну авторизацію. Приватні дані й worker не стають публічними.

Cloud SQL підключається документованим Cloud Run connector/Unix-socket шляхом; він не означає відкриття Postgres для всього інтернету. База має власну вартість, незалежну від scale-to-zero вебсервісу. Обмежуємо pool і кількість інстансів.

Cloud Run з CPU під час запиту не повинен повертати 202 і залишати роботу лише в Node promise. Для довгого завдання зберігаємо SQL operation/outbox і викликаємо приватний worker через Cloud Tasks; повтори не застосовують ефект вдруге. Scheduler для Run Job використовує виклик API з OAuth, а не плутається з OIDC-викликом приватного HTTP worker.

### AWS

ECS Express Mode створює керовану адресу застосунку з HTTPS; власний домен для демо не обов’язковий. Це відрізняється від ручного збирання звичайного ECS+ALB. App Runner для нового клієнта не є базовою рекомендацією за поточним повідомленням AWS.

Cognito керує обліковими записами, backend перевіряє відповідний токен і формує Actor. Приватна RDS приймає з’єднання лише від дозволених app/worker task groups. Execution role, task role, infrastructure role та scheduler role мають різні обов’язки.

Bedrock access/регіон/кредити перевіряються до викликів. Перший сторонній model invocation може означати прийняття умов/підписку, тому він не є безумовно read-only перевіркою. Cognito verification email і продуктова розсилка через SES — різні сценарії; SES sandbox може обмежувати одержувачів.

### Спільне для обох

Бізнес-логіка не залежить від бренду хмари. Actor містить перевірений provider/issuer та непрозорий user ID: не припускаємо, що кожен UID має формат UUID. Правила бюджету залишаються в сервісі; власник перевіряється на кожному шляху до даних/файлів.

Одна історія міграцій, runtime DB-роль окремо від DDL, приватні файли, обмежені запити до моделі, незмінні знімки експорту. Роботу зберігаємо у БД/Storage, а не на тимчасовому диску контейнера.

Кредити — джерело оплати, а не універсальна гарантія нульової оплати. До створення ресурсів потрібні фактичний баланс/строк/покриття сервісів, права, регіон і погоджений бюджет. На цьому етапі ресурсів не створено.

## Один продукт і два акаунти команди

Спільний доступ двох учасників і спільне використання двох кредитних залишків — різні питання.

- Обидва учасники можуть мати окремі входи з потрібними правами до одного проєкту/оточення. Паролі спільного root/Google-акаунта для цього не потрібні.
- Для Google Cloud один проєкт має один активний billing account. Офіційна освітня інструкція описує командний проєкт і почергове використання платіжних акаунтів студентів. Для ще не використаних купонів вона також описує об’єднання до трьох купонів у невеликій команді; це не означає довільне перенесення вже зарахованого балансу.
- AWS підтримує credit sharing усередині AWS Organizations за відповідних налаштувань і умов кредиту. Вступ до організації посеред місяця впливає на те, коли кредити входять до спільного пулу. Не припускаємо, що створення організації сьогодні одразу дасть спільну суму до демо 19 листопада.
- Рахунки, права, billing links, організації й купони зараз не змінюємо: користувач попросив переглянути залишки та пояснити можливості.

Приватні результати перевірки акаунтів за потреби зберігаємо тільки в локальному виключеному з Git каталозі .local/.

## Найближчі кроки

1. Переглянути Credits/Billing у вже наявних акаунтах, записати залишок, строк дії й обмеження.
2. Обрати один провайдер і проєкт/акаунт команди; визначити окремі ролі двох учасників.
3. Перевірити потрібні права, квоти й модель без створення платних ресурсів або прийняття нових модельних угод.
4. Підготувати конкретний інфраструктурний план і оцінку, потім створювати погоджені ресурси.
5. Зберегти календар: ранній HTTPS/signup, реальні користувачі 16–17 листопада, виправлення/звіт 18-го, показ 19-го.

## Джерела

Докладні звіти: [Google Cloud](../planning/google-cloud-agent.md), [AWS](../planning/aws-cloud-agent.md).

- [Google Cloud Run](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run).
- [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
- [Cloud Run -> Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/connect-run).
- [Cloud Tasks -> Cloud Run](https://docs.cloud.google.com/run/docs/triggering/using-tasks).
- [Cloud Run Jobs за розкладом](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule).
- [ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html).
- [Google education credits](https://docs.cloud.google.com/billing/docs/how-to/edu-grants).
- [Google Billing and Team Projects](https://services.google.com/fh/files/helpcenter/cloud_edu_billing_team_projects.pdf).
- [Зміна billing account проєкту](https://docs.cloud.google.com/billing/docs/how-to/modify-project).
- [AWS credits і credit sharing](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html).
- [AWS Promotional Credit Terms](https://aws.amazon.com/awscredits/).
