/**
 * Ukrainian 2026 Taxation Parameters & Constants
 * All monetary amounts are defined strictly in integer kopecks (1 UAH = 100 kopecks).
 */

// Basic statutory figures (Ukraine 2026)
export const MIN_MONTHLY_SALARY_KOPECKS = 800_000; // 8 000,00 грн
export const LIVING_MINIMUM_KOPECKS = 302_800; // 3 028,00 грн

// FOP Group 2 parameters
// Єдиний податок: до 20% від розміру мінімальної зарплати
export const FOP2_EP_FIXED_KOPECKS = 160_000; // 1 600,00 грн/міс
// Військовий збір ФОП 2 групи: 10% від мінімальної заробітної плати
export const FOP2_MILITARY_LEVY_FIXED_KOPECKS = 80_000; // 800,00 грн/міс
// ЄСВ за себе: 22% від мінімальної зарплати
export const FOP_ESV_MIN_KOPECKS = 176_000; // 1 760,00 грн/міс

// FOP Group 3 parameters
// Єдиний податок: 5% від отриманого доходу
export const FOP3_EP_RATE = 0.05;
// Військовий збір: 1% від доходу (відповідно до норм оподаткування)
export const FOP3_MILITARY_LEVY_RATE = 0.01;

// General taxation system (Загальна система)
export const GENERAL_SYSTEM_PIT_RATE = 0.18; // ПДФО 18% від чистого доходу
export const GENERAL_SYSTEM_MILITARY_LEVY_RATE = 0.05; // ВЗ 5% від чистого доходу
export const GENERAL_SYSTEM_ESV_RATE = 0.22; // ЄСВ 22%

// Hired employees taxation (Наймані працівники)
export const EMPLOYEE_PIT_RATE = 0.18; // ПДФО 18% (утримується з зарплати)
export const EMPLOYEE_MILITARY_LEVY_RATE = 0.05; // Військовий збір 5% (утримується з зарплати)
export const EMPLOYEE_ESV_RATE = 0.22; // ЄСВ 22% (нараховується на фонд оплати праці)

export interface EmployeeTaxBreakdown {
  grossSalaryKopecks: number;
  pitKopecks: number; // ПДФО 18%
  militaryLevyKopecks: number; // ВЗ 5%
  netSalaryKopecks: number; // Зарплата на руки
  esvEmployerKopecks: number; // ЄСВ 22% роботодавця
  totalEmployerCostKopecks: number; // Повні витрати роботодавця (gross + ESV)
  totalTaxesToStateKopecks: number; // Сукупні надходження державі (ПДФО + ВЗ + ЄСВ)
}

export function calculateEmployeeTaxes(grossSalaryKopecks: number): EmployeeTaxBreakdown {
  const gross = Math.max(0, Math.round(grossSalaryKopecks));
  const pit = Math.round(gross * EMPLOYEE_PIT_RATE);
  const military = Math.round(gross * EMPLOYEE_MILITARY_LEVY_RATE);
  const esv = Math.round(gross * EMPLOYEE_ESV_RATE);
  const net = gross - pit - military;

  return {
    grossSalaryKopecks: gross,
    pitKopecks: pit,
    militaryLevyKopecks: military,
    netSalaryKopecks: net,
    esvEmployerKopecks: esv,
    totalEmployerCostKopecks: gross + esv,
    totalTaxesToStateKopecks: pit + military + esv,
  };
}

export interface FopMonthlyTaxesBreakdown {
  singleTaxKopecks: number;
  militaryLevyKopecks: number;
  esvKopecks: number;
  totalMonthlyTaxesKopecks: number;
}

export function calculateFop2MonthlyTaxes(): FopMonthlyTaxesBreakdown {
  const ep = FOP2_EP_FIXED_KOPECKS;
  const vz = FOP2_MILITARY_LEVY_FIXED_KOPECKS;
  const esv = FOP_ESV_MIN_KOPECKS;
  return {
    singleTaxKopecks: ep,
    militaryLevyKopecks: vz,
    esvKopecks: esv,
    totalMonthlyTaxesKopecks: ep + vz + esv,
  };
}

export function calculateFop3MonthlyTaxes(monthlyRevenueKopecks: number): FopMonthlyTaxesBreakdown {
  const rev = Math.max(0, Math.round(monthlyRevenueKopecks));
  const ep = Math.round(rev * FOP3_EP_RATE);
  const vz = Math.round(rev * FOP3_MILITARY_LEVY_RATE);
  const esv = FOP_ESV_MIN_KOPECKS;
  return {
    singleTaxKopecks: ep,
    militaryLevyKopecks: vz,
    esvKopecks: esv,
    totalMonthlyTaxesKopecks: ep + vz + esv,
  };
}
