# Назва й початкова вкладка проєкту

- Координатор: Codex Sol. Гілка `codex/project-start-flow`, база після інтеграції свіжого main304efbe; owned path `frontend/src/Cases.tsx` і документація передачі.
- Запит: «Новий проєкт» має вести до актуальної «Готовність та експорт»; «Готувати робочу чернетку» має просити власну назву.
- Виявлено: preparation effect автоматично створював справу з 80 символів seed у title; generic create задавав programId=null, тому показував старий загальний review без GrantApplication.
- Зміни: обидва входи відкривають форму з порожньою обов’язковою назвою; seed лише в initialDescription (max2000). Новий проєкт без окремо обраної програми використовує пілот vlasna-sprava, що явно пояснено у формі. Guided-проєкти після create/select відкривають review, а редагування лишається за чинним серверним payment gate. Власні назви існуючих справ не перезаписуються. Підтвердження незбережених правок і create idempotency збережені.
- Перевірки: TypeScript typecheck, Vite production build (`--configLoader runner` через node_modules symlink), diff-check PASS. Нова грошова операція не виконувалась.
- Незалежне Terra review: закриття форми для attach-to-existing, захист stale асинхронного підтвердження й синхронний in-flight guard для create виправлені. Прибрано твердження про верифіковану актуальність офіційної анкети; показується робоча форма пілота.

## Публікація та реліз
PR32 https://github.com/stashnid/GrantFolio/pull/32, head97b598c. CI run44468163983: перший запуск мав 401 у concurrent donation auth-emulator test; обидва donations tests локально PASS; rerun failed verify job завершився SUCCESS без змін цього коду. Merge PR32 автоматично відхилено approval review: routine authorization не включає merge/default branch та запуск deployment, потрібно явне погодження саме PR32. Merge і deployment цієї зміни не виконані; production лишається попередньою версією. Код і докази готові до погодження.
