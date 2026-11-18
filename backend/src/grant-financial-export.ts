import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import type { calculateFinancialPlan } from "./grant-financial-plan.js";

type Forecast = ReturnType<typeof calculateFinancialPlan>;
export type FinancialExport = {
  title: string;
  caseRevision: number;
  applicationRevision: number;
  planRevision: number;
  forecast: Forecast;
};

const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const textCell = (address: string, value: string, style = 0) => `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
const numberCell = (address: string, kopecks: number, style = 1) => {
  if (!Number.isSafeInteger(kopecks)) throw new Error("Invalid financial amount");
  return `<c r="${address}" s="${style}"><v>${(kopecks / 100).toFixed(2)}</v></c>`;
};

const rowsPerSheet = 24;

function worksheet(input: FinancialExport, months: Forecast["months"], includeTotals: boolean) {
  const f = input.forecast;
  const labels = ["Місяць", "Залишок на початок", "Продажі", "Грант", "Власні кошти", "Операційні витрати", "Зарплата", "Податки", "Капітальні витрати", "Надходження", "Витрати", "Залишок на кінець"];
  const rowNumber = months.length + 7;
  const t = f.totals;
  const totals = [f.openingBalanceKopecks, t.salesKopecks, t.grantKopecks, t.ownKopecks, t.operatingCostsKopecks, t.payrollKopecks, t.taxesKopecks, t.capitalCostsKopecks, t.incomeKopecks, t.expensesKopecks, t.closingBalanceKopecks];
  const rows = [
    `<row r="1" ht="23" customHeight="1">${textCell("A1", "РОБОЧИЙ ФІНАНСОВИЙ ПЛАН · ДЛЯ ПЕРЕВІРКИ", 3)}</row>`,
    `<row r="2">${textCell("A2", input.title)}</row>`,
    `<row r="3">${textCell("A3", `Версії: проєкт ${input.caseRevision}, анкета ${input.applicationRevision}, план ${input.planRevision}`)}</row>`,
    `<row r="4">${textCell("A4", "Дані введені заявником, суми в гривнях. Перевірте умови програми та офіційну форму.")}</row>`,
    `<row r="6" ht="32" customHeight="1">${labels.map((label, i) => textCell(`${String.fromCharCode(65 + i)}6`, label, 2)).join("")}</row>`,
    ...months.map((month, index) => {
      const row = index + 7;
      const values = [month.openingBalanceKopecks, month.salesKopecks, month.grantKopecks, month.ownKopecks, month.operatingCostsKopecks, month.payrollKopecks, month.taxesKopecks, month.capitalCostsKopecks, month.incomeKopecks, month.expensesKopecks, month.closingBalanceKopecks];
      return `<row r="${row}"><c r="A${row}"><v>${month.number}</v></c>${values.map((value, i) => numberCell(`${String.fromCharCode(66 + i)}${row}`, value)).join("")}</row>`;
    }),
  ];
  if (includeTotals) {
    rows.push(`<row r="${rowNumber}">${textCell(`A${rowNumber}`, "Разом", 2)}${totals.map((amount, i) => numberCell(`${String.fromCharCode(66 + i)}${rowNumber}`, amount, 4)).join("")}</row>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="9" width="13" customWidth="1"/><col min="10" max="10" width="17" customWidth="1"/><col min="11" max="12" width="13" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="4"><mergeCell ref="A1:L1"/><mergeCell ref="A2:L2"/><mergeCell ref="A3:L3"/><mergeCell ref="A4:L4"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

export function buildFinancialWorkbook(input: FinancialExport): Uint8Array {
  const months = input.forecast.months;
  if (![24, 36, 60].includes(months.length)) throw new Error("Invalid projection length");
  const sheets = Array.from({ length: Math.ceil(months.length / rowsPerSheet) }, (_, index) => {
    const start = index * rowsPerSheet;
    const end = Math.min(start + rowsPerSheet, months.length);
    return { id: index + 1, start, end, content: worksheet(input, months.slice(start, end), end === months.length) };
  });
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map(({ id }) => `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(({ id, start, end }) => `<sheet name="Місяці ${start + 1}-${end}" sheetId="${id}" r:id="rId${id}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map(({ id }) => `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="3"><font><sz val="11"/><name val="DejaVu Sans"/></font><font><b/><sz val="11"/><name val="DejaVu Sans"/></font><font><b/><sz val="16"/><name val="DejaVu Sans"/></font></fonts>
        <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="5">
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
          <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment shrinkToFit="1"/></xf>
          <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
          <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
          <xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment shrinkToFit="1"/></xf>
        </cellXfs>
      </styleSheet>`,
  };
  for (const { id, content } of sheets) entries[`xl/worksheets/sheet${id}.xml`] = content;
  return zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, strToU8(content)])), { level: 6 });
}

const run = promisify(execFile);
export async function createFinancialExport(input: FinancialExport, signal?: AbortSignal): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "grantfolio-financial-export-"));
  try {
    const workbook = buildFinancialWorkbook(input);
    const xlsx = join(directory, "financial-plan.xlsx");
    await writeFile(xlsx, workbook, { mode: 0o600 });
    const executable = process.env.LIBREOFFICE_PATH || "soffice";
    await run(executable, [`-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`, "--headless", "--convert-to", "pdf:calc_pdf_Export", "--outdir", directory, xlsx], { timeout: 45000, maxBuffer: 256 * 1024, signal });
    const pdf = await readFile(join(directory, "financial-plan.pdf"));
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid converted PDF");
    return Buffer.from(zipSync({ "financial-plan.xlsx": workbook, "financial-plan.pdf": pdf }, { level: 6 }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
