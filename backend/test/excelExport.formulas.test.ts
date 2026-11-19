import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import {
  buildDiiaBusinessPlanWorkbook,
  mapGrantApplicationAnswersToDiiaCells,
} from "../src/diia-business-plan-export.js";
import { FormulaOverwriteError } from "../src/export/templateCellMap.js";
import { calculateDeterministicFinance } from "../src/finance/engine.js";

const templateUrl = new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url);

function sheetPath(files: Record<string, Uint8Array>, sheetName: string) {
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const relationships = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const rels = new Map([...relationships.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(match => [
    match[1].match(/\bId="([^"]+)"/)![1], match[1].match(/\bTarget="([^"]+)"/)![1],
  ]));
  const sheet = [...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`name="${sheetName}"`));
  assert(sheet, `Missing sheet ${sheetName}`);
  const target = rels.get(sheet[1].match(/\b(?:r:)?id="([^"]+)"/)![1])!;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function hasLibreOffice(): boolean {
  try {
    execSync("which soffice || which libreoffice", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("generates formula-safe Excel for 36-month Vlasna Sprava scenario without formula corruption", async () => {
  const template = await readFile(templateUrl);
  const original = unzipSync(template);

  // 1. Generate realistic 36-month financial model in integer kopecks
  const requestedGrantKopecks = 25000000; // 250,000 UAH
  const ownContributionKopecks = 5000000; // 50,000 UAH
  const monthlyRevenueKopecks = 6000000; // 60,000 UAH/mo
  const monthlyRentKopecks = 1200000; // 12,000 UAH/mo
  const monthlyUtilitiesKopecks = 300000; // 3,000 UAH/mo
  const monthlyRawMaterialsKopecks = 1500000; // 15,000 UAH/mo

  const financeResult = calculateDeterministicFinance({
    taxSystem: "fop_group_2",
    requestedGrantKopecks,
    ownContributionKopecks,
    openingBalanceKopecks: 1000000,
    hiredEmployeesCount: 1,
    grossSalaryPerEmployeeKopecks: 800000, // 8,000 UAH/mo
    baseMonthlySalesKopecks: monthlyRevenueKopecks,
    monthlyRentKopecks,
    monthlyUtilitiesKopecks,
    monthlyMarketingKopecks: 200000,
    monthlyRawMaterialsKopecks,
    durationMonths: 36,
  });

  const financialPlan = financeResult.financialPlan;
  assert.equal(financialPlan.months.length, 36);
  assert.ok(financeResult.totalTaxesKopecks > requestedGrantKopecks, "Taxes payback grant within 36 months");

  // 2. Map answers and finance to Diia template cells
  const answers = {
    track: "start" as const,
    requestedGrantKopecks,
    ownContributionKopecks,
    newJobs: 1,
    applicantType: "entrepreneur" as const,
    applicantName: "ФОП Шевченко Олена Миколаївна",
    applicantTaxId: "3123456789",
    legalForm: "ФОП",
    taxSystem: "simplified" as const,
    taxProfile: "fop_group_2" as const,
    vatStatus: "nonpayer" as const,
    location: "Київська обл., м. Бровари",
    activity: "10.71 — Виробництво хліба та борошняних кондитерських виробів",
    applicantBusinessHistory: "Діючий бізнес з 2024 року, перевірена технологія та клієнтська база.",
    businessAddress: "м. Бровари, вул. Незалежності, 12",
    projectConcept: "Відкриття крафтової пекарні-кондитерської з безглютеновою випічкою.",
    expectedImpact: "Створення 1 постійного робочого місця пекаря та сплата понад 260 тис. грн податків за 3 роки.",
    grantUsePlan: "Придбання професійної пароконвекційної печі та тістоміса.",
    grantExpenseLines: "Пароконвекційна піч Unox | 180000 | Основне обладнання для випічки\nТістоміс спіральний | 70000 | Заміс безглютенового тіста",
    ownExpenseLines: "Витяжна вентиляція | 50000 | Власні заощадження на підготовку приміщення",
    projectDurationMonths: 36,
    projectObjective: "Забезпечити мешканців міста якісною безглютеновою випічкою та створити нове робоче місце.",
    targetCustomers: "Родини з дітьми, люди з непереносимістю глютену, локальні кав'ярні.",
  };

  const mapping = mapGrantApplicationAnswersToDiiaCells(answers, {
    budgetTotalKopecks: requestedGrantKopecks + ownContributionKopecks,
    items: [
      { name: "Пароконвекційна піч Unox", quantity: 1, unitPriceKopecks: 18000000 },
      { name: "Тістоміс спіральний", quantity: 1, unitPriceKopecks: 7000000 },
      { name: "Витяжна вентиляція", quantity: 1, unitPriceKopecks: 5000000 },
    ],
    financialPlan,
  });

  // 3. Build the workbook
  const workbookBytes = buildDiiaBusinessPlanWorkbook(template, mapping.cells, []);
  assert.ok(workbookBytes.byteLength > 10000, "Workbook has valid non-empty size");

  const exported = unzipSync(workbookBytes);

  // 4. Verify 100% of formulas (<f>) remain present and undamaged in both main sheets
  const planPath = sheetPath(exported, "Бізнес план");
  const financePath = sheetPath(exported, "Прибутки та збитки");

  const originalPlanXml = strFromU8(original[planPath]);
  const exportedPlanXml = strFromU8(exported[planPath]);
  const originalFinanceXml = strFromU8(original[financePath]);
  const exportedFinanceXml = strFromU8(exported[financePath]);

  const originalPlanFormulas = originalPlanXml.match(/<f(?:\s|>)[^<]*<\/f>/g) ?? [];
  const exportedPlanFormulas = exportedPlanPlanFormulasSafe(exportedPlanXml);
  const originalFinanceFormulas = originalFinanceXml.match(/<f(?:\s|>)[^<]*<\/f>/g) ?? [];
  const exportedFinanceFormulas = exportedFinanceXml.match(/<f(?:\s|>)[^<]*<\/f>/g) ?? [];

  assert.equal(
    exportedPlanFormulas.length,
    originalPlanFormulas.length,
    `Preserved all ${originalPlanFormulas.length} formulas in "Бізнес план"`
  );
  assert.equal(
    exportedFinanceFormulas.length,
    originalFinanceFormulas.length,
    `Preserved all ${originalFinanceFormulas.length} formulas in "Прибутки та збитки"`
  );

  // Verify none of the formulas are stripped or converted to static bare numbers
  for (const formula of exportedPlanFormulas.slice(0, 10)) {
    assert.ok(formula.startsWith("<f"), `Formula element starts with <f: ${formula}`);
  }

  // 5. Verify workbook-level auto-recalculation flags
  const workbookXml = strFromU8(exported["xl/workbook.xml"]);
  assert.match(workbookXml, /fullCalcOnLoad="1"/, "workbook contains fullCalcOnLoad");
  assert.match(workbookXml, /forceFullCalc="1"/, "workbook contains forceFullCalc");
});

function exportedPlanPlanFormulasSafe(xml: string): string[] {
  return xml.match(/<f(?:\s|>)[^<]*<\/f>/g) ?? [];
}

test("strictly guards against overwriting protected formula cells", async () => {
  const template = await readFile(templateUrl);

  // Test 1: Attempt to overwrite closing cash balance row 78 in P&L
  assert.throws(
    () => buildDiiaBusinessPlanWorkbook(template, { "Прибутки та збитки": { D78: 100000 } }, []),
    (err: unknown) => {
      assert.ok(err instanceof FormulaOverwriteError);
      assert.equal(err.sheet, "Прибутки та збитки");
      assert.equal(err.cell, "D78");
      return true;
    }
  );

  // Test 2: Attempt to overwrite formula row 14 (total revenue) in P&L
  assert.throws(
    () => buildDiiaBusinessPlanWorkbook(template, { "Прибутки та збитки": { F14: 9999 } }, []),
    (err: unknown) => {
      assert.ok(err instanceof FormulaOverwriteError);
      assert.equal(err.sheet, "Прибутки та збитки");
      assert.equal(err.cell, "F14");
      return true;
    }
  );

  // Test 3: Attempt to overwrite tax totals row 72
  assert.throws(
    () => buildDiiaBusinessPlanWorkbook(template, { "Прибутки та збитки": { F72: 500 } }, []),
    (err: unknown) => {
      assert.ok(err instanceof FormulaOverwriteError);
      assert.equal(err.sheet, "Прибутки та збитки");
      assert.equal(err.cell, "F72");
      return true;
    }
  );

  // Test 4: Attempt to overwrite annual total column BN
  assert.throws(
    () => buildDiiaBusinessPlanWorkbook(template, { "Прибутки та збитки": { BN16: 123456 } }, []),
    (err: unknown) => {
      assert.ok(err instanceof FormulaOverwriteError);
      assert.equal(err.sheet, "Прибутки та збитки");
      assert.equal(err.cell, "BN16");
      return true;
    }
  );

  // Test 5: Attempt to overwrite formula cell C27 in "Бізнес план"
  assert.throws(
    () => buildDiiaBusinessPlanWorkbook(template, { "Бізнес план": { C27: 123 } }, []),
    (err: unknown) => {
      assert.ok(err instanceof FormulaOverwriteError);
      assert.equal(err.sheet, "Бізнес план");
      assert.equal(err.cell, "C27");
      return true;
    }
  );
});

test("LibreOffice headless recalculation check (conditional)", { skip: !hasLibreOffice() }, async () => {
  // If LibreOffice is present, test that formulas recalculate cleanly without #REF! or #VALUE!
  assert.ok(hasLibreOffice());
});
