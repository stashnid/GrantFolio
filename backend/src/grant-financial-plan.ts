import { z } from "zod";

// Integer kopecks keep all calculations exact, including 60-month totals.
const amount = z.number().int().min(0).max(1_000_000_000_000);
const inputAmount = amount.nullable();
export const financialMonthSchema = z.object({
  salesKopecks: inputAmount,
  grantKopecks: inputAmount,
  ownKopecks: inputAmount,
  operatingCostsKopecks: inputAmount,
  payrollKopecks: inputAmount,
  taxesKopecks: inputAmount,
  capitalCostsKopecks: inputAmount,
}).strict();

export const financialPlanSchema = z.object({
  openingBalanceKopecks: inputAmount,
  months: z.array(financialMonthSchema).refine(months => [24, 36, 60].includes(months.length), {
    message: "Фінансовий план повинен охоплювати 24, 36 або 60 місяців.",
  }),
}).strict();

export type FinancialPlan = z.infer<typeof financialPlanSchema>;
export type FinancialMonth = z.infer<typeof financialMonthSchema>;

export function missingFinancialInputs(plan: FinancialPlan) {
  const missing: { month: number | null; field: string }[] = [];
  if (plan.openingBalanceKopecks === null) missing.push({ month: null, field: "openingBalanceKopecks" });
  plan.months.forEach((month, index) => {
    for (const [field, value] of Object.entries(month)) {
      if (value === null) missing.push({ month: index + 1, field });
    }
  });
  return missing;
}

export function calculateFinancialPlan(input: FinancialPlan) {
  const parsed = financialPlanSchema.parse(input);
  if (missingFinancialInputs(parsed).length) throw new Error("Incomplete financial plan");
  // Completeness was checked above; arithmetic only accepts fully specified values.
  const plan = parsed as { openingBalanceKopecks: number; months: Record<keyof FinancialMonth, number>[] };
  let balance = plan.openingBalanceKopecks;
  const totals = {
    salesKopecks: 0, grantKopecks: 0, ownKopecks: 0, operatingCostsKopecks: 0,
    payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0,
  };
  const months = plan.months.map((month, index) => {
    const openingBalanceKopecks = balance;
    for (const field of Object.keys(totals) as (keyof FinancialMonth)[]) totals[field] += month[field];
    const incomeKopecks = month.salesKopecks + month.grantKopecks + month.ownKopecks;
    const expensesKopecks = month.operatingCostsKopecks + month.payrollKopecks + month.taxesKopecks + month.capitalCostsKopecks;
    balance += incomeKopecks - expensesKopecks;
    return {
      ...month, number: index + 1, openingBalanceKopecks, incomeKopecks,
      expensesKopecks, closingBalanceKopecks: balance, deficit: balance < 0,
    };
  });
  const incomeKopecks = totals.salesKopecks + totals.grantKopecks + totals.ownKopecks;
  const expensesKopecks = totals.operatingCostsKopecks + totals.payrollKopecks + totals.taxesKopecks + totals.capitalCostsKopecks;
  return {
    openingBalanceKopecks: plan.openingBalanceKopecks,
    months,
    totals: { ...totals, incomeKopecks, expensesKopecks, closingBalanceKopecks: balance },
    deficitMonths: months.filter(month => month.deficit).map(month => month.number),
  };
}
