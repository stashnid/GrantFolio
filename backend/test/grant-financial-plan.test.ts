import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialPlan, financialPlanSchema } from "../src/grant-financial-plan.js";

const empty = { salesKopecks: 0, grantKopecks: 0, ownKopecks: 0, operatingCostsKopecks: 0, payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0 };
test("monthly cash flow carries deficits and reconciles totals without rounding", () => {
  const months = Array.from({ length: 24 }, () => ({ ...empty }));
  months[0] = { ...empty, grantKopecks: 10001, capitalCostsKopecks: 12002 };
  months[1] = { ...empty, ownKopecks: 1000, salesKopecks: 2002, taxesKopecks: 1 };
  const result = calculateFinancialPlan({ openingBalanceKopecks: 0, months });
  assert.equal(result.months[0].closingBalanceKopecks, -2001);
  assert.equal(result.months[1].openingBalanceKopecks, -2001);
  assert.equal(result.months[1].closingBalanceKopecks, 1000);
  assert.deepEqual(result.deficitMonths, [1]);
  assert.equal(result.totals.closingBalanceKopecks, 1000);
  assert.equal(result.totals.incomeKopecks - result.totals.expensesKopecks, 1000);
});
test("accepts only complete supported periods and nonnegative integer inputs", () => {
  for (const length of [24, 36, 60]) assert(financialPlanSchema.safeParse({ openingBalanceKopecks: 0, months: Array.from({ length }, () => empty) }).success);
  assert(!financialPlanSchema.safeParse({ openingBalanceKopecks: 0, months: [empty] }).success);
  assert(!financialPlanSchema.safeParse({ openingBalanceKopecks: 0, months: Array.from({ length: 24 }, () => ({ ...empty, taxesKopecks: 0.5 })) }).success);
  assert(!financialPlanSchema.safeParse({ openingBalanceKopecks: -1, months: Array.from({ length: 24 }, () => empty) }).success);
});
