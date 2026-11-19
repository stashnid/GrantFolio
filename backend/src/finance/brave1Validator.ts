import type { ValidationIssue } from "./grantValidator.js";

export interface Brave1Milestone {
  title: string;
  duration_months: number;
  deliverable: string;
  cost_kopecks: number;
}

export interface Brave1ValidationContext {
  title?: string;
  current_trl?: number;
  target_trl?: number;
  trl_evidence?: string;
  rd_milestones?: Brave1Milestone[];
  bom_and_rd_budget?: Array<{ name: string; category?: string; kopecks: number }>;
  total_kopecks?: string | number;
  all_text_fields?: string[];
}

export interface Brave1ValidationResult {
  valid: boolean;
  blocking_errors: ValidationIssue[];
  warnings: ValidationIssue[];
  trl_transition: { current: number; target: number };
  reconciliation: {
    milestones_total_kopecks: number;
    budget_total_kopecks: number;
    difference_kopecks: number;
    matches: boolean;
  };
}

export function validateBrave1Project(context: Brave1ValidationContext): Brave1ValidationResult {
  const blocking_errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const current_trl = Number(context.current_trl || 0);
  const target_trl = Number(context.target_trl || 0);

  // 1. TRL Validation
  if (current_trl < 1 || current_trl > 9) {
    blocking_errors.push({
      code: "INVALID_CURRENT_TRL",
      field: "current_trl",
      message: "Поточний рівень TRL має бути цілим числом від 1 до 9.",
      severity: "blocking_error",
      currentValue: current_trl,
    });
  } else if (current_trl < 3) {
    blocking_errors.push({
      code: "TRL_BELOW_MINIMUM",
      field: "current_trl",
      message: `Поточний TRL ${current_trl} нижче мінімального вхідного порогу кластера Brave1 (TRL 3). Програма фінансує розробки з підтвердженим лабораторним зразком або розрахунковим стендом, а не ідеї на стадії концепту.`,
      severity: "blocking_error",
      currentValue: current_trl,
      requiredValue: 3,
    });
  }

  if (target_trl < 1 || target_trl > 9) {
    blocking_errors.push({
      code: "INVALID_TARGET_TRL",
      field: "target_trl",
      message: "Цільовий рівень TRL має бути цілим числом від 1 до 9.",
      severity: "blocking_error",
      currentValue: target_trl,
    });
  } else if (target_trl <= current_trl && current_trl >= 1) {
    blocking_errors.push({
      code: "TARGET_TRL_NOT_PROGRESSING",
      field: "target_trl",
      message: `Цільовий TRL (${target_trl}) повинен бути вищим за поточний TRL (${current_trl}). Мета гранту Brave1 — перехід технології на вищий рівень зрілості.`,
      severity: "blocking_error",
      currentValue: target_trl,
      requiredValue: current_trl + 1,
    });
  }

  // 2. R&D Milestones
  const milestones = Array.isArray(context.rd_milestones) ? context.rd_milestones : [];
  if (milestones.length < 2) {
    blocking_errors.push({
      code: "INSUFFICIENT_MILESTONES",
      field: "rd_milestones",
      message: `Зазначено ${milestones.length} етапів R&D. Для оцінки та виплати траншів Brave1 вимагає мінімум 2 деталізовані контрольні точки.`,
      severity: "blocking_error",
      currentValue: milestones.length,
      requiredValue: 2,
    });
  }

  // 3. Budget & Milestones Reconciliation
  const milestonesTotalKopecks = milestones.reduce((sum, m) => sum + (Number(m.cost_kopecks) || 0), 0);
  const budgetTotalKopecks = Number(context.total_kopecks || 0);

  if (budgetTotalKopecks <= 0 && milestonesTotalKopecks <= 0) {
    blocking_errors.push({
      code: "EMPTY_RND_BUDGET",
      field: "total_kopecks",
      message: "Сума R&D бюджету дорівнює нулю. Необхідно заповнити BOM-кошторис або етапи розробки.",
      severity: "blocking_error",
    });
  }

  const diffKopecks = Math.abs(milestonesTotalKopecks - budgetTotalKopecks);
  const matches = budgetTotalKopecks > 0 && milestonesTotalKopecks > 0 && diffKopecks === 0;

  if (budgetTotalKopecks > 0 && milestonesTotalKopecks > 0 && diffKopecks > 0) {
    warnings.push({
      code: "BUDGET_RECONCILIATION_MISMATCH",
      field: "rd_milestones",
      message: `Сума R&D етапів (${(milestonesTotalKopecks / 100).toLocaleString("uk-UA")} грн) не збігається із загальним кошторисом проєкту (${(budgetTotalKopecks / 100).toLocaleString("uk-UA")} грн). Різниця: ${(diffKopecks / 100).toLocaleString("uk-UA")} грн.`,
      severity: "warning",
      currentValue: milestonesTotalKopecks,
      requiredValue: budgetTotalKopecks,
    });
  }

  // 4. OPSEC Checks
  const textsToCheck = [
    context.title || "",
    context.trl_evidence || "",
    ...(context.all_text_fields || []),
    ...milestones.map((m) => `${m.title} ${m.deliverable}`),
  ].join(" ");

  // GPS coordinates pattern
  if (/\b(?:[1-8]\d\.\d{4,8}|90\.0000)\s*,\s*(?:1[0-7]\d\.\d{4,8}|[1-9]?\d\.\d{4,8}|180\.0000)\b/i.test(textsToCheck)) {
    blocking_errors.push({
      code: "OPSEC_GPS_COORDINATES_DETECTED",
      message: "УВАГА OPSEC: У тексті виявлено числові географічні координати. За правилами безпеки Brave1 публікація точних координат лабораторій чи позицій суворо заборонена.",
      severity: "blocking_error",
    });
  }

  // Military unit designation pattern (Cyrillic and Latin, Unicode-safe without ASCII \b)
  if (/(?:^|[\s,.:;()"—-])(?:в[\s/.]*ч[\s.]*[А-ЯA-Za-z]\d{4}|військов\S+\s+частин\S+\s+[А-ЯA-Za-z]\d{4})(?:$|[\s,.:;()"—-])/iu.test(textsToCheck)) {
    warnings.push({
      code: "OPSEC_MILITARY_UNIT_DETECTED",
      message: "ПОПЕРЕДЖЕННЯ OPSEC: У тексті виявлено ймовірне найменування військової частини (в/ч). Замість номерів використовуйте нейтральне формулювання «підрозділ Сил оборони України».",
      severity: "warning",
    });
  }

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings,
    trl_transition: { current: current_trl, target: target_trl },
    reconciliation: {
      milestones_total_kopecks: milestonesTotalKopecks,
      budget_total_kopecks: budgetTotalKopecks,
      difference_kopecks: diffKopecks,
      matches,
    },
  };
}
