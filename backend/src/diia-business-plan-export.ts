import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { GrantApplicationAnswers } from "./grant-application.js";
import type { FinancialBusinessPlanRows, FinancialPlan } from "./grant-financial-plan.js";
import { calculateFinancialPlan, financialBusinessPlanRowsMatch } from "./grant-financial-plan.js";
import { parseGrantInvestmentLines } from "./grant-investment-lines.js";
import { FormulaOverwriteError, assertCanWriteCell } from "./export/templateCellMap.js";

export { FormulaOverwriteError } from "./export/templateCellMap.js";

const run = promisify(execFile);
const workbookNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeRelationshipsNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationshipsNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
const mainSheets = new Set(["Бізнес план", "Прибутки та збитки"]);

export type DiiaBusinessPlanCells = Readonly<Record<string, string | number | null>>;
export type DiiaBusinessPlanCellChanges = Readonly<Partial<Record<"Бізнес план" | "Прибутки та збитки", DiiaBusinessPlanCells>>>;
export type DiiaBusinessPlanCellReference = { sheet: "Бізнес план" | "Прибутки та збитки"; cell: string };
export type DiiaBusinessPlanAnswerMapping = {
  cells: DiiaBusinessPlanCellChanges;
  mappedAnswers: (keyof GrantApplicationAnswers)[];
  remainingAnswers: (keyof GrantApplicationAnswers)[];
  missingOfficialInputs: string[];
};

const mappedAnswerFields = new Set<keyof GrantApplicationAnswers>([
  "track", "requestedGrantKopecks", "newJobs", "permits", "projectObjective", "pricingStrategy", "staffingPlan", "projectRisks",
  "applicantType", "applicantTaxId", "legalForm", "taxSystem", "taxProfile", "vatStatus", "vatBonusBasis", "youngApplicant", "veteranBusiness", "patentBasis", "displacedApplicant", "priorityTerritory", "damagedAssets", "prioritySector", "applicantName", "businessAddress", "applicantBusinessHistory", "applicantIdentity", "applicantExperience", "monthsInBusiness", "existingJobs", "ownContributionKopecks",
  "location", "activity", "projectDurationMonths", "projectSchedule", "productDescription", "targetCustomers", "grantUsePlan",
  "grantExpenseLines", "ownExpenseLines",
  "expectedImpact", "salesForecast", "profitabilityForecast", "financialResultForecast", "cashFlowForecast", "roiForecast", "irrForecast",
  "paybackAssumptions", "breakEvenMonths", "environmentalImpact", "otherResults", "taxEstimate", "regionalImpact", "projectRiskMitigation",
  "marketAnalysis", "marketEvidence", "financialAssumptions", "quoteEvidence", "existingAssets", "financingSources", "indirectJobs",
]);

const monthlyColumn = (month: number) => {
  let n = month + 5;
  let col = "";
  while (n > 0) { const remainder = (n - 1) % 26; col = String.fromCharCode(65 + remainder) + col; n = Math.floor((n - 1) / 26); }
  return col;
};

function monthlyCell(row: number, month: number) { return `${monthlyColumn(month)}${row}`; }
function money(kopecks: number) { return kopecks / 100; }

function planCells(plan: FinancialPlan, requestedGrantKopecks: number) {
  if (!financialBusinessPlanRowsMatch(plan)) throw new Error("Business-plan line allocations do not reconcile");
  const months = plan.months.length;
  const firstGrant = plan.months[0]?.grantKopecks ?? 0;
  if (firstGrant !== requestedGrantKopecks || plan.months.slice(1).some(month => month.grantKopecks !== 0)) {
    throw new Error("The official template only supports receiving the grant in month one");
  }
  const result: Record<string, string | number> = { D76: money(plan.openingBalanceKopecks) };
  for (let index = 0; index < months; index++) {
    const month = plan.months[index];
    const rows = plan.businessPlanRows![index] as FinancialBusinessPlanRows;
    for (const [row, value] of [[15, month.ownKopecks], [16, month.salesKopecks],
      [17, rows.additionalSalesKopecks], [18, rows.assetSaleIncomeKopecks], [19, rows.otherIncomeKopecks],
      [33, rows.propertyPurchaseKopecks], [34, rows.premisesRentKopecks], [35, rows.equipmentRentalKopecks],
      [36, rows.otherBusinessCostsKopecks], [37, rows.utilitiesKopecks], [38, rows.insuranceKopecks],
      [39, rows.marketingKopecks], [40, rows.communicationsKopecks], [41, rows.equipmentKopecks],
      [42, rows.repairsKopecks], [43, rows.transportKopecks], [44, rows.professionalServicesKopecks],
      [47, rows.applicantSalaryKopecks], [48, rows.existingStaffSalaryKopecks], [49, rows.newStaffSalaryKopecks],
      [60, rows.simplifiedTaxKopecks], [61, rows.simplifiedMilitaryLevyKopecks], [62, rows.fopTaxableIncomeKopecks],
      [63, rows.fopIncomeTaxKopecks], [64, rows.fopMilitaryLevyKopecks], [65, rows.fopEsvKopecks],
      [68, rows.ecologicalTaxKopecks],
      [69, rows.rentPaymentKopecks]] as const) {
      result[monthlyCell(row, index)] = money(value);
    }
  }
  return result;
}

export function mapGrantApplicationAnswersToDiiaCells(answers: GrantApplicationAnswers, context?: {
  budgetTotalKopecks: number; items: readonly { name: string; quantity: number; unitPriceKopecks: number }[]; financialPlan: FinancialPlan;
}): DiiaBusinessPlanAnswerMapping {
  const cells: Record<string, string | number> = {};
  if (answers.applicantType !== undefined) cells.B6 = answers.applicantType === "individual" ? "Фізична особа" : answers.applicantType === "entrepreneur" ? "ФОП" : "Юридична особа";
  if (answers.applicantTaxId !== undefined) cells.B7 = answers.applicantTaxId;
  if (answers.legalForm !== undefined) cells.B8 = answers.legalForm;
  if (answers.location !== undefined) cells.B9 = answers.location;
  if (answers.activity !== undefined) cells.B10 = answers.activity;
  if (answers.applicantBusinessHistory !== undefined) cells.B11 = `${answers.applicantBusinessHistory}${answers.monthsInBusiness === undefined ? "" : `; тривалість діяльності: ${answers.monthsInBusiness} міс.`}${answers.applicantExperience ? `; досвід команди: ${answers.applicantExperience}` : ""}`;
  if (answers.businessAddress !== undefined) cells.B12 = `${answers.businessAddress}${answers.applicantIdentity ? `; контакти/відповідальна особа: ${answers.applicantIdentity}` : ""}`;
  if (answers.projectConcept !== undefined) cells.B14 = `${answers.projectConcept}${answers.existingAssets ? ` Наявні активи: ${answers.existingAssets}` : ""}`;
  if (answers.expectedImpact !== undefined) cells.B15 = `${answers.expectedImpact}${answers.marketAnalysis ? ` Аналіз ринку: ${answers.marketAnalysis}` : ""}${answers.marketEvidence ? ` Підтвердження попиту: ${answers.marketEvidence}` : ""}`;
  if (answers.permits !== undefined) cells.B16 = answers.permits;
  if (answers.grantUsePlan !== undefined) cells.B17 = `Запитувана сума: ${answers.requestedGrantKopecks === undefined ? "" : money(answers.requestedGrantKopecks)} грн. Напрями: ${answers.grantUsePlan}`;
  if (answers.projectDurationMonths !== undefined) cells.B22 = answers.projectDurationMonths === 24 ? "24 місяці" : `${answers.projectDurationMonths} місяців`;
  if (answers.track !== undefined) {
    cells.B24 = answers.track === "start" ? "Започаткування власної справи" : "Масштабування власної справи";
  }
  if (answers.requestedGrantKopecks !== undefined) cells.C26 = answers.requestedGrantKopecks / 100;
  if (answers.taxSystem !== undefined) cells.B41 = answers.taxSystem === "simplified" ? "Спрощена система" : "Загальна система";
  if (answers.vatStatus !== undefined) cells.B43 = answers.vatStatus === "payer" ? "Платник ПДВ" : "Неплатник ПДВ";
  if (answers.vatBonusBasis !== undefined) cells.C29 = answers.vatBonusBasis === "yes" ? "Так" : "Ні";
  if (answers.youngApplicant !== undefined) cells.C30 = answers.youngApplicant === "yes" ? "Так" : "Ні";
  if (answers.veteranBusiness !== undefined) cells.C31 = answers.veteranBusiness === "yes" ? "Так" : "Ні";
  if (answers.patentBasis !== undefined) cells.C32 = answers.patentBasis === "yes" ? "Так" : "Ні";
  if (answers.displacedApplicant !== undefined) cells.C33 = answers.displacedApplicant === "yes" ? "Так" : "Ні";
  if (answers.newJobs !== undefined) cells.C34 = answers.newJobs >= 2 ? "Так" : "Ні";
  if (answers.priorityTerritory !== undefined) cells.C35 = answers.priorityTerritory === "yes" ? "Так" : "Ні";
  if (answers.damagedAssets !== undefined) cells.C36 = answers.damagedAssets === "yes" ? "Так" : "Ні";
  if (answers.prioritySector !== undefined) cells.C37 = answers.prioritySector === "yes" ? "Так" : "Ні";
  if (answers.projectObjective !== undefined) cells.B45 = answers.projectObjective;
  if (answers.productDescription !== undefined) cells.B47 = answers.productDescription;
  if (answers.targetCustomers !== undefined) cells.B49 = answers.targetCustomers;
  if (answers.location !== undefined) cells.B51 = answers.location;
  if (answers.projectSchedule !== undefined) answers.projectSchedule.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach((line, i) => { cells[`B${53 + i}`] = line; });
  if (context) cells.B58 = `Загальний бюджет: ${money(context.budgetTotalKopecks)} грн. Основні позиції: ${context.items.slice().sort((a, b) => b.quantity * b.unitPriceKopecks - a.quantity * a.unitPriceKopecks).slice(0, 7).map(item => `${item.name} (${item.quantity} × ${money(item.unitPriceKopecks)} грн)`).join("; ")}${answers.quoteEvidence ? ` Цінові пропозиції: ${answers.quoteEvidence}` : ""}`;
  if (answers.salesForecast !== undefined) cells.B62 = `${answers.salesForecast}${answers.financialAssumptions ? ` Фінансові припущення: ${answers.financialAssumptions}` : ""}`;
  if (answers.profitabilityForecast !== undefined) cells.B63 = answers.profitabilityForecast;
  if (answers.financialResultForecast !== undefined) cells.B64 = answers.financialResultForecast;
  if (answers.cashFlowForecast !== undefined) cells.B65 = answers.cashFlowForecast;
  if (answers.paybackAssumptions !== undefined) cells.B67 = answers.paybackAssumptions;
  if (answers.roiForecast !== undefined) cells.B68 = answers.roiForecast;
  if (answers.irrForecast !== undefined) cells.B69 = answers.irrForecast;
  if (answers.expectedImpact !== undefined) cells.B70 = answers.expectedImpact;
  if (answers.environmentalImpact !== undefined) cells.B71 = answers.environmentalImpact;
  if (answers.otherResults !== undefined) cells.B72 = answers.otherResults;
  if (answers.breakEvenMonths !== undefined) cells.B74 = answers.breakEvenMonths;
  cells.B76 = "Версія 1";
  cells.B78 = new Date().toLocaleDateString("uk-UA");
  if (answers.pricingStrategy !== undefined) cells.B60 = answers.pricingStrategy;
  if (answers.newJobs !== undefined) cells.B99 = answers.newJobs;
  if (answers.staffingPlan !== undefined) cells.B101 = `${answers.staffingPlan}${answers.existingJobs === undefined ? "" : ` Чинні працівники: ${answers.existingJobs}.`}${answers.newJobs === undefined ? "" : ` План нових працівників: ${answers.newJobs}.`}`;
  if (answers.projectRisks !== undefined) cells.B104 = answers.projectRisks;
  if (answers.projectRiskMitigation !== undefined) cells.B106 = answers.projectRiskMitigation;
  if (answers.newJobs !== undefined) cells.B109 = answers.newJobs;
  if (answers.taxEstimate !== undefined) cells.B111 = answers.taxEstimate;
  if (answers.regionalImpact !== undefined) cells.B113 = answers.regionalImpact;
  const grantLines = parseGrantInvestmentLines(answers.grantExpenseLines, 7).lines ?? [];
  grantLines.forEach((line, index) => {
    const row = 82 + index;
    cells[`B${row}`] = line.name;
    cells[`E${row}`] = money(line.amountKopecks);
    cells[`F${row}`] = line.rationale;
  });
  const ownLines = parseGrantInvestmentLines(answers.ownExpenseLines, 4).lines ?? [];
  if (ownLines.length) ownLines.forEach((line, index) => {
    const row = 92 + index;
    cells[`B${row}`] = line.name;
    cells[`E${row}`] = money(line.amountKopecks);
    cells[`F${row}`] = `${line.rationale}; джерело: ${answers.financingSources ?? "не вказано"}`;
  });
  else {
    cells.E92 = 0;
    cells.F92 = "Власні / залучені кошти не передбачені";
  }
  const profitAndLoss: Record<string, string | number> = context ? planCells(context.financialPlan, answers.requestedGrantKopecks ?? 0) : {};
  if (answers.applicantName !== undefined) profitAndLoss.D4 = answers.applicantName;
  if (context) {
    const taxEstimateTotal = calculateFinancialPlan(context.financialPlan).totals.taxesKopecks;
    cells.B111 = `Податки та ЄСВ за фінансовим планом: ${money(taxEstimateTotal)} грн${answers.taxEstimate ? `; пояснення заявника: ${answers.taxEstimate}` : ""}`;
  }
  if (answers.indirectJobs !== undefined && answers.expectedImpact !== undefined) cells.B113 = `${answers.regionalImpact ?? ""} Непрямі робочі місця за оцінкою заявника: ${answers.indirectJobs}. ${answers.expectedImpact}`;
  const missingOfficialInputs: string[] = [];
  if (parseGrantInvestmentLines(answers.grantExpenseLines, 7).error) missingOfficialInputs.push("Заповніть рядки витрат гранту або явно вкажіть, що грантові витрати не плануються.");
  if (parseGrantInvestmentLines(answers.ownExpenseLines, 4).error) missingOfficialInputs.push("Заповніть рядки власного внеску або явно вкажіть, що він не планується.");
  if (!context) missingOfficialInputs.push("Збережіть повний помісячний прогноз доходів, витрат, зарплат і податків у фінансовому плані.");
  const answerKeys = Object.keys(answers) as (keyof GrantApplicationAnswers)[];
  return {
    cells: { "Бізнес план": cells, "Прибутки та збитки": profitAndLoss },
    mappedAnswers: answerKeys.filter(field => mappedAnswerFields.has(field)),
    remainingAnswers: answerKeys.filter(field => !mappedAnswerFields.has(field) && field !== "confirmAccuracy"),
    missingOfficialInputs,
  };
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function decodeXml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function sheetPaths(files: Record<string, Uint8Array>) {
  const workbook = files["xl/workbook.xml"];
  const relationships = files["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) throw new Error("Invalid Diia workbook package");
  const workbookXml = strFromU8(workbook);
  const relationshipsXml = strFromU8(relationships);
  const rels = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target);
  }
  const paths = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]+)\/?\s*>/g)) {
    const name = match[1].match(/\bname="([^"]+)"/)?.[1];
    const id = match[1].match(new RegExp(`\\b(?:r:)?id="([^"]+)"`))?.[1];
    const target = id ? rels.get(id) : undefined;
    if (!name || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    paths.set(decodeXml(name), path.replace("xl/xl/", "xl/"));
  }
  for (const name of mainSheets) if (!paths.has(name)) throw new Error(`Missing official sheet: ${name}`);
  return { paths, workbookXml };
}

function replaceCell(xml: string, sheetName: string, reference: string, value: string | number | null, clear: boolean) {
  const matcher = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)\\s*\\/>|<c\\b([^>]*\\br="${reference}"[^>]*)>([\\s\\S]*?)<\\/c>`);
  const match = matcher.exec(xml);
  if (!match) throw new Error(`Missing official template cell: ${reference}`);
  const attributes = match[1] ?? match[2];
  const inner = match[3] ?? "";
  assertCanWriteCell(sheetName, reference, inner);
  const style = attributes.match(/\bs="([^"]+)"/)?.[1];
  const styleAttribute = style ? ` s="${style}"` : "";
  let replacement: string;
  if (clear || value === null) replacement = `<c r="${reference}"${styleAttribute}/>`;
  else if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${reference}`);
    replacement = `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  } else {
    replacement = `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }
  return xml.replace(matcher, () => replacement);
}

function setCellStyle(xml: string, reference: string, style: number) {
  const matcher = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)`);
  if (!matcher.test(xml)) return xml;
  return xml.replace(matcher, (_full, attributes: string) => {
    const withStyle = /\bs="\d+"/.test(attributes)
      ? attributes.replace(/\bs="\d+"/, `s="${style}"`)
      : `${attributes} s="${style}"`;
    return `<c${withStyle}`;
  });
}

function preserveCurrencyCents(files: Record<string, Uint8Array>, paths: Map<string, string>) {
  const references = new Map<"Бізнес план" | "Прибутки та збитки", string[]>();
  const plan = ["C26", "C28", "C39", ...Array.from({ length: 8 }, (_, i) => `E${82 + i}`), ...Array.from({ length: 5 }, (_, i) => `E${92 + i}`)];
  const finance = ["C10", "D76"];
  for (const row of [
    ...Array.from({ length: 14 }, (_, i) => 14 + i), ...Array.from({ length: 12 }, (_, i) => 33 + i),
    47, 48, 49, 52, 53, 54, 56, 57, 58, ...Array.from({ length: 10 }, (_, i) => 60 + i), 72, 74, 76, 78,
  ]) {
    for (let col = 5; col <= 64; col++) {
      let value = col, letters = "";
      while (value) { value--; letters = String.fromCharCode(65 + value % 26) + letters; value = Math.floor(value / 26); }
      finance.push(`${letters}${row}`);
    }
  }
  references.set("Бізнес план", plan);
  references.set("Прибутки та збитки", finance);
  const styleXml = strFromU8(files["xl/styles.xml"]);
  const match = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(styleXml);
  if (!match) throw new Error("Missing cell styles in official workbook");
  const cellXfs = [...match[2].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(item => item[0]);
  const added = new Map<number, number>();
  let updatedStyleXml = styleXml;
  for (const [sheet, refs] of references) {
    const path = paths.get(sheet)!;
    let sheetXml = strFromU8(files[path]);
    for (const reference of refs) {
      const cell = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)`).exec(sheetXml);
      const originalStyle = cell?.[1].match(/\bs="(\d+)"/)?.[1];
      if (originalStyle === undefined) continue;
      const styleIndex = Number(originalStyle);
      let preciseStyle = added.get(styleIndex);
      if (preciseStyle === undefined) {
        const original = cellXfs[styleIndex];
        if (!original) throw new Error(`Missing original cell style: ${styleIndex}`);
        if (original.match(/\bnumFmtId="(\d+)"/)?.[1] === "4") continue;
        let clone = /\bnumFmtId="\d+"/.test(original)
          ? original.replace(/\bnumFmtId="\d+"/, 'numFmtId="4"')
          : original.replace(/<xf\b/, '<xf numFmtId="4"');
        if (/\bapplyNumberFormat="\d+"/.test(clone)) clone = clone.replace(/\bapplyNumberFormat="\d+"/, 'applyNumberFormat="1"');
        else clone = clone.replace(/<xf\b/, '<xf applyNumberFormat="1"');
        preciseStyle = cellXfs.length + added.size;
        added.set(styleIndex, preciseStyle);
        updatedStyleXml = updatedStyleXml.replace(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/, (_full, attrs: string, body: string) => {
          const count = Number(attrs.match(/\bcount="(\d+)"/)?.[1] ?? cellXfs.length);
          return `<cellXfs${attrs.replace(/\bcount="\d+"/, `count="${count + 1}"`)}>${body}${clone}</cellXfs>`;
        });
      }
      sheetXml = setCellStyle(sheetXml, reference, preciseStyle);
    }
    files[path] = strToU8(sheetXml);
  }
  files["xl/styles.xml"] = strToU8(updatedStyleXml);
}

export function buildDiiaBusinessPlanWorkbook(
  template: Uint8Array,
  cells: DiiaBusinessPlanCellChanges,
  clearCells: readonly DiiaBusinessPlanCellReference[],
) {
  const files = unzipSync(template);
  const { paths, workbookXml } = sheetPaths(files);
  preserveCurrencyCents(files, paths);
  for (const { sheet, cell } of clearCells) {
    if (!paths.has(sheet)) throw new Error(`Missing official sheet: ${sheet}`);
    if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(cell)) throw new Error(`Invalid cell reference: ${cell}`);
    const path = paths.get(sheet)!;
    files[path] = strToU8(replaceCell(strFromU8(files[path]), sheet, cell, null, true));
  }
  for (const [sheetName, entries] of Object.entries(cells)) {
    if (!sheetName || !paths.has(sheetName)) throw new Error(`Missing official sheet: ${sheetName}`);
    let sheetXml = strFromU8(files[paths.get(sheetName)!]);
    for (const [reference, value] of Object.entries(entries ?? {})) {
      if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(reference)) throw new Error(`Invalid cell reference: ${reference}`);
      sheetXml = replaceCell(sheetXml, sheetName, reference, value, false);
    }
    files[paths.get(sheetName)!] = strToU8(sheetXml);
  }
  const recalculation = workbookXml.includes("<calcPr ")
    ? workbookXml.replace(/<calcPr\b([^>]*)\/?\s*>/, (_full, attrs: string) => `<calcPr${attrs.replace(/\/\s*$/, "").replace(/\s+(?:fullCalcOnLoad|forceFullCalc)="[^"]*"/g, "")} fullCalcOnLoad="1" forceFullCalc="1"/>`)
    : workbookXml.replace("</workbook>", '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
  files["xl/workbook.xml"] = strToU8(recalculation);
  return zipSync(files, { level: 6 });
}

export async function createDiiaBusinessPlanExport(
  template: Uint8Array,
  cells: DiiaBusinessPlanCellChanges,
  clearCells: readonly DiiaBusinessPlanCellReference[],
  signal?: AbortSignal,
) {
  const workbook = buildDiiaBusinessPlanWorkbook(template, cells, clearCells);
  const directory = await mkdtemp(join(tmpdir(), "grantfolio-diia-business-plan-"));
  try {
    const xlsxPath = join(directory, "business-plan.xlsx");
    await writeFile(xlsxPath, workbook, { mode: 0o600 });
    const files = unzipSync(workbook);
    const { workbookXml } = sheetPaths(files);
    const pdfWorkbook = workbookXml.replace(/<sheet\b([^>]+?)\s*(\/?)>/g, (full, attributes: string, slash: string) => {
      const name = attributes.match(/\bname="([^"]+)"/)?.[1];
      if (!name || mainSheets.has(decodeXml(name))) return full;
      const updated = attributes.replace(/\s+state="[^"]*"/, "");
      return `<sheet${updated} state="hidden"${slash}>`;
    });
    files["xl/workbook.xml"] = strToU8(pdfWorkbook);
    const pdfXlsxPath = join(directory, "business-plan-pdf.xlsx");
    await writeFile(pdfXlsxPath, zipSync(files, { level: 6 }), { mode: 0o600 });
    const executable = process.env.LIBREOFFICE_PATH || "soffice";
    await run(executable, [`-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`, "--headless", "--convert-to", "pdf:calc_pdf_Export", "--outdir", directory, pdfXlsxPath], {
      timeout: 45000, maxBuffer: 256 * 1024, signal,
    });
    const pdf = await readFile(join(directory, "business-plan-pdf.pdf"));
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid converted Diia PDF");
    return Buffer.from(zipSync({ "business-plan.xlsx": workbook, "business-plan.pdf": pdf }, { level: 6 }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
