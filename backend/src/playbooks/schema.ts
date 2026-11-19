import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const labels = z.array(z.string().trim().min(1).max(180)).max(30);
const kopecks = z.number().int().nonnegative().max(1_000_000_000_000);
const bps = z.number().int().min(0).max(10_000);

const source = z.strictObject({
  id,
  title: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  observedOn: z.iso.date(),
  issuedOn: z.iso.date().optional(),
  publishedOn: z.iso.date().optional(),
  effectiveOn: z.iso.date().optional(),
  version: z.string().min(1),
  kind: z.enum(["law", "service", "guidance", "organizer"]),
});
const evidence = z.strictObject({
  sourceId: id,
  provision: z.string().min(1),
});
const track = z.strictObject({
  id: z.enum(["start", "scale", "orchard"]),
  label: z.string().min(1),
  periodsMonths: z.array(z.number().int().positive()).min(1).optional(),
  minimumJobs: z.number().int().nonnegative().optional(),
  minimumGrantKopecks: kopecks.optional(),
  maximumGrantKopecks: kopecks.optional(),
  baseMaximumGrantKopecks: kopecks.optional(),
  evidence,
});
const budgetRule = z.strictObject({
  category: id,
  label: z.string().min(1),
  limitBps: bps,
  denominator: z.enum(["grant", "project"]),
  evidence,
});
const rule = z.discriminatedUnion("status", [
  z.strictObject({
    id,
    status: z.literal("verified"),
    summary: z.string().min(1),
    evidence,
  }),
  z.strictObject({
    id,
    status: z.literal("unknown"),
    reason: z.string().min(1),
  }),
]);

export const programPlaybookSchema = z
  .strictObject({
    programId: id,
    rulesVersion: id,
    observedOn: z.iso.date(),
    supportTier: z.enum(["deep", "catalog_only"]),
    lifecycle: z.enum(["current", "legacy", "directory"]),
    successorProgramId: id.optional(),
    capabilities: z.strictObject({
      guidedPreparation: z.boolean(),
      draftXlsx: z.boolean(),
      draftPdf: z.boolean(),
      officialPackageVerified: z.literal(false),
    }),
    sources: z.array(source).min(1),
    intake: z.strictObject({
      status: z.enum(["paused", "closed", "unconfirmed"]),
      observedOn: z.iso.date(),
      evidence,
    }),
    searchTags: labels,
    searchSynonyms: labels,
    useCaseExamples: labels,
    tracks: z.array(track),
    budgetRules: z.array(budgetRule),
    rules: z.array(rule),
    gaps: labels,
  })
  .superRefine((playbook, context) => {
    const sourceIds = new Set(playbook.sources.map((item) => item.id));
    if (sourceIds.size !== playbook.sources.length)
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Duplicate source ID",
      });
    const references = [
      playbook.intake.evidence,
      ...playbook.tracks.map((item) => item.evidence),
      ...playbook.budgetRules.map((item) => item.evidence),
      ...playbook.rules.flatMap((item) =>
        item.status === "verified" ? [item.evidence] : [],
      ),
    ];
    if (references.some((item) => !sourceIds.has(item.sourceId)))
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Unresolved evidence reference",
      });
    if (
      playbook.lifecycle !== "current" &&
      (playbook.supportTier !== "catalog_only" ||
        playbook.tracks.length ||
        playbook.budgetRules.length)
    )
      context.addIssue({
        code: "custom",
        path: ["lifecycle"],
        message: "Legacy and directory entries cannot supply actionable rules",
      });
    if (
      playbook.supportTier === "catalog_only" &&
      (playbook.capabilities.guidedPreparation ||
        playbook.capabilities.draftXlsx ||
        playbook.capabilities.draftPdf)
    )
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: "Catalogue-only entries cannot prepare drafts",
      });
    if (playbook.lifecycle === "legacy" && !playbook.successorProgramId)
      context.addIssue({
        code: "custom",
        path: ["successorProgramId"],
        message: "Legacy entry requires a successor",
      });
  });

export type ProgramPlaybook = z.infer<typeof programPlaybookSchema>;
