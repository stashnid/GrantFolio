# Production-реліз світлого чату

- Агент Codex. Дата 17.11.2026.
- Гілка `codex/release-luminous-chat`. Після `git fetch` гілка `origin/main` вказувала на `cd1fd12`, злиття PR №12.
- Статус `done`. За запитом користувача розгорнуто свіжий `main` у наявному сервісі Cloud Run.
- Змінені файли `docs/STATUS.md`, `docs/WORKLOG.md` і цей звіт.

## Розгортання та перевірки

Зібрано образ із `cd1fd12`. У Artifact Registry він має digest `sha256:988499efd81eb0f91f9fb4143f185ce159d1281f3bca62ee15d04df44ebe0afe`. Міграції від попередньої версії не змінилися.

Ревізія `grantfolio-web-main-cd1fd12` стала Ready до перемикання трафіку. Збережено налаштування Firebase і Vertex AI. Після перемикання Cloud Run показав 100% трафіку на новій ревізії, [головна сторінка](https://grantfolio.pp.ua/) підключила новий `/assets/index-YmraQVO4.css`, а [перевірка API](https://grantfolio.pp.ua/api/health) повернула `ok`. У цьому релізі не виконували автентифікований тест чату чи виклик Gemini.

## Передача

Оновлено STATUS і WORKLOG. Автоматичне розгортання залишається в [PR №13](https://github.com/stashnid/GrantFolio/pull/13) і потребує налаштування доступу GitHub до Google Cloud.
