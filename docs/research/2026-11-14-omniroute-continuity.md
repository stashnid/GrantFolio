# OmniRoute: продовження роботи після квот

14.11.2026. Координатор gpt-6.1-sol. Перевірено свіжий upstream HEAD19197b16c41236d65e1e7c73bef01217ad04396f, release/v3.8.54; локальний checkout чистий. Fresh heads GrantFolio без нових комітів, зміни V1 збережено. Встановлення npm runtime3.8.53 завершилось:1331 packages; lifecycle scripts вимкнено, сервер шлюзу ще не перевірений. Mac:16GiB RAM, виміряно sysctl.

## Висновок

Нескінченних безкоштовних хмарних квот немає. Практична безперервність: незалежні дозволені API-квоти + автоматичний fallback + локальна Ollama як останній резерв. Це не гарантує однакової якості/швидкості й не усуває мережеві або апаратні збої. Локальна модель знімає зовнішню квоту, але потребує RAM/CPU/диску. Для Mac16GiB почати з невеликої4B-моделі;8B і контекст перевірити вимірюванням, не припускати frontier-якість.

## Що реально вміє шлюз

- docs/OMNIROUTE_PROVIDER_FAILOVER.md: quota429/402 переходять на інший провайдер; вичерпаний той самий не повторюється. Типово максимум3 provider attempts. Після першого streamed byte fallback не виконується: потрібна обробка відновлення клієнтом.
- docs/routing/AUTO-COMBO.md: auto/coding, auto/cheap, priority combos, quota-aware routing. auto/offline означає перевагу доступної квоти, а не локальну роботу без інтернету.
- auto category/tier filter може бути fail-open: порожній набір повертає весь pool. auto/cheap не гарантує0витрат. Для строго безкоштовної роботи потрібні конкретний combo/явні дозволені targets, відсутність платних emergency fallback і перевірка фактичного provider response.
- Префікс provider/model сам по собі не перемикається між провайдерами. Для нашої черги використовувати exact combo name.
- Антигравіті onboarding guide технічно описує OAuth, shared quota IDE/CLI/шлюз; це не нова квота. Не стверджувати, що підтримки немає. Але guide застарілий, містить непідтверджені назви/команди, зокрема неправильний npm namespace; не виконувати їх сліпо.
- FREE_TIERS.md суперечить собі: вступ обіцяє виключати tos:avoid зauto, наступний розділ називає flag лише advisory. Не покладатися на автоматичний захист/оголошені сукупні токени.
- Google Antigravity Terms §6 прямо обмежують сторонній OAuth proxy access. Не робити імпорт Google-сесії основою схеми; офіційний Antigravity доступ залишається окремим інструментом.
- CLI-TOOLS.md описує Codex CLI consumer конфігурацію. Підключення поточного desktop-чату/його built-in agents не доведене; перевіряти окремий клієнт через /v1/responses, tool calls і continuation.

## Запропонована конфігурація

Один explicit priority combo grantfolio-dev: Groq GPT-OSS120B → перевірений Gemini3.5 Flash-Lite → конкретна підтримувана tool-capable OpenRouter free модель → локальна Ollama. Це кандидати, а не вже підключений маршрут. Лише Gemini direct API перевірено. Не перемикати бізнес/юридичні рішення на слабку модель без перевірки. Обмежені retries, cooldown за провайдером, короткі задачі та передача у GitHub. Одна основна задача + один рецензент замість масового fan-out. Compression виміряти спочатку на логах; не стиснути точні умови/контракти.

## Критерій приймання

1. Шлюз на loopback з ключем, реальні дозволені provider connections.
2. Успішний короткий tool-call coding workflow.
3. Контрольований429 тест → наступний target, без retry loop/платного fallback.
4. Недоступні хмарні targets → локальна відповідь, з видимим ім'ям моделі.
5. Вичерпання поточного Codex plan не маскується як вирішене, доки окремий client-agent маршрут фактично не запущено.

Джерела: локальні файли зазначені вище; https://github.com/cheaper-inference/OmniRoute ; https://antigravity.google/terms ; https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.54/docs/routing/AUTO-COMBO.md . Доступи/оплата/сеанси не змінені в межах дослідження.
