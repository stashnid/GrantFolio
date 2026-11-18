import { getGrantApplication, grantApplicationAnswersSchema } from "./grant-application.js";
import type { Item } from "./budget.js";
import { assessBudget, detailsSchema, readiness } from "./project-details.js";
import { getProgramDetails } from "./grant-sources.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import type { z } from "zod";

type Draft = {
  title: string;
  program_id?: string | null;
  revision: number;
  details: z.infer<typeof detailsSchema>;
  items: Item[];
  application_answers?: unknown;
  application_revision?: number | null;
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
  const answers = grantApplicationAnswersSchema.safeParse(row.application_answers ?? {});
  const application = answers.success ? getGrantApplication(row.program_id, answers.data) : null;
  const applicationSections = application ? [
    `Анкета програми · версія ${row.application_revision ?? 0} · правила ${application.version}`,
    ...application.questions.filter(question => question.kind !== "confirmation").map(question => {
      const { label, value, kind, options } = question;
      const printed = typeof value === "number" && kind === "money" ? money(value)
        : options?.find(option => option.value === value)?.label ?? value ?? "Не вказано";
      return `${label}:\n${printed}`;
    }),
  ] : [];
  const checks = readiness(row);
  const missing = checks.checks.filter((check) => check.status === "missing");
  const { validItems, totalMatches } = assessBudget(row.items, row.total_kopecks);
  const budget = validItems && row.items.length
    ? row.items
        .map(
          (item, i) =>
            `${i + 1}. ${item.name}: ${item.quantity} × ${money(item.unitPriceKopecks)} = ${money(item.quantity * item.unitPriceKopecks)}`,
        )
        .join("\n")
    : validItems ? "Не вказано" : "Позиції бюджету пошкоджені; перевірте та збережіть кошторис повторно.";
  return [
    "Робоча чернетка. Не офіційна заявка.",
    `Назва проєкту: ${row.title}`,
    program ? `Цільова програма: ${program.title} (${program.provider})` : "Фінансування: підберемо далі",
    `Версія: ${row.revision}`,
    "Джерело відомостей про проєкт і бюджет: збережені дані заявника. Перевірте їх точність і узгодженість перед використанням.",
    missing.length ? `Потребує доопрацювання: ${missing.map((check) => check.label).join(", ")}.` : "Базову перевірку заповнення пройдено. Зміст, факти та узгодженість ще потрібно перевірити.",
    ...fields.map(
      ([label, value]) => `${label}:\n${typeof value === "string" && value.trim() || "Не вказано"}`,
    ),
    `Бюджет:\n${budget}\n${totalMatches ? `Загалом: ${money(row.total_kopecks)}` : "Підсумок потребує перевірки: збережена сума не збігається з позиціями або бюджет пошкоджений."}`,
    ...applicationSections,
    ...(program ? [
      "Документи та наступні кроки:\n" + [...program.documents, ...program.steps].map((item) => `- ${item}`).join("\n"),
      `Офіційні джерела програми:\n${(GRANT_CATALOG.find((p) => p.id === program.id)?.details.sources ?? []).map((source) => `- ${source.title}: ${source.url} (перевірено ${source.checkedAt})`).join("\n") || program.officialUrl}`,
      "Звірте матеріали з актуальною офіційною формою; підпис і подання виконує заявник.",
    ] : ["Фінансування підберемо далі; вимоги визначатимуться обраною програмою."]),
    checks.disclaimer,
    "",
  ].join("\n\n");
}
