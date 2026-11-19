import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildBrave1Workbook,
  buildBrave1ProjectBriefMarkdown,
} from "../src/export/brave1Export.js";
import { validateBrave1Project } from "../src/finance/brave1Validator.js";

const sampleInput = {
  title: "Система РЕБ «Спектр-1»",
  revision: 1,
  details: {
    project_title: "Система виявлення та радіоелектронного придушення БПЛА «Спектр-1»",
    defense_category: "Засоби РЕБ / РЕР",
    operational_problem: "Придушення каналів управління FPV-дронів на нестандартних діапазонах.",
    technical_solution_public: "Модульний широкосмуговий глушник із спрямованими антенами та цифровим синтезатором.",
    current_trl: 4,
    target_trl: 6,
    trl_evidence: "https://example.com/field-tests-proof-video",
    team_engineering_background: "3 кандидати технічних наук, 8 років досвіду в НДІ радіоелектроніки.",
    testing_and_scaling_plan: "1 міс: безвідлунна камера, 2 міс: полігон із бойовими підрозділами.",
    supply_chain_and_risks: "Компоненти постачаються від перевірених дистриб'юторів у ЄС.",
    rd_milestones: [
      {
        title: "Етап 1: Лабораторний макет",
        duration_months: 2,
        deliverable: "Прототип у безвідлунній камері",
        cost_kopecks: 35000000,
      },
      {
        title: "Етап 2: Полігонні випробування",
        duration_months: 3,
        deliverable: "Польовий звіт з військовими",
        cost_kopecks: 65000000,
      },
    ],
    bom_and_rd_budget: [
      { name: "Модулі SDR / FPGA", category: "BOM", quantity: 2, unitPriceKopecks: 25000000, cost_kopecks: 50000000 },
      { name: "СВЧ-підсилювачі", category: "BOM", quantity: 2, unitPriceKopecks: 25000000, cost_kopecks: 50000000 },
    ],
  },
  items: [
    { name: "Модулі SDR / FPGA", quantity: 2, unitPriceKopecks: 25000000, category: "BOM" },
    { name: "СВЧ-підсилювачі", quantity: 2, unitPriceKopecks: 25000000, category: "BOM" },
  ],
  total_kopecks: 100000000,
};

test("buildBrave1Workbook outputs valid XLSX with live formulas and two sheets", () => {
  const bytes = buildBrave1Workbook(sampleInput);
  assert.ok(bytes.byteLength > 1000, "XLSX file size must be substantial");

  const unzipped = unzipSync(bytes);
  assert.ok(unzipped["[Content_Types].xml"], "Must contain [Content_Types].xml");
  assert.ok(unzipped["xl/workbook.xml"], "Must contain xl/workbook.xml");
  assert.ok(unzipped["xl/worksheets/sheet1.xml"], "Must contain sheet1 (BOM)");
  assert.ok(unzipped["xl/worksheets/sheet2.xml"], "Must contain sheet2 (Milestones & TRL)");

  const workbookXml = strFromU8(unzipped["xl/workbook.xml"]);
  assert.match(workbookXml, /Кошторис R&amp;D \(BOM\)/u);
  assert.match(workbookXml, /Етапи R&amp;D та TRL/u);
  assert.match(workbookXml, /forceFullCalc="1"/u);

  const sheet1Xml = strFromU8(unzipped["xl/worksheets/sheet1.xml"]);
  assert.doesNotMatch(sheet1Xml, /#REF!/);
  assert.doesNotMatch(sheet1Xml, /#VALUE!/);
  assert.match(sheet1Xml, /<f>D\d+\*E\d+<\/f>/, "Must contain live multiplication formula =D*E");
  assert.match(sheet1Xml, /<f>SUM\(F6:F\d+\)<\/f>/, "Must contain live SUM formula for BOM");

  const sheet2Xml = strFromU8(unzipped["xl/worksheets/sheet2.xml"]);
  assert.doesNotMatch(sheet2Xml, /#REF!/);
  assert.match(sheet2Xml, /<f>SUM\(E6:E\d+\)<\/f>/, "Must contain live SUM formula for Milestones");
  assert.match(sheet2Xml, /<f>E\d+-.*?F\d+<\/f>/, "Must contain reconciliation formula between sheets");
});

test("buildBrave1ProjectBriefMarkdown contains OPSEC rules and 10 structured sections", () => {
  const md = buildBrave1ProjectBriefMarkdown(sampleInput);

  assert.match(md, /OPSEC/);
  assert.match(md, /1\. Загальна інформація про проєкт/);
  assert.match(md, /2\. Бойова \/ операційна задача/);
  assert.match(md, /3\. Технічне рішення та інновація/);
  assert.match(md, /4\. Рівень технологічної готовності/);
  assert.match(md, /5\. Дорожня карта та етапи R&D/);
  assert.match(md, /6\. Інженерна команда/);
  assert.match(md, /7\. План випробувань, кодифікації та масштабування/);
  assert.match(md, /8\. Ланцюг постачання/);
  assert.match(md, /9\. Зведений кошторис R&D та BOM/);
  assert.match(md, /10\. Чекліст зовнішніх додатків заявника/);

  // Check data populated
  assert.match(md, /Спектр-1/);
  assert.match(md, /TRL 4/);
  assert.match(md, /TRL 6/);
});

test("validateBrave1Project enforces TRL rules, milestones and OPSEC constraints", () => {
  // 1. Valid project
  const validResult = validateBrave1Project({
    title: sampleInput.title,
    current_trl: 4,
    target_trl: 6,
    trl_evidence: "https://example.com/test-stand",
    rd_milestones: sampleInput.details.rd_milestones,
    bom_and_rd_budget: [
      { name: "FPGA", kopecks: 50000000 },
      { name: "RF Amp", kopecks: 50000000 },
    ],
    total_kopecks: 100000000,
    all_text_fields: [
      "Система Спектр-1",
      "Засоби РЕБ",
      "Широкосмуговий глушник",
    ],
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.blocking_errors.length, 0);
  assert.equal(validResult.reconciliation.matches, true);

  // 2. Target TRL not progressing
  const invalidTrl = validateBrave1Project({
    current_trl: 5,
    target_trl: 4,
    rd_milestones: sampleInput.details.rd_milestones,
    total_kopecks: 100000000,
  });
  assert.equal(invalidTrl.valid, false);
  assert.ok(invalidTrl.blocking_errors.some((e) => e.code === "TARGET_TRL_NOT_PROGRESSING"));

  // 3. Insufficient milestones (< 2)
  const insufficientMilestones = validateBrave1Project({
    current_trl: 3,
    target_trl: 5,
    rd_milestones: [{ title: "Only 1 milestone", duration_months: 3, deliverable: "Done", cost_kopecks: 1000000 }],
    total_kopecks: 1000000,
  });
  assert.equal(insufficientMilestones.valid, false);
  assert.ok(insufficientMilestones.blocking_errors.some((e) => e.code === "INSUFFICIENT_MILESTONES"));

  // 4. OPSEC: GPS coordinates detection
  const opsecGps = validateBrave1Project({
    current_trl: 3,
    target_trl: 5,
    rd_milestones: sampleInput.details.rd_milestones,
    total_kopecks: 100000000,
    all_text_fields: ["Випробування проводились на полігоні 50.4501, 30.5234 біля річки"],
  });
  assert.equal(opsecGps.valid, false);
  assert.ok(opsecGps.blocking_errors.some((e) => e.code === "OPSEC_GPS_COORDINATES_DETECTED"));

  // 5. OPSEC: Military unit code detection
  const opsecUnit = validateBrave1Project({
    current_trl: 3,
    target_trl: 5,
    rd_milestones: sampleInput.details.rd_milestones,
    total_kopecks: 100000000,
    all_text_fields: ["Передано на баланс у в/ч А1234 для дослідної експлуатації"],
  });
  assert.ok(opsecUnit.warnings.some((w) => w.code === "OPSEC_MILITARY_UNIT_DETECTED"));
});
