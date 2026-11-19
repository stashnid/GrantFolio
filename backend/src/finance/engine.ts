import {
  MIN_MONTHLY_SALARY_KOPECKS,
  calculateEmployeeTaxes,
  calculateFop2MonthlyTaxes,
  calculateFop3MonthlyTaxes,
} from "./taxConfig2026.js";
import type { FinancialPlan, FinancialMonth, FinancialBusinessPlanRows } from "../grant-financial-plan.js";

export type TaxSystemType = "fop_group_2" | "fop_group_3" | "general";

export interface FinanceModelInput {
  openingBalanceKopecks?: number;
  requestedGrantKopecks: number;
  ownContributionKopecks?: number;
  durationMonths?: 24 | 36 | 60;
  taxSystem?: TaxSystemType;
  hiredEmployeesCount?: number;
  grossSalaryPerEmployeeKopecks?: number;
  // Revenue: either per-month array or baseline with ramp-up
  monthlyRevenueKopecks?: number[];
  baseMonthlySalesKopecks?: number;
  // Cost lines
  monthlyRentKopecks?: number;
  monthlyMarketingKopecks?: number;
  monthlyRawMaterialsKopecks?: number;
  monthlyUtilitiesKopecks?: number;
  monthlyOtherOperatingKopecks?: number;
  capitalEquipmentMonth1Kopecks?: number;
}

export interface MonthlyFinanceRecord {
  month: number;
  salesKopecks: number;
  grantKopecks: number;
  ownKopecks: number;
  operatingCostsKopecks: number;
  payrollKopecks: number;
  taxesKopecks: number;
  capitalCostsKopecks: number;
  netCashFlowKopecks: number;
  closingBalanceKopecks: number;
  operatingProfitKopecks: number;
  netProfitKopecks: number;
  businessPlanRow: FinancialBusinessPlanRows;
}

export interface DeterministicFinanceResult {
  durationMonths: number;
  openingBalanceKopecks: number;
  totalRevenueKopecks: number;
  totalOperatingCostsKopecks: number;
  totalPayrollCostsKopecks: number;
  totalTaxesKopecks: number;
  totalTaxes36MonthsKopecks: number;
  finalCashBalanceKopecks: number;
  hasCashDeficit: boolean;
  deficitMonths: number[];
  breakevenMonth: number | null;
  months: MonthlyFinanceRecord[];
  financialPlan: FinancialPlan;
}

export function calculateDeterministicFinance(
  input: FinanceModelInput
): DeterministicFinanceResult {
  const duration = input.durationMonths ?? 36;
  const openingBalance = Math.max(0, Math.round(input.openingBalanceKopecks ?? 0));
  const requestedGrant = Math.max(0, Math.round(input.requestedGrantKopecks));
  const ownContribution = Math.max(0, Math.round(input.ownContributionKopecks ?? 0));
  const taxSystem = input.taxSystem ?? "fop_group_2";
  const employeesCount = Math.max(0, Math.round(input.hiredEmployeesCount ?? 1));
  const salaryPerEmployee = Math.max(
    MIN_MONTHLY_SALARY_KOPECKS,
    Math.round(input.grossSalaryPerEmployeeKopecks ?? MIN_MONTHLY_SALARY_KOPECKS)
  );

  const baseSales = Math.max(0, Math.round(input.baseMonthlySalesKopecks ?? 120_000_00)); // Default 120 000 грн
  const rent = Math.max(0, Math.round(input.monthlyRentKopecks ?? 15_000_00));
  const marketing = Math.max(0, Math.round(input.monthlyMarketingKopecks ?? 8_000_00));
  const rawMaterials = Math.max(0, Math.round(input.monthlyRawMaterialsKopecks ?? 35_000_00));
  const utilities = Math.max(0, Math.round(input.monthlyUtilitiesKopecks ?? 5_000_00));
  const otherOp = Math.max(0, Math.round(input.monthlyOtherOperatingKopecks ?? 4_000_00));
  const capitalEquipmentM1 = Math.max(
    0,
    Math.round(input.capitalEquipmentMonth1Kopecks ?? (requestedGrant + ownContribution))
  );

  let currentCash = openingBalance;
  const records: MonthlyFinanceRecord[] = [];
  const financialMonths: FinancialMonth[] = [];
  const businessPlanRows: FinancialBusinessPlanRows[] = [];

  let totalRevenue = 0;
  let totalOperating = 0;
  let totalPayroll = 0;
  let totalTaxesAll = 0;
  let totalTaxes36 = 0;
  const deficitMonths: number[] = [];
  let breakevenMonth: number | null = null;
  let cumulativeNetProfit = 0;

  for (let m = 0; m < duration; m++) {
    const monthNum = m + 1;

    // Grant arrives in month 1 strictly
    const grantInflow = m === 0 ? requestedGrant : 0;
    const ownInflow = m === 0 ? ownContribution : 0;

    // Sales trajectory: ramp-up in first months if not explicitly provided
    let sales = 0;
    if (input.monthlyRevenueKopecks && input.monthlyRevenueKopecks[m] !== undefined) {
      sales = Math.max(0, Math.round(input.monthlyRevenueKopecks[m]));
    } else {
      // Ramp-up: Month 1: 40%, Month 2: 70%, Month 3: 90%, Month 4+: 100%
      const rampFactor = m === 0 ? 0.4 : m === 1 ? 0.7 : m === 2 ? 0.9 : 1.0;
      sales = Math.round(baseSales * rampFactor);
    }
    totalRevenue += sales;

    // Monthly payroll
    const employeeTaxes = calculateEmployeeTaxes(salaryPerEmployee * employeesCount);
    const payrollGross = salaryPerEmployee * employeesCount;
    const employerEsv = employeeTaxes.esvEmployerKopecks;
    totalPayroll += payrollGross;

    // FOP Entrepreneur taxes
    let fopEp = 0;
    let fopVz = 0;
    let fopEsv = 0;

    if (taxSystem === "fop_group_2") {
      const fopTaxes = calculateFop2MonthlyTaxes();
      fopEp = fopTaxes.singleTaxKopecks;
      fopVz = fopTaxes.militaryLevyKopecks;
      fopEsv = fopTaxes.esvKopecks;
    } else if (taxSystem === "fop_group_3") {
      const fopTaxes = calculateFop3MonthlyTaxes(sales);
      fopEp = fopTaxes.singleTaxKopecks;
      fopVz = fopTaxes.militaryLevyKopecks;
      fopEsv = fopTaxes.esvKopecks;
    } else {
      // General system
      const netEstimate = Math.max(0, sales - (rent + marketing + rawMaterials + utilities + otherOp + payrollGross));
      fopEp = 0;
      fopVz = Math.round(netEstimate * 0.05);
      fopEsv = Math.round(netEstimate * 0.22);
    }

    // Monthly operating costs (excluding capital equipment)
    // Scale raw materials proportionally to sales ramp-up
    const currentRawMaterials = Math.round(rawMaterials * (sales / Math.max(1, baseSales)));
    const monthlyOperatingCosts = rent + marketing + currentRawMaterials + utilities + otherOp;
    totalOperating += monthlyOperatingCosts;

    // Taxes line in cash flow: includes FOP single tax/VZ/ESV + employer ESV
    // Note: In cash flow outflow, payrollGross already pays employee net + employee PIT + employee VZ.
    const monthCashFlowTaxesKopecks = fopEp + fopVz + fopEsv + employerEsv;

    // Total taxes paid to state treasury (for KMU № 738 36-month grant payback):
    // Includes FOP EP/PIT/VZ + FOP ESV + Employee PIT (18%) + Employee VZ (5%) + Employer ESV (22%)
    const monthTotalTaxesToTreasury = fopEp + fopVz + fopEsv + employeeTaxes.totalTaxesToStateKopecks;
    totalTaxesAll += monthTotalTaxesToTreasury;
    if (m < 36) {
      totalTaxes36 += monthTotalTaxesToTreasury;
    }

    const capitalCosts = m === 0 ? capitalEquipmentM1 : 0;

    // Cash flow
    const totalCashInflow = sales + grantInflow + ownInflow;
    const totalCashOutflow = monthlyOperatingCosts + payrollGross + monthCashFlowTaxesKopecks + capitalCosts;
    const netCashFlow = totalCashInflow - totalCashOutflow;

    currentCash += netCashFlow;

    if (currentCash < 0) {
      deficitMonths.push(monthNum);
    }

    // Profitability
    const operatingProfit = sales - monthlyOperatingCosts - payrollGross - employerEsv;
    const netProfit = operatingProfit - (fopEp + fopVz);
    cumulativeNetProfit += netProfit;

    if (breakevenMonth === null && cumulativeNetProfit > 0) {
      breakevenMonth = monthNum;
    }

    // Map to official Diia spreadsheet business plan rows
    const businessPlanRow: FinancialBusinessPlanRows = {
      additionalSalesKopecks: 0,
      assetSaleIncomeKopecks: 0,
      otherIncomeKopecks: 0,
      propertyPurchaseKopecks: 0,
      premisesRentKopecks: rent,
      equipmentRentalKopecks: 0,
      otherBusinessCostsKopecks: currentRawMaterials + otherOp,
      utilitiesKopecks: utilities,
      insuranceKopecks: 0,
      marketingKopecks: marketing,
      communicationsKopecks: 0,
      equipmentKopecks: capitalCosts,
      repairsKopecks: 0,
      transportKopecks: 0,
      professionalServicesKopecks: 0,
      applicantSalaryKopecks: 0,
      existingStaffSalaryKopecks: 0,
      newStaffSalaryKopecks: payrollGross,
      simplifiedTaxKopecks: fopEp,
      simplifiedMilitaryLevyKopecks: fopVz,
      fopTaxableIncomeKopecks: 0,
      fopIncomeTaxKopecks: 0,
      fopMilitaryLevyKopecks: 0,
      fopEsvKopecks: fopEsv + employerEsv,
      ecologicalTaxKopecks: 0,
      rentPaymentKopecks: 0,
    };

    const record: MonthlyFinanceRecord = {
      month: monthNum,
      salesKopecks: sales,
      grantKopecks: grantInflow,
      ownKopecks: ownInflow,
      operatingCostsKopecks: monthlyOperatingCosts,
      payrollKopecks: payrollGross,
      taxesKopecks: monthCashFlowTaxesKopecks,
      capitalCostsKopecks: capitalCosts,
      netCashFlowKopecks: netCashFlow,
      closingBalanceKopecks: currentCash,
      operatingProfitKopecks: operatingProfit,
      netProfitKopecks: netProfit,
      businessPlanRow,
    };

    records.push(record);

    financialMonths.push({
      salesKopecks: sales,
      grantKopecks: grantInflow,
      ownKopecks: ownInflow,
      operatingCostsKopecks: monthlyOperatingCosts,
      payrollKopecks: payrollGross,
      taxesKopecks: monthCashFlowTaxesKopecks,
      capitalCostsKopecks: capitalCosts,
    });

    businessPlanRows.push(businessPlanRow);
  }

  const financialPlan: FinancialPlan = {
    openingBalanceKopecks: openingBalance,
    months: financialMonths,
    businessPlanRows,
  };

  return {
    durationMonths: duration,
    openingBalanceKopecks: openingBalance,
    totalRevenueKopecks: totalRevenue,
    totalOperatingCostsKopecks: totalOperating,
    totalPayrollCostsKopecks: totalPayroll,
    totalTaxesKopecks: totalTaxesAll,
    totalTaxes36MonthsKopecks: totalTaxes36,
    finalCashBalanceKopecks: currentCash,
    hasCashDeficit: deficitMonths.length > 0,
    deficitMonths,
    breakevenMonth,
    months: records,
    financialPlan,
  };
}
