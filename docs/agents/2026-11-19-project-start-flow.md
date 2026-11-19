# Назва й початкова вкладка проєкту

- Координатор: Codex Sol. Гілка `codex/project-start-flow`, база після інтеграції свіжого main304efbe; owned path `frontend/src/Cases.tsx` і документація передачі.
- Запит: «Новий проєкт» має вести до актуальної «Готовність та експорт»; «Готувати робочу чернетку» має просити власну назву.
- Виявлено: preparation effect автоматично створював справу з 80 символів seed у title; generic create задавав programId=null, тому показував старий загальний review без GrantApplication.
- Зміни: обидва входи відкривають форму з порожньою обов’язковою назвою; seed лише в initialDescription (max2000). Новий проєкт без окремо обраної програми використовує пілот vlasna-sprava, що явно пояснено у формі. Guided-проєкти після create/select відкривають review, а редагування лишається за чинним серверним payment gate. Власні назви існуючих справ не перезаписуються. Підтвердження незбережених правок і create idempotency збережені.
- Перевірки: TypeScript typecheck, Vite production build (`--configLoader runner` через node_modules symlink), diff-check PASS. Нова грошова операція не виконувалась.
