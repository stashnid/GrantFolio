import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import { GRANT_SOURCE_RULES } from "./grant-source-rules.js";
import {
  PROGRAM_MONITOR_PROFILES,
  getMonitorProfile,
} from "./program-monitor-profiles.js";
import {
  assertSafeMonitorUrl,
  createSmartGrantMonitor,
} from "./smart-grant-monitor.js";

export type MonitorAdminToken = {
  uid?: string;
  email?: string;
  email_verified?: boolean;
};

export type MonitorAdminOptions = {
  onAvailabilityApproved?: () => Promise<void>;
  runMonitor?: (programId?: string) => Promise<unknown>;
  isAdmin?: (token: unknown, emailVerifiedByOtp?: boolean) => boolean;
};

const PROPOSAL_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "auto_applied",
] as const;

type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

const proposalStatusQuerySchema = z.enum(PROPOSAL_STATUSES);

const proposalIdSchema = z.string().uuid();

const reviewBodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

const runBodySchema = z
  .object({
    programId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const availabilityNewValueSchema = z.object({
  state: z.enum(["open", "closed", "unknown"]),
  sourceUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine((value) => {
      try {
        assertSafeMonitorUrl(value);
        return true;
      } catch {
        return false;
      }
    }),
  checkedAt: z.string().optional(),
  validUntil: z.string().optional(),
  evidence: z.string().optional(),
  basis: z.enum(["calendar", "announcement", "rolling"]).optional(),
  deadlineAt: z.string().nullable().optional(),
  deadlinePrecision: z.enum(["day", "minute"]).optional(),
  startsAt: z.string().nullable().optional(),
  rolling: z.boolean().optional(),
});

type SnapshotDbRow = {
  program_id: string;
  source_url: string;
  content_hash: string;
  fetched_at: string | Date;
  last_changed_at: string | Date;
  extraction_status: string;
  verifier_errors: string[] | null;
  last_error: string | null;
};

type ProposalCountRow = {
  status: string;
  count: number | string;
};

type ProposalDbRow = {
  id: string;
  program_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  evidence_quote: string;
  confidence: string;
  status: string;
  detected_at: string | Date;
  reviewed_at: string | Date | null;
  reviewed_by: string | null;
  review_notes: string | null;
};

function parseCsvSet(raw: string | undefined, lowercase: boolean): Set<string> {
  if (!raw) return new Set();
  const entries = raw
    .split(",")
    .map((entry) => entry.trim().replace(/^["']+|["']+$/g, "").trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (lowercase ? entry.toLowerCase() : entry));
  return new Set(entries);
}

export function isMonitorAdmin(
  token: MonitorAdminToken | undefined,
  options?: { emailVerifiedByOtp?: boolean },
): boolean {
  if (!token || typeof token !== "object") return false;

  const allowedEmails = parseCsvSet(process.env.MONITOR_ADMIN_EMAILS, true);
  const allowedUids = parseCsvSet(process.env.MONITOR_ADMIN_UIDS, false);

  if (allowedEmails.size === 0 && allowedUids.size === 0) {
    if (
      process.env.AUTH_MODE === "emulator" &&
      process.env.NODE_ENV !== "production" &&
      Boolean(token.uid || token.email)
    ) {
      return true;
    }
  }

  allowedEmails.add("grantfoliomanager@gmail.com");

  if (typeof token.uid === "string" && token.uid.length > 0 && allowedUids.has(token.uid)) {
    return true;
  }

  const emailVerified = token.email_verified === true || options?.emailVerifiedByOtp === true;
  if (
    emailVerified &&
    typeof token.email === "string" &&
    allowedEmails.has(token.email.trim().toLowerCase())
  ) {
    return true;
  }

  return false;
}

function getProgramTitle(programId: string): string {
  const entry = GRANT_CATALOG.find((program) => program.id === programId);
  return entry?.title ?? programId;
}

function presentProposal(row: ProposalDbRow) {
  return {
    id: row.id,
    programId: row.program_id,
    programTitle: getProgramTitle(row.program_id),
    fieldName: row.field_name,
    oldValue: row.old_value ?? null,
    newValue: row.new_value,
    evidenceQuote: row.evidence_quote,
    confidence: row.confidence,
    status: row.status,
    detectedAt: row.detected_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewNotes: row.review_notes ?? null,
  };
}

export function monitorAdminRouter(db: Pool, options: MonitorAdminOptions = {}) {
  const router = Router();
  const checkAdmin =
    options.isAdmin ??
    ((token: unknown, emailVerifiedByOtp?: boolean) =>
      isMonitorAdmin(token as MonitorAdminToken | undefined, { emailVerifiedByOtp }));
  const runMonitor =
    options.runMonitor ??
    ((programId?: string) => createSmartGrantMonitor(db).runAll(programId));

  let running = false;

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!checkAdmin(res.locals.firebaseToken, Boolean(res.locals.emailVerifiedByOtp))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  });

  router.get("/status", async (_req, res, next) => {
    try {
      const [snapshotsResult, proposalCountsResult] = await Promise.all([
        db.query<SnapshotDbRow>(
          `SELECT program_id, source_url, content_hash, fetched_at, last_changed_at,
                  extraction_status, verifier_errors, last_error
           FROM grant_program_snapshots`,
        ),
        db.query<ProposalCountRow>(
          `SELECT status, COUNT(*)::int AS count
           FROM grant_change_proposals
           GROUP BY status`,
        ),
      ]);

      const snapshotsByProgram = new Map<string, SnapshotDbRow>(
        snapshotsResult.rows.map((row) => [row.program_id, row]),
      );

      const proposalCounts: Record<ProposalStatus, number> = {
        pending_review: 0,
        approved: 0,
        rejected: 0,
        auto_applied: 0,
      };
      for (const row of proposalCountsResult.rows) {
        if (row.status in proposalCounts) {
          proposalCounts[row.status as ProposalStatus] = Number(row.count) || 0;
        }
      }

      let verified = 0;
      let unmodified = 0;
      let verifierFailed = 0;
      let aiDisabled = 0;
      let fetchErrors = 0;

      const snapshots = PROGRAM_MONITOR_PROFILES.map((profile) => {
        const row = snapshotsByProgram.get(profile.programId);
        const status = row?.extraction_status ?? "never_run";
        if (status === "verified") verified += 1;
        else if (status === "unmodified") unmodified += 1;
        else if (status === "verifier_failed") verifierFailed += 1;
        else if (status === "ai_disabled") aiDisabled += 1;
        else if (status === "fetch_error" || status === "llm_error") fetchErrors += 1;

        return {
          programId: profile.programId,
          programTitle: getProgramTitle(profile.programId),
          sourceUrl: row?.source_url ?? profile.sourceUrl,
          sourceType: profile.sourceType,
          cadenceHours: profile.cadenceHours,
          autoPromoteAvailability: profile.autoPromoteAvailability,
          extractionStatus: status,
          fetchedAt: row?.fetched_at ?? null,
          lastChangedAt: row?.last_changed_at ?? null,
          verifierErrors: Array.isArray(row?.verifier_errors) ? row.verifier_errors : [],
          lastError: row?.last_error ?? null,
        };
      });

      res.status(200).json({
        aiEnabled: process.env.SMART_MONITOR_AI_ENABLED === "true",
        summary: {
          totalProfiles: PROGRAM_MONITOR_PROFILES.length,
          pendingProposals: proposalCounts.pending_review,
          verified,
          unmodified,
          verifierFailed,
          aiDisabled,
          fetchErrors,
          proposalCounts,
        },
        snapshots,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/proposals", async (req, res, next) => {
    const rawStatus = req.query.status === undefined ? "pending_review" : req.query.status;
    const parsedStatus = proposalStatusQuerySchema.safeParse(rawStatus);
    if (!parsedStatus.success) {
      res.status(400).json({ error: "invalid_status" });
      return;
    }

    try {
      const result = await db.query<ProposalDbRow>(
        `SELECT id, program_id, field_name, old_value, new_value, evidence_quote,
                confidence, status, detected_at, reviewed_at, reviewed_by, review_notes
         FROM grant_change_proposals
         WHERE status = $1
         ORDER BY detected_at DESC
         LIMIT 100`,
        [parsedStatus.data],
      );
      res.status(200).json({
        proposals: result.rows.map(presentProposal),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/proposals/:id/review", async (req, res, next) => {
    const parsedId = proposalIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: "invalid_proposal_id" });
      return;
    }

    const parsedBody = reviewBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_review" });
      return;
    }

    const proposalId = parsedId.data;
    const { decision, notes } = parsedBody.data;
    const token = res.locals.firebaseToken as MonitorAdminToken | undefined;
    const reviewedBy = String(token?.email || token?.uid || "admin").slice(0, 160);

    const client = await db.connect();
    let availabilityUpdated = false;
    let updatedRow: ProposalDbRow | null = null;

    try {
      await client.query("BEGIN");
      const existing = await client.query<ProposalDbRow>(
        `SELECT id, program_id, field_name, old_value, new_value, evidence_quote,
                confidence, status, detected_at, reviewed_at, reviewed_by, review_notes
         FROM grant_change_proposals
         WHERE id = $1
         FOR UPDATE`,
        [proposalId],
      );

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }

      const proposal = existing.rows[0];
      if (proposal.status !== "pending_review") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "already_reviewed" });
        return;
      }

      let approvedSourceUrl: string | null = null;
      let approvedAvailability: Record<string, unknown> | null = null;
      if (decision === "approved" && proposal.field_name === "availability") {
        const parsedAvailability = availabilityNewValueSchema.safeParse(proposal.new_value);
        if (!parsedAvailability.success) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "invalid_availability_proposal" });
          return;
        }
        if (parsedAvailability.data.state === "open" && GRANT_SOURCE_RULES.some(rule =>
          rule.programId === proposal.program_id && rule.suspensionOpenDeadlinePattern,
        )) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: "availability_requires_service_confirmation" });
          return;
        }
        const profile = getMonitorProfile(proposal.program_id);
        approvedSourceUrl = profile?.sourceUrl ?? parsedAvailability.data.sourceUrl;
        const approvedAt = new Date();
        approvedAvailability = {
          ...parsedAvailability.data,
          checkedAt: approvedAt.toISOString(),
          validUntil: new Date(approvedAt.getTime() + 36 * 60 * 60 * 1000).toISOString(),
        };
      }

      const updated = await client.query<ProposalDbRow>(
        `UPDATE grant_change_proposals
         SET status = $2,
             reviewed_at = now(),
             reviewed_by = $3,
             review_notes = $4
         WHERE id = $1
         RETURNING id, program_id, field_name, old_value, new_value, evidence_quote,
                   confidence, status, detected_at, reviewed_at, reviewed_by, review_notes`,
        [proposalId, decision, reviewedBy, notes ?? null],
      );
      updatedRow = updated.rows[0];

      if (approvedSourceUrl && approvedAvailability) {
        await client.query(
          `INSERT INTO grant_source_checks (program_id, source_url, availability, last_attempt_at, last_error)
           VALUES ($1, $2, $3::jsonb, now(), NULL)
           ON CONFLICT (program_id) DO UPDATE SET
             source_url = EXCLUDED.source_url,
             availability = EXCLUDED.availability,
             last_attempt_at = now(),
             last_error = NULL`,
          [proposal.program_id, approvedSourceUrl, JSON.stringify(approvedAvailability)],
        );
        availabilityUpdated = true;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
      return;
    } finally {
      client.release();
    }

    try {
      if (availabilityUpdated) {
        await options.onAvailabilityApproved?.();
      }
      res.status(200).json({ proposal: presentProposal(updatedRow!) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/run", async (req, res, next) => {
    const parsedBody = runBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_run_request" });
      return;
    }

    const { programId } = parsedBody.data;
    if (programId && !getMonitorProfile(programId)) {
      res.status(400).json({ error: "unknown_program" });
      return;
    }

    if (running) {
      res.status(429).json({ error: "monitor_busy" });
      return;
    }

    running = true;
    try {
      const summary = await runMonitor(programId);
      await options.onAvailabilityApproved?.();
      res.status(200).json({ summary });
    } catch (error) {
      next(error);
    } finally {
      running = false;
    }
  });

  return router;
}
