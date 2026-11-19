# Розгортання виправлень консультації — PR №33

- Дата: 19.11.2026. Виконавець: координатор Codex.
- Гілка звіту: `codex/pr33-deployment-handoff`; база `3739621f2e30dbd86c9663cbbbcca80fd74e6650`.
- Власність: цей звіт, STATUS, WORKLOG та посилання на результат у звіті реалізації. Застосунок, тариф, платіжні ключі, IAM і cloud settings не змінюються вручну.
- Статус: done — PR злитий, attempt 2 успішний, нову версію перевірено через HTTPS.

Користувач явно погодив merge PR №33 із head `2c629239a121410fa017951beadb50459306356a` та автоматичне розгортання на grantfolio.pp.ua. Перед merge свіжо перевірено remote heads, незмінний head/base, CI PASS, clean checkout і відсутність конфліктів. `gstack-ci-gate` повернув PASS для цього SHA.

GitHub підтвердив squash merge 19.11.2026 о 12:16:11 UTC. Merge commit: `3739621f2e30dbd86c9663cbbbcca80fd74e6650`. Запущено [workflow 44522314486](https://github.com/stashnid/GrantFolio/actions/runs/44522314486), headSha збігається з merge commit. До релізу 100% production-трафіку обслуговувала `grantfolio-web-gh-44479304483-1`.

Результати перевірок реалізації: [звіт](2026-11-19-assistant-audit-fixes.md), 269/269 локальних тестів, typecheck/build, незалежний review, CI PR. Подальший статус має підтверджувати завершення workflow, точну ревізію/digest Cloud Run та публічні HTTPS перевірки. Сам факт merge не доводить розгортання.

О 12:23 UTC повторна CI-перевірка merge-коміту ще виконувалася на кроці `Install PDF conversion dependencies`; попередні кроки міграцій локальної CI-БД, typecheck і build успішні. GitHub CLI повідомив, що журнал job доступний лише після завершення. Це затримка з невідомою на цей момент причиною, не встановлена помилка коду. Реліз повторно не запускався; production-трафік до завершення налаштованих перевірок не змінювався.

Після понад 10 хвилин на встановленні LibreOffice переддеплойний CI attempt 1 скасовано. Перед цим перевірено, що виконується лише `verify` і cloud deploy ще не почався. GitHub підтвердив `cancelled`; журнал показав `Unable to connect to azure.archive.ubuntu.com` та `Could not wait for server fd - select (11: Resource temporarily unavailable)` при завантаженні Ubuntu-пакетів. Це встановлена мережева помилка runner, не падіння тестів застосунку. Один раз повторено той самий workflow, attempt 2, незмінний headSha `3739621`; код та конфігурацію перевірок не змінювали.

Attempt 2 теж затримався на тому самому кроці. Підготовлено, але не опубліковано CI-альтернативу: замість повторного встановлення LibreOffice на Ubuntu-host збирається чинний Dockerfile застосунку (Debian bookworm із LibreOffice), а незмінний `npm test` з `LIBREOFFICE_TEST=1` виконується в цьому runtime. Репозиторій і dev-залежності runner монтуються read-only; `--network host` на Linux дає тестам доступ до локальних PostgreSQL/Firebase. Така зміна потребувала би окремої перевірки PR перед merge.

До публікації альтернативи attempt 2 успішно встановив PDF-залежності й перейшов до тестів. Власну незакомічену CI-правку вилучено; workflow залишено byte-identical до злитого релізу. Локальна збірка чинного Dockerfile успішна, але альтернативний тестовий workflow не запускався й не публікувався. Незалежний reviewer виявив потребу явного development NODE_ENV для такого контейнерного варіанта; це не дефект чинного workflow. Локальна спроба YAML-перевірки не виконалася через відсутній модуль PyYAML, тому її не зараховано як PASS.

Першоджерело схожого збою й підтвердження, що pin Ubuntu 24.04 не гарантує усунення проблеми: [actions/runner-images №15142](https://github.com/actions/runner-images/issues/15142). Це контекст діагностики; конкретний збій GrantFolio встановлено за власним журналом attempt 1.

## Фактичний реліз

[Workflow attempt 2](https://github.com/stashnid/GrantFolio/actions/runs/44522314486/attempts/2) завершився `success`: verify — 8 хвилин, Deploy to Cloud Run — 2 хвилини 54 секунди. Авторизація workflow через Workload Identity Federation успішна. Застосунок розгорнуто без змін погодженого коміту.

Журнал автентифікованого cloud deploy підтвердив:

- Міграції: `grantfolio-migrate-9k69k` успішно завершено о 12:40:54 UTC.
- Ревізія: `grantfolio-web-gh-44522314486-2`.
- О 12:41:13 UTC трафік: 100% на цю ревізію.
- Merge SHA: `3739621f2e30dbd86c9663cbbbcca80fd74e6650`.
- Образ: `europe-west1-docker.pkg.dev/grantfolio-pp-ua/grantfolio/web@sha256:ae67ab215930e58fb6d1fda0f8fd4700da69034917cd95408f0f09c302187864`.

Локальна додаткова команда `gcloud run revisions describe` не виконалася через протерміновану user-сесію (`Reauthentication failed; cannot prompt during non-interactive execution`). Обліковий запис/налаштування CLI не змінювали. Ревізія, digest і розподіл трафіку підтверджені журналом автентифікованого CI, а не цією невиконаною локальною перевіркою.

## Production smoke

Після завершення релізу, з повторною перевіркою 19.11.2026 близько 15:22 UTC:

| Перевірка | Спостереження |
|---|---|
| `GET https://grantfolio.pp.ua/` | HTTP 200 |
| `GET /api/health` | HTTP 200, `status=ok` |
| `GET /api/grants` | HTTP 200, 104 записи, нові identity aliases Brave1 присутні |
| `GET /api/cases` без токена | HTTP 401 |
| `GET /api/advisor` без токена | HTTP 401 |
| `/assets/Advisor-CSi_YVMe.js` | HTTP 200, JavaScript MIME; нові `hasPreparationIdea` і текст рівня допомоги присутні |
| Ізольований браузер | Сторінка входу та реєстрації відображаються, console errors відсутні |

Це публічна smoke-перевірка фактично розгорнутої версії. Нових production-акаунтів, модельних консультацій, платежів і офіційних подань не створювали. Перевірки локальних сценаріїв та їхні межі залишаються у звіті реалізації.

## Передача

Деплой завершено. STATUS і WORKLOG оновлені в окремій документаційній гілці; ця передача не змінює production-код і не запускає ще один реліз у main. Робочі копії виконавців архівовані; інтеграційна копія залишається для звіту. Тестові інструменти й журнали лишаються поза Git. У main збережено чинну оплату через банку, тариф і серверні гейти.
