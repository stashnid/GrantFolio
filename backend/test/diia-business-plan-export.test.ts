import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { buildDiiaBusinessPlanWorkbook, createDiiaBusinessPlanExport, mapGrantApplicationAnswersToDiiaCells } from "../src/diia-business-plan-export.js";
import type { FinancialBusinessPlanRows, FinancialPlan } from "../src/grant-financial-plan.js";

const templateUrl = new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url);

function sheetPath(files: Record<string, Uint8Array>, sheetName: string) {
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const relationships = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const rels = new Map([...relationships.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(match => [
    match[1].match(/\bId="([^"]+)"/)![1], match[1].match(/\bTarget="([^"]+)"/)![1],
  ]));
  const sheet = [...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`name="${sheetName}"`));
  assert(sheet);
  const target = rels.get(sheet[1].match(/\b(?:r:)?id="([^"]+)"/)![1])!;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function assertCurrencyStyle(files: Record<string, Uint8Array>, sheetName: string, cell: string) {
  const xml = strFromU8(files[sheetPath(files, sheetName)]);
  const style = xml.match(new RegExp(`<c r="${cell}"[^>]* s="(\\d+)"`))?.[1];
  assert(style, `currency cell ${sheetName}!${cell} has no style`);
  const styles = strFromU8(files["xl/styles.xml"]);
  const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1];
  assert(xfs);
  const entries = [...xfs.matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(match => match[0]);
  assert.match(entries[Number(style)], /numFmtId="4"/);
}

function financialPlan(): FinancialPlan {
  const emptyRows: FinancialBusinessPlanRows = {
    additionalSalesKopecks: 0, assetSaleIncomeKopecks: 0, otherIncomeKopecks: 0,
    propertyPurchaseKopecks: 0, premisesRentKopecks: 0, equipmentRentalKopecks: 0, otherBusinessCostsKopecks: 0,
    utilitiesKopecks: 0, insuranceKopecks: 0, marketingKopecks: 0, communicationsKopecks: 0, equipmentKopecks: 0,
    repairsKopecks: 0, transportKopecks: 0, professionalServicesKopecks: 0, applicantSalaryKopecks: 0,
    existingStaffSalaryKopecks: 0, newStaffSalaryKopecks: 0, simplifiedTaxKopecks: 0, simplifiedMilitaryLevyKopecks: 0,
    fopTaxableIncomeKopecks: 0, fopIncomeTaxKopecks: 0, fopMilitaryLevyKopecks: 0, fopEsvKopecks: 0,
    ecologicalTaxKopecks: 0, rentPaymentKopecks: 0,
  };
  const months = Array.from({ length: 24 }, () => ({ salesKopecks: 0, grantKopecks: 0, ownKopecks: 0,
    operatingCostsKopecks: 0, payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0 }));
  months[0] = { salesKopecks: 500000, grantKopecks: 12500500, ownKopecks: 2500000,
    operatingCostsKopecks: 4050, payrollKopecks: 100000, taxesKopecks: 5000, capitalCostsKopecks: 100000 };
  const businessPlanRows = Array.from({ length: 24 }, () => ({ ...emptyRows }));
  businessPlanRows[0] = { ...emptyRows, additionalSalesKopecks: 150, assetSaleIncomeKopecks: 250, otherIncomeKopecks: 350,
    marketingKopecks: 4050, equipmentKopecks: 100000,
    newStaffSalaryKopecks: 100000, simplifiedTaxKopecks: 5000 };
  return { openingBalanceKopecks: 0, months, businessPlanRows };
}

const answers = {
  track: "start" as const, requestedGrantKopecks: 12500500, ownContributionKopecks: 2500000,
  newJobs: 2, applicantType: "entrepreneur" as const, applicantName: "ФОП Тестовий $& заявник", applicantTaxId: "0000000000",
  legalForm: "ФОП", taxSystem: "simplified" as const, taxProfile: "fop_simplified" as const, vatStatus: "nonpayer" as const,
  vatBonusBasis: "no" as const, youngApplicant: "no" as const, veteranBusiness: "no" as const, patentBasis: "no" as const, displacedApplicant: "no" as const,
  priorityTerritory: "no" as const, damagedAssets: "no" as const, prioritySector: "no" as const,
  location: "Київська область, тестова громада", activity: "01.13 — вирощування овочів", applicantBusinessHistory: "Нова справа, діяльність ще не розпочата.",
  businessAddress: "Тестова адреса, пошта test@example.com", applicantIdentity: "Контактна особа тестова", applicantExperience: "Досвід команди в сільському господарстві.",
  projectConcept: "Унікальна концепція ферми.", expectedImpact: "Створення двох робочих місць.", permits: "Дозволи перевірені.",
  grantUsePlan: "Обладнання та запуск теплиці.", grantExpenseLines: "Насосна станція | 125005 | Для зрошення теплиці", ownExpenseLines: "Підготовка майданчика | 25000 | Власні кошти",
  projectDurationMonths: 24, projectObjective: "Запустити ферму.", projectSchedule: "Січень 2027\nЗакупівля обладнання — лютий 2027\nМонтаж — березень 2027\nЗапуск — квітень 2027",
  productDescription: "Овочі", targetCustomers: "Місцеві магазини", pricingStrategy: "Собівартість і ринкова ціна.",
  salesForecast: "Продажі згідно з фінпланом.", profitabilityForecast: "За прогнозом.", financialResultForecast: "За прогнозом.", cashFlowForecast: "За прогнозом.",
  paybackAssumptions: "За прогнозом.", roiForecast: "За прогнозом.", irrForecast: "За прогнозом.", breakEvenMonths: 12,
  environmentalImpact: "План мінімізації відходів.", otherResults: "Підтримка місцевих постачальників.", taxEstimate: "За планом.", regionalImpact: "Закупівлі у громаді.",
  projectRisks: "Затримка обладнання.", projectRiskMitigation: "Запасний постачальник.", staffingPlan: "Двоє працівників.", indirectJobs: "1 у постачальника.",
  marketAnalysis: "Попит місцевого ринку.", marketEvidence: "Попередні замовлення.", financialAssumptions: "Ціни й обсяги — прогноз.",
  quoteEvidence: "Пропозиція постачальника від 2026-10-01.", existingAssets: "Земельна ділянка в оренді.", financingSources: "Власні заощадження.",
};

test("maps the full applicant and financing data into the official template and preserves every formula", async () => {
  const template = await readFile(templateUrl);
  const source = unzipSync(template);
  const mapping = mapGrantApplicationAnswersToDiiaCells(answers, {
    budgetTotalKopecks: 15000500,
    items: [{ name: "Насосна станція", quantity: 1, unitPriceKopecks: 12500500 }, { name: "Підготовка майданчика", quantity: 1, unitPriceKopecks: 2500000 }],
    financialPlan: financialPlan(),
  });
  const exported = unzipSync(buildDiiaBusinessPlanWorkbook(template, mapping.cells, []));
  const planPath = sheetPath(exported, "Бізнес план");
  const financePath = sheetPath(exported, "Прибутки та збитки");
  const originalPlan = strFromU8(source[planPath]);
  const exportedPlan = strFromU8(exported[planPath]);
  const originalFinance = strFromU8(source[financePath]);
  const exportedFinance = strFromU8(exported[financePath]);
  for (const path of Object.keys(source)) assert(exported[path], `preserved package entry ${path}`);
  assert.equal((exportedPlan.match(/<f(?:\s|>)/g) ?? []).length, (originalPlan.match(/<f(?:\s|>)/g) ?? []).length);
  assert.equal((exportedFinance.match(/<f(?:\s|>)/g) ?? []).length, (originalFinance.match(/<f(?:\s|>)/g) ?? []).length);
  assert.equal((exportedPlan.match(/<row\b/g) ?? []).length, (originalPlan.match(/<row\b/g) ?? []).length);
  assert.equal((exportedPlan.match(/<mergeCell\b/g) ?? []).length, (originalPlan.match(/<mergeCell\b/g) ?? []).length);
  assert.match(exportedPlan, /<c r="B22"[^>]*>.*?24 місяці/s);
  assert.match(exportedPlan, /<c r="B82"[^>]*>.*?Насосна станція/s);
  assert.match(exportedPlan, /<c r="E82"[^>]*><v>125005<\/v><\/c>/);
  assert.match(exportedPlan, /<c r="E92"[^>]*><v>25000<\/v><\/c>/);
  assert.match(exportedPlan, /<c r="C34"[^>]*>.*?Так/s);
  assert.match(exportedPlan, /<c r="B106"[^>]*>.*?Запасний постачальник/s);
  assert.match(exportedFinance, /<c r="D4"[^>]*>.*?ФОП Тестовий \$&amp; заявник/s);
  assert.match(exportedFinance, /<c r="E16"[^>]*><v>5000<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E17"[^>]*><v>1\.5<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E18"[^>]*><v>2\.5<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E19"[^>]*><v>3\.5<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E39"[^>]*><v>40\.5<\/v><\/c>/);
  assertCurrencyStyle(exported, "Прибутки та збитки", "E39");
  assertCurrencyStyle(exported, "Бізнес план", "E82");
  assert.match(exportedFinance, /<c r="E41"[^>]*><v>1000<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E49"[^>]*><v>1000<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="E60"[^>]*><v>50<\/v><\/c>/);
  assert.match(exportedFinance, /<c r="AB16"[^>]*><v>0<\/v><\/c>/);
});

test("paired and self-closing cells are replaced without consuming neighboring table rows", async () => {
  const template = await readFile(templateUrl);
  const source = unzipSync(template);
  const changed = unzipSync(buildDiiaBusinessPlanWorkbook(template, { "Бізнес план": {
    B82: "Item $& 1", E82: 1.5, F82: "Reason $1", B92: "Own line", E92: 0, F92: "None",
  } }, []));
  const path = sheetPath(changed, "Бізнес план");
  const original = strFromU8(source[path]);
  const output = strFromU8(changed[path]);
  assert.equal((output.match(/<row\b/g) ?? []).length, (original.match(/<row\b/g) ?? []).length);
  assert.equal((output.match(/<mergeCell\b/g) ?? []).length, (original.match(/<mergeCell\b/g) ?? []).length);
  assert.equal((output.match(/<f(?:\s|>)/g) ?? []).length, (original.match(/<f(?:\s|>)/g) ?? []).length);
  assert.match(output, /Item \$&amp; 1/);
  assert.match(output, /Reason \$1/);
  assert.match(output, /<c r="F95"/);
});

test("rejects formula edits and missing cells", async () => {
  const template = await readFile(templateUrl);
  assert.throws(() => buildDiiaBusinessPlanWorkbook(template, { "Бізнес план": { C27: 9 } }, []), /formula cell/i);
  assert.throws(() => buildDiiaBusinessPlanWorkbook(template, { "Бізнес план": { Z999: 9 } }, []), /missing official template cell/i);
});

test("official export creates a PDF from the same workbook and hides reference sheets", async () => {
  const template = await readFile(templateUrl);
  const archive = unzipSync(await createDiiaBusinessPlanExport(template, { "Бізнес план": { B41: "Загальна система" } }, [
    { sheet: "Бізнес план", cell: "B43" },
  ]));
  assert.match(strFromU8(archive["business-plan.pdf"].slice(0, 5)), /^%PDF-$/);
  const exported = unzipSync(archive["business-plan.xlsx"]);
  const original = unzipSync(template);
  assert.equal((strFromU8(exported[sheetPath(exported, "Прибутки та збитки")]).match(/<f(?:\s|>)/g) ?? []).length,
    (strFromU8(original[sheetPath(original, "Прибутки та збитки")]).match(/<f(?:\s|>)/g) ?? []).length);
  assert.match(strFromU8(exported["xl/workbook.xml"]), /name="Пам/);
});
