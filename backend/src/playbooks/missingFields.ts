export interface MissingFieldItem {
  field_key: string;
  label_uk: string;
  why_required_uk: string;
}

export interface MissingFieldsResult {
  program_id: string | null;
  filled_count: number;
  total_required_count: number;
  missing_fields: MissingFieldItem[];
  is_complete: boolean;
}

export interface ProjectStateContext {
  title?: string;
  program_id?: string | null;
  details?: Record<string, unknown> | null;
  items?: unknown[] | null;
  total_kopecks?: string | number | null;
  profile?: Record<string, unknown> | null;
}

function isUsefulString(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const s = val.trim();
  if (s.length === 0) return false;
  if (/^(?:todo|tbd|placeholder|заповнити|не знаю|\.{3}|…|\[.*?\])$/iu.test(s)) return false;
  return true;
}

export function computeMissingRequiredFields(
  programId: string | null | undefined,
  projectState: ProjectStateContext = {}
): MissingFieldsResult {
  const normId = programId === "brave1" ? "ua-brave1-core" : (programId ?? null);
  const details = (projectState.details && typeof projectState.details === "object" ? projectState.details : {}) as Record<string, unknown>;
  const items = Array.isArray(projectState.items) ? projectState.items : [];
  const hasBudget = items.length > 0 && items.some((it: any) => (it.unitPriceKopecks ?? it.kopecks ?? 0) > 0);

  if (normId === "vlasna-sprava") {
    const required: { key: string; label: string; why: string; check: () => boolean }[] = [
      {
        key: "projectDescription",
        label: "Опис бізнес-ідеї та продукту",
        why: "Комісія оцінює життєздатність проєкту та його ринкову потребу.",
        check: () => isUsefulString(details.projectDescription),
      },
      {
        key: "customers",
        label: "Цільова аудиторія та клієнти",
        why: "Необхідно підтвердити наявність платоспроможного попиту.",
        check: () => isUsefulString(details.customers),
      },
      {
        key: "salesChannels",
        label: "Канали збуту та маркетинг",
        why: "Показує спосіб залучення клієнтів і генерації виручки.",
        check: () => isUsefulString(details.salesChannels),
      },
      {
        key: "implementationPlan",
        label: "План реалізації та строки",
        why: "Оцінюється реалістичність запуску справи за 6 місяців.",
        check: () => isUsefulString(details.implementationPlan),
      },
      {
        key: "expectedResults",
        label: "Очікувані фінансові результати",
        why: "Потрібно для перевірки повернення гранту через податки за 36 місяців.",
        check: () => isUsefulString(details.expectedResults),
      },
      {
        key: "budget",
        label: "Кошторис витрат гранту",
        why: "Витрати мають відповідати дозволеним категоріям Порядку № 738.",
        check: () => hasBudget,
      },
    ];

    const missing_fields: MissingFieldItem[] = [];
    let filled_count = 0;
    for (const req of required) {
      if (req.check()) {
        filled_count++;
      } else {
        missing_fields.push({
          field_key: req.key,
          label_uk: req.label,
          why_required_uk: req.why,
        });
      }
    }

    return {
      program_id: normId,
      filled_count,
      total_required_count: required.length,
      missing_fields,
      is_complete: missing_fields.length === 0,
    };
  }

  if (normId === "veteran-grant") {
    const required: { key: string; label: string; why: string; check: () => boolean }[] = [
      {
        key: "projectDescription",
        label: "Опис ветеранського бізнес-проєкту",
        why: "Оцінка життєздатності ідеї та соціального ефекту для ветеранів.",
        check: () => isUsefulString(details.projectDescription),
      },
      {
        key: "customers",
        label: "Клієнти та ринкова ніша",
        why: "Підтвердження стабільного попиту на товари/послуги.",
        check: () => isUsefulString(details.customers),
      },
      {
        key: "salesChannels",
        label: "Канали збуту та маркетинг",
        why: "Механізм забезпечення грошового потоку бізнесу.",
        check: () => isUsefulString(details.salesChannels),
      },
      {
        key: "implementationPlan",
        label: "Покроковий план відкриття",
        why: "Реалістичність термінів створення робочих місць.",
        check: () => isUsefulString(details.implementationPlan),
      },
      {
        key: "expectedResults",
        label: "Очікувані доходи та податки",
        why: "Оцінка повернення суми гранту через сплату ЄСВ та податків.",
        check: () => isUsefulString(details.expectedResults),
      },
      {
        key: "veteranStatus",
        label: "Статус заявника (УБД / подружжя)",
        why: "Визначає право на участь та максимальний поріг гранту.",
        check: () =>
          details.veteranStatus === "ubd" ||
          details.veteranStatus === "spouse" ||
          projectState.profile?.isVeteran === true ||
          projectState.profile?.veteranStatus === "ubd" ||
          projectState.profile?.veteranStatus === "spouse",
      },
      {
        key: "fundingTier",
        label: "Обрана сума гранту (250k / 500k / 1M)",
        why: "Впливає на норматив нових робочих місць та вимогу співфінансування 70/30.",
        check: () =>
          details.fundingTier === 250000 ||
          details.fundingTier === 500000 ||
          details.fundingTier === 1000000 ||
          typeof details.fundingTier === "number",
      },
      {
        key: "budget",
        label: "Кошторис проєкту",
        why: "Обґрунтування потреби в обладнанні та сировині.",
        check: () => hasBudget,
      },
    ];

    const missing_fields: MissingFieldItem[] = [];
    let filled_count = 0;
    for (const req of required) {
      if (req.check()) {
        filled_count++;
      } else {
        missing_fields.push({
          field_key: req.key,
          label_uk: req.label,
          why_required_uk: req.why,
        });
      }
    }

    return {
      program_id: normId,
      filled_count,
      total_required_count: required.length,
      missing_fields,
      is_complete: missing_fields.length === 0,
    };
  }

  if (normId === "ua-brave1-core") {
    const required: { key: string; label: string; why: string; check: () => boolean }[] = [
      {
        key: "project_title",
        label: "Несекретна назва оборонної розробки",
        why: "Ідентифікатор проєкту в кластері Brave1.",
        check: () => isUsefulString(details.project_title) || isUsefulString(projectState.title),
      },
      {
        key: "defense_category",
        label: "Оборонна категорія (ППО, РЕБ, БПЛА тощо)",
        why: "Визначає профільну комісію військових експертів Генштабу ЗСУ.",
        check: () => isUsefulString(details.defense_category),
      },
      {
        key: "operational_problem",
        label: "Бойова задача та переваги",
        why: "Яку проблему військових вирішує та чим перевершує аналоги противника.",
        check: () => isUsefulString(details.operational_problem),
      },
      {
        key: "technical_solution_public",
        label: "Несекретний опис технології",
        why: "Архітектура, діапазони та принцип роботи без секретних частот/алгоритмів.",
        check: () => isUsefulString(details.technical_solution_public),
      },
      {
        key: "current_trl",
        label: "Поточний рівень TRL (1–9)",
        why: "Підтверджує стадію розробки (для фінансування Brave1 потрібен TRL 3+).",
        check: () => typeof details.current_trl === "number" && details.current_trl >= 1 && details.current_trl <= 9,
      },
      {
        key: "target_trl",
        label: "Цільовий рівень TRL (1–9)",
        why: "Результат, який буде досягнуто за кошти гранту.",
        check: () => typeof details.target_trl === "number" && details.target_trl >= 1 && details.target_trl <= 9,
      },
      {
        key: "trl_evidence",
        label: "Докази готовності (тести/стенд)",
        why: "Посилання на несекретні відео/фото випробувань діючого зразка.",
        check: () => isUsefulString(details.trl_evidence),
      },
      {
        key: "rd_milestones",
        label: "Етапи R&D та дорожня карта",
        why: "Мінімум 2-3 контрольні точки з вартістю для виплати траншів.",
        check: () => Array.isArray(details.rd_milestones) && details.rd_milestones.length >= 2,
      },
      {
        key: "team_engineering_background",
        label: "Інженерна команда",
        why: "Досвід ключових розробників у сфері hard/soft miltech.",
        check: () => isUsefulString(details.team_engineering_background),
      },
      {
        key: "testing_and_scaling_plan",
        label: "План випробувань та кодифікації",
        why: "Порядок тестування на полігоні та допуску до експлуатації ЗСУ.",
        check: () => isUsefulString(details.testing_and_scaling_plan),
      },
      {
        key: "supply_chain_and_risks",
        label: "Ланцюг постачання та ризики",
        why: "Оцінка залежності від імпортних компонентів та захист від зриву постачання.",
        check: () => isUsefulString(details.supply_chain_and_risks),
      },
      {
        key: "budget",
        label: "BOM-кошторис R&D",
        why: "Розподіл гранту на компоненти, збірку, тестування та команду.",
        check: () => hasBudget || (Array.isArray(details.bom_and_rd_budget) && details.bom_and_rd_budget.length > 0),
      },
    ];

    const missing_fields: MissingFieldItem[] = [];
    let filled_count = 0;
    for (const req of required) {
      if (req.check()) {
        filled_count++;
      } else {
        missing_fields.push({
          field_key: req.key,
          label_uk: req.label,
          why_required_uk: req.why,
        });
      }
    }

    return {
      program_id: normId,
      filled_count,
      total_required_count: required.length,
      missing_fields,
      is_complete: missing_fields.length === 0,
    };
  }

  return {
    program_id: normId,
    filled_count: 0,
    total_required_count: 0,
    missing_fields: [],
    is_complete: true,
  };
}
