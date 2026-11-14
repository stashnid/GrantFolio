# Видалення OmniRoute із застосунку

- Автор: агент реалізації Codex; дата: 14.11.2026.
- Branch: `feat/test-version-preparation`; base: `94acc4b`. Координатор свіжо перевірив remote; власний `ls-remote` агента не пройшов через DNS, тому самостійна перевірка remote неповна.
- Статус: done. Межі: видалити gateway-залежність застосунку, зберегти маршрути, історію та інʼєкцію responder; не підключати платного провайдера.
- Власні файли: `backend/src/assistant.ts`, `backend/test/assistant.test.ts`, `scripts/dev-local.sh`, `.env.example`, `README.md`, `infra/README.md`, `infra/preflight.sh`, цей звіт.

## Результат

Прибрано конфігурований gateway responder і його prompt; нові запити асистента за замовчуванням повертають `503 assistant_unavailable`. Власність, revision, історія і тестовий responder збережені. Скрипт локального запуску більше не запускає gateway; актуальні інструкції та приклад середовища оновлено. Окрема інтеграція продуктового ШІ ще потрібна.

## Перевірки

`npm run typecheck`, `npm run build`, `npm test` (12/12), `bash -n scripts/dev-local.sh infra/preflight.sh` пройшли. Build попереджає про розмір frontend chunk. Перші спроби build/test у обмеженому середовищі не змогли записати build output або відкрити локальний порт; повтор з необхідним доступом пройшов.

## Передача

Координатор оновлює спільні STATUS/DECISIONS/BACKLOG/WORKLOG і відповідає за налаштування OmniRoute для Codex поза застосунком. Коміт і push не виконано.
