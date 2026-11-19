import { z } from "zod";

export const ProgramPlaybookSchema = z.object({
  program_id: z.string().min(1),
  canonical_name: z.string().min(1),
  operator: z.string().min(1),
  funding_type: z.string().min(1),
  amount_range_uah: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
  }),
  support_tier: z.literal("deep"),
  domain_tags: z.array(z.string().min(1)),
  synonyms_uk_en: z.array(z.string().min(1)),
  use_case_examples: z.array(z.string().min(1)),
  eligibility_rules: z.object({
    applicant_types: z.array(z.string().min(1)),
    job_creation_requirements: z.string().min(1),
    min_jobs: z.number().int().nonnegative(),
    co_financing_percent: z.number().min(0).max(100),
    tax_payback_months: z.number().int().positive().optional(),
    forbidden_kveds: z.array(z.string()),
    stop_factors: z.array(z.string().min(1)),
  }),
  budget_rules: z.object({
    allowed_categories: z.array(z.string().min(1)),
    category_caps_percent: z.record(z.string(), z.number().min(0).max(100)),
    rent_limit_percent: z.number().min(0).max(100).optional(),
    marketing_limit_percent: z.number().min(0).max(100).optional(),
    raw_materials_limit_percent: z.number().min(0).max(100).optional(),
    equipment_minimum_percent: z.number().min(0).max(100).optional(),
  }),
  scoring_rubric: z.object({
    criteria: z.array(
      z.object({
        name: z.string().min(1),
        weight_percent: z.number().min(0).max(100),
        description: z.string().min(1),
      })
    ),
    rejection_triggers: z.array(z.string().min(1)),
  }),
  required_documents: z.array(z.string().min(1)),
  supported_exports: z.array(z.string().min(1)),
});

export type ProgramPlaybook = z.infer<typeof ProgramPlaybookSchema>;
