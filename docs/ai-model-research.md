> Поточне уточнення: [Opus та бізнес-юридичний вибір](business-legal-model-selection.md). Основний кандидат для якісного пілота — Opus; остаточний вибір після перевірки на кейсах.

> Оновлення 13.11.2026: [дослідження Claude і поточний план спеціалізації](anthropic-assistant-plan.md). Попередня Gemini-рекомендація нижче є альтернативою для порівняння/SFT, остаточний провайдер не обраний.

# Основа ШІ-асистента: дослідження моделей

Перевірено: **12 листопада 2026**, за офіційною документацією. Це вибір кандидатів за можливостями й вартістю, не benchmark якості GrantFolio. Платних викликів, training jobs або upload даних не було. Користувач підтвердив: **навчальних матеріалів поки немає**.

## Рекомендація

Перший кандидат — **`gemini-3.5-flash-lite` через керований Google Cloud API**. Спочатку перевірити його без донавчання, з українським редакційним стандартом, умовами обраної програми й підтвердженими фактами. Далі можна донавчати ту саму основу на перевірених прикладах. Це поєднує обрану хмару, помірну token-вартість і наявний шлях SFT; перевага в якості українських заявок ще не доведена.

Для порівняння — дешевший `gemini-3.1-flash-lite`; якщо Lite не проходить перевірку текстів, сильніший за класом кандидат `gemini-3.5-flash`. Фактичну перевагу встановлюємо на однакових кейсах. `gemini-3.8-flash` може бути контрольним варіантом без навчання, але його model card не підтримує tuning. [3.5 Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite), [3.1 Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite), [3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash), [3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash).

Підтверджені потрібні можливості 3.5 Lite: текст/документи як input, текстовий output, structured output і function calling. Важлива відмінність: custom temperature/top-K/top-P ігноруються, тому не закладати «temperature=0» як механізм точності. Параметри SDK перевірити на точній моделі. [Model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite).

## Порівняння основ

| Варіант | Шлях донавчання для нового проєкту | Висновок |
|---|---|---|
| Gemini 3.5 Flash-Lite / 3.1 Flash-Lite / 3.5 Flash | Managed SFT у Google Cloud документований | Найпряміша відповідність обраній інфраструктурі |
| Claude | Публічного self-serve fine-tuning Claude API немає | Можливий контроль якості генерації, без обіцянки власного SFT |
| OpenAI GPT | Нова організація не може почати self-serve SFT; сервіс згортається | Не обираємо як основу нового навчального циклу |
| Gemma з відкритими вагами | Managed tuning/експорт ваг і власний serving | Більше контролю, але додає розгортання й ресурси моделі; зараз відкладаємо |

Джерела: [Gemini SFT support](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/supervised-tuning), [Claude glossary: fine-tuning](https://platform.claude.com/docs/en/about-claude/glossary), [OpenAI SFT notice](https://developers.openai.com/api/docs/guides/supervised-fine-tuning), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [Google open-model tuning](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tuning/open-model-tuning).

Claude доступний у Google Cloud. OpenAI offering теж існує, але як Private Preview із перевіркою доступу через Google account team. Наявність сторінки не означає доступ нашому проєкту або покриття кредитами. [Google-managed Claude](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed), [OpenAI on Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/openai).

Не обираємо модель лише тому, що вона є у старому tuning tutorial. Перед реалізацією перевіряємо GA/retirement для точного ID; старі Gemini 2.5 у lifecycle вже retired, хоча tuning-сторінки ще можуть їх згадувати. [Поточний lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions).

## Вартість

USD за 1 млн токенів, standard uncached PayGo на дату дослідження. Output включає оплачувані reasoning tokens. Це ціни сервісу, не виміряна собівартість нашої заявки.

| Модель | Global input / output | Non-global input / output | SFT за 1 млн training tokens |
|---|---:|---:|---:|
| 3.1 Flash-Lite, текст | $0.25 / $1.50 | $0.275 / $1.65 | $3 |
| 3.5 Flash-Lite | $0.30 / $2.50 | $0.33 / $2.75 | $3 |
| 3.5 Flash | $1.50 / $9.00 | $1.65 / $9.90 | $10 |

Training tokens = токени навчального набору × епохи. Для tuned Gemini 3 non-global inference коштує 1.5× відповідного base inference; global — як base. Storage, виклики оцінювання й інші послуги оплачуються окремо. [Офіційні ціни та примітки](https://cloud.google.com/model-garden/pricing).

Власний ілюстративний розрахунок: 300 прикладів × 1500 токенів × 3 епохи = 1.35 млн training tokens; Lite ≈ $4.05, Flash ≈ $13.50 лише за training. Кількість, токенізація, епохи й фактичний кошторис ще не визначені. Це не дозвіл на витрати й не оцінка всього навчального процесу. Найбільше роботи — підготувати достовірні target-відповіді.

## Доступ і покриття кредитами — до платного запуску

Поточні правила Free Trial виключають покриття Gemini platform/Vertex AI Welcome-кредитом для signup **або paid upgrade на/після 16.11.2026**. AI Studio Gemini API та partner managed models також не оплачуються цим Welcome credit. Non-billable trial обмежує GPU, Marketplace і підвищення квот. Ці правила стосуються саме Free Trial; інші навчальні промо перевіряються за їхніми умовами. [Google Free Program, During the Free Trial](https://docs.cloud.google.com/free/docs/free-cloud-features).

Перевірити приватно конкретний billing/credit entitlement, дати, API/IAM, inference/SFT quota й регіони. Видимий залишок кредиту не є доказом покриття конкретного AI SKU. Не змінювати billing поспіхом через дату; upgrade може створити реальні зобов'язання оплати. Доступ і покриття нашого проєкту **ще не підтверджені**. Hosting у Google Cloud залишається прийнятим рішенням; модельний бюджет — окрема перевірка.

## Як це підключаємо

Один серверний adapter; модель, location, prompt/schema version і max output — у конфігурації. Використовуємо runtime service identity, а не ключ у браузері. Логи містять request/job ID, версії, токени, тривалість і validation outcome без повного тексту приватних документів.

Пам'ять бізнесу живе в PostgreSQL. Поточні правила гранту передаються з джерел у контекст. Розрахунки й перевірки прав — у коді. Донавчання має покращити конкретне мовне завдання, а не запам'ятовувати дедлайни чи замінити бюджетний калькулятор.

До релізу порівняти кандидати на невеликому заздалегідь узгодженому українському наборі: повні/неповні факти, суперечливий документ, розділ заявки, зміна суми. Перевірити факти, доречні уточнення, стиль, формат, latency/tokens/cost. Перший прогін має обмежений погоджений бюджет. Витік між користувачами або вигаданий критичний факт зупиняє реліз сценарію. Результатів такого порівняння ще немає.

[План справжнього донавчання](ai-training-plan.md) · [Звіти дослідників](agents/README.md)
