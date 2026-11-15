import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const mdPath = resolve("docs/user-testing-report.md");
const outPdf = resolve("docs/user-testing-report.pdf");
const tempHtml = resolve(".local/report-preview.html");

mkdirSync(".local", { recursive: true });

const markdown = readFileSync(mdPath, "utf8");

// Simple markdown to HTML parser for standard report elements
function mdToHtml(md) {
  const lines = md.split("\n");
  const html = [];
  let inTable = false;
  let inList = false;
  let inQuote = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Close list if line is not list item
    if (inList && !line.trim().startsWith("- ") && !line.trim().match(/^\d+\.\s/)) {
      html.push("</ul>");
      inList = false;
    }
    // Close quote
    if (inQuote && !line.trim().startsWith(">")) {
      html.push("</blockquote>");
      inQuote = false;
    }
    // Close table if not table row
    if (inTable && !line.trim().startsWith("|")) {
      html.push("</tbody></table>");
      inTable = false;
    }

    if (!line.trim()) {
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      html.push("<hr />");
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3>${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("#### ")) {
      html.push(`<h4>${formatInline(line.slice(5))}</h4>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      if (!inQuote) {
        html.push("<blockquote>");
        inQuote = true;
      }
      html.push(`<p>${formatInline(line.slice(2))}</p>`);
      continue;
    }

    // Table
    if (line.trim().startsWith("|")) {
      const parts = line.split("|").map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      // Skip separator
      if (parts.every(p => /^:?-+:?$/.test(p))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        html.push("<table><thead><tr>");
        for (const p of parts) {
          html.push(`<th>${formatInline(p)}</th>`);
        }
        html.push("</tr></thead><tbody>");
      } else {
        html.push("<tr>");
        for (const p of parts) {
          html.push(`<td>${formatInline(p)}</td>`);
        }
        html.push("</tr>");
      }
      continue;
    }

    // List item
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(line.trim().slice(2))}</li>`);
      continue;
    }

    // Numbered list
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li><strong>${numMatch[1]}.</strong> ${formatInline(numMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    html.push(`<p>${formatInline(line)}</p>`);
  }

  if (inTable) html.push("</tbody></table>");
  if (inList) html.push("</ul>");
  if (inQuote) html.push("</blockquote>");

  return html.join("\n");
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

const styledHtml = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>Звіт про користувацьке тестування GrantFolio</title>
<style>
  @page {
    size: A4;
    margin: 18mm 16mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #212529;
    line-height: 1.55;
    font-size: 10.5pt;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 20pt;
    color: #1b3d2b;
    border-bottom: 2px solid #2d5a3f;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 12pt;
  }
  h2 {
    font-size: 14pt;
    color: #234d35;
    border-bottom: 1px solid #d4ded7;
    padding-bottom: 4px;
    margin-top: 18pt;
    margin-bottom: 8pt;
    break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    color: #2b543b;
    margin-top: 14pt;
    margin-bottom: 6pt;
    break-after: avoid;
  }
  p {
    margin: 5pt 0;
  }
  blockquote {
    margin: 8pt 0;
    padding: 8pt 12pt;
    background: #f4f7f4;
    border-left: 4px solid #3c7a54;
    color: #2f4035;
    font-style: italic;
    border-radius: 0 4px 4px 0;
  }
  blockquote p {
    margin: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 9.5pt;
  }
  th, td {
    border: 1px solid #c8d3cc;
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #eaf1ec;
    color: #1e3d2b;
    font-weight: 600;
  }
  tr:nth-child(even) td {
    background: #fafcfa;
  }
  ul {
    margin: 6pt 0;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 3pt;
  }
  code {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 9pt;
    background: #edf2ee;
    padding: 1pt 3pt;
    border-radius: 3px;
    color: #204b32;
  }
  hr {
    border: 0;
    height: 1px;
    background: #d4ded7;
    margin: 14pt 0;
  }
  strong {
    color: #183324;
  }
  a {
    color: #2b5e38;
    text-decoration: underline;
  }
</style>
</head>
<body>
${mdToHtml(markdown)}
</body>
</html>`;

writeFileSync(tempHtml, styledHtml, "utf8");
console.log(`Rendered HTML: ${tempHtml}`);

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const cmd = `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outPdf}" "file://${tempHtml}"`;

try {
  execSync(cmd, { stdio: "inherit" });
  console.log(`Successfully generated PDF: ${outPdf}`);
} catch (e) {
  console.error("Failed to run Chrome print-to-pdf:", e.message);
  process.exit(1);
}
