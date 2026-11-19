import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OfficialDocManifestSchema, parseMarkdownSections } from "../src/knowledge/indexOfficialDocs.js";
import { searchOfficialRules } from "../src/knowledge/searchOfficialRules.js";
import { inspectXlsxTemplate } from "../../scripts/inspect-xlsx-template.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("official source manifests validate against OfficialDocManifestSchema", () => {
  const sourcesRoot = path.resolve(__dirname, "../resources/official-sources");
  const folders = ["vlasna-sprava", "veteran-grant", "brave1"];

  for (const folder of folders) {
    const manifestPath = path.join(sourcesRoot, folder, "manifest.json");
    assert(fs.existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);

    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const parsed = OfficialDocManifestSchema.safeParse(raw);

    assert(parsed.success, `Manifest in ${folder} failed schema: ${JSON.stringify(parsed.error?.issues)}`);
    assert(parsed.data.documents.length > 0, `Manifest in ${folder} must contain at least 1 document`);

    for (const doc of parsed.data.documents) {
      const docPath = path.join(sourcesRoot, folder, doc.local_file);
      assert(fs.existsSync(docPath), `Document file ${doc.local_file} must exist at ${docPath}`);
    }
  }
});

test("parseMarkdownSections chunks markdown files by headers", () => {
  const sampleMarkdown = `
# Вступ до програми
Це загальний опис програми єРобота.

## Стаття 1. Ліміти та пороги
Грант надається від 50 000 до 250 000 грн.

## Стаття 2. Вимоги до робочих місць
Обов'язкове працевлаштування 1 або 2 осіб на 36 місяців.
`;

  const chunks = parseMarkdownSections(
    sampleMarkdown,
    "vlasna-sprava",
    "test-doc",
    "https://example.com/law",
    "2026-11-19"
  );

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].section_title, "Загальні положення");
  assert.equal(chunks[1].section_title, "Стаття 1. Ліміти та пороги");
  assert.match(chunks[1].content, /250 000 грн/);
  assert.equal(chunks[2].section_title, "Стаття 2. Вимоги до робочих місць");
  assert.match(chunks[2].content, /36 місяців/);
});

test("searchOfficialRules retrieves relevant regulatory sections from local files", async () => {
  const vlasnaRules = await searchOfficialRules({
    program_id: "vlasna-sprava",
    question: "чи можна оренду без найму працівників",
  });

  assert(vlasnaRules.length > 0, "Must return rules for Vlasna Sprava");
  const rentSection = vlasnaRules.find((r) => /оренд|працівник/i.test(r.snippet + r.section_title));
  assert(rentSection, "Must find sections discussing rent or workers");
  assert.equal(rentSection.doc_id, "kmu-738-regulation");
  assert.match(rentSection.source_url, /zakon\.rada\.gov\.ua/);

  const brave1Rules = await searchOfficialRules({
    program_id: "brave1",
    question: "OPSEC вимоги та рівень TRL",
  });

  assert(brave1Rules.length > 0, "Must return rules for Brave1");
  const opsecSection = brave1Rules.find((r) => /opsec|trl/i.test(r.snippet + r.section_title));
  assert(opsecSection, "Must find sections discussing OPSEC or TRL");
  assert.equal(opsecSection.doc_id, "brave1-official-guide-rd");
});

test("inspectXlsxTemplate inspects spreadsheet and extracts formula cells and input cells", () => {
  const sampleXlsx = path.resolve(__dirname, "../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx");
  assert(fs.existsSync(sampleXlsx), `Template ${sampleXlsx} must exist`);

  const inspection = inspectXlsxTemplate(sampleXlsx);

  assert(inspection.sheets.length > 0, "Must detect worksheets");
  assert(inspection.sheets.includes("Бізнес план"), "Must contain 'Бізнес план' sheet");
  assert(inspection.formulaCells.length > 0, "Must detect formula cells <f>");
  assert(
    inspection.formulaCells.some((f) => f.formula.includes("IF") || f.formula.includes("SUM")),
    "Must detect Excel formulas like IF or SUM"
  );
  assert(inspection.inputCells.length > 0, "Must detect input cells <v>");
});
