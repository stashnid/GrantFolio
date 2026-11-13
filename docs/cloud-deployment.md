# Google Cloud: план запуску

Статус: 12.11.2026, ресурсів і demo URL ще немає. Це порядок реалізації, не готовий deployment script. [Архітектура](architecture.md) · [Фактичний стан](STATUS.md)

## 1. Перевірити середовище

- Вибрати один Google project для прототипу; дати двом учасникам персональний доступ з потрібними ролями.
- Перевірити billing type, credit eligibility/expiry, API/IAM, доступ до моделей і регіони. Особисті ідентифікатори/баланси залишити поза Git.
- Підготувати кошторис конкретної SQL instance, storage і лімітів web/worker/AI; погодити фактичне створення ресурсів. Для AI є окрема [перевірка кредитів](ai-model-research.md).
- Не активувати billing upgrade чи спеціальний 30-денний SQL trial як прихований крок. Обраний режим має зберегти демо доступним у потрібний період.

## 2. Зробити локальний вертикальний сценарій

Створити workspace/lockfile і Dockerfile; frontend React/Vite, backend Express. Для локальної роботи — PostgreSQL у Docker і Firebase Auth Emulator, явний локальний file adapter та AI stub. Stub не видавати за реальну модель. Реальні Google secrets залишаються локально/в Secret Manager.

Перший робочий зріз: реєстрація → вхід → захищений `/api` → збережений власний профіль → reload. Разом із кодом додати точні передумови, `.env.example`, команди setup/run/test. Не публікувати неіснуюче `npm run deploy`.

## 3. Відтворювана інфраструктура

У `infra/` реалізувати Terraform для Artifact Registry, Cloud SQL, private bucket, Cloud Run web/worker/jobs, Tasks, Scheduler, service accounts, secrets references і WIF. State — у приватному remote backend після початкового bootstrap. Terraform створює references/контейнери секретів; значення додаються окремим захищеним кроком, щоб не потрапляти в код, tfvars чи state. SQL-паролі також потребують такого способу створення; сам state завжди приватний. Версії provider і lockfile фіксуються в реалізації.

Спершу розгорнути HTTPS web із входом. Далі підключати дані, worker і розклад до того самого образу. Public web дає сторінку входу; кожний приватний API все одно перевіряє користувача. Для прототипу достатньо стандартного HTTPS URL Cloud Run; придбання домену не потрібне. [Cloud Run HTTPS](https://docs.cloud.google.com/run/docs/triggering/https-request).

## 4. CI/CD і перевірка

GitHub Actions через WIF: перевірки → image digest → migration Job зі статусом успіху → deploy відповідних entrypoints → smoke. Перший release фіксує URL, image digest, migration version і результати перевірок у WORKLOG/STATUS. Для Firebase налаштувати production domain, action links і перевірити листи.

Smoke включає HTTPS sign-up/sign-in/reload, ізоляцію двох користувачів, недоступність private worker зовні, збереження справи й експорт. Перевірити доставку справжнього Task і recovery, якщо цей функціонал включено в release.

## 5. Реліз і підтримка

Розгорнутий код відкотити на відому сумісну revision; міграції й дані автоматично не відкотувати. Стежити за SQL connections, queue age, job errors, AI tokens/cost і актуальністю джерел. Логи не містять токенів входу чи повних бізнес-документів.

Перед запрошенням користувачів оновити root README реальними командами й URL. Після тестування — зафіксувати фактичні відгуки, зміни й підготувати PDF. Нинішній план не означає, що цей запуск уже виконано.
