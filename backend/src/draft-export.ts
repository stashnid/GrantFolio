import type { Item } from "./budget.js";
import { detailsSchema } from "./project-details.js";
import { getProgramDetails } from "./grant-sources.js";
import type { z } from "zod";

type Draft = {
  title: string;
  program_id?: string;
  revision: number;
  details: z.infer<typeof detailsSchema>;
  items: Item[];
  total_kopecks: string;
};

function money(kopecks: number | string): string {
  const value = BigInt(kopecks);
  return `${value / 100n},${(value % 100n).toString().padStart(2, "0")} грн`;
}

export function draftExport(row: Draft): string {
  const program = getProgramDetails(row.program_id ?? "vlasna-sprava");
  const fields = [
    ["Опис проєкту", row.details.projectDescription],
    ["Клієнти", row.details.customers],
    ["Канали продажу", row.details.salesChannels],
    ["План реалізації", row.details.implementationPlan],
    ["Очікувані результати", row.details.expectedResults],
  ];
  const budget = row.items.length
    ? row.items.map((item, i) => `${i + 1}. ${item.name}: ${item.quantity} × ${money(item.unitPriceKopecks)} = ${money(item.quantity * item.unitPriceKopecks)}`).join("\n")
    : "Не вказано";
  return [
    "Робоча чернетка. Не офіційна заявка.",
    `Назва проєкту: ${row.title}`,
    `Цільова програма: ${program.title} (${program.provider})`,
    `Версія: ${row.revision}`,
    ...fields.map(([label, value]) => `${label}:\n${value.trim() || "Не вказано"}`),
    `Бюджет:\n${budget}\nЗагалом: ${money(row.total_kopecks)}`,
    "",
  ].join("\n\n");
}
