import type { DeterministicFinanceResult } from "./engine.js";
import type { ProgramPlaybook } from "../playbooks/schema.js";

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: "blocking_error" | "warning";
  currentValue?: number | string;
  requiredValue?: number | string;
}

export interface GrantFinancialValidationResult {
  valid: boolean;
  blocking_errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface BudgetContext {
  totalKopecks: number;
  items: {
    name: string;
    category?: string;
    kopecks: number;
  }[];
}

export interface QuestionnaireContext {
  requestedGrantKopecks?: number;
  ownContributionKopecks?: number;
  hiredEmployeesCount?: number;
  newJobs?: number;
}

export function validateGrantFinancials(
  financeResult: DeterministicFinanceResult,
  budget: BudgetContext,
  questionnaire: QuestionnaireContext = {},
  playbook?: ProgramPlaybook | null
): GrantFinancialValidationResult {
  const blocking_errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const requestedGrantKopecks = questionnaire.requestedGrantKopecks ??
    (financeResult.months[0]?.grantKopecks || budget.totalKopecks);

  // 1. Касовий розрив (Cash deficit check)
  if (financeResult.hasCashDeficit) {
    blocking_errors.push({
      code: "CASH_DEFICIT",
      field: "closingBalanceKopecks",
      message: `Виявлено касовий розрив: грошовий залишок опускається нижче нуля у місяцях: ${financeResult.deficitMonths.join(", ")}. Грантові комісії Ощадбанку та Дія автоматично відхиляють бізнес-плани з касовим дефіцитом.`,
      severity: "blocking_error",
    });
  }

  // 2. Податкове покриття (36-month tax payback for єРобота / Власна справа / Ветерани)
  const isTaxPaybackRequired = playbook?.eligibility_rules.tax_payback_months === 36 ||
    playbook?.program_id === "vlasna-sprava" ||
    playbook?.program_id === "veteran-grant";

  if (isTaxPaybackRequired) {
    const taxSurplus = financeResult.totalTaxes36MonthsKopecks - requestedGrantKopecks;
    if (taxSurplus < 0) {
      const deficitUah = Math.abs(taxSurplus) / 100;
      blocking_errors.push({
        code: "TAX_PAYBACK_DEFICIT",
        field: "totalTaxes36MonthsKopecks",
        message: `Дефіцит податкового повернення: за 36 місяців прогнозується сплата ${(financeResult.totalTaxes36MonthsKopecks / 100).toLocaleString("uk-UA")} грн податків і ЄСВ, що на ${deficitUah.toLocaleString("uk-UA")} грн менше за суму гранту (${(requestedGrantKopecks / 100).toLocaleString("uk-UA")} грн). Підприємець зобов'язаний повернути різницю державі. Збільште виручку або штат.`,
        severity: "blocking_error",
        currentValue: financeResult.totalTaxes36MonthsKopecks,
        requiredValue: requestedGrantKopecks,
      });
    }
  }

  // 3. Робочі місця (Job requirements check)
  const jobs = questionnaire.newJobs ?? questionnaire.hiredEmployeesCount ?? 1;

  if (playbook?.program_id === "vlasna-sprava") {
    const threshold150 = 150_000_00;
    if (requestedGrantKopecks > threshold150 && jobs < 2) {
      blocking_errors.push({
        code: "INSUFFICIENT_JOBS_VLASNA_SPRAVA",
        field: "newJobs",
        message: `Для мікрогранту понад 150 000 грн (ваша сума: ${(requestedGrantKopecks / 100).toLocaleString("uk-UA")} грн) обов'язкове створення щонайменше 2 робочих місць. Зазначено: ${jobs}.`,
        severity: "blocking_error",
        currentValue: jobs,
        requiredValue: 2,
      });
    } else if (jobs < 1) {
      blocking_errors.push({
        code: "MIN_ONE_JOB_REQUIRED",
        field: "newJobs",
        message: "Для отримання гранту обов'язкове створення щонайменше 1 офіційного робочого місця на 36 місяців.",
        severity: "blocking_error",
        currentValue: jobs,
        requiredValue: 1,
      });
    }
  } else if (playbook?.program_id === "veteran-grant") {
    if (requestedGrantKopecks > 500_000_00 && jobs < 4) {
      blocking_errors.push({
        code: "INSUFFICIENT_JOBS_VETERAN_1M",
        field: "newJobs",
        message: `Для ветеранського гранту понад 500 000 грн обов'язкове створення не менше 4 робочих місць. Зазначено: ${jobs}.`,
        severity: "blocking_error",
        currentValue: jobs,
        requiredValue: 4,
      });
    } else if (requestedGrantKopecks > 250_000_00 && jobs < 2) {
      blocking_errors.push({
        code: "INSUFFICIENT_JOBS_VETERAN_500K",
        field: "newJobs",
        message: `Для ветеранського гранту від 250 000 до 500 000 грн обов'язкове створення не менше 2 робочих місць. Зазначено: ${jobs}.`,
        severity: "blocking_error",
        currentValue: jobs,
        requiredValue: 2,
      });
    }
  } else if (playbook?.program_id === "processing-business") {
    if (jobs < 25) {
      blocking_errors.push({
        code: "INSUFFICIENT_JOBS_PROCESSING",
        field: "newJobs",
        message: `Програма «Грант на переробне підприємство» вимагає створення мінімум 25 офіційних робочих місць. Зазначено: ${jobs}.`,
        severity: "blocking_error",
        currentValue: jobs,
        requiredValue: 25,
      });
    }
  }

  // 4. Ліміти бюджету (Budget category caps from playbook)
  if (playbook?.budget_rules) {
    const rules = playbook.budget_rules;

    // Categorize items
    let rentKopecks = 0;
    let marketingKopecks = 0;
    let rawMaterialsKopecks = 0;

    for (const item of budget.items) {
      const name = item.name.toLowerCase();
      const cat = item.category?.toLowerCase() || "";
      if (cat.includes("rent") || name.includes("оренд")) {
        rentKopecks += item.kopecks;
      } else if (cat.includes("market") || name.includes("реклам") || name.includes("маркетинг")) {
        marketingKopecks += item.kopecks;
      } else if (cat.includes("raw") || cat.includes("mater") || name.includes("сировин") || name.includes("матеріал")) {
        rawMaterialsKopecks += item.kopecks;
      }
    }

    if (rules.rent_limit_percent !== undefined) {
      const maxRent = Math.round(requestedGrantKopecks * (rules.rent_limit_percent / 100));
      if (rentKopecks > maxRent) {
        blocking_errors.push({
          code: "RENT_BUDGET_CAP_EXCEEDED",
          message: `Витрати на оренду (${(rentKopecks / 100).toLocaleString("uk-UA")} грн) перевищують ліміт програми (${rules.rent_limit_percent}% = ${(maxRent / 100).toLocaleString("uk-UA")} грн).`,
          severity: "blocking_error",
          currentValue: rentKopecks,
          requiredValue: maxRent,
        });
      }
    }

    if (rules.marketing_limit_percent !== undefined) {
      const maxMarketing = Math.round(requestedGrantKopecks * (rules.marketing_limit_percent / 100));
      if (marketingKopecks > maxMarketing) {
        blocking_errors.push({
          code: "MARKETING_BUDGET_CAP_EXCEEDED",
          message: `Витрати на маркетинг (${(marketingKopecks / 100).toLocaleString("uk-UA")} грн) перевищують ліміт програми (${rules.marketing_limit_percent}% = ${(maxMarketing / 100).toLocaleString("uk-UA")} грн).`,
          severity: "blocking_error",
          currentValue: marketingKopecks,
          requiredValue: maxMarketing,
        });
      }
    }

    if (rules.raw_materials_limit_percent !== undefined) {
      const maxRaw = Math.round(requestedGrantKopecks * (rules.raw_materials_limit_percent / 100));
      if (rawMaterialsKopecks > maxRaw) {
        blocking_errors.push({
          code: "RAW_MATERIALS_BUDGET_CAP_EXCEEDED",
          message: `Витрати на сировину (${(rawMaterialsKopecks / 100).toLocaleString("uk-UA")} грн) перевищують ліміт програми (${rules.raw_materials_limit_percent}% = ${(maxRaw / 100).toLocaleString("uk-UA")} грн).`,
          severity: "blocking_error",
          currentValue: rawMaterialsKopecks,
          requiredValue: maxRaw,
        });
      }
    }
  }

  // 5. Sanity warnings (Адекватність припущень)
  const totalRevenue = financeResult.totalRevenueKopecks;
  const totalOperating = financeResult.totalOperatingCostsKopecks;
  if (totalRevenue > 0) {
    const grossMargin = (totalRevenue - totalOperating) / totalRevenue;
    if (grossMargin > 0.70) {
      warnings.push({
        code: "UNREALISTIC_HIGH_MARGIN",
        message: `Рівень рентабельності становить ${(grossMargin * 100).toFixed(0)}%. Якщо маржа перевищує 70%, грантова комісія може вважати розрахунок собівартості заниженим.`,
        severity: "warning",
      });
    }
  }

  if (financeResult.months.length >= 2) {
    const m1Sales = financeResult.months[0].salesKopecks;
    const m2Sales = financeResult.months[1].salesKopecks;
    if (m1Sales > 0 && m1Sales === m2Sales) {
      warnings.push({
        code: "IMMEDIATE_FULL_CAPACITY",
        message: "Виручка у 1-му місяці дорівнює виручці у подальших місяцях. Рекомендується закласти плавний запуск і нарощування клієнтської бази.",
        severity: "warning",
      });
    }
  }

  return {
    valid: blocking_errors.length === 0,
    blocking_errors,
    warnings,
  };
}
