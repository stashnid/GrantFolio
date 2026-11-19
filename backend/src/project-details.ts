import { z } from "zod";
import { itemSchema, totalKopecks } from "./budget.js";
import { computeMissingRequiredFields } from "./playbooks/missingFields.js";

const field = z.string().trim().max(3000);

export const detailsSchema = z
  .object({
    projectDescription: field.optional().default(""),
    customers: field.optional().default(""),
    salesChannels: field.optional().default(""),
    implementationPlan: field.optional().default(""),
    expectedResults: field.optional().default(""),
    // Veteran Grant fields
    veteranStatus: z.string().trim().max(100).optional(),
    fundingTier: z.union([z.number().int().positive(), z.string().trim().max(100)]).optional(),
    spouseConsent: z.boolean().optional(),
    ownFundsKopecks: z.number().int().nonnegative().optional(),
    // Brave1 fields
    project_title: z.string().trim().max(500).optional(),
    defense_category: z.string().trim().max(200).optional(),
    operational_problem: z.string().trim().max(5000).optional(),
    technical_solution_public: z.string().trim().max(5000).optional(),
    current_trl: z.number().int().min(1).max(9).optional(),
    target_trl: z.number().int().min(1).max(9).optional(),
    trl_evidence: z.string().trim().max(5000).optional(),
    rd_milestones: z.array(z.record(z.string(), z.any())).optional(),
    team_engineering_background: z.string().trim().max(5000).optional(),
    testing_and_scaling_plan: z.string().trim().max(5000).optional(),
    supply_chain_and_risks: z.string().trim().max(5000).optional(),
    bom_and_rd_budget: z.array(z.record(z.string(), z.any())).optional(),
    // Interactive checklist persistence
    external_checklist_state: z.record(z.string(), z.boolean()).optional(),
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
  title?: string;
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

  const missingSummary = computeMissingRequiredFields(row.program_id, {
    title: row.title,
    program_id: row.program_id,
    details: row.details as any,
    items: row.items,
    total_kopecks: row.total_kopecks,
  });

  let checks: Array<{ id: string; label: string; status: "complete" | "missing" }>;

  if (row.program_id === "ua-brave1-core" || row.program_id === "brave1") {
    const missingKeys = new Set(missingSummary.missing_fields.map((f) => f.field_key));
    const brave1FieldLabels: Record<string, string> = {
      project_title: "Несекретна назва оборонної розробки",
      defense_category: "Оборонна категорія (ППО, РЕБ, БПЛА тощо)",
      operational_problem: "Бойова задача та переваги",
      technical_solution_public: "Несекретний опис технології",
      current_trl: "Поточний рівень TRL (1–9)",
      target_trl: "Цільовий рівень TRL (1–9)",
      trl_evidence: "Докази готовності (тести/стенд)",
      rd_milestones: "Етапи R&D та дорожня карта",
      team_engineering_background: "Інженерна команда",
      testing_and_scaling_plan: "План випробувань та кодифікації",
      supply_chain_and_risks: "Ланцюг постачання та ризики",
      budget: "BOM-кошторис R&D",
    };
    checks = Object.entries(brave1FieldLabels).map(([key, label]) => ({
      id: key,
      label,
      status: missingKeys.has(key) ? ("missing" as const) : ("complete" as const),
    }));
  } else {
    checks = [
      ...(Object.keys(labels) as (keyof typeof labels)[]).map((id) => ({
        id,
        label: labels[id],
        status: useful(row.details?.[id])
          ? ("complete" as const)
          : ("missing" as const),
      })),
      {
        id: "budget",
        label: "Бюджет",
        status: budgetComplete ? ("complete" as const) : ("missing" as const),
      },
    ];
  }

  return {
    revision: row.revision,
    checks,
    summary: missingSummary,
    disclaimer:
      "Це лише базова перевірка змісту: текст не має бути порожнім, повторювати інший блок або містити очевидні заготовки; бюджет має містити коректні позиції з додатними цінами. Перевірте факти та узгодженість самостійно. Список не перевіряє відповідність умовам гранту і не гарантує схвалення.",
  };
}
