# OmniRoute: локальний безкоштовний резерв

14.11.2026. Runtime3.8.53 запущений на http://127.0.0.1:20128. Приватні дані у .local/model-gateways/omniroute-data (Gitignore). Endpoint /v1, model grantfolio-free, priority Gemini3.5Flash-Lite → Groq GPT-OSS120B; Claude, платні провайдери, локальні моделі не додані. OpenRouter поки не підключений. Ключ endpoint обмежений цим combo.

Перевірено реальним запитом: звичайний маршрут відповів Gemini OK; тимчасова заміна першого target на GeminiArgon з freequota0 дала429, потім Groq відповів OK, лог підтвердив1fallback. Первинний Flash-Lite target відновлено. Усі хмарні квоти можуть вичерпатися; шлюз їх не створює. Після початку потоку повне безшовне відновлення не гарантується.

Панель має приватний пароль у локальному dashboard-login.txt. Секрети не включати в Git чи скріншоти. Для друга потрібно власне встановлення й підключення власних доступів. Переконатися у Free Tier провайдера перед використанням; не вмикати paid billing заради цього маршруту. Надані ключі з історії чату рекомендовано ротувати.

## GrantFolio assistant

Потрібен працюючий локальний OmniRoute. У серверне середовище додати OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:20128/v1, ASSISTANT_MODEL=grantfolio-free, ASSISTANT_API_KEY=локальний endpoint key. Це ключ шлюзу, не Groq/Gemini. У браузер ключі не передаються. Без конфігурації endpoint повертає503, введення зберігається. Поточний adapter навмисно дозволяє лише loopback20128; це локальна інтеграція, хмарне розгортання gateway ще не зроблене.

На цьому Mac приватне assistant.env уже підготовлено. Запуск API з кореня: node --env-file=.env --env-file=.local/model-gateways/omniroute-data/assistant.env --import tsx backend/src/server.ts. Не запускати одночасно два API на18080. Web: npm run dev:web.

Асистент отримує збережений SQL-знімок конкретної власної справи. Текстова відповідь не змінює дані, позначена revision/stale. Ліміт питання2000символів, відповідь1200outputtokens, timeout25s, cooldown15s на користувача, максимум2одночасно в процесі. Cooldown не є глобальною квотою між replicas; перед публічним deployment потрібен спільний ліміт. Без незбережених змін/явної кнопки модель не викликається.

## Окремий Codex CLI

Локальний wrapper .local/model-gateways/bin/codex-free.py запускає Codex із per-process provider override, не змінюючи основний config. Simple read-only agent reply OK пройшов. Перший тест підхопив зайві MCP/Apps; wrapper тепер вимикає їх для цього запуску. Повний coding/tool workflow ще не перевірений. Built-in агенти поточного desktop-чату не оголошуються переведеними на цей маршрут.

Джерела перевірки: установлені API/схеми/логи OmniRoute; логи/ключі приватні, у документацію додається лише результат.

Для спільного dev запуску на цьому Mac: node --env-file=.env --env-file=.local/model-gateways/omniroute-data/assistant.env node_modules/concurrently/dist/bin/concurrently.js -k -n api,web npm:dev:api npm:dev:web. Попередній npm run dev потрібно зупинити, щоб він не утримував стару конфігурацію API.
