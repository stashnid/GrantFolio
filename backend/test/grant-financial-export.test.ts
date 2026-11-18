import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { buildFinancialWorkbook, createFinancialExport } from "../src/grant-financial-export.js";
import { calculateFinancialPlan } from "../src/grant-financial-plan.js";

const blank = { salesKopecks: 10050, grantKopecks: 0, ownKopecks: 0, operatingCostsKopecks: 2025, payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0 };
const input = (count: number) => ({
  title: '=Тест & <план>', caseRevision: 2, applicationRevision: 3, planRevision: 4,
  forecast: calculateFinancialPlan({ openingBalanceKopecks: 0, months: Array.from({ length: count }, () => blank) }),
});
for (const count of [24, 36, 60]) {
  test(`workbook writes exact projection and text-only title for ${count} months`, () => {
    const files = unzipSync(buildFinancialWorkbook(input(count)));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    assert.match(sheet, /=Тест &amp; &lt;план&gt;/);
    assert.match(sheet, /<v>100\.50<\/v>/);
    assert.match(sheet, /<v>20\.25<\/v>/);
    const finalSheet = strFromU8(files["xl/worksheets/sheet" + Math.ceil(count / 24) + ".xml"]);
    assert.match(finalSheet, new RegExp(`<c r="A\\d+"><v>${count}</v></c>`));
    assert.match(finalSheet, /Разом/);
    assert(!sheet.includes("<f>") && !finalSheet.includes("<f>"));
  });
}
test("export returns matching workbook and converted PDF", { skip: !process.env.LIBREOFFICE_TEST }, async () => {
  const files = unzipSync(await createFinancialExport(input(24)));
  assert(strFromU8(files["financial-plan.pdf"].slice(0, 5)) === "%PDF-");
  assert(strFromU8(unzipSync(files["financial-plan.xlsx"])["xl/worksheets/sheet1.xml"]).includes("100.50"));
});
