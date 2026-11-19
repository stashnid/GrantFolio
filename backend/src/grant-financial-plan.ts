import { z } from "zod";

// Integer kopecks keep all calculations exact, including 60-month totals.
const amount = z.number().int().min(0).max(1_000_000_000_000);
export const financialMonthSchema = z.object({
  salesKopecks: amount,
  grantKopecks: amount,
  ownKopecks: amount,
  operatingCostsKopecks: amount,
  payrollKopecks: amount,
  taxesKopecks: amount,
  capitalCostsKopecks: amount,
}).strict();

const financialBusinessPlanRowsSchema = z.object({
  additionalSalesKopecks: amount,
  assetSaleIncomeKopecks: amount,
  otherIncomeKopecks: amount,
  propertyPurchaseKopecks: amount,
  premisesRentKopecks: amount,
  equipmentRentalKopecks: amount,
  otherBusinessCostsKopecks: amount,
  utilitiesKopecks: amount,
  insuranceKopecks: amount,
  marketingKopecks: amount,
  communicationsKopecks: amount,
  equipmentKopecks: amount,
  repairsKopecks: amount,
  transportKopecks: amount,
  professionalServicesKopecks: amount,
  applicantSalaryKopecks: amount,
  existingStaffSalaryKopecks: amount,
  newStaffSalaryKopecks: amount,
  simplifiedTaxKopecks: amount,
  simplifiedMilitaryLevyKopecks: amount,
  fopTaxableIncomeKopecks: amount,
  fopIncomeTaxKopecks: amount,
  fopMilitaryLevyKopecks: amount,
  fopEsvKopecks: amount,
  ecologicalTaxKopecks: amount,
  rentPaymentKopecks: amount,
}).strict();
export type FinancialBusinessPlanRows = z.infer<typeof financialBusinessPlanRowsSchema>;

export const financialPlanSchema = z.object({
  openingBalanceKopecks: amount,
  months: z.array(financialMonthSchema).refine(months => [24, 36, 60].includes(months.length), {
    message: "Фінансовий план повинен охоплювати 24, 36 або 60 місяців.",
  }),
  businessPlanRows: z.array(financialBusinessPlanRowsSchema).optional(),
}).strict();

export type FinancialPlan = z.infer<typeof financialPlanSchema>;
export type FinancialMonth = z.infer<typeof financialMonthSchema>;

export const financialBusinessPlanRowFields = [
  ["additionalSalesKopecks", "Додатковий дохід від продажів"], ["assetSaleIncomeKopecks", "Дохід від продажу майна"],
  ["otherIncomeKopecks", "Інші грошові надходження"],
  ["propertyPurchaseKopecks", "Придбання майна"], ["premisesRentKopecks", "Оренда приміщень/землі"],
  ["equipmentRentalKopecks", "Оренда обладнання"], ["otherBusinessCostsKopecks", "Інші господарські платежі"],
  ["utilitiesKopecks", "Комунальні послуги"], ["insuranceKopecks", "Страхування"], ["marketingKopecks", "Маркетинг і реклама"],
  ["communicationsKopecks", "Зв’язок, інтернет, охорона"], ["equipmentKopecks", "Обладнання й робочі місця"],
  ["repairsKopecks", "Ремонт і матеріали"], ["transportKopecks", "Транспорт і доставка"], ["professionalServicesKopecks", "Професійні послуги та ПЗ"],
  ["applicantSalaryKopecks", "Зарплата заявника-ФОП"], ["existingStaffSalaryKopecks", "Зарплата чинних працівників"],
  ["newStaffSalaryKopecks", "Зарплата нових працівників"], ["simplifiedTaxKopecks", "Єдиний податок, спрощена система"],
  ["simplifiedMilitaryLevyKopecks", "Військовий збір, спрощена система"], ["fopTaxableIncomeKopecks", "Оподатковуваний дохід ФОП, загальна система"],
  ["fopIncomeTaxKopecks", "ПДФО ФОП, загальна система"], ["fopMilitaryLevyKopecks", "Військовий збір ФОП, загальна система"],
  ["fopEsvKopecks", "ЄСВ ФОП, загальна система"], ["ecologicalTaxKopecks", "Екологічний податок"],
  ["rentPaymentKopecks", "Рентна плата"],
] as const satisfies readonly [keyof FinancialBusinessPlanRows, string][];

const sumBusinessPlanRows = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
export function financialBusinessPlanRowsMatch(plan: FinancialPlan, taxProfile?: "fop_simplified" | "fop_general" | "company_simplified" | "company_general") {
  if (!plan.businessPlanRows || plan.businessPlanRows.length !== plan.months.length) return false;
  return plan.months.every((month, index) => {
    const rows = plan.businessPlanRows![index];
    const operating = sumBusinessPlanRows([
      rows.propertyPurchaseKopecks, rows.premisesRentKopecks, rows.equipmentRentalKopecks, rows.otherBusinessCostsKopecks,
      rows.utilitiesKopecks, rows.insuranceKopecks, rows.marketingKopecks, rows.communicationsKopecks,
      rows.repairsKopecks, rows.transportKopecks, rows.professionalServicesKopecks,
    ]);
    const payroll = sumBusinessPlanRows([rows.applicantSalaryKopecks, rows.existingStaffSalaryKopecks, rows.newStaffSalaryKopecks]);
    const taxes = sumBusinessPlanRows([
      rows.simplifiedTaxKopecks, rows.simplifiedMilitaryLevyKopecks, rows.fopIncomeTaxKopecks, rows.fopMilitaryLevyKopecks,
      rows.fopEsvKopecks, rows.ecologicalTaxKopecks, rows.rentPaymentKopecks,
    ]);
    const invalidTaxRow = taxProfile === "fop_simplified"
      ? rows.fopTaxableIncomeKopecks + rows.fopIncomeTaxKopecks + rows.fopMilitaryLevyKopecks + rows.fopEsvKopecks > 0
      : taxProfile === "company_simplified"
        ? rows.simplifiedMilitaryLevyKopecks + rows.fopTaxableIncomeKopecks + rows.fopIncomeTaxKopecks + rows.fopMilitaryLevyKopecks + rows.fopEsvKopecks > 0
        : taxProfile === "fop_general"
          ? rows.simplifiedTaxKopecks + rows.simplifiedMilitaryLevyKopecks > 0
          : taxProfile === "company_general"
            ? rows.simplifiedTaxKopecks + rows.simplifiedMilitaryLevyKopecks + rows.fopTaxableIncomeKopecks + rows.fopIncomeTaxKopecks + rows.fopMilitaryLevyKopecks + rows.fopEsvKopecks > 0
            : false;
    return operating === month.operatingCostsKopecks && rows.equipmentKopecks === month.capitalCostsKopecks &&
      payroll === month.payrollKopecks && taxes === month.taxesKopecks && !invalidTaxRow &&
      (index === 0 ? month.grantKopecks === sumBusinessPlanRows(plan.months.map(item => item.grantKopecks)) : month.grantKopecks === 0);
  });
}

export function calculateFinancialPlan(input: FinancialPlan) {
  const plan = financialPlanSchema.parse(input);
  let balance = plan.openingBalanceKopecks;
  const totals = {
    salesKopecks: 0, grantKopecks: 0, ownKopecks: 0, operatingCostsKopecks: 0,
    payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0, additionalIncomeKopecks: 0,
  };
  const months = plan.months.map((month, index) => {
    const openingBalanceKopecks = balance;
    const rows = plan.businessPlanRows?.[index];
    const employerEsvKopecks = rows ? Math.round((rows.existingStaffSalaryKopecks + rows.newStaffSalaryKopecks) * 0.22) : 0;
    const taxesKopecks = month.taxesKopecks + employerEsvKopecks;
    for (const field of ["salesKopecks", "grantKopecks", "ownKopecks", "operatingCostsKopecks", "payrollKopecks", "taxesKopecks", "capitalCostsKopecks"] as const) {
      totals[field] += field === "taxesKopecks" ? taxesKopecks : month[field];
    }
    const additionalIncomeKopecks = rows ? rows.additionalSalesKopecks + rows.assetSaleIncomeKopecks + rows.otherIncomeKopecks : 0;
    totals.additionalIncomeKopecks += additionalIncomeKopecks;
    const incomeKopecks = month.salesKopecks + month.grantKopecks + month.ownKopecks + additionalIncomeKopecks;
    const expensesKopecks = month.operatingCostsKopecks + month.payrollKopecks + taxesKopecks + month.capitalCostsKopecks;
    balance += incomeKopecks - expensesKopecks;
    return {
      ...month, taxesKopecks, number: index + 1, openingBalanceKopecks, incomeKopecks,
      expensesKopecks, closingBalanceKopecks: balance, deficit: balance < 0,
    };
  });
  const incomeKopecks = totals.salesKopecks + totals.grantKopecks + totals.ownKopecks + totals.additionalIncomeKopecks;
  const expensesKopecks = totals.operatingCostsKopecks + totals.payrollKopecks + totals.taxesKopecks + totals.capitalCostsKopecks;
  return {
    openingBalanceKopecks: plan.openingBalanceKopecks,
    months,
    totals: { ...totals, incomeKopecks, expensesKopecks, closingBalanceKopecks: balance },
    deficitMonths: months.filter(month => month.deficit).map(month => month.number),
  };
}
