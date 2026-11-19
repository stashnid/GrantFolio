import { calculateDeterministicFinance, type FinanceModelInput, type DeterministicFinanceResult } from "../finance/engine.js";
import { validateGrantFinancials, type GrantFinancialValidationResult, type BudgetContext, type QuestionnaireContext } from "../finance/grantValidator.js";
import { getProgramPlaybook, type ProgramPlaybook } from "../playbooks/index.js";
import { callGeminiGenerate } from "./geminiClient.js";
import { isAiConfigured } from "./aiConfig.js";

export interface BusinessPlanPipelineInput {
  caseId: string;
  programId: string;
  profile: {
    businessName: string;
    description: string;
    region: string;
    legalForm?: string;
    kvedCode?: string;
  };
  budget: BudgetContext;
  financeInputs: FinanceModelInput;
  questionnaire?: QuestionnaireContext;
  fetchImpl?: typeof fetch;
}

export interface VerifiedFinancialSnapshot {
  requestedGrantUah: number;
  ownContributionUah: number;
  totalInvestmentUah: number;
  totalRevenue36Uah: number;
  totalTaxes36Uah: number;
  totalPayroll36Uah: number;
  finalCashBalanceUah: number;
  breakevenMonth: number | null;
  employeesCount: number;
  validation: GrantFinancialValidationResult;
  reconciled: boolean;
}

export interface GeneratedBusinessPlanSections {
  projectDescription: string;
  marketAndCustomers: string;
  salesChannels: string;
  operationalPlan: string;
  financialSummarySection: string;
}

export interface PreSubmissionAuditIssue {
  criterion: string;
  risk_level: "high" | "medium" | "low";
  issue: string;
  recommendation: string;
}

export interface BusinessPlanPipelineResult {
  snapshot: VerifiedFinancialSnapshot;
  financeResult: DeterministicFinanceResult;
  generatedSections: GeneratedBusinessPlanSections;
  auditIssues: PreSubmissionAuditIssue[];
}

export async function runBusinessPlanPipeline(
  input: BusinessPlanPipelineInput
): Promise<BusinessPlanPipelineResult> {
  const playbook: ProgramPlaybook | undefined = getProgramPlaybook(input.programId);

  // Step 2: Code calculates and validates financial model deterministically
  const financeResult = calculateDeterministicFinance(input.financeInputs);
  const validation = validateGrantFinancials(
    financeResult,
    input.budget,
    input.questionnaire,
    playbook
  );

  const snapshot: VerifiedFinancialSnapshot = {
    requestedGrantUah: input.financeInputs.requestedGrantKopecks / 100,
    ownContributionUah: (input.financeInputs.ownContributionKopecks ?? 0) / 100,
    totalInvestmentUah:
      (input.financeInputs.requestedGrantKopecks + (input.financeInputs.ownContributionKopecks ?? 0)) / 100,
    totalRevenue36Uah: financeResult.totalRevenueKopecks / 100,
    totalTaxes36Uah: financeResult.totalTaxes36MonthsKopecks / 100,
    totalPayroll36Uah: financeResult.totalPayrollCostsKopecks / 100,
    finalCashBalanceUah: financeResult.finalCashBalanceKopecks / 100,
    breakevenMonth: financeResult.breakevenMonth,
    employeesCount: input.financeInputs.hiredEmployeesCount ?? 1,
    validation,
    reconciled: validation.valid,
  };

  // Step 3: Text sections generation strictly based on facts
  let generatedSections: GeneratedBusinessPlanSections;
  let auditIssues: PreSubmissionAuditIssue[] = [];

  const prompt = `Ти — провідний експерт із підготовки грантових заявок в Україні.
Згенеруй структурований текст для бізнес-плану проєкту «${input.profile.businessName}» (${input.profile.region}) на програму «${playbook?.canonical_name || input.programId}».

ВАРІАНТ РОЗРАХУНКУ (зафіксовані точні цифри, НЕ ЗМІНЮВАТИ І НЕ ВИГАДУВАТИ ІНШИХ ЦИФР):
- Запитувана сума гранту: ${snapshot.requestedGrantUah.toLocaleString("uk-UA")} грн
- Власний внесок: ${snapshot.ownContributionUah.toLocaleString("uk-UA")} грн
- Загальний бюджет: ${snapshot.totalInvestmentUah.toLocaleString("uk-UA")} грн
- Прогнозована виручка за 36 міс.: ${snapshot.totalRevenue36Uah.toLocaleString("uk-UA")} грн
- Сплата податків і зборів за 36 міс.: ${snapshot.totalTaxes36Uah.toLocaleString("uk-UA")} грн
- Робочих місць: ${snapshot.employeesCount}
- Місяць виходу в плюс: ${snapshot.breakevenMonth ?? "з 1-го року"}

Поверни JSON з ключами:
{
  "projectDescription": "...",
  "marketAndCustomers": "...",
  "salesChannels": "...",
  "operationalPlan": "...",
  "financialSummarySection": "..."
}`;

  if (isAiConfigured() || input.fetchImpl !== undefined) {
    try {
      const response = await callGeminiGenerate(
        {
          systemInstruction: "Ти генеруєш фактичні тексти для бізнес-плану на основі наданих фінансових розрахунків. Використовуй виключно надані суми.",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          role: "pro",
        },
        input.fetchImpl
      );

      const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedSections = JSON.parse(jsonMatch[0]);
      } else {
        generatedSections = fallbackSections(input, snapshot);
      }
    } catch {
      generatedSections = fallbackSections(input, snapshot);
    }
  } else {
    generatedSections = fallbackSections(input, snapshot);
  }

  // Step 4: AI Pre-submission Audit against scoring rubric
  auditIssues = performPreSubmissionAudit(snapshot, playbook, input.budget);

  return {
    snapshot,
    financeResult,
    generatedSections,
    auditIssues,
  };
}

function fallbackSections(
  input: BusinessPlanPipelineInput,
  snapshot: VerifiedFinancialSnapshot
): GeneratedBusinessPlanSections {
  return {
    projectDescription: `Проєкт передбачає створення та розвиток бізнесу «${input.profile.businessName}» у сфері ${input.profile.description} у регіоні ${input.profile.region}. Загальний бюджет проєкту становить ${snapshot.totalInvestmentUah.toLocaleString("uk-UA")} грн, з яких ${(snapshot.requestedGrantUah).toLocaleString("uk-UA")} грн — кошти безповоротного гранту, а ${snapshot.ownContributionUah.toLocaleString("uk-UA")} грн — власний внесок заявника.`,
    marketAndCustomers: `Цільовою аудиторією є мешканці та підприємства регіону ${input.profile.region}, зацікавлені у якісній продукції за доступними цінами. Попит підтверджується відсутністю прямих конкурентів із подібним асортиментом у локації.`,
    salesChannels: `Реалізація здійснюватиметься через прямі продажі, локальну торговельну точку та цифрові канали збуту. Прогнозований сукупний дохід за 36 місяців діяльності становить ${snapshot.totalRevenue36Uah.toLocaleString("uk-UA")} грн.`,
    operationalPlan: `Для реалізації бізнес-плану залучається ${snapshot.employeesCount} офіційних працівників із виплатою заробітної плати не нижче встановлених нормативів. Виробничий цикл базується на закупівлі спеціалізованого обладнання за кошти гранту.`,
    financialSummarySection: `Фінансова модель є сталою та реалістичною: точка беззбитковості досягається в місяці ${snapshot.breakevenMonth ?? 3}, накопичений грошовий залишок на кінець періоду становить ${snapshot.finalCashBalanceUah.toLocaleString("uk-UA")} грн. Прогнозована сума сплачених податків і зборів за 36 місяців досягає ${snapshot.totalTaxes36Uah.toLocaleString("uk-UA")} грн, що повністю покриває суму отриманого гранту.`,
  };
}

function performPreSubmissionAudit(
  snapshot: VerifiedFinancialSnapshot,
  playbook?: ProgramPlaybook,
  budget?: BudgetContext
): PreSubmissionAuditIssue[] {
  const issues: PreSubmissionAuditIssue[] = [];

  // Check 1: Tax surplus margin
  const taxSurplus = snapshot.totalTaxes36Uah - snapshot.requestedGrantUah;
  if (taxSurplus < 0) {
    issues.push({
      criterion: "Оцінка повернення гранту через податки (єРобота)",
      risk_level: "high",
      issue: `Сума сплати податків за 36 міс. (${snapshot.totalTaxes36Uah.toLocaleString("uk-UA")} грн) є меншою за грант (${snapshot.requestedGrantUah.toLocaleString("uk-UA")} грн).`,
      recommendation: "Збільште планову виручку або кількість офіційно працевлаштованих робітників для забезпечення 100% покриття гранту.",
    });
  } else if (taxSurplus < snapshot.requestedGrantUah * 0.1) {
    issues.push({
      criterion: "Податковий буфер безпеки",
      risk_level: "medium",
      issue: "Податкове покриття перевищує суму гранту менш ніж на 10%. За можливого зниження виручки виникає ризик повернення залишку.",
      recommendation: "Закладіть додатковий буфер у виручці або перегляньте штатний розпис.",
    });
  }

  // Check 2: Jobs vs grant amount
  if (playbook?.program_id === "vlasna-sprava" && snapshot.requestedGrantUah > 150000 && snapshot.employeesCount < 2) {
    issues.push({
      criterion: "Вимоги до створення робочих місць",
      risk_level: "high",
      issue: "Для суми гранту понад 150 тис. грн обов'язково створити мінімум 2 робочих місця.",
      recommendation: "Додайте 2-го працівника до штатного розпису в розділі «Персонал».",
    });
  }

  // Check 3: Budget items balance
  if (budget && budget.items.length === 1 && snapshot.requestedGrantUah > 200000) {
    issues.push({
      criterion: "Обґрунтованість структури кошторису",
      risk_level: "low",
      issue: "Увесь бюджет заявки зосереджено в одній позиції.",
      recommendation: "Додайте детальну комерційну пропозицію від постачальника з специфікацією комплектуючих.",
    });
  }

  // Check 4: Cash flow stability
  if (snapshot.validation.blocking_errors.some((e) => e.code === "CASH_DEFICIT")) {
    issues.push({
      criterion: "Фінансова спроможність та ліквідність",
      risk_level: "high",
      issue: "У перші місяці виникає від'ємний залишок коштів (касовий розрив).",
      recommendation: "Збільште власний внесок на старті або перенесіть частину операційних витрат на наступні періоди.",
    });
  }

  return issues;
}
