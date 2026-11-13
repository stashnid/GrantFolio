# architecture: план Google Cloud

Дата: 12.11.2026. База: `74b9bdd`. Статус: done_with_concerns. Задача — advisory-уточнення, без provisioning; інтеграцію файлів виконав координатор.

## Хід роботи й висновки

1. Перевірив поточний запит і попередні плани: Google Cloud тепер прийнятий вибір; Render/Supabase й AWS перестають бути deployment-рекомендацією.
2. Звірив офіційні Google/Firebase матеріали щодо входу, приватного worker, SQL connections, Tasks/Scheduler, IAM і CI.
3. Запропонував одну кодову базу з web/worker/maintenance/migrate entrypoints. Спрощено попередню RLS-схему: backend-only DB та явні перевірки власника. UID Firebase має бути TEXT.
4. Опрацював зміну ціни й export snapshots, розрив SQL commit/queue publication, повторні Tasks, lease/recovery і неоднозначну повторну оплату AI.
5. Додав малий dev/test deployment, SQL pool limits, різні Firebase/IAM токени, WIF і одноразові міграції. Наголосив, що alert budget не є жорстким cap.

Зведені контракти, джерела й сценарії перевірки: [архітектура](../architecture.md), [deployment](../cloud-deployment.md). Не підтверджено реальний GCP project, права/квоти, підтримувану програму, пошту й funding. Користувач повідомив, що навчальних матеріалів немає; модель не вважати донавченою.

## Передача

Координатор прийняв GCP mapping і спрощення доступу, зафіксував межі перевірки в STATUS. Наступне: B01–B03. Код, runtime та cloud tests не запускалися, ресурсів не створено.
