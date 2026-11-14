# Звіт: Case deletion and DB health check

- Автор/агент: Antigravity
- Дата, branch, base commit: 2026-11-14, branch `feat/test-version-preparation`, base commit `b29e977`. Fresh remote check: гілка синхронізована з `origin/feat/test-version-preparation`.
- Статус: done.
- Задача й межі дозволеного: реалізація безпечного видалення чернетки (DELETE /api/cases/:id) з каскадним видаленням пов'язаних записів, перевірка здоров'я підключення до БД у `/api/health`, інтерфейс видалення у фронтенді з підтвердженням користувача, міграція 005 для cascade foreign keys.
- Файли у власності: `backend/migrations/005_cascade_deletes.sql`, `backend/src/app.ts`, `backend/src/cases.ts`, `backend/test/integration.test.ts`, `frontend/src/Cases.tsx`, `frontend/src/style.css`.

## План і хід роботи

1. Створено ендпоінт `DELETE /api/cases/:id` з обов'язковою перевіркою `owner_id = res.locals.uid`. Чужі справи повертають 404.
2. Створено міграцію `005_cascade_deletes.sql`, яка оновлює зовнішні ключі таблиць `budget_commands`, `details_commands` та `budget_history` з додаванням `ON DELETE CASCADE` (таблиця `assistant_exchanges` вже має `ON DELETE CASCADE` з міграції 004).
3. Додано перевірку з'єднання з базою даних (`SELECT 1`) у `/api/health` для коректної готовності контейнера у Cloud Run / балансувальнику. При помилці підключення повертається статус 503 `db_unavailable`.
4. У компоненті `Cases.tsx` додано кнопку «Видалити чернетку» з діалоговим підтвердженням, очищенням виділеного стану та повідомленням про успіх. Додано стиль `.danger`.
5. Додано інтеграційні тести в `backend/test/integration.test.ts`: ізоляція при видаленні (чужий користувач отримує 404), успішне видалення чернетки та каскадне очищення пов'язаних команд, а також перевірка `/api/health`.

## Змінені файли й перевірки

- `npm run typecheck` PASS.
- `npm run build` PASS (tsc + vite build).
- Запобігання витоку чужих даних: перевірено логіку перевірки `owner_id` при операціях DELETE.

## Передача

- Зміни підготовлені для коміту й публікації на гілці `feat/test-version-preparation`.
- Оновлено `STATUS.md`, `WORKLOG.md`.
- Наступні кроки: підготовка тестових сценаріїв користувача для збору відгуків до звіту PDF (дедлайн 19.11).
