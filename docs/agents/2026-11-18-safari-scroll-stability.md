# Звіт: Виправлення нестабільного прокручування та вертикальних стрибків у Safari/WebKit

- Автор/агент: Antigravity + незалежний `code-reviewer`
- Дата, branch, base commit і результат fresh remote check: 2026-11-18, `fix/safari-scroll-stability`, base `origin/main` `892ab23` (первинне відтворення виконано на `5d0ddfc`, перед публікацією повторно виконано `git fetch --all --prune` та виконано чистий rebase на актуальний `origin/main` `892ab23`; робота велася в ізольованому git worktree, незакомічені локальні правки на `feat/styled-confirm-dialog` в основному робочому дереві повністю збережено без змін).
- Статус: done.
- Задача й межі дозволеного:
  - Відтворити у Safari/WebKit на macOS нестабільне прокручування, вертикальний зсув верхнього каркаса, появу темно-синьої смуги змінної висоти над навігацією та основним вмістом і появу посилання «Перейти до вмісту» у розділі «Профіль бізнесу» → «Розсилка грантів».
  - Встановити підтверджену причину через фактичні стилі, координати й стан фокуса; розрізнити Safari rubber-band overscroll, зсув верстки та програмне прокручування.
  - Усунути причину мінімальними змінами без видалення skip-link, без приховування фокуса, без глобального перехоплення `wheel`/`touchmove`, без `scrollTo(0, 0)`/`overflow: hidden` та без змін API, авторизації чи поштової логіки.
- Файли у власності; погоджені контракти:
  - Frontend CSS: `frontend/src/style.css`, `frontend/src/workspace.css`, `frontend/src/BusinessProfile.css`
  - Документація: `docs/agents/2026-11-18-safari-scroll-stability.md`, `docs/STATUS.md`, `docs/WORKLOG.md`

## План і хід роботи

- 2026-11-18: Перевірено локальний Git-стан (`feat/styled-confirm-dialog` із незакоміченими локальними правками), виконано `git fetch --all --prune` (`origin/main` = `5d0ddfc`), прочитано `AGENTS.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`.
- 2026-11-18: Створено чистий git worktree на гілці `fix/safari-scroll-stability` від `origin/main` (`5d0ddfc`), запущено локальний dev-стек із локальними PostgreSQL та Firebase Auth Emulator (без надсилання реальних листів) і тестовий профіль з увімкненою розсилкою грантів.
- 2026-11-18: Відтворено проблему в нативному macOS `WKWebView` (Safari 18.5 `WebKit.framework`, 20621.2.5.11.8) з реальними трекпадними `NSEvent` scroll-жестами на розділі «Профіль бізнесу» → «Розсилка грантів» (`1440×900`):
  - Підтверджено відсутність сторонніх вкладених областей прокручування (`scrollables: []`, `docScrollHeight: 2354`, `docClientHeight: 819`), відсутність програмного прокручування при перемиканні вкладок чи фокусі та відсутність зсуву верстки при появі `.skip-link`.
  - Підтверджено, що `<meta name="theme-color" content="#122441" />` (`frontend/index.html`) встановлює в WebKit `themeColor = sRGB(0.0706, 0.1412, 0.2549)` (`#122441` — темно-синій), який Safari на macOS використовує як `underPageBackgroundColor` для області overscroll над документом.
  - Під час трекпадних жестів прокручування вгору на верхній межі (`scrollY = 0`) та повернення до початку без `overscroll-behavior-y` кореневий viewport у WebKit зміщувався у від’ємну область до `scrollY = -76px` (`topbar.top = +76px`), зсуваючи верхній каркас вниз і відкриваючи темно-синю смугу змінної висоти (`#122441`), після чого відскакував назад до `0`.
  - Підтверджено, що `.skip-link` у неактивному стані мав координати `top: -72.8px, bottom: -26.8px, height: 46px` (`position: fixed; top: 10px; transform: translateY(-180%)`) при **`opacity: 1`**, **`visibility: visible`**, **`clip-path: none`** та **`pointer-events: auto`**. Через це при rubber-band overscroll глибше `-27px` (у Safari macOS `ScrollingTreeFixedNode` зсуває `position: fixed` шари вниз разом із документом при `scrollY < 0`) намальоване посилання «Перейти до вмісту» опинялося прямо у видимій темно-синій смузі над інтерфейсом, попри відсутність фокуса (`activeElement = BODY`).
- 2026-11-18: Застосовано мінімальне CSS-виправлення:
  - `frontend/src/style.css`: додано `overscroll-behavior-y: none;` на `html` і `body` — усуває вертикальний rubber-band overscroll за межі сторінки у Safari/WebKit без блокування нормального прокручування.
  - `frontend/src/workspace.css`: для неактивного `.skip-link` додано `opacity: 0; pointer-events: none; clip-path: inset(50%);` (з повним відновленням `opacity: 1; pointer-events: auto; clip-path: none; transform: translateY(0);` на `:focus, :focus-visible`), а для мобільної ширини (`@media (max-width: 900px)`) додано `scroll-margin-top: 60px;` на `main.workspace`, щоб активація skip-link не ховала `.workspace-topbar` під sticky-шапкою висотою 60px.
  - `frontend/src/BusinessProfile.css`: під час мобільної перевірки (`390×844`) на вкладці «Розсилка грантів» виявлено горизонтальне переповнення (`scrollWidth: 429 > innerWidth: 390`), спричинене відсутністю `min-width: 0` у grid-елемента `.bp-section` та `.bp-preview-subject` (`white-space: nowrap`). Додано `min-width: 0` на `.bp-section`, `flex: none` на `.bp-preview-dot` та `flex: 1; min-width: 0` на `.bp-preview-subject`.
- 2026-11-18: Проведено повне повторне тестування у macOS WebKit (Safari 18.5 `WebKit.framework`) на desktop (`1440×900`) і mobile (`390×844`), у Chromium (`1440×900` і `390×844`), а також перевірки проєкту (`typecheck`, `build`, `npm test`, `git diff --check`) та незалежне рев’ю.

## Рішення й докази

- **Підтверджена причина**: поєднання двох CSS-дефектів із поведінкою Safari macOS:
  1. Відсутність `overscroll-behavior-y: none` на `html`/`body` у поєднанні з `<meta name="theme-color" content="#122441" />` дозволяло Safari rubber-band прокручуванню відводити `scrollY` до `-76px`, зсуваючи весь верхній каркас вниз і відкриваючи темно-синю смугу змінної висоти.
  2. `.skip-link` ховався лише через `transform: translateY(-180%)` (`bottom: -26.8px`) без візуального обрізання чи `opacity: 0`, тому фактично залишався намальованим за 26.8px над вікном і виринав на темно-синій смузі при глибшому overscroll навіть без фокуса.
  3. Додатково на мобільній ширині (`390×844`) `.bp-section` і `.bp-preview-subject` без `min-width: 0` створювали горизонтальне переповнення +39px на вкладці «Розсилка грантів», а активація skip-link без `scroll-margin-top: 60px` прокручувала `.workspace-topbar` під 60px sticky-хедер.
- **Примітка про середовище Safari**: системний `safaridriver` на цій машині повернув `Allow remote automation` вимкненим у Safari Settings, тому відтворення й повторна перевірка WebKit виконані через нативний macOS `WKWebView` (той самий системний `WebKit.framework` Safari 18.5 `20621.2.5.11.8` із нативними трекпадними `NSEvent` scroll-жестами та `themeColor -> underPageBackgroundColor`).

## Змінені файли й перевірки

- Змінені файли:
  - `frontend/src/style.css`
  - `frontend/src/workspace.css`
  - `frontend/src/BusinessProfile.css`
  - `docs/agents/2026-11-18-safari-scroll-stability.md`
  - `docs/STATUS.md`
  - `docs/WORKLOG.md`
- Перевірки:
  - **macOS WebKit (Safari 18.5 `WebKit.framework`) Desktop (`1440×900`)**:
    - До виправлення: повторний жест вгору на верхній межі → `minScrollY: -76.0`, `maxTopbarTop: 76.0`; `.skip-link` у стані без фокуса `top: -72.8, bottom: -26.8, opacity: 1, clipPath: none`.
    - Після виправлення: прокручування вниз (`endScrollY: 720.0`), повернення вгору (`minScrollY: 0.0, maxTopbarTop: 0.0`), подвійний жест вгору на верхній межі (`minScrollY: 0.0, maxTopbarTop: 0.0`), фокус `.skip-link` (`top: 10, opacity: 1, clipPath: none`, `topbar.top: 0` — без зсуву верстки), активація `.skip-link` (`activeElement = MAIN#main-content.workspace`, `.skip-link` знову `opacity: 0, clipPath: inset(50%)`), перемикання вкладок (`Бізнес` ↔ `Розсилка грантів`, `scrollY: 0`), незбережені зміни + прокручування до низу (`scrollY: 1505`, `.bp-save` видима й активна) + збереження (`«Зміни збережено.»`), `horizOverflow: false` (`1432 <= 1440`). — **PASS**.
  - **macOS WebKit (Safari 18.5 `WebKit.framework`) Mobile (`390×844`)**:
    - Повернення вгору та повторні жести вгору на верхній межі: `minScrollY: 0.0, maxTopbarTop: 60.0`.
    - Фокус і активація `.skip-link`: з’являється при фокусі без зсуву, після активації `scrollY: 0`, `topbar.top: 60` (не ховається під sticky-шапкою).
    - Горизонтальне переповнення: `scrollWidth: 382 <= innerWidth: 390` (`horizOverflow: false` на всіх кроках).
    - Збереження змін: `«Зміни збережено.»` — **PASS**.
  - **Chromium (`1440×900` та `390×844`)**:
    - Desktop: `overscroll-behavior-y: none`, реальний `Tab` фокусує `.skip-link` (`top: 10, opacity: 1, topbar.top: 0`), `Enter` переводить фокус на `MAIN#main-content.workspace`, перемикання вкладок без стрибків, збереження частоти («Миттєво») і перевірка після `reload` (`persistedLabel: "Миттєво"`, `matched: true`), `horizOverflow: false`.
    - Mobile (`390×844`): мобільне меню (`data-mobile-open="true"`), `Tab`/`Enter` на `.skip-link` (`scrollY: 0, topbar.top: 60`), прокручування до низу (`scrollY: 3500`), `horizOverflow: false` (`390 <= 390`). — **PASS**.
  - `npm run typecheck`: **PASS** (0 помилок).
  - `npm run build`: **PASS** (`tsc` + `vite build`, 173 модулі).
  - `npm test`: **PASS** (**156/156** тестів, 0 провалів).
  - `git diff --check`: **PASS**.
  - Незалежне рев’ю `code-reviewer`: **APPROVE** (0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW; підтверджено коректність `overscroll-behavior-y: none`, WCAG 2.2 AA SC 2.4.1/2.4.7/2.4.11 для `.skip-link`, `scroll-margin-top: 60px` та мобільне виправлення `min-width: 0`).

## Передача

- Опубліковано гілку `fix/safari-scroll-stability` та відкрито PR до `main` без merge/deploy.
- Оновлено `docs/STATUS.md`, `docs/WORKLOG.md` та цей звіт.
