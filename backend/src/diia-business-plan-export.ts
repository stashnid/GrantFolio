import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { GrantApplicationAnswers } from "./grant-application.js";

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
]);

const missingOfficialInputs = [
  "Ім’я/назва заявника окремо від коду ЄДРПОУ або РНОКПП та контактів",
  "Правова форма, місце діяльності з територіальною громадою та код основного КВЕД",
  "Досвід діяльності із датою початку та досвід команди",
  "Опис бізнес-ідеї, очікуваного впливу та потреби у державній підтримці",
  "Підстави для збільшення граничного гранту, включно з ПДВ, віком, ветеранським статусом, патентом, ВПО/релокацією, визначеною територією та пріоритетним сектором",
  "Період реалізації, система оподаткування та статус ПДВ",
  "Опис продукту/послуги, цільова аудиторія, адреса діяльності та етапи з датами",
  "Загальний бюджет і окремі рядки грантових та власних витрат з обґрунтуванням",
  "Прогноз продажів у кількості й гривнях, рентабельність, прибуток, грошовий потік, окупність, ROI та IRR",
  "Екологічний і додатковий вплив, місяць беззбитковості, версія плану й дата оновлення",
  "Заходи з пом’якшення кожного ризику, прогноз податків і регіональний економічний ефект",
];

export function mapGrantApplicationAnswersToDiiaCells(answers: GrantApplicationAnswers): DiiaBusinessPlanAnswerMapping {
  const cells: Record<string, string | number> = {};
  if (answers.track !== undefined) {
    cells.B24 = answers.track === "start" ? "Започаткування власної справи" : "Масштабування власної справи";
  }
  if (answers.requestedGrantKopecks !== undefined) cells.C26 = answers.requestedGrantKopecks / 100;
  if (answers.newJobs !== undefined) cells.B99 = answers.newJobs;
  if (answers.permits !== undefined) cells.B16 = answers.permits;
  if (answers.projectObjective !== undefined) cells.B45 = answers.projectObjective;
  if (answers.pricingStrategy !== undefined) cells.B59 = answers.pricingStrategy;
  if (answers.staffingPlan !== undefined) cells.B101 = answers.staffingPlan;
  if (answers.projectRisks !== undefined) cells.B104 = answers.projectRisks;
  const answerKeys = Object.keys(answers) as (keyof GrantApplicationAnswers)[];
  return {
    cells: { "Бізнес план": cells },
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

function replaceCell(xml: string, reference: string, value: string | number | null, clear: boolean) {
  const matcher = new RegExp(`<c\\b([^>]*\\br="${reference}"[^>]*)>([\\s\\S]*?)<\\/c>|<c\\b([^>]*\\br="${reference}"[^>]*)\\s*\\/>`);
  const match = matcher.exec(xml);
  if (!match) throw new Error(`Missing official template cell: ${reference}`);
  const attributes = match[1] ?? match[3];
  const inner = match[2] ?? "";
  if (/<f(?:\s|>)/.test(inner)) throw new Error(`Refusing to replace a formula cell: ${reference}`);
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
  return xml.replace(matcher, replacement);
}

export function buildDiiaBusinessPlanWorkbook(
  template: Uint8Array,
  cells: DiiaBusinessPlanCellChanges,
  clearCells: readonly DiiaBusinessPlanCellReference[],
) {
  const files = unzipSync(template);
  const { paths, workbookXml } = sheetPaths(files);
  for (const { sheet, cell } of clearCells) {
    if (!paths.has(sheet)) throw new Error(`Missing official sheet: ${sheet}`);
    if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(cell)) throw new Error(`Invalid cell reference: ${cell}`);
    const path = paths.get(sheet)!;
    files[path] = strToU8(replaceCell(strFromU8(files[path]), cell, null, true));
  }
  for (const [sheetName, entries] of Object.entries(cells)) {
    if (!sheetName || !paths.has(sheetName)) throw new Error(`Missing official sheet: ${sheetName}`);
    let sheetXml = strFromU8(files[paths.get(sheetName)!]);
    for (const [reference, value] of Object.entries(entries ?? {})) {
      if (!/^[A-Z]{1,3}[1-9][0-9]*$/.test(reference)) throw new Error(`Invalid cell reference: ${reference}`);
      sheetXml = replaceCell(sheetXml, reference, value, false);
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
