# Gemini: перевірка доступу

14.11.2026. Користувач прямо дозволив використання наданого ключа. Секрет збережено тільки в ігнорованому `.local/model-gateways/gemini.env` із mode0600; у цей звіт ключ не включається. Remote heads перевірено на початку підключення; командні зміни збережено.

GET models успішний. Старий gemini-2.5-flash-lite отримав404 (Google: unavailable to new users). Рекомендований API gemini-3.5-flash-lite успішно виконав короткий generateContent: OK, 5 input +1 output =6 tokens. Це підтверджує прямий Gemini API, не інтеграцію в Codex або GrantFolio. Масові/автоматичні виклики не запускались; free quota/billing eligibility не встановлювали.

OmniRoute Git checkout3.8.54 не опубліковано в npm; встановлення локального runtime3.8.53 ще триває. Сторонні lifecycle scripts вимкнено. Потрібно завершити встановлення, перевірити native dependencies, запустити панель на loopback, зареєструвати провайдера Gemini й перевірити один виклик через gateway. Налаштування Codex не змінено.

Ключ був наданий у чаті; користувачу рекомендовано замінити його. Після ротації локальний файл потрібно оновити без додавання секрету в Git. Документація: https://ai.google.dev/gemini-api/docs/api-key

Додаткові профілі за запитом користувача: Argon gemini-4-argon, Pro gemini-3.1-pro-preview, Carbon gemini-4-carbon. Свіжий models list містить усі три, але по одному короткому generateContent на кожну отримали429 RESOURCE_EXHAUSTED з free-tier limit0. Це відсутня безкоштовна квота, не успішний доступ. Billing не змінювали. Локальні профілі збережені у .local/model-gateways/gemini-profiles.json; default лишається перевірений flash-lite, автоматичний fallback вимкнений.
