# Світлий сучасний чат і темно-синя основа з градієнтами — 17.11.2026

- Base: 197b46f55a74508fcacee1028e16ab9590300501; branch feat/luminous-chat-interface; fresh fetch/heads17.11, main актуальна, локальних змін немає.
- Оглянуто незлиту codex/enable-live-gemini: зміни серверного AI не інтегруються автоматично й зберігаються окремо.
- Scope: явний новий напрям користувача замінює попередню надмірно синю тему. Білий canvas/темно-сині дії й навігація; фіолетовий тільки як складова градієнтів, за останнім уточненням користувача; один шар assistant message, звичний chat composer, поступова поява нових відповідей. Без paid AI, cloud deployments, schema/API changes.
- Ownership: Terra visual_language — CSS/frontend/index.html/favicon; Terra chat_behavior — Advisor.tsx/Assistant.tsx, новий shared reply reveal hook/component і цільові тести; Sol qa — read-only браузер і review; координатор — інтеграція/docs.
- Збереження: чинні auth/OTP, history/drafts/retry/idempotency, джерела, budget/text-confirmation guards.
- Progressive reveal є локальною анімацією отриманої відповіді; не видавати за streaming backend. Історія не анімується повторно, reduced-motion показує повний текст, анімацію можна завершити одразу.
- Статус: in_progress.


## Реалізація

- Terra visual_language: спільна світла палітра, темно-синя навігація, фіолетовий лише в синьо-фіолетових градієнтах; neutral поля/картки та інформаційні сторінки. Assistant prose без background/border/shadow; user — одна легка підкладка. Primary icon-send44px, читабельна метаінформація й компактне позначення асистента.
- Terra chat_behavior: спільний ReplyReveal для Advisor/Assistant; нові успішні відповіді з обмеженням6сек, показати всю відповідь, reduced-motion, історія відразу, показ pending question, auto-follow лише біля кінця стрічки. Recommendation/suggestion actions після завершення; copy працює з повним збереженим текстом.
- Координатор: review й інтеграція, memo Unicode chars, visibilitychange cleanup (rAF у фоновій вкладці призупиняється), SR-safe inert часткова розмітка та звичайні інтерактивні посилання після завершення. Повтор існуючого server message id не запускає анімацію вдруге.
- Явна вимога користувача дозволити фіолетовий у градієнтах має пріоритет над no-violet правилом Taste. Застосовані ECC frontend/accessibility, UI/UX Pro Max рекомендації ясного AI labeling та relevant design guidance; без нових декоративних workflow чи академічних deliverables.

## Перевірки

Typecheck/build/diff-check PASS; npm test90/90 PASS. Новий unit suite, що повторює анімаційний код, не додавався; життєвий цикл перевіряється незалежною browser QA Sol.

Локальний реальний guided reply (Gemini key явно порожній): запит видно pending відразу, observed chars4→22→74→127→180→232→285→337→381; actions0 під час появи й3 після завершення. Для спостереження очікування локально додано900ms delay перед fetch, сам reply — відповідь чинного локального API. Це не production/live-model дослід. Джерела й API/business guards збережені.

Поточні докази в /private/tmp/grantfolio-luminous/; фінальні lifecycle/contrast результати додаються після завершення Sol QA. Cloud deployment не виконується: за уточненням користувача це робить друг у своєму акаунті. Task branch/PR відправляється за постійним дозволом, без automatic merge.


## Уточнення під час інтеграції

Основний колір — преміальний темно-синій; фіолетовий лише в градієнтах. Це останнє уточнення користувача, яке замінює початкову темно-фіолетову основу в цій задачі. Білий чат і всі поведінкові зміни залишаються в scope.
