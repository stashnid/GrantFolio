#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

export interface XlsxInspectionResult {
  filePath: string;
  sheets: string[];
  formulaCells: { sheet: string; cell: string; formula: string }[];
  inputCells: { sheet: string; cell: string; sampleValue: string }[];
  headers: { sheet: string; text: string }[];
}

export function inspectXlsxTemplate(filePath: string): XlsxInspectionResult {
  const buffer = fs.readFileSync(filePath);
  const unzipped = unzipSync(new Uint8Array(buffer));

  // 1. Shared Strings Table
  const sharedStrings: string[] = [];
  const sstFile = unzipped["xl/sharedStrings.xml"];
  if (sstFile) {
    const sstXml = new TextDecoder().decode(sstFile);
    const siRegex = /<si>(.*?)<\/si>/gs;
    let match: RegExpExecArray | null;
    while ((match = siRegex.exec(sstXml)) !== null) {
      const tMatch = match[1].match(/<t(?:\s+[^>]*)?>(.*?)<\/t>/gs);
      if (tMatch) {
        const text = tMatch.map((t) => t.replace(/<[^>]+>/g, "")).join("");
        sharedStrings.push(text);
      } else {
        sharedStrings.push("");
      }
    }
  }

  // 2. Workbook sheet names
  const sheets: string[] = [];
  const wbFile = unzipped["xl/workbook.xml"];
  if (wbFile) {
    const wbXml = new TextDecoder().decode(wbFile);
    const sheetRegex = /<sheet\s+[^>]*name="([^"]+)"/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sheetRegex.exec(wbXml)) !== null) {
      sheets.push(sMatch[1]);
    }
  }

  const formulaCells: { sheet: string; cell: string; formula: string }[] = [];
  const inputCells: { sheet: string; cell: string; sampleValue: string }[] = [];
  const headers: { sheet: string; text: string }[] = [];

  // 3. Worksheets inspection
  let sheetIdx = 1;
  while (true) {
    const sheetPath = `xl/worksheets/sheet${sheetIdx}.xml`;
    const sFile = unzipped[sheetPath];
    if (!sFile) break;

    const sheetName = sheets[sheetIdx - 1] || `Sheet${sheetIdx}`;
    const sheetXml = new TextDecoder().decode(sFile);

    const cellRegex = /<c\s+r="([A-Z0-9]+)"(?:\s+t="([a-z]+)")?[^>]*>(.*?)<\/c>/gs;
    let cMatch: RegExpExecArray | null;

    while ((cMatch = cellRegex.exec(sheetXml)) !== null) {
      const cellRef = cMatch[1];
      const cellType = cMatch[2] || "";
      const cellBody = cMatch[3];

      const fMatch = cellBody.match(/<f(?:\s+[^>]*)?>(.*?)<\/f>/);
      const vMatch = cellBody.match(/<v(?:\s+[^>]*)?>(.*?)<\/v>/);

      if (fMatch) {
        formulaCells.push({
          sheet: sheetName,
          cell: cellRef,
          formula: fMatch[1],
        });
      } else if (vMatch) {
        let val = vMatch[1];
        if (cellType === "s") {
          const sIndex = parseInt(val, 10);
          val = sharedStrings[sIndex] || val;
        }

        // Row 1-3 often represent headers
        const rowNum = parseInt(cellRef.replace(/^[A-Z]+/, ""), 10);
        if (rowNum <= 3 && val.length > 2) {
          headers.push({ sheet: sheetName, text: `${cellRef}: ${val}` });
        } else {
          inputCells.push({
            sheet: sheetName,
            cell: cellRef,
            sampleValue: val.slice(0, 40),
          });
        }
      }
    }

    sheetIdx++;
  }

  return {
    filePath,
    sheets,
    formulaCells,
    inputCells,
    headers,
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith("inspect-xlsx-template.ts")) {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error("Usage: npm run inspect:xlsx -- <path-to-file.xlsx>");
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), targetPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  try {
    const res = inspectXlsxTemplate(resolved);
    console.log(`\n=== Excel Template Inspection: ${path.basename(resolved)} ===`);
    console.log(`Sheets (${res.sheets.length}): ${res.sheets.join(", ")}`);
    console.log(`\nProtected Formula Cells (<f>) found: ${res.formulaCells.length}`);
    for (const fc of res.formulaCells.slice(0, 15)) {
      console.log(`  [${fc.sheet}] ${fc.cell} = ${fc.formula}`);
    }
    if (res.formulaCells.length > 15) {
      console.log(`  ... and ${res.formulaCells.length - 15} more formula cells.`);
    }

    console.log(`\nInput Data Cells (<v>) found: ${res.inputCells.length}`);
    for (const ic of res.inputCells.slice(0, 10)) {
      console.log(`  [${ic.sheet}] ${ic.cell} = "${ic.sampleValue}"`);
    }

    console.log(`\nTemplate Headers:`);
    for (const h of res.headers.slice(0, 10)) {
      console.log(`  [${h.sheet}] ${h.text}`);
    }
  } catch (err) {
    console.error("Inspection failed:", err);
    process.exit(1);
  }
}
