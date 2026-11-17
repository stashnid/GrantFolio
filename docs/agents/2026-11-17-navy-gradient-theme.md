# Темно-синя палітра з градієнтами — 17.11.2026

- Base: c4d8d495e247fca63d0a554c6cca62eadb7ccd47, branch feat/navy-gradient-theme.
- Fresh fetch/heads: main оновлено ff-only з 77161bf до c4d8d49; чистий стан збережено. Переглянуто release preparation та окрему незлиту гілку google-button-profile-ai-performance (не інтегрована автоматично).
- Scope: темно-синя premium тема з градієнтами, усі чинні сценарії входу/OTP/каталогу/профілю зберігаються. Без production data mutations або платних викликів.
- Ownership: Terra navy_styles — frontend/**/*.css та frontend/index.html theme-color; координатор — docs і перевірки. Sol browser QA — без source edits.
- Актуальний production: https://grantfolio.pp.ua/, Cloud Run за HTTPS LB; запуск підтверджений release report. Публікація Git дозволена постійним правилом; новий deploy не заявляється без фактичного виконання.
- Статус: done.


## Реалізація

Terra navy_styles оновив спільні токени, CSS екранів, recovery/pilot та information.css, theme-color. Координатор узгодив SVG favicon, додав контрастну кнопку альтернативного входу, footer links, градієнтні поверхні з урахуванням lazy CSS та окремі чорні заголовки друкованого експорту. TSX, API, Google/OTP-поведінка, дані, залежності та конфігурація GCP не змінювалися.

UI/UX Pro Max пошук `dark financial dashboard` підтвердив dark navy surfaces/light text як придатний напрям; зелений accent замінений синьо-блакитним за прямим запитом. Taste принципи спокійної типографіки й ясних дій збережено; no-shader для форм. Моделі: gpt-6.1-terra реалізація, gpt-6.1-sol незалежна browser QA, поточний Codex координує.

## Перевірки

- Typecheck/build/diff-check PASS. Зміна лише стилів і favicon, нові unit-тести не додавалися.
- Sol read-only перевірив чинні production homepage/privacy/terms: HTTP200; не створював акаунтів і не надсилав листів на production.
- Локальна QA із порожнім GEMINI_API_KEY й Firebase Emulator/PostgreSQL; production дані не змінювалися.
- Browser QA desktop1440, tablet768, mobile390: advisor/catalog/profile/projects/auth; немає горизонтального overflow. Знайдено й виправлено світлий край CTA gradient (4.34→4.85:1) та напівпрозорий світлий фон active step numeral. Основний muted text 9.13:1, sidebar не нижче6.79:1 на перевірених парах. Це вибіркова перевірка, не повний WCAG аудит.
- Локальні докази: /private/tmp/grantfolio-navy/final-*.png; копії фінального preview збережено в Codex visualization folder. Фактичний production дизайн цим локальним preview не підміняється.

## Межі передачі

Публікація task branch/PR після перевірок за постійним дозволом користувача. Чинний https://grantfolio.pp.ua залишається окремою розгорнутою версією; новий deploy/merge цією CSS-зміною не запускається. Автоматичного deployment у поточному GitHub workflow немає (тільки Prototype checks). Для оновлення live потрібен окремий release за infra/README.md з перевіреним image/revision, збереженням secret/env та попередньої traffic revision.


## Фінальна незалежна QA

Sol: print через CDP — h1/h2/th rgb(17,17,17) на білому; PASS. Active step numeral темний alpha фон підтверджений, найнижчий перевірений desktop contrast4.85:1. Mobile menu open/close, focus3px, scrollWidth=viewport1440/768/390 PASS. Основні screenshots перевірені координатором. Є наявний local-only404 POST `/api/auth/email-code/clear` під час logout; source auth/API цим завданням не змінювався. Live OTP delivery/Google OAuth не повторювалися, тому нова перевірка їх поведінки не заявляється. Повноцінний WCAG аудит не виконувався.


## Публікація

GitHub прийняв `51a8ce95914e0da53211d34c7f5219573d87eb6e`; свіжий ls-remote підтвердив SHA. [PR №10](https://github.com/stashnid/GrantFolio/pull/10) до main, без merge/deploy. Цей запис передається наступним документаційним комітом; remote CI ще не заявляється PASS.
