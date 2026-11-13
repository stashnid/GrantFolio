# Backend

Поки містить лише план; сервер, залежності та команди ще не створено.

План: TypeScript/Express modular monolith із модулями business, grants, applications, assistant, notifications. Entry points: public web, private worker, maintenance, migrate. PostgreSQL зберігає стан; бюджет обчислюється одним сервісом; AI і private Storage підключаються через adapters.

Перший зріз — вхід Firebase й власний захищений профіль. Разом із реалізацією додати setup/run/test, міграції, `.env.example` і перевірку доступу між двома користувачами. [Поточна архітектура](../docs/architecture.md).
