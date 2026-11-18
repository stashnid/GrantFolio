export type GrantInvestmentLine = { name: string; amountKopecks: number; rationale: string };

const none = /^(?:немає|не планується|відсутні)(?:\s*\(0\s*грн\))?\.?$/iu;

function uahToKopecks(value: string) {
  const normalized = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function parseGrantInvestmentLines(value: string | undefined, maxLines: number) {
  if (!value?.trim()) return { lines: null, error: "Перелічіть витрати або явно вкажіть «Не планується (0 грн)»." };
  if (none.test(value.trim())) return { lines: [] as GrantInvestmentLine[], error: null };
  const rawLines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!rawLines.length || rawLines.length > maxLines) return { lines: null, error: `Потрібно від 1 до ${maxLines} рядків.` };
  const lines: GrantInvestmentLine[] = [];
  for (const [index, line] of rawLines.entries()) {
    const [name, amountText, rationale, ...extra] = line.split("|").map(part => part.trim());
    const amountKopecks = uahToKopecks(amountText ?? "");
    if (extra.length || !name || name.length > 160 || amountKopecks === null || !rationale || rationale.length > 300) {
      return { lines: null, error: `Рядок ${index + 1}: використайте формат «назва | сума грн | обґрунтування», сума має бути більшою за нуль.` };
    }
    lines.push({ name, amountKopecks, rationale });
  }
  return { lines, error: null };
}

export const totalInvestmentLines = (lines: readonly GrantInvestmentLine[]) =>
  lines.reduce((total, line) => total + line.amountKopecks, 0);
