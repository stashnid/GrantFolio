import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildDiiaBusinessPlanWorkbook, createDiiaBusinessPlanExport, mapGrantApplicationAnswersToDiiaCells } from "../src/diia-business-plan-export.js";

function fixture() {
  return zipSync({
    "xl/workbook.xml": strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Бізнес план" sheetId="1" r:id="rId1"/><sheet name="Прибутки та збитки" sheetId="2" r:id="rId2"/><sheet name="Довідник" sheetId="3" r:id="rId3"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="C1" s="5" t="inlineStr"><is><t>Приклад</t></is></c><c r="C2" s="6"><f>1+1</f><v>2</v></c><c r="C3" s="5" t="inlineStr"><is><t>Старий приклад</t></is></c></row></sheetData><dataValidations count="1"/></worksheet>'),
    "xl/worksheets/sheet2.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="D1" s="7"><v>100</v></c></row></sheetData></worksheet>'),
    "xl/worksheets/sheet3.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
    "xl/styles.xml": strToU8("styles"),
    "xl/sharedStrings.xml": strToU8("shared"),
  });
}

function sheetPath(files: Record<string, Uint8Array>, sheetName: string) {
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const relationships = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const rels = new Map([...relationships.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(match => [
    match[1].match(/\bId="([^"]+)"/)![1], match[1].match(/\bTarget="([^"]+)"/)![1],
  ]));
  const sheet = [...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`name="${sheetName}"`));
  assert(sheet);
  const id = sheet[1].match(/\b(?:r:)?id="([^"]+)"/)![1];
  const target = rels.get(id)!;
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

test("preserves official package structure and formulas while clearing and filling explicit cells", () => {
  const original = fixture();
  const changed = unzipSync(buildDiiaBusinessPlanWorkbook(original, {
    "Бізнес план": { C1: "Значення заявника" },
    "Прибутки та збитки": { D1: 250.5 },
  }, [{ sheet: "Бізнес план", cell: "C3" }]));
  const source = unzipSync(original);
  const plan = strFromU8(changed["xl/worksheets/sheet1.xml"]);
  const finance = strFromU8(changed["xl/worksheets/sheet2.xml"]);
  assert.match(plan, /<c r="C1" s="5" t="inlineStr"><is><t xml:space="preserve">Значення заявника<\/t><\/is><\/c>/);
  assert.match(plan, /<c r="C2" s="6"><f>1\+1<\/f><v>2<\/v><\/c>/);
  assert.match(plan, /<c r="C3" s="5"\/>/);
  assert.match(plan, /<dataValidations count="1"\/>/);
  assert.match(finance, /<c r="D1" s="7"><v>250\.5<\/v><\/c>/);
  assert.deepEqual(Object.keys(changed).sort(), Object.keys(source).sort());
  assert.equal(strFromU8(changed["xl/styles.xml"]), strFromU8(source["xl/styles.xml"]));
  assert.equal(strFromU8(changed["xl/sharedStrings.xml"]), strFromU8(source["xl/sharedStrings.xml"]));
  assert.match(strFromU8(changed["xl/workbook.xml"]), /fullCalcOnLoad="1" forceFullCalc="1"/);
});

test("refuses formula edits and unsupported cells", () => {
  const original = fixture();
  assert.throws(() => buildDiiaBusinessPlanWorkbook(original, { "Бізнес план": { C2: 9 } }, []), /formula cell/i);
  assert.throws(() => buildDiiaBusinessPlanWorkbook(original, { "Бізнес план": { Z99: 9 } }, []), /missing official template cell/i);
});

test("maps only direct application answers and reports fields that still need applicant input", () => {
  const mapping = mapGrantApplicationAnswersToDiiaCells({
    track: "scale", requestedGrantKopecks: 12500500, newJobs: 2, permits: "Ліцензія потрібна, подання заплановане до початку роботи.",
    projectObjective: "Відкрити цех для виробництва деталей.", pricingStrategy: "Ціна покриває матеріали, оплату праці та логістику.",
    staffingPlan: "Майстер — 1 працівник, 24 000 грн на місяць.", projectRisks: "Постачання обладнання може затриматися.",
    applicantIdentity: "Назва і контакти, код буде уточнено.",
  });
  assert.deepEqual(mapping.cells["Бізнес план"], {
    B24: "Масштабування власної справи", C26: 125005, B99: 2,
    B16: "Ліцензія потрібна, подання заплановане до початку роботи.",
    B45: "Відкрити цех для виробництва деталей.",
    B59: "Ціна покриває матеріали, оплату праці та логістику.",
    B101: "Майстер — 1 працівник, 24 000 грн на місяць.",
    B104: "Постачання обладнання може затриматися.",
  });
  assert(mapping.remainingAnswers.includes("applicantIdentity"));
  assert(mapping.missingOfficialInputs.some(item => item.includes("окремо від коду ЄДРПОУ")));
});

test("preserves the sanitized Diia workbook when mapped answers are applied", async () => {
  const template = await readFile(new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url));
  const source = unzipSync(template);
  const mapping = mapGrantApplicationAnswersToDiiaCells({
    track: "start", requestedGrantKopecks: 25000000, newJobs: 1,
    permits: "Дозвіл не потрібен за наявної моделі діяльності.",
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
  assert.equal((exportedPlan.match(/<dataValidation\b/g) ?? []).length, (originalPlan.match(/<dataValidation\b/g) ?? []).length);
  assert.match(exportedPlan, /<c r="B24"[^>]*>.*?Масштабування власної справи/s);
});

test("packaged workbook clears example entries and keeps form headings and formulas", async () => {
  const template = await readFile(new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url));
  const files = unzipSync(template);
  const plan = strFromU8(files[sheetPath(files, "Бізнес план")]);
  for (const cell of ["B6", "B14", "B16", "B22", "C34", "C41", "C43", "B45", "B59", "B104"]) {
    assert.match(plan, new RegExp(`<c\\b[^>]*\\br="${cell}"[^>]*/>`), `sample value removed from ${cell}`);
  }
  assert.match(plan, /<c r="B13"[^>]*><v>/);
  assert.match(plan, /<c r="K14"[^>]*><v>/);
  const finance = strFromU8(files[sheetPath(files, "Прибутки та збитки")]);
  assert.equal((plan.match(/<f(?:\s|>)/g) ?? []).length, 18);
  assert.equal((finance.match(/<f(?:\s|>)/g) ?? []).length, 1138);
});

test("applies values to the sanitized Diia workbook without changing form structure", async () => {
  const original = await readFile(new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url));
  const source = unzipSync(original);
  const changed = unzipSync(buildDiiaBusinessPlanWorkbook(original, {
    "Бізнес план": { C41: "Загальна система" },
  }, [
    { sheet: "Бізнес план", cell: "C41" },
    { sheet: "Бізнес план", cell: "C43" },
  ]));
  for (const file of Object.keys(source)) assert(changed[file], `preserved package entry ${file}`);
  const planPath = sheetPath(changed, "Бізнес план");
  const plan = strFromU8(changed[planPath]);
  assert.match(plan, /<c r="C41" s="230" t="inlineStr"><is><t xml:space="preserve">Загальна система<\/t><\/is><\/c>/);
  assert.match(plan, /<c r="C43" s="230"\/>/);
  const oldPlan = strFromU8(source[planPath]);
  assert.equal((plan.match(/<f(?:\s|>)/g) ?? []).length, (oldPlan.match(/<f(?:\s|>)/g) ?? []).length);
  assert.equal((plan.match(/<dataValidation\b/g) ?? []).length, (oldPlan.match(/<dataValidation\b/g) ?? []).length);
});

test("builds PDF from the same preserved workbook while excluding reference sheets", async () => {
  const template = await readFile(new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url));
  const archive = unzipSync(await createDiiaBusinessPlanExport(template, {}, [
    { sheet: "Бізнес план", cell: "C41" },
    { sheet: "Бізнес план", cell: "C43" },
  ]));
  assert.match(strFromU8(archive["business-plan.pdf"].slice(0, 5)), /^%PDF-$/);
  const exported = unzipSync(archive["business-plan.xlsx"]);
  const original = unzipSync(template);
  assert.equal((strFromU8(exported[sheetPath(exported, "Прибутки та збитки")]).match(/<f(?:\s|>)/g) ?? []).length,
    (strFromU8(original[sheetPath(original, "Прибутки та збитки")]).match(/<f(?:\s|>)/g) ?? []).length);
  assert.match(strFromU8(exported["xl/workbook.xml"]), /name="Пам/);
});
