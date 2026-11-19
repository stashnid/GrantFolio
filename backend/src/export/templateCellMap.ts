/**
 * GrantFolio: Declarative cell mapping for official Diia Business Plan Excel templates.
 * Enforces strict boundaries between user-editable input cells and protected formula cells.
 */

export class FormulaOverwriteError extends Error {
  public readonly sheet: string;
  public readonly cell: string;

  constructor(sheet: string, cell: string, message?: string) {
    super(message ?? `Cannot overwrite formula cell in "${sheet}"!${cell}`);
    this.name = "FormulaOverwriteError";
    this.sheet = sheet;
    this.cell = cell;
    Object.setPrototypeOf(this, FormulaOverwriteError.prototype);
  }
}

/**
 * Monthly column helper for 1-based month index (1 -> F, 2 -> G, ..., 60 -> BK).
 */
export function monthlyColumn(monthIndex: number): string {
  let n = monthIndex + 5;
  let col = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    col = String.fromCharCode(65 + remainder) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

export function monthlyCell(row: number, monthIndex: number): string {
  return `${monthlyColumn(monthIndex)}${row}`;
}

// ---------------------------------------------------------------------------
// 1. INPUT CELLS: Cells where user/application data is permitted to be written
// ---------------------------------------------------------------------------

const BIZ_PLAN_INPUT_CELLS = new Set<string>([
  // Applicant details
  "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B14", "B15", "B16", "B17",
  "B22", "B24",
  // Requested grant & eligibility criteria checkboxes
  "C26", "C29", "C30", "C31", "C32", "C33", "C34", "C35", "C36", "C37",
  // Taxation system & VAT
  "B41", "B43",
  // Project details & schedule
  "B45", "B47", "B49", "B51",
  "B53", "B54", "B55", "B56", "B57",
  "B58", "B60",
  // Forecasts & impact
  "B62", "B63", "B64", "B65", "B67", "B68", "B69", "B70", "B71", "B72", "B74",
  "B76", "B78",
  // Grant investment lines (up to 7 items, rows 82..88)
  ...Array.from({ length: 7 }, (_, i) => `B${82 + i}`),
  ...Array.from({ length: 7 }, (_, i) => `E${82 + i}`),
  ...Array.from({ length: 7 }, (_, i) => `F${82 + i}`),
  // Own investment lines (up to 4 items, rows 92..95)
  ...Array.from({ length: 4 }, (_, i) => `B${92 + i}`),
  ...Array.from({ length: 4 }, (_, i) => `E${92 + i}`),
  ...Array.from({ length: 4 }, (_, i) => `F${92 + i}`),
  // Staffing & risks
  "B99", "B101", "B104", "B106", "B109", "B111", "B113",
]);

// Profit & Loss (Прибутки та збитки) editable rows across 60 months
const PL_INPUT_ROWS = [
  15, // Own funds / grant receipt in month 1
  16, // Sales revenue
  17, // Additional sales revenue
  18, // Asset sales
  19, // Other income
  33, // Property purchase
  34, // Premises rent
  35, // Equipment rental
  36, // Other operating costs
  37, // Utilities
  38, // Insurance
  39, // Marketing & advertising
  40, // Communications
  41, // Equipment purchase
  42, // Repairs & maintenance
  43, // Transport & logistics
  44, // Professional services
  47, // Applicant salary
  48, // Existing staff salaries
  49, // New staff salaries
  60, // Simplified tax (Single Tax 2/3 group)
  61, // Simplified military levy
  62, // General system taxable income
  63, // PIT (18%)
  64, // Military levy (5%)
  65, // ESV (22%)
  68, // Ecological tax
  69, // Rent payment
];

const PL_INPUT_CELLS = new Set<string>([
  "D4",  // Applicant name
  "D76", // Opening cash balance
]);

// Add month 1..60 (cols F..BK) for each input row
for (const row of PL_INPUT_ROWS) {
  for (let m = 0; m < 60; m++) {
    PL_INPUT_CELLS.add(monthlyCell(row, m));
  }
}

export const INPUT_CELLS: Readonly<Record<string, ReadonlySet<string>>> = {
  "Бізнес план": BIZ_PLAN_INPUT_CELLS,
  "Прибутки та збитки": PL_INPUT_CELLS,
};

// ---------------------------------------------------------------------------
// 2. PROTECTED FORMULA CELLS: Critical calculation cells containing XML <f>
// ---------------------------------------------------------------------------

const BIZ_PLAN_FORMULA_CELLS = new Set<string>([
  "B1",
  "D27", "D28",
  "E29", "E30", "E31", "E32", "E33", "E34", "F34", "E35", "E36", "E37", "E38",
  "D39", "E39", "F39",
  "F89",
]);

// P&L calculation rows across all months (cols E/F through BM) and annual totals (col BN)
const PL_FORMULA_ROWS = [
  14, // Total sales revenue
  20, // Total income
  21, 22, 23, 24, 25, 26, 27, // Turnover totals
  32, // Depreciation
  45, // Total operating expenses
  46, // Direct expenses
  50, // Total payroll
  52, 53, 54, // Simplified tax sub-totals
  56, 57, 58, // General tax sub-totals
  66, 67, 70, 71, // Tax subtotals
  72, // Total taxes and fees
  74, // Net financial result / profit
  76, // Cumulative cash balance
  77, // Financing net flow
  78, // Closing cash balance
];

const PL_FORMULA_CELLS = new Set<string>([
  "A1", "D10", "D11",
]);

// Add all formula rows across month columns and column BN (totals)
for (const row of PL_FORMULA_ROWS) {
  for (let m = 0; m < 60; m++) {
    PL_FORMULA_CELLS.add(monthlyCell(row, m));
  }
  PL_FORMULA_CELLS.add(`BN${row}`);
}

// Add annual summary totals (column BN) for all rows 14..78
for (let r = 14; r <= 78; r++) {
  PL_FORMULA_CELLS.add(`BN${r}`);
}

export const PROTECTED_FORMULA_CELLS: Readonly<Record<string, ReadonlySet<string>>> = {
  "Бізнес план": BIZ_PLAN_FORMULA_CELLS,
  "Прибутки та збитки": PL_FORMULA_CELLS,
};

// ---------------------------------------------------------------------------
// 3. Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a cell is an explicitly known protected formula cell.
 */
export function isProtectedFormulaCell(sheet: string, cell: string): boolean {
  const protectedSet = PROTECTED_FORMULA_CELLS[sheet];
  return Boolean(protectedSet?.has(cell));
}

/**
 * Checks if a cell is an explicitly declared user input cell.
 */
export function isAllowedInputCell(sheet: string, cell: string): boolean {
  const inputSet = INPUT_CELLS[sheet];
  return Boolean(inputSet?.has(cell));
}

/**
 * Asserts that a write operation to `sheet!cell` is safe and does not overwrite a formula.
 * Throws FormulaOverwriteError if the cell is in the protected formula set or has `<f>`.
 */
export function assertCanWriteCell(sheet: string, cell: string, cellXmlContent?: string): void {
  if (isProtectedFormulaCell(sheet, cell)) {
    throw new FormulaOverwriteError(sheet, cell, `Cannot overwrite formula cell in "${sheet}"!${cell}`);
  }
  if (cellXmlContent && /<f(?:\s|>)/.test(cellXmlContent)) {
    throw new FormulaOverwriteError(sheet, cell, `Cannot overwrite formula cell in "${sheet}"!${cell} (detected <f> tag in XML)`);
  }
}
