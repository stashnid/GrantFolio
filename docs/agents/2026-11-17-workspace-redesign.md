# Редизайн GrantFolio — 17.11.2026

- Координатор: поточний Codex. Виконавці: gpt-6.1-terra (chat_design та catalog_profile_design); незалежна browser QA: gpt-6.1-sol (browser_review). Координатор не перевидається за Astra, модель сесії не перемикалася.
- Branch: feat/considered-workspace-redesign; base: 7e6aaaa5a4be983735beb075e2ab2dd21a8a5872.
- Fresh remote heads перевірено 17.11: main збігається з base; локальних змін на старті немає. Переглянуто останній premium-ui merge.
- Статус: done. Scope: візуальний дизайн й зручність чинних сценаріїв без зміни API, даних або paid calls.
- Ownership: координатор — App.tsx, style.css, workspace.css, документація; Terra A — Advisor.tsx/Advisor.css/Assistant.tsx/Assistant.css; Terra B — GrantCatalog.tsx/GrantCatalog.css/BusinessProfile.tsx/BusinessProfile.css.

## Напрям
Software workspace: теплий світлий canvas, глибокий смарагдовий navigation rail, виразна типографіка Manrope, тонкі лінії, послідовні відступи, компактні статуси й чітка головна дія. Зберегти дані, recovery, українські тексти, джерела, клавіатуру й mobile. Не застосовувати маркетингові full-screen секції чи shader до робочих форм. UI/UX search Swiss style доречний; wellness font pairing та landing pattern відхилено як невідповідні продукту.

## Перевірки
- `npm run typecheck`, `npm run build`, `npm test`: PASS, 66/66 tests; `git diff --check`: PASS.
- Terra реалізували визначені вище ділянки; catalog_profile_design виконав незалежний статичний review shell/chat без підтверджених дефектів. Sol виконав Chrome QA на localhost:5173 з локальними Firebase Auth Emulator та PostgreSQL.
- Desktop 1440, tablet 768, mobile 390: переглянуті advisor/catalog/profile/projects. Перевірено mobile navigation, видимий keyboard focus, відсутність горизонтального overflow, save/reload вигаданого профілю та опису вигаданого проєкту. Browser console errors: 0 на перевірених шляхах.
- Інтеграційно виправлені висота чату з topbar, контраст історії на темній панелі, ширина мобільного composer та flex overflow форми проєкту. Збережені API, recovery, validation і джерела.
- Застосовано Taste (візуальна ієрархія, plain copy), UI/UX Pro Max (пошук напряму), ECC frontend/accessibility та gstack browser workflow. Landing-only fullscreen/shader/kit gates не переносили на чинні робочі форми; це scoped app redesign, не новий marketing site.
- Screenshots: `/private/tmp/grantfolio-redesign/final-*.png` (локальні, з вигаданими QA-даними, не користувацькі докази для навчального звіту).

## Передача і межі

Локальна версія доступна на http://localhost:5173, dev services запущено для перевірки. Live Gemini у QA вимкнено; paid model calls/HTTPS deployment/push/merge не виконувалися. Локальний тестовий акаунт та проєкт позначені QA. Перевірка не є повним аудитом WCAG або оцінкою живої генерації. Поточні джерела каталогу можуть повідомляти про недоступність повторної перевірки; це чинна обробка freshness, не прихована заглушка.

Оновлено STATUS і WORKLOG. Продуктовий scope, backend і навчальні deliverables не розширені. Durable lesson: новий application topbar слід віднімати від висоти scrollable chat; загальний `header` selector має бути обмежений головним хедером, щоб не впливати на заголовки каталогу.


## Публікація за новим дозволом — 17.11

Користувач надав постійний дозвіл одразу commit/push після змін; правило додано в AGENTS.md. Перед публікацією повторний `ls-remote` підтвердив main 7e6aaaa та відсутність однойменної remote task branch. Типи/збірка, 66 tests і browser QA виконані у цьому чаті; після них додано лише документаційне правило/записи передачі. Редизайн і правило передаються одним task commit. Результат push і URL PR перевіряються після публікації.


GitHub прийняв `ab0193a02d45d8dac8253eeee8bbfc153d3a29c7`; свіжий `git ls-remote` підтвердив точний SHA. Відкрито [PR №5](https://github.com/stashnid/GrantFolio/pull/5) до main, без merge/deploy. Локальні перевірки PASS зазначені вище; remote CI не оголошується успішним без окремого результату. Цей запис передано наступним документаційним комітом.
