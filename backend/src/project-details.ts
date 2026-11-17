import { z } from "zod";
import { itemSchema, totalKopecks } from "./budget.js";

const field = z.string().trim().max(3000);
export const detailsSchema = z
  .object({
    projectDescription: field,
    customers: field,
    salesChannels: field,
    implementationPlan: field,
    expectedResults: field,
  })
  .strict();
export const detailsCommandSchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    idempotencyKey: z.string().uuid(),
    details: detailsSchema,
  })
  .strict();

export function assessBudget(items: unknown, storedTotal: unknown) {
  const parsed = z.array(itemSchema).max(100).safeParse(items);
  const calculated = parsed.success ? totalKopecks(parsed.data) : null;
  return {
    validItems: parsed.success,
    totalMatches: calculated !== null && storedTotal !== undefined && String(calculated) === String(storedTotal),
  };
}

export function readiness(row: {
  revision: number;
  program_id?: string | null;
  details: z.infer<typeof detailsSchema>;
  items: unknown[];
  total_kopecks?: string | number;
}) {
  const labels = {
    projectDescription: "Опис проєкту",
    customers: "Клієнти",
    salesChannels: "Канали продажу",
    implementationPlan: "План реалізації",
    expectedResults: "Очікувані результати",
  } as const;
  // This detects obvious gaps only; it does not assess truth or semantic quality.
  const normalize = (value: unknown) => typeof value === "string"
    ? value.trim().toLocaleLowerCase("uk").replace(/[\s\p{P}]+/gu, " ").trim() : "";
  const values = (Object.keys(labels) as (keyof typeof labels)[]).map((id) => normalize(row.details?.[id]));
  const useful = (value: unknown) => {
    const normalized = normalize(value);
    return normalized.length > 0 && values.filter((entry) => entry === normalized).length === 1 &&
      !/(?:\b(?:todo|tbd|test|placeholder)\b|заповнити|додати пізніше|не знаю|\.{3}|…|\[.*?\])/iu.test(String(value)) &&
      !/^(?:наша |наш |мій |моя )?(?:справа|бізнес|проєкт|проект) (?:буде|стане) (?:дуже )?(?:успішн(?:им|ою)|прибутков(?:им|ою)|найкращ(?:им|ою))$/u.test(normalized);
  };
  const parsedItems = z.array(itemSchema).min(1).max(100).safeParse(row.items);
  const assessment = assessBudget(row.items, row.total_kopecks);
  const budgetComplete = parsedItems.success && totalKopecks(parsedItems.data) !== null && (row.total_kopecks === undefined || assessment.totalMatches) &&
    parsedItems.data.every((item) => item.unitPriceKopecks > 0 && !/(?:\b(?:todo|tbd|test|placeholder)\b|заповнити|\.{3}|…|\[.*?\])/iu.test(item.name));
  const checks = (Object.keys(labels) as (keyof typeof labels)[]).map((id) => ({
    id,
    label: labels[id],
    status: useful(row.details?.[id])
      ? ("complete" as const)
      : ("missing" as const),
  }));
  return {
    revision: row.revision,
    checks: [
      ...checks,
      {
        id: "budget",
        label: "Бюджет",
        status: budgetComplete ? ("complete" as const) : ("missing" as const),
      },
    ],
    disclaimer:
      "Це лише базова перевірка змісту: текст не має бути порожнім, повторювати інший блок або містити очевидні заготовки; бюджет має містити коректні позиції з додатними цінами. Перевірте факти та узгодженість самостійно. Список не перевіряє відповідність умовам гранту і не гарантує схвалення.",
  };
}
