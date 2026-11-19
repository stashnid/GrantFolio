import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_MONTHLY_SALARY_KOPECKS,
  FOP_ESV_MIN_KOPECKS,
  FOP2_EP_FIXED_KOPECKS,
  FOP2_MILITARY_LEVY_FIXED_KOPECKS,
  calculateEmployeeTaxes,
  calculateFop2MonthlyTaxes,
  calculateFop3MonthlyTaxes,
} from "../src/finance/taxConfig2026.js";
import { calculateDeterministicFinance } from "../src/finance/engine.js";
import { validateGrantFinancials } from "../src/finance/grantValidator.js";
import { getProgramPlaybook } from "../src/playbooks/index.js";

test("2026 Ukrainian Tax Configuration enforces exact official rates in kopecks", () => {
  assert.equal(MIN_MONTHLY_SALARY_KOPECKS, 800000); // 8,000 UAH
  assert.equal(FOP_ESV_MIN_KOPECKS, 176000); // 22% of 8,000 UAH = 1,760 UAH
  assert.equal(FOP2_EP_FIXED_KOPECKS, 160000); // 1,600 UAH
  assert.equal(FOP2_MILITARY_LEVY_FIXED_KOPECKS, 80000); // 800 UAH

  // FOP Group 2
  const fop2 = calculateFop2MonthlyTaxes();
  assert.equal(fop2.singleTaxKopecks, 160000);
  assert.equal(fop2.militaryLevyKopecks, 80000);
  assert.equal(fop2.esvKopecks, 176000);
  assert.equal(fop2.totalMonthlyTaxesKopecks, 416000); // 4,160 UAH/mo

  // FOP Group 3 with 100,000 UAH turnover (10,000,000 kopecks)
  const fop3 = calculateFop3MonthlyTaxes(10000000);
  assert.equal(fop3.singleTaxKopecks, 500000); // 5% = 5,000 UAH
  assert.equal(fop3.militaryLevyKopecks, 100000); // 1% = 1,000 UAH
  assert.equal(fop3.esvKopecks, 176000); // 1,760 UAH
  assert.equal(fop3.totalMonthlyTaxesKopecks, 776000); // 7,760 UAH/mo

  // Employee with min wage (8,000 UAH)
  const emp = calculateEmployeeTaxes(800000);
  assert.equal(emp.pitKopecks, 144000); // 18% = 1,440 UAH
  assert.equal(emp.militaryLevyKopecks, 40000); // 5% = 400 UAH
  assert.equal(emp.netSalaryKopecks, 616000); // 6,160 UAH in hand
  assert.equal(emp.esvEmployerKopecks, 176000); // 22% = 1,760 UAH
  assert.equal(emp.totalEmployerCostKopecks, 976000); // 9,760 UAH total employer cost
  assert.equal(emp.totalTaxesToStateKopecks, 360000); // 3,600 UAH total taxes paid to budget
});

test("Deterministic Finance Engine accurately calculates 36-month cash flow in kopecks", () => {
  const result = calculateDeterministicFinance({
    taxSystem: "fop_group_2",
    requestedGrantKopecks: 25000000, // 250,000 UAH
    ownContributionKopecks: 5000000, // 50,000 UAH
    openingBalanceKopecks: 1000000, // 10,000 UAH
    hiredEmployeesCount: 2,
    grossSalaryPerEmployeeKopecks: 800000,
    baseMonthlySalesKopecks: 8000000, // 80,000 UAH/mo
    monthlyRentKopecks: 1000000,
    monthlyUtilitiesKopecks: 250000,
    monthlyMarketingKopecks: 150000,
    monthlyRawMaterialsKopecks: 2000000,
    capitalEquipmentMonth1Kopecks: 25000000,
    durationMonths: 36,
  });

  assert.equal(result.durationMonths, 36);
  assert.equal(result.months.length, 36);
  assert.equal(result.financialPlan.months.length, 36);

  // Month 1 checks: receives grant + own contribution
  const m1 = result.months[0];
  assert.equal(m1.grantKopecks, 25000000);
  assert.equal(m1.ownKopecks, 5000000);
  assert.equal(m1.salesKopecks, 3200000); // 40% ramp-up of 80,000 UAH
  assert.equal(m1.capitalCostsKopecks, 25000000);
  assert.equal(m1.payrollKopecks, 1600000); // 2 employees * 8,000 UAH

  // Cash flow remains positive throughout all 36 months
  assert.equal(result.hasCashDeficit, false);
  assert.equal(result.deficitMonths.length, 0);
  assert.ok(result.finalCashBalanceKopecks > 0);

  // 36-month taxes comfortably exceed 250,000 UAH grant
  assert.ok(
    result.totalTaxes36MonthsKopecks > 25000000,
    `Total taxes ${result.totalTaxes36MonthsKopecks / 100} UAH must exceed 250,000 UAH`
  );

  // Diia FinancialPlan row compatibility check
  const planRows = result.financialPlan.businessPlanRows;
  assert.ok(planRows && planRows.length === 36);
  assert.equal(planRows[0].simplifiedTaxKopecks, 160000);
  assert.equal(planRows[0].simplifiedMilitaryLevyKopecks, 80000);
  assert.equal(planRows[0].premisesRentKopecks, 1000000);
});

test("Grant Validator catches cash deficits, tax payback deficits, and job requirement violations", () => {
  const vlasnaSpravaPlaybook = getProgramPlaybook("vlasna-sprava");
  assert.ok(vlasnaSpravaPlaybook);

  // Scenario 1: Deficit in tax payback (1 employee, 250k grant on FOP 2 -> taxes ~279k, but if salary/revenue zero)
  const deficientFinance = calculateDeterministicFinance({
    taxSystem: "fop_group_2",
    requestedGrantKopecks: 25000000,
    ownContributionKopecks: 0,
    openingBalanceKopecks: 0,
    hiredEmployeesCount: 0, // No employees!
    baseMonthlySalesKopecks: 1000000,
    monthlyRentKopecks: 800000,
    monthlyUtilitiesKopecks: 200000,
    monthlyMarketingKopecks: 100000,
    monthlyRawMaterialsKopecks: 200000,
    durationMonths: 36,
  });

  const validation1 = validateGrantFinancials(
    deficientFinance,
    {
      totalKopecks: 25000000,
      items: [{ name: "Обладнання", kopecks: 25000000 }],
    },
    { requestedGrantKopecks: 25000000, newJobs: 0 },
    vlasnaSpravaPlaybook
  );

  assert.equal(validation1.valid, false);
  const errorCodes1 = validation1.blocking_errors.map(e => e.code);
  assert.ok(errorCodes1.includes("TAX_PAYBACK_DEFICIT"), "Catches tax payback deficit");
  assert.ok(errorCodes1.includes("INSUFFICIENT_JOBS_VLASNA_SPRAVA"), "Catches insufficient jobs for 250k");

  // Scenario 2: Cash deficit detection (expenses exceed inflows)
  const cashDeficitFinance = calculateDeterministicFinance({
    taxSystem: "fop_group_2",
    requestedGrantKopecks: 15000000,
    openingBalanceKopecks: 100000, // only 1,000 UAH
    hiredEmployeesCount: 1,
    baseMonthlySalesKopecks: 500000, // 5,000 UAH revenue
    monthlyRentKopecks: 3000000, // 30,000 UAH rent (massive loss!)
    durationMonths: 36,
  });

  assert.equal(cashDeficitFinance.hasCashDeficit, true);
  const validation2 = validateGrantFinancials(
    cashDeficitFinance,
    { totalKopecks: 15000000, items: [{ name: "Піч", kopecks: 15000000 }] },
    { requestedGrantKopecks: 15000000, newJobs: 1 },
    vlasnaSpravaPlaybook
  );
  assert.equal(validation2.valid, false);
  const errorCodes2 = validation2.blocking_errors.map(e => e.code);
  assert.ok(errorCodes2.includes("CASH_DEFICIT"), "Catches cash deficit");

  // Scenario 3: Valid model with full compliance
  const validFinance = calculateDeterministicFinance({
    taxSystem: "fop_group_2",
    requestedGrantKopecks: 25000000,
    ownContributionKopecks: 5000000,
    openingBalanceKopecks: 3000000, // 30,000 UAH working capital
    hiredEmployeesCount: 2,
    grossSalaryPerEmployeeKopecks: 800000,
    baseMonthlySalesKopecks: 8000000,
    monthlyRentKopecks: 1200000,
    monthlyUtilitiesKopecks: 300000,
    monthlyMarketingKopecks: 150000,
    monthlyRawMaterialsKopecks: 2000000,
    capitalEquipmentMonth1Kopecks: 25000000,
    durationMonths: 36,
  });

  const validation3 = validateGrantFinancials(
    validFinance,
    {
      totalKopecks: 25000000,
      items: [
        { name: "Верстат", category: "Обладнання", kopecks: 20000000 },
        { name: "Сировина", category: "Сировина", kopecks: 5000000 },
      ],
    },
    { requestedGrantKopecks: 25000000, newJobs: 2 },
    vlasnaSpravaPlaybook
  );

  assert.equal(validation3.valid, true);
  assert.equal(validation3.blocking_errors.length, 0);
});
