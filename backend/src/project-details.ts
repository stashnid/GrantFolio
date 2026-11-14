import { z } from "zod";

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

export function readiness(row: {
  revision: number;
  details: z.infer<typeof detailsSchema>;
  items: unknown[];
}) {
  const labels = {
    projectDescription: "Опис проєкту",
    customers: "Клієнти",
    salesChannels: "Канали продажу",
    implementationPlan: "План реалізації",
    expectedResults: "Очікувані результати",
  } as const;
  const checks = (Object.keys(labels) as (keyof typeof labels)[]).map((id) => ({
    id,
    label: labels[id],
    status: row.details[id].trim()
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
        status: row.items.length ? "complete" : "missing",
      },
    ],
    disclaimer:
      "Це загальний перелік для підготовки, а не перевірка відповідності умовам гранту чи гарантія схвалення.",
  };
}
