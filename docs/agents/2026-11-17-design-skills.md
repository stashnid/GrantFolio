# Додані дизайн-скіли — 17.11.2026

Прямий запит користувача: додати redesign-existing-projects і UI/UX Pro Max до наявних ECC/gstack/Karpathy тільки для GrantFolio. Встановлено локально у `.agents/skills/`, глобальні каталоги/конфігурації не змінювалися. Завантажені інструменти не додаються до Git; версії збережені у локальному manifest.

- [redesign-existing-projects](https://github.com/Leonxlnx/taste-skill/blob/e04409a461022e1b9d0e898eac6b9224e2b9dc4e/skills/redesign-skill/SKILL.md): upstream HEAD `f6b7657` більше не має окремого скіла під цим ім’ям. Знайдено останнє окреме визначення `name: redesign-existing-projects` у `skills/redesign-skill`; встановлено ref `e04409a461022e1b9d0e898eac6b9224e2b9dc4e` під запитаним ім’ям.
- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/e59ff376a41f7ca47b7541ad5c116495cbade3ee/.claude/skills/ui-ux-pro-max): встановлено повний skill із references/data/scripts, ref `e59ff376a41f7ca47b7541ad5c116495cbade3ee`.

Інсталяція через перевірений skill-installer із явним `--dest` проєкту замість глобальної установки. SKILL.md прочитані до використання; Python3 search `error summary validation --domain ux -n 2` успішно повернув релевантні Focusable Error Summary / Error Messages. Дані запиту загальні, приватні дані не надсилалися. Скіли будуть доступні для виявлення у наступних запитах і можуть читатися за локальним шляхом уже зараз.

Сфера застосування — інтерфейс, доступність, адаптивність і візуальна ієрархія. Вони не є джерелом фінансових фактів і не оцінюють зміст грантових документів. Поради upstream про вигадані приклади/дати не застосовуються до фактичних даних, відгуків або документів GrantFolio. Вибраний користувачем стиль і чинні правила достовірності мають пріоритет; ця задача не змінює узгоджену світлу/темно-синю тему лише через загальні рекомендації скіла.
