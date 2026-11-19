import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialPlan, financialBusinessPlanRowsMatch, financialPlanSchema } from "../src/grant-financial-plan.js";

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

test("reconciles official expense, payroll, tax rows and one-time grant timing", () => {
  const rows = {
    additionalSalesKopecks: 0, assetSaleIncomeKopecks: 0, otherIncomeKopecks: 0,
    propertyPurchaseKopecks: 0, premisesRentKopecks: 0, equipmentRentalKopecks: 0, otherBusinessCostsKopecks: 0,
    utilitiesKopecks: 0, insuranceKopecks: 0, marketingKopecks: 400, communicationsKopecks: 0,
    equipmentKopecks: 1000, repairsKopecks: 0, transportKopecks: 0, professionalServicesKopecks: 0,
    applicantSalaryKopecks: 0, existingStaffSalaryKopecks: 0, newStaffSalaryKopecks: 1000,
    simplifiedTaxKopecks: 50, simplifiedMilitaryLevyKopecks: 0, fopTaxableIncomeKopecks: 0,
    fopIncomeTaxKopecks: 0, fopMilitaryLevyKopecks: 0, fopEsvKopecks: 0,
    ecologicalTaxKopecks: 0, rentPaymentKopecks: 0,
  };
  const months = Array.from({ length: 24 }, () => ({ ...empty }));
  months[0] = { ...empty, grantKopecks: 12000, operatingCostsKopecks: 400, capitalCostsKopecks: 1000,
    payrollKopecks: 1000, taxesKopecks: 50 };
  const emptyRows = Object.fromEntries(Object.keys(rows).map(key => [key, 0])) as typeof rows;
  const businessPlanRows = Array.from({ length: 24 }, () => ({ ...emptyRows }));
  businessPlanRows[0] = rows;
  const plan = { openingBalanceKopecks: 0, months, businessPlanRows };
  assert.equal(financialBusinessPlanRowsMatch(plan, "fop_simplified"), true);
  assert.equal(calculateFinancialPlan(plan).totals.taxesKopecks, 270);
  assert.equal(financialBusinessPlanRowsMatch(plan, "company_general"), false);
  assert.equal(financialBusinessPlanRowsMatch({ ...plan, businessPlanRows: businessPlanRows.slice(1) }, "fop_simplified"), false);
  assert.equal(financialBusinessPlanRowsMatch({ ...plan, months: months.map((month, index) => index === 1 ? { ...month, grantKopecks: 1 } : month) }, "fop_simplified"), false);
});
