import { z } from "zod";

export const ExternalChecklistItemSchema = z.object({
  id: z.string().min(1),
  title_uk: z.string().min(1),
  where_to_get_uk: z.string().min(1),
  why_needed_uk: z.string().min(1),
  mandatory: z.boolean(),
});

export const GeneratedDocumentItemSchema = z.object({
  document_id: z.string().min(1),
  title_uk: z.string().min(1),
  file_format: z.enum(["xlsx", "pdf", "docx"]),
  source_fields: z.array(z.string().min(1)),
  description_uk: z.string().min(1),
});

export const LifecycleGuideSchema = z.object({
  overview_and_ecosystem: z.string().min(1),
  eligibility_and_stop_factors: z.array(z.string().min(1)),
  funding_tiers_and_limits: z.array(z.string().min(1)),
  step_by_step_submission: z.array(
    z.object({
      step_number: z.number().int().positive(),
      title_uk: z.string().min(1),
      description_uk: z.string().min(1),
    })
  ),
  evaluation_and_scoring: z.object({
    criteria_summary: z.string().min(1),
    top_rejection_reasons: z.array(z.string().min(1)),
  }),
  post_grant_obligations: z.array(z.string().min(1)),
  security_and_opsec_rules: z.array(z.string().min(1)).optional(),
});

export const DocumentRequirementsSchema = z.object({
  generated_by_grantfolio: z.array(GeneratedDocumentItemSchema),
  applicant_external_checklist: z.array(ExternalChecklistItemSchema),
});

export const ProgramPlaybookSchema = z.object({
  program_id: z.string().min(1),
  canonical_name: z.string().min(1),
  operator: z.string().min(1),
  funding_type: z.string().min(1),
  amount_range_uah: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
  }),
  support_tier: z.enum(["deep", "rules_only", "playbook_only", "catalog_only"]),
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
  lifecycle_guide: LifecycleGuideSchema.optional(),
  document_requirements: DocumentRequirementsSchema.optional(),
});

export type ExternalChecklistItem = z.infer<typeof ExternalChecklistItemSchema>;
export type GeneratedDocumentItem = z.infer<typeof GeneratedDocumentItemSchema>;
export type LifecycleGuide = z.infer<typeof LifecycleGuideSchema>;
export type DocumentRequirements = z.infer<typeof DocumentRequirementsSchema>;
export type ProgramPlaybook = z.infer<typeof ProgramPlaybookSchema>;
