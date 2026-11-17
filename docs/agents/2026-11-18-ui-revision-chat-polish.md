# Повна UI/UX ревізія, анімації та чат у стилі ChatGPT / Claude / Gemini — 18.11.2026

- **Координатор**: Antigravity (Gemini 3.8 Flash).
- **Делеговані агенти**:
  - Аудит (паралельно): `code-explorer` (CSS/типографіка/чат-архітектура), `a11y-architect` (WCAG 2.2 AA, контраст, touch-targets, motion), `react-reviewer` (React-стан, кліки, життєвий цикл анімацій, IME/scroll), живий Chrome CDP аудит BEFORE/AFTER (Desktop `1440×900` + Mobile `390×844`).
  - Реалізація (паралельно, неперетинні файли): Worker 1 (`UI Foundations & Shell Designer`), Worker 2 (`Flagship AI Chat Engineer`), Worker 3 (`Catalog, Projects & Profile Polish Engineer`).
  - Незалежний огляд після правок: `code-reviewer` (`APPROVE`, 0 CRITICAL / 0 HIGH / 0 MEDIUM).
- **Дата**: 18.11.2026. **База**: `b65ba29` (`feat/assistant-document-quality` поверх `origin/main` `fe378fe`), із повним збереженням усіх локальних змін якості порад і документів. **Гілка публікації**: `feat/ui-polish-chat-revision`.
- **Fresh remote check**: `git fetch origin` підтвердив актуальність `origin/main` (`fe378fe`) та появу нової гілки `origin/codex/official-pdf-export`.
- **Статус**: done.

## Реалізовані зміни

1. **Чат ШІ-асистента у стандарті ChatGPT / Claude / Gemini (`ReplyReveal.tsx`, `Advisor.tsx/css`, `Assistant.tsx/css`)**:
   - Виправлено **критичний баг анімації** у `ReplyReveal.tsx`: кнопка «Показати всю відповідь» тепер коректно скасовує `requestAnimationFrame` через `frameRef` і `doneRef`, зупиняючи появу без відкату тексту.
   - **Плаваючий pill-композер** із м'яким верхнім градієнтом, авто-розширенням `textarea` (`46px → 180px`, `resize: none`), повним IME-захистом (`!e.repeat && !e.nativeEvent.isComposing && e.keyCode !== 229`) та круглою градієнтною кнопкою відправки (`border-radius: 50%`).
   - **Повідомлення та проза**: центрована стрічка (`760px`), м'яка бульбашка користувача (`#eef3fb`, без візуального шуму мітки «Ви», збережена `sr-only`), чиста проза асистента без зайвих рамок із геометричним SVG-емблемою-іскрою, 3-крапковою хвилею мислення (`.typing-wave`), розширеним безпечним Markdown (`` `code` ``, `> blockquote`, `---`) без `dangerouslySetInnerHTML`.
   - **Паритет дій**: додано кнопку «Копіювати» зі статусом та `aria-live` у `Advisor.tsx` (раніше була лише в `Assistant.tsx`), плаваючу кнопку «Вниз ↓» при прокрутці вгору, 2×2 картки стартових промптів із чистими SVG-іконками (без емодзі та повторюваних `↗`), усунено дублювання «Нова розмова» в бічній історії, оновлено модалку порівняння пропозицій (backdrop-клік, кнопка `×`, чіткі межі колонок).
   - Порожній чат проєкту в `Assistant.tsx` залишається у верхній точці вітального екрана, а не прокручується вниз.

2. **Стиль, типографіка, мобільний хедер і WCAG 2.2 AA (`index.html`, `style.css`, `workspace.css`, `SessionRecovery.css`, `App.tsx`, `EmailLoginCode.tsx`, `Feedback.tsx`)**:
   - Додано `<link rel="preload">` для локальних кириличного (`manrope-1.woff2`) та латинського (`manrope-5.woff2`) підмножин Manrope.
   - Виправлено критичний баг невидимого виділення тексту `::selection` (темний текст на темному тлі -> `#dbe8ff` / `#0f1d32`).
   - Повністю очищено залишкові смарагдово-зелені тіні/підкладки в усіх CSS-файлах на користь узгодженої темно-синьої палітри (`rgba(15, 29, 50, ...)`).
   - Усунено всі випадки `transition: all` на користь явних compositor-безпечних властивостей; додано `text-wrap: balance/pretty`, `font-variant-numeric: tabular-nums` і тактильний відгук `scale(0.975)`.
   - Виправлено **мобільний хедер** (`≤900px`): кнопка «Меню» вирівняна до `42px` (раніше розтягувалася по висоті), додано `aria-label` та прихований `span` замість `font-size: 0` на кнопці виходу, додано розмиту підкладку `.mobile-nav-scrim` і закриття по `Escape`.
   - Покращено контраст `--color-text-faint` та placeholder до `#595e73` (`≥6.3:1` AA), виправлено `aria-invalid`/`aria-describedby` у формах входу/OTP/відгуків, розгорнуто форму «Відгуки» без зайвого `<details>` з 44×44px інтерактивними зірками.

3. **Каталог грантів, проєкти та профіль бізнесу (`GrantCatalog.tsx/css`, `Cases.tsx`, `BusinessProfile.tsx/css`, `KvedPicker.tsx`)**:
   - Згруповано фільтри каталогу в компактну панель `.catalog-toolbar-panel` — перша картка програми тепер одразу видима на першому екрані (`top: 692px` на `1440×900`).
   - Вирівняно breadcrumb у деталях програми, додано `useMemo` для пошуку/фільтрації, повернення з деталей по `Escape` та індивідуальні `aria-label` із назвою програми.
   - У `Cases.tsx` замінено `key={index}` у динамічному редакторі бюджету на стабільні `clientId` (ізольовані від API-запитів), додано очищення таймерів/Blob URL при розмонтуванні та `aria-current="step"`/`aria-controls`.
   - У `BusinessProfile` оновлено навігацію розділів до сегментованого контролу, збільшено touch-target кнопок видалення КВЕД (`32×32px`), виправлено `aria-controls` у `KvedPicker.tsx` та `rel="noopener noreferrer"`.

## Перевірки

- `npm run typecheck`: **PASS** (0 помилок).
- `npm run build`: **PASS** (`tsc` + `vite build` за ~0.8 с).
- `git diff --check`: **PASS** (без артефактів).
- `npm test`: **105/105 PASS** (0 провалів, включно з PostgreSQL, auth, advisor/assistant/document quality, discovery).
- Незалежний `code-reviewer`: **APPROVE** (0 CRITICAL / 0 HIGH / 0 MEDIUM).
- Живий headless Chrome CDP аудит (BEFORE vs AFTER, Desktop `1440×900` + Mobile `390×844`): **0 консольних помилок, 0 винятків, 0 failed network requests, 0 горизонтального переповнення (`scrollWidth === innerWidth`)**; підтверджено авто-розширення поля (`46px → 98px`), коректний skip `ReplyReveal`, видимість каталогу вище згину, `Escape` у деталях і шторці, 42px мобільну кнопку «Меню» та 44×44px зірки відгуку. Локальна перевірка у браузері; production cloud deploy цією задачею не виконувався.
