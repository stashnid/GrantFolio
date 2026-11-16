import type { Item } from "./budget.js";
import { detailsSchema } from "./project-details.js";
import { getProgramDetails } from "./grant-sources.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import type { z } from "zod";

type Draft = {
  title: string;
  program_id?: string | null;
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
  const program = row.program_id && GRANT_CATALOG.some(p => p.id === row.program_id) ? getProgramDetails(row.program_id) : null;
  const fields = [
    ["Опис проєкту", row.details.projectDescription],
    ["Клієнти", row.details.customers],
    ["Канали продажу", row.details.salesChannels],
    ["План реалізації", row.details.implementationPlan],
    ["Очікувані результати", row.details.expectedResults],
  ];
  const budget = row.items.length
    ? row.items
        .map(
          (item, i) =>
            `${i + 1}. ${item.name}: ${item.quantity} × ${money(item.unitPriceKopecks)} = ${money(item.quantity * item.unitPriceKopecks)}`,
        )
        .join("\n")
    : "Не вказано";
  return [
    "Робоча чернетка. Не офіційна заявка.",
    `Назва проєкту: ${row.title}`,
    program ? `Цільова програма: ${program.title} (${program.provider})` : "Фінансування: підберемо далі",
    `Версія: ${row.revision}`,
    ...fields.map(
      ([label, value]) => `${label}:\n${value.trim() || "Не вказано"}`,
    ),
    `Бюджет:\n${budget}\nЗагалом: ${money(row.total_kopecks)}`,
    ...(program ? [
      "Документи та наступні кроки:\n" + [...program.documents, ...program.steps].map((item) => `- ${item}`).join("\n"),
      `Офіційні джерела програми:\n${(GRANT_CATALOG.find((p) => p.id === program.id)?.details.sources ?? []).map((source) => `- ${source.title}: ${source.url}`).join("\n") || program.officialUrl}`,
      "Звірте матеріали з актуальною офіційною формою; підпис і подання виконує заявник.",
    ] : ["Фінансування підберемо далі; вимоги визначатимуться обраною програмою."]),
    "",
  ].join("\n\n");
}
