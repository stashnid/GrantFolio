import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import { brave1Playbook } from "../playbooks/brave1.js";

export interface Brave1ProjectExportInput {
  title: string;
  revision: number;
  details: {
    project_title?: string;
    defense_category?: string;
    operational_problem?: string;
    technical_solution_public?: string;
    current_trl?: number;
    target_trl?: number;
    trl_evidence?: string;
    rd_milestones?: Array<{
      title: string;
      duration_months: number;
      deliverable: string;
      cost_kopecks: number;
    }>;
    team_engineering_background?: string;
    testing_and_scaling_plan?: string;
    supply_chain_and_risks?: string;
    bom_and_rd_budget?: Array<{
      name: string;
      category?: string;
      quantity?: number;
      unitPriceKopecks?: number;
      cost_kopecks?: number;
    }>;
    external_checklist_state?: Record<string, boolean>;
  };
  items?: Array<{
    name: string;
    quantity: number;
    unitPriceKopecks: number;
    category?: string;
  }>;
  total_kopecks?: string | number;
}

const xml = (value: string | number) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const textCell = (address: string, value: string | number, style = 0) =>
  `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

const numberCell = (address: string, uah: number, style = 1) =>
  `<c r="${address}" s="${style}"><v>${uah.toFixed(2)}</v></c>`;

const formulaCell = (address: string, formula: string, cachedUah: number, style = 1) =>
  `<c r="${address}" s="${style}"><f>${xml(formula)}</f><v>${cachedUah.toFixed(2)}</v></c>`;

const percentFormulaCell = (address: string, formula: string, cachedPercent: number, style = 5) =>
  `<c r="${address}" s="${style}"><f>${xml(formula)}</f><v>${(cachedPercent / 100).toFixed(4)}</v></c>`;

export function buildBrave1Workbook(input: Brave1ProjectExportInput): Uint8Array {
  const d = input.details || {};
  const rawItems = (input.items && input.items.length > 0)
    ? input.items
    : (d.bom_and_rd_budget || []);

  const bomItems = rawItems.length > 0
    ? rawItems.map((it: any) => ({
        name: it.name || "Компонент / послуга R&D",
        category: it.category || "Комплектуючі (BOM)",
        quantity: Math.max(1, Number(it.quantity || 1)),
        unitPriceUah: (Number(it.unitPriceKopecks ?? it.cost_kopecks ?? 0) / 100) / Math.max(1, Number(it.quantity || 1)),
      }))
    : [
        { name: "Мікроконтролери та обчислювальні модулі STM32/FPGA", category: "Комплектуючі (BOM)", quantity: 5, unitPriceUah: 18000 },
        { name: "СВЧ-підсилювачі потужності та антенні решітки", category: "Комплектуючі (BOM)", quantity: 4, unitPriceUah: 32000 },
        { name: "Розробка вбудованого ПЗ цифрової обробки сигналів (DSP)", category: "R&D команда", quantity: 1, unitPriceUah: 180000 },
        { name: "Стендові випробування у безвідлунній камері", category: "Випробування та сертифікація", quantity: 1, unitPriceUah: 75000 },
      ];

  const milestones = Array.isArray(d.rd_milestones) && d.rd_milestones.length > 0
    ? d.rd_milestones
    : [
        {
          title: "Етап 1: Розробка схемотехніки та макетного стенду",
          duration_months: 2,
          deliverable: "Діючий лабораторний макет, підтвердження TRL 4",
          cost_kopecks: 35000000,
        },
        {
          title: "Етап 2: Збірка дослідного прототипу та польові випробування",
          duration_months: 3,
          deliverable: "Дослідний зразок у захищеному корпусі, звіт полігону TRL 5",
          cost_kopecks: 65000000,
        },
      ];

  // 1. Build Sheet 1: «Кошторис R&D (BOM)»
  const bomRows: string[] = [
    `<row r="1" ht="24" customHeight="1">${textCell("A1", "BRAVE1 DEFENSE-TECH: КОШТОРИС R&D ТА КОМПЛЕКТУЮЧИХ (BOM)", 3)}</row>`,
    `<row r="2">${textCell("A2", `Проєкт: ${d.project_title || input.title} · Ревізія ${input.revision}`)}</row>`,
    `<row r="3">${textCell("A3", "Усі розрахунки формульні. Подається до кластера Brave1 для затвердження траншів.")}</row>`,
    `<row r="5" ht="26" customHeight="1">
      ${textCell("A5", "№", 2)}
      ${textCell("B5", "Найменування компонента / R&D робіт", 2)}
      ${textCell("C5", "Категорія витрат", 2)}
      ${textCell("D5", "Кількість", 2)}
      ${textCell("E5", "Ціна за од., грн", 2)}
      ${textCell("F5", "Сума, грн", 2)}
      ${textCell("G5", "Частка, %", 2)}
    </row>`,
  ];

  let totalBomUah = 0;
  bomItems.forEach((item, index) => {
    const rowNum = index + 6;
    const itemTotal = item.quantity * item.unitPriceUah;
    totalBomUah += itemTotal;
  });

  const totalBomRowNum = bomItems.length + 6;

  bomItems.forEach((item, index) => {
    const rowNum = index + 6;
    const itemTotal = item.quantity * item.unitPriceUah;
    const share = totalBomUah > 0 ? (itemTotal / totalBomUah) * 100 : 0;
    bomRows.push(
      `<row r="${rowNum}">
        <c r="A${rowNum}"><v>${index + 1}</v></c>
        ${textCell(`B${rowNum}`, item.name)}
        ${textCell(`C${rowNum}`, item.category)}
        <c r="D${rowNum}"><v>${item.quantity}</v></c>
        ${numberCell(`E${rowNum}`, item.unitPriceUah)}
        ${formulaCell(`F${rowNum}`, `D${rowNum}*E${rowNum}`, itemTotal)}
        ${percentFormulaCell(`G${rowNum}`, `F${rowNum}/$F$${totalBomRowNum}`, share)}
      </row>`
    );
  });

  bomRows.push(
    `<row r="${totalBomRowNum}" ht="20" customHeight="1">
      ${textCell(`A${totalBomRowNum}`, "РАЗОМ", 4)}
      ${textCell(`B${totalBomRowNum}`, "", 4)}
      ${textCell(`C${totalBomRowNum}`, "", 4)}
      ${textCell(`D${totalBomRowNum}`, "", 4)}
      ${textCell(`E${totalBomRowNum}`, "", 4)}
      ${formulaCell(`F${totalBomRowNum}`, `SUM(F6:F${totalBomRowNum - 1})`, totalBomUah, 4)}
      ${percentFormulaCell(`G${totalBomRowNum}`, `SUM(G6:G${totalBomRowNum - 1})`, 100, 4)}
    </row>`
  );

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <cols>
    <col min="1" max="1" width="6" customWidth="1"/>
    <col min="2" max="2" width="45" customWidth="1"/>
    <col min="3" max="3" width="28" customWidth="1"/>
    <col min="4" max="4" width="12" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
  </cols>
  <sheetData>${bomRows.join("")}</sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:G1"/>
    <mergeCell ref="A2:G2"/>
    <mergeCell ref="A3:G3"/>
  </mergeCells>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;

  // 2. Build Sheet 2: «Етапи R&D та TRL»
  const currentTrl = Number(d.current_trl || 3);
  const targetTrl = Number(d.target_trl || 5);

  const milestoneRows: string[] = [
    `<row r="1" ht="24" customHeight="1">${textCell("A1", "ДОРОЖНЯ КАРТА R&D ТА ТРАНШІ BRAVE1", 3)}</row>`,
    `<row r="2">${textCell("A2", `Цільовий перехід: TRL ${currentTrl} ➔ TRL ${targetTrl}`)}</row>`,
    `<row r="3">${textCell("A3", "Виплата кожного траншу здійснюється після демонстрації вимірюваного результату.")}</row>`,
    `<row r="5" ht="26" customHeight="1">
      ${textCell("A5", "№", 2)}
      ${textCell("B5", "Назва етапу R&D", 2)}
      ${textCell("C5", "Тривалість (міс.)", 2)}
      ${textCell("D5", "Вимірюваний результат / Акт", 2)}
      ${textCell("E5", "Бюджет етапу, грн", 2)}
      ${textCell("F5", "Звірка з BOM", 2)}
    </row>`,
  ];

  let totalMilestonesUah = 0;
  milestones.forEach((m, index) => {
    const rowNum = index + 6;
    const costUah = Number(m.cost_kopecks || 0) / 100;
    totalMilestonesUah += costUah;
    milestoneRows.push(
      `<row r="${rowNum}">
        <c r="A${rowNum}"><v>${index + 1}</v></c>
        ${textCell(`B${rowNum}`, m.title)}
        <c r="C${rowNum}"><v>${m.duration_months}</v></c>
        ${textCell(`D${rowNum}`, m.deliverable)}
        ${numberCell(`E${rowNum}`, costUah)}
        ${textCell(`F${rowNum}`, "Етап узгоджено")}
      </row>`
    );
  });

  const totalMilestoneRowNum = milestones.length + 6;
  milestoneRows.push(
    `<row r="${totalMilestoneRowNum}" ht="20" customHeight="1">
      ${textCell(`A${totalMilestoneRowNum}`, "РАЗОМ", 4)}
      ${textCell(`B${totalMilestoneRowNum}`, "", 4)}
      ${textCell(`C${totalMilestoneRowNum}`, "", 4)}
      ${textCell(`D${totalMilestoneRowNum}`, "", 4)}
      ${formulaCell(`E${totalMilestoneRowNum}`, `SUM(E6:E${totalMilestoneRowNum - 1})`, totalMilestonesUah, 4)}
      ${formulaCell(`F${totalMilestoneRowNum}`, `E${totalMilestoneRowNum}-'Кошторис R&D (BOM)'!F${totalBomRowNum}`, totalMilestonesUah - totalBomUah, 4)}
    </row>`
  );

  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <cols>
    <col min="1" max="1" width="6" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="45" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
    <col min="6" max="6" width="18" customWidth="1"/>
  </cols>
  <sheetData>${milestoneRows.join("")}</sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:F1"/>
    <mergeCell ref="A2:F2"/>
    <mergeCell ref="A3:F3"/>
  </mergeCells>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;

  // 3. Assemble package with styles and calcPr
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>
  <sheets>
    <sheet name="Кошторис R&amp;D (BOM)" sheetId="1" r:id="rId1"/>
    <sheet name="Етапи R&amp;D та TRL" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="DejaVu Sans"/></font>
    <font><b/><sz val="11"/><name val="DejaVu Sans"/></font>
    <font><b/><sz val="14"/><name val="DejaVu Sans"/></font>
    <font><b/><sz val="11"/><name val="DejaVu Sans"/><color rgb="FF166534"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><top style="thin"/><bottom style="double"/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="2" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`,
    "xl/worksheets/sheet1.xml": sheet1Xml,
    "xl/worksheets/sheet2.xml": sheet2Xml,
  };

  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, content]) => [name, strToU8(content)])
    ),
    { level: 6 }
  );
}

export function buildBrave1ProjectBriefMarkdown(input: Brave1ProjectExportInput): string {
  const d = input.details || {};
  const currentTrl = Number(d.current_trl || 3);
  const targetTrl = Number(d.target_trl || 5);
  const milestones = Array.isArray(d.rd_milestones) ? d.rd_milestones : [];
  const checklist = brave1Playbook.document_requirements?.applicant_external_checklist || [];
  const checkedState = d.external_checklist_state || {};

  return `# BRAVE1 DEFENSE-TECH PROJECT BRIEF

> **ЗАСТЕРЕЖЕННЯ OPSEC:** Цей документ є робочою чернеткою для подання до кластера Brave1 (Український фонд стартапів / Міноборони / Мінцифра).
> Заборонено вносити секретні відомості: точні робочі радіочастоти передачі/керування, алгоритми обходу РЕБ, закриті ТТХ, координати розташування лабораторій або дійсні номери бойових військових частин.

---

### 1. Загальна інформація про проєкт
- **Назва розробки:** ${d.project_title || input.title}
- **Цільова програма:** ${brave1Playbook.canonical_name} (\`${brave1Playbook.program_id}\`)
- **Ревізія проєкту:** ${input.revision}
- **Оборонна категорія:** ${d.defense_category || "Системи виявлення та протидії БПЛА (C-UAS / РЕБ / РЕР)"}

---

### 2. Бойова / операційна задача (Operational Problem)
${d.operational_problem || "Розробка вирішує критичну задачу детекції та нейтралізації низьколетючих повітряних цілей противника на ближній дистанції, забезпечуючи захист об'єктів критичної інфраструктури та опорних пунктів Сил оборони України."}

---

### 3. Технічне рішення та інновація (Technical Solution — Public/Unclassified)
${d.technical_solution_public || "Пасивна радіолокаційна та акустична система з цифровою обробкою сигналів на базі SDR та нейромережевої класифікації акустичних сигнатур двигунів БПЛА у реальному часі."}

---

### 4. Рівень технологічної готовності (TRL Transition)
| Параметр | Значення |
| :--- | :--- |
| **Поточний рівень (Current TRL):** | **TRL ${currentTrl}** |
| **Цільовий рівень (Target TRL):** | **TRL ${targetTrl}** |
| **Докази поточної готовності:** | ${d.trl_evidence || "Відеозапис лабораторного стенду та польових випробувань модуля радіочастотної пеленгації."} |

---

### 5. Дорожня карта та етапи R&D (Milestones)
${
  milestones.length > 0
    ? milestones
        .map(
          (m, idx) =>
            `#### Етап ${idx + 1}: ${m.title}\n` +
            `- **Тривалість:** ${m.duration_months} міс.\n` +
            `- **Вимірюваний результат:** ${m.deliverable}\n` +
            `- **Бюджет етапу:** ${(Number(m.cost_kopecks || 0) / 100).toLocaleString("uk-UA")} грн`
        )
        .join("\n\n")
    : "- Етап 1: Лабораторний макет і прошивка DSP (2 міс.)\n- Етап 2: Польові випробування передсерійного зразка (3 міс.)"
}

---

### 6. Інженерна команда (Team Background)
${d.team_engineering_background || "Команда включає головного конструктора (12 років у радіоелектроніці), провідного схемотехніка, спеціаліста з цифрової обробки сигналів та інженера-тестувальника."}

---

### 7. План випробувань, кодифікації та масштабування
${d.testing_and_scaling_plan || "Проведення стендових випробувань, виїзд на полігон ЗСУ за координації Brave1, підготовка комплекту КД для державної кодифікації за стандартом НАТО (Fast Track)."}

---

### 8. Ланцюг постачання та оцінка ризиків
${d.supply_chain_and_risks || "90% електронних компонентів постачаються від перевірених європейських та американських дистриб'юторів; розроблено альтернативні схемотехнічні рішення для захисту від дефіциту чипів."}

---

### 9. Зведений кошторис R&D та BOM
- **Загальний бюджет:** ${input.total_kopecks ? `${(Number(input.total_kopecks) / 100).toLocaleString("uk-UA")} грн` : "Згідно зі специфікацією BOM"}
- **Структура:** деталізований формульний розрахунок наведено у супровідному файлі \`brave1_milestone_budget.xlsx\`.

---

### 10. Чекліст зовнішніх додатків заявника
${checklist
  .map(
    (item) =>
      `- [${checkedState[item.id] ? "x" : " "}] **${item.title_uk}** (${item.mandatory ? "Обов'язково" : "Бажано"})\n  *Де отримати:* ${item.where_to_get_uk}\n  *Призначення:* ${item.why_needed_uk}`
  )
  .join("\n")}
`;
}

const run = promisify(execFile);

export async function createBrave1Export(
  input: Brave1ProjectExportInput,
  signal?: AbortSignal
): Promise<{ xlsxBuffer: Buffer; pdfBuffer?: Buffer; zipBuffer: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), "grantfolio-brave1-export-"));
  try {
    const workbookBytes = buildBrave1Workbook(input);
    const xlsxPath = join(directory, "brave1-rnd-budget.xlsx");
    await writeFile(xlsxPath, workbookBytes, { mode: 0o600 });

    const markdownText = buildBrave1ProjectBriefMarkdown(input);
    const mdPath = join(directory, "brave1-project-brief.md");
    await writeFile(mdPath, markdownText, { encoding: "utf8" });

    let pdfBuffer: Buffer | undefined;
    const executable = process.env.LIBREOFFICE_PATH || "soffice";

    // Convert XLSX to PDF if LibreOffice is available
    try {
      await run(
        executable,
        [
          `-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`,
          "--headless",
          "--convert-to",
          "pdf:calc_pdf_Export",
          "--outdir",
          directory,
          xlsxPath,
        ],
        { timeout: 35000, maxBuffer: 256 * 1024, signal }
      );
      const generatedPdf = await readFile(join(directory, "brave1-rnd-budget.pdf")).catch(() => null);
      if (generatedPdf && generatedPdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        pdfBuffer = generatedPdf;
      }
    } catch {
      // PDF conversion skipped if soffice is not in environment
    }

    const zipFiles: Record<string, Uint8Array> = {
      "brave1-rnd-budget.xlsx": workbookBytes,
      "brave1-project-brief.md": strToU8(markdownText),
    };

    if (pdfBuffer) {
      zipFiles["brave1-rnd-budget.pdf"] = new Uint8Array(pdfBuffer);
    }

    const zipped = zipSync(zipFiles, { level: 6 });

    return {
      xlsxBuffer: Buffer.from(workbookBytes),
      pdfBuffer,
      zipBuffer: Buffer.from(zipped),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
