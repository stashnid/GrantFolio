import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  isSmartFeedbackAiEnabled,
  synthesizeFeedbackBatch,
  triageSingleFeedback,
  type JsonGenerator,
  type SingleFeedbackTriage,
  type VerifiedBatchFeedbackSynthesis,
} from "./feedback-ai.js";
import {
  computeFeedbackContentHash,
  dispatchFeedbackNotification,
  resolveFeedbackNotifyRecipients,
} from "./feedback-notifier.js";
import {
  computeDeterministicMetrics,
  kopecksToUah,
  renderFeedbackReportCsv,
  renderFeedbackReportMarkdown,
  type DeterministicFeedbackMetrics,
  type FeedbackAdminItem,
  type FeedbackBatchSynthesisRecord,
  type FeedbackChangeLink,
  type FeedbackMetricInputRow,
  type FeedbackNotifyStatus,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackTaskOutcome,
  type FeedbackWillingnessToPay,
} from "./feedback-report.js";
import { isMonitorAdmin, type MonitorAdminToken } from "./monitor-admin.js";

export type FeedbackAdminRouterOptions = {
  isAdmin?: (token: unknown, emailVerifiedByOtp?: boolean) => boolean;
  env?: NodeJS.ProcessEnv;
  generateJson?: JsonGenerator;
  dispatchNotification?: typeof dispatchFeedbackNotification;
  resolveNotifyRecipients?: typeof resolveFeedbackNotifyRecipients;
  now?: () => Date;
};

const FEEDBACK_STATUSES = [
  "new",
  "reviewed",
  "planned",
  "resolved",
  "dismissed",
] as const;

const FEEDBACK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

const uuidSchema = z.string().uuid();

const optionalQueryInt = (min: number, max: number) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return val;
      if (typeof val === "string" && /^\d+$/.test(val.trim())) {
        return Number.parseInt(val.trim(), 10);
      }
      return val;
    },
    z.number().int().min(min).max(max).optional(),
  );

const listQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  task: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
  minRating: optionalQueryInt(1, 5),
  maxRating: optionalQueryInt(1, 5),
  limit: optionalQueryInt(1, 100),
  offset: optionalQueryInt(0, 100_000),
});

const triageBodySchema = z
  .object({
    status: z.enum(FEEDBACK_STATUSES),
    priority: z.enum(FEEDBACK_PRIORITIES).optional(),
    resolutionNote: z.string().trim().max(2000).nullable().optional(),
    resolvedCommitOrPr: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

const changeLinkBodySchema = z
  .object({
    changeSummary: z.string().trim().min(5).max(1000),
    pullRequestOrCommit: z.string().trim().min(1).max(120),
    verificationEvidence: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const refreshBodySchema = z
  .object({
    forceRefresh: z.boolean().optional(),
  })
  .strict();

const exportFormatSchema = z.enum(["markdown", "csv", "json"]);

type StatusCountsRow = {
  total_count: number | string;
  new_count: number | string;
};

type AggregateMoneyRow = {
  count: number | string;
  total_kopecks: string | number;
};

type FeedbackDbRow = {
  id: string;
  owner_id: string;
  rating: number;
  task: string;
  comment: string;
  created_at: string | Date;
  rating_ux: number | null;
  rating_usefulness: number | null;
  rating_ai: number | null;
  task_outcome: string;
  would_recommend: boolean | null;
  willingness_to_pay: string;
  suggested_price_uah: number | null;
  category_tags: string[] | null;
  tester_role: string;
  contact_consent: boolean;
  contact_info: string | null;
  context_snapshot: Record<string, unknown> | null;
  status: string;
  priority: string;
  resolution_note: string | null;
  resolved_commit_or_pr: string | null;
  resolved_at: string | Date | null;
  reviewed_by: string | null;
  notify_status: string;
  notify_attempts: number;
  notified_at: string | Date | null;
  notify_error: string | null;
  content_hash: string | null;
  ai_triage: SingleFeedbackTriage | null;
  ai_triaged_at: string | Date | null;
  business_name?: string | null;
  region?: string | null;
};

type ChangeLinkDbRow = {
  id: string;
  feedback_id: string;
  change_summary: string;
  pull_request_or_commit: string;
  verification_evidence: string | null;
  created_at: string | Date;
  created_by: string;
};

type BatchSynthesisDbRow = {
  id: string;
  created_at: string | Date;
  created_by: string;
  feedback_count: number;
  deterministic_metrics: DeterministicFeedbackMetrics;
  ai_synthesis: VerifiedBatchFeedbackSynthesis | null;
  status: "completed" | "failed" | "deterministic_only";
  error_message: string | null;
};

function toIsoRequired(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toIsoNullable(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function presentChangeLink(row: ChangeLinkDbRow): FeedbackChangeLink {
  return {
    id: row.id,
    feedbackId: row.feedback_id,
    changeSummary: row.change_summary,
    pullRequestOrCommit: row.pull_request_or_commit,
    verificationEvidence: row.verification_evidence ?? null,
    createdAt: toIsoRequired(row.created_at),
    createdBy: row.created_by,
  };
}

function presentFeedbackItem(
  row: FeedbackDbRow,
  changeLinks: FeedbackChangeLink[] = [],
): FeedbackAdminItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    rating: Number(row.rating),
    task: row.task,
    comment: row.comment,
    createdAt: toIsoRequired(row.created_at),
    ratingUx: row.rating_ux ?? null,
    ratingUsefulness: row.rating_usefulness ?? null,
    ratingAi: row.rating_ai ?? null,
    taskOutcome: (row.task_outcome || "unspecified") as FeedbackTaskOutcome,
    wouldRecommend: row.would_recommend ?? null,
    willingnessToPay: (row.willingness_to_pay || "none") as FeedbackWillingnessToPay,
    suggestedPriceUah: row.suggested_price_uah ?? null,
    categoryTags: Array.isArray(row.category_tags) ? row.category_tags : [],
    testerRole: row.tester_role || "entrepreneur",
    contactConsent: Boolean(row.contact_consent),
    contactInfo: row.contact_consent ? (row.contact_info ?? null) : null,
    contextSnapshot:
      row.context_snapshot && typeof row.context_snapshot === "object"
        ? row.context_snapshot
        : {},
    status: (row.status || "new") as FeedbackStatus,
    priority: (row.priority || "medium") as FeedbackPriority,
    resolutionNote: row.resolution_note ?? null,
    resolvedCommitOrPr: row.resolved_commit_or_pr ?? null,
    resolvedAt: toIsoNullable(row.resolved_at),
    reviewedBy: row.reviewed_by ?? null,
    notifyStatus: (row.notify_status || "pending") as FeedbackNotifyStatus,
    notifyAttempts: Number(row.notify_attempts) || 0,
    notifiedAt: toIsoNullable(row.notified_at),
    notifyError: row.notify_error ?? null,
    contentHash: row.content_hash ? row.content_hash.trim() : null,
    aiTriage: row.ai_triage ?? null,
    aiTriagedAt: toIsoNullable(row.ai_triaged_at),
    businessName: row.business_name ?? null,
    region: row.region ?? null,
    changeLinks,
  };
}

function presentSynthesis(row: BatchSynthesisDbRow): FeedbackBatchSynthesisRecord {
  return {
    id: row.id,
    createdAt: toIsoRequired(row.created_at),
    createdBy: row.created_by,
    feedbackCount: Number(row.feedback_count) || 0,
    deterministicMetrics: row.deterministic_metrics,
    aiSynthesis: row.ai_synthesis ?? null,
    status: row.status,
    errorMessage: row.error_message ?? null,
  };
}

const FEEDBACK_SELECT_COLUMNS = `
  f.id, f.owner_id, f.rating, f.task, f.comment, f.created_at,
  f.rating_ux, f.rating_usefulness, f.rating_ai,
  f.task_outcome, f.would_recommend, f.willingness_to_pay,
  f.suggested_price_uah, f.category_tags, f.tester_role,
  f.contact_consent, f.contact_info, f.context_snapshot,
  f.status, f.priority, f.resolution_note, f.resolved_commit_or_pr,
  f.resolved_at, f.reviewed_by,
  f.notify_status, f.notify_attempts, f.notified_at, f.notify_error,
  f.content_hash, f.ai_triage, f.ai_triaged_at,
  p.business_name, p.region
`;

async function queryOptionalMoneyTotals(
  db: Pool,
  sql: string,
): Promise<{ count: number; totalUah: number }> {
  try {
    const res = await db.query<AggregateMoneyRow>(sql);
    const row = res.rows[0];
    if (!row) return { count: 0, totalUah: 0 };
    return {
      count: Number(row.count) || 0,
      totalUah: kopecksToUah(Number(row.total_kopecks) || 0),
    };
  } catch {
    return { count: 0, totalUah: 0 };
  }
}

async function loadDeterministicMetrics(
  db: Pool,
): Promise<DeterministicFeedbackMetrics> {
  const [feedbackRes, actualDonations, pilotPayments] = await Promise.all([
    db.query<{
      owner_id: string;
      rating: number;
      task: string;
      rating_ux: number | null;
      rating_usefulness: number | null;
      rating_ai: number | null;
      task_outcome: string | null;
      would_recommend: boolean | null;
      willingness_to_pay: string | null;
      suggested_price_uah: number | null;
      category_tags: string[] | null;
      status: string | null;
      notify_status: string | null;
    }>(
      `SELECT owner_id, rating, task, rating_ux, rating_usefulness, rating_ai,
              task_outcome, would_recommend, willingness_to_pay,
              suggested_price_uah, category_tags, status, notify_status
       FROM user_feedback`,
    ),
    queryOptionalMoneyTotals(
      db,
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_kopecks), 0)::text AS total_kopecks
       FROM donations`,
    ),
    queryOptionalMoneyTotals(
      db,
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_kopecks), 0)::text AS total_kopecks
       FROM grant_preparation_pilot
       WHERE confirmed_at IS NOT NULL`,
    ),
  ]);

  const metricRows: FeedbackMetricInputRow[] = feedbackRes.rows.map((row) => ({
    ownerId: row.owner_id,
    rating: Number(row.rating),
    task: row.task,
    ratingUx: row.rating_ux ?? null,
    ratingUsefulness: row.rating_usefulness ?? null,
    ratingAi: row.rating_ai ?? null,
    taskOutcome: row.task_outcome ?? "unspecified",
    wouldRecommend: row.would_recommend ?? null,
    willingnessToPay: row.willingness_to_pay ?? "none",
    suggestedPriceUah: row.suggested_price_uah ?? null,
    categoryTags: row.category_tags ?? [],
    status: row.status ?? "new",
    notifyStatus: row.notify_status ?? "pending",
  }));

  return computeDeterministicMetrics(metricRows, actualDonations, pilotPayments);
}

async function loadChangeLinksByFeedbackIds(
  db: Pool,
  ids: string[],
): Promise<Map<string, FeedbackChangeLink[]>> {
  const map = new Map<string, FeedbackChangeLink[]>();
  if (ids.length === 0) return map;

  const res = await db.query<ChangeLinkDbRow>(
    `SELECT id, feedback_id, change_summary, pull_request_or_commit,
            verification_evidence, created_at, created_by
     FROM feedback_change_links
     WHERE feedback_id = ANY($1::uuid[])
     ORDER BY created_at DESC, id DESC`,
    [ids],
  );

  for (const row of res.rows) {
    const list = map.get(row.feedback_id) ?? [];
    list.push(presentChangeLink(row));
    map.set(row.feedback_id, list);
  }
  return map;
}

async function loadLatestSynthesis(
  db: Pool,
): Promise<FeedbackBatchSynthesisRecord | null> {
  const res = await db.query<BatchSynthesisDbRow>(
    `SELECT id, created_at, created_by, feedback_count,
            deterministic_metrics, ai_synthesis, status, error_message
     FROM feedback_batch_syntheses
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  );
  if (res.rows.length === 0) return null;
  return presentSynthesis(res.rows[0]);
}

async function loadAllFeedbackItems(db: Pool): Promise<FeedbackAdminItem[]> {
  const res = await db.query<FeedbackDbRow>(
    `SELECT ${FEEDBACK_SELECT_COLUMNS}
     FROM user_feedback f
     LEFT JOIN profiles p ON p.owner_id = f.owner_id
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT 2000`,
  );
  const linksById = await loadChangeLinksByFeedbackIds(
    db,
    res.rows.map((r) => r.id),
  );
  return res.rows.map((row) =>
    presentFeedbackItem(row, linksById.get(row.id) ?? []),
  );
}

export function feedbackAdminRouter(
  db: Pool,
  options: FeedbackAdminRouterOptions = {},
) {
  const router = Router();
  const getEnv = () => options.env ?? process.env;
  const checkAdmin =
    options.isAdmin ??
    ((token: unknown, emailVerifiedByOtp?: boolean) =>
      isMonitorAdmin(token as MonitorAdminToken | undefined, {
        emailVerifiedByOtp,
      }));
  const dispatchNotification =
    options.dispatchNotification ?? dispatchFeedbackNotification;
  const resolveRecipients =
    options.resolveNotifyRecipients ?? resolveFeedbackNotifyRecipients;
  const now = options.now ?? (() => new Date());

  let analyzing = false;

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    const token = (res.locals.firebaseToken ?? res.locals.token) as
      | MonitorAdminToken
      | undefined;
    const emailVerifiedByOtp = res.locals.emailVerifiedByOtp === true;
    if (!checkAdmin(token, emailVerifiedByOtp)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  });

  function actorLabel(res: { locals: Record<string, unknown> }): string {
    const token = (res.locals.firebaseToken ?? res.locals.token) as
      | MonitorAdminToken
      | undefined;
    return String(token?.email || token?.uid || "admin").slice(0, 160);
  }

  router.get("/status", async (_req, res, next) => {
    try {
      const env = getEnv();
      const countsRes = await db.query<StatusCountsRow>(
        `SELECT COUNT(*)::int AS total_count,
                COUNT(*) FILTER (WHERE status = 'new')::int AS new_count
         FROM user_feedback`,
      );
      const counts = countsRes.rows[0];
      res.status(200).json({
        ok: true,
        isAdmin: true,
        newCount: Number(counts?.new_count) || 0,
        totalCount: Number(counts?.total_count) || 0,
        aiEnabled: isSmartFeedbackAiEnabled(env),
        notifyRecipientsCount: resolveRecipients(env).length,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/metrics", async (_req, res, next) => {
    try {
      const [metrics, latestSynthesis] = await Promise.all([
        loadDeterministicMetrics(db),
        loadLatestSynthesis(db),
      ]);
      res.status(200).json({ metrics, latestSynthesis });
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    const parsedQuery = listQuerySchema.safeParse({
      status: req.query.status,
      task: req.query.task,
      minRating: req.query.minRating,
      maxRating: req.query.maxRating,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    if (!parsedQuery.success) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    const q = parsedQuery.data;
    if (
      q.minRating !== undefined &&
      q.maxRating !== undefined &&
      q.minRating > q.maxRating
    ) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }

    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.status !== undefined) {
      params.push(q.status);
      conditions.push(`f.status = $${params.length}`);
    }
    if (q.task !== undefined) {
      params.push(q.task);
      conditions.push(`f.task = $${params.length}`);
    }
    if (q.minRating !== undefined) {
      params.push(q.minRating);
      conditions.push(`f.rating >= $${params.length}`);
    }
    if (q.maxRating !== undefined) {
      params.push(q.maxRating);
      conditions.push(`f.rating <= $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const countRes = await db.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total FROM user_feedback f ${whereClause}`,
        params,
      );
      const total = Number(countRes.rows[0]?.total) || 0;

      const listParams = [...params, limit, offset];
      const limitParam = `$${params.length + 1}`;
      const offsetParam = `$${params.length + 2}`;

      const rowsRes = await db.query<FeedbackDbRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS}
         FROM user_feedback f
         LEFT JOIN profiles p ON p.owner_id = f.owner_id
         ${whereClause}
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        listParams,
      );

      const linksById = await loadChangeLinksByFeedbackIds(
        db,
        rowsRes.rows.map((r) => r.id),
      );
      const items = rowsRes.rows.map((row) =>
        presentFeedbackItem(row, linksById.get(row.id) ?? []),
      );

      res.status(200).json({ total, items });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/triage", async (req, res, next) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: "invalid_feedback_id" });
      return;
    }

    const parsedBody = triageBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_triage" });
      return;
    }

    const feedbackId = parsedId.data;
    const body = parsedBody.data;
    const reviewedBy = actorLabel(res);
    const hasResolutionNote = body.resolutionNote !== undefined;
    const hasResolvedCommit = body.resolvedCommitOrPr !== undefined;

    try {
      const updated = await db.query<FeedbackDbRow>(
        `UPDATE user_feedback
         SET status = $2,
             priority = COALESCE($3, priority),
             resolution_note = CASE WHEN $4::boolean THEN $5 ELSE resolution_note END,
             resolved_commit_or_pr = CASE WHEN $6::boolean THEN $7 ELSE resolved_commit_or_pr END,
             resolved_at = CASE WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE NULL END,
             reviewed_by = $8
         WHERE id = $1
         RETURNING id, owner_id, rating, task, comment, created_at,
                   rating_ux, rating_usefulness, rating_ai,
                   task_outcome, would_recommend, willingness_to_pay,
                   suggested_price_uah, category_tags, tester_role,
                   contact_consent, contact_info, context_snapshot,
                   status, priority, resolution_note, resolved_commit_or_pr,
                   resolved_at, reviewed_by,
                   notify_status, notify_attempts, notified_at, notify_error,
                   content_hash, ai_triage, ai_triaged_at`,
        [
          feedbackId,
          body.status,
          body.priority ?? null,
          hasResolutionNote,
          body.resolutionNote ?? null,
          hasResolvedCommit,
          body.resolvedCommitOrPr ?? null,
          reviewedBy,
        ],
      );

      if (updated.rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const refreshed = await db.query<FeedbackDbRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS}
         FROM user_feedback f
         LEFT JOIN profiles p ON p.owner_id = f.owner_id
         WHERE f.id = $1`,
        [feedbackId],
      );
      const linksById = await loadChangeLinksByFeedbackIds(db, [feedbackId]);
      res.status(200).json({
        ok: true,
        feedback: presentFeedbackItem(
          refreshed.rows[0] ?? updated.rows[0],
          linksById.get(feedbackId) ?? [],
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/change-links", async (req, res, next) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: "invalid_feedback_id" });
      return;
    }

    const parsedBody = changeLinkBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_change_link" });
      return;
    }

    const feedbackId = parsedId.data;
    const body = parsedBody.data;
    const createdBy = actorLabel(res);

    try {
      const exists = await db.query<{ id: string }>(
        "SELECT id FROM user_feedback WHERE id = $1",
        [feedbackId],
      );
      if (exists.rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const inserted = await db.query<ChangeLinkDbRow>(
        `INSERT INTO feedback_change_links
           (feedback_id, change_summary, pull_request_or_commit, verification_evidence, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, feedback_id, change_summary, pull_request_or_commit,
                   verification_evidence, created_at, created_by`,
        [
          feedbackId,
          body.changeSummary,
          body.pullRequestOrCommit,
          body.verificationEvidence ?? null,
          createdBy,
        ],
      );

      res.status(201).json({
        ok: true,
        changeLink: presentChangeLink(inserted.rows[0]),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/notify", async (req, res, next) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: "invalid_feedback_id" });
      return;
    }

    const feedbackId = parsedId.data;
    try {
      const exists = await db.query<{ id: string }>(
        "SELECT id FROM user_feedback WHERE id = $1",
        [feedbackId],
      );
      if (exists.rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const result = await dispatchNotification(db, feedbackId, {
        env: getEnv(),
      });
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/ai-triage", async (req, res, next) => {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(400).json({ error: "invalid_feedback_id" });
      return;
    }

    const parsedBody = refreshBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const feedbackId = parsedId.data;
    const forceRefresh = parsedBody.data.forceRefresh === true;
    const env = getEnv();

    try {
      const found = await db.query<FeedbackDbRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS}
         FROM user_feedback f
         LEFT JOIN profiles p ON p.owner_id = f.owner_id
         WHERE f.id = $1`,
        [feedbackId],
      );
      if (found.rows.length === 0) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = found.rows[0];
      const currentHash = computeFeedbackContentHash({
        rating: Number(row.rating),
        task: row.task,
        comment: row.comment,
        taskOutcome: row.task_outcome,
        categoryTags: row.category_tags ?? [],
        willingnessToPay: row.willingness_to_pay,
      });

      if (
        !forceRefresh &&
        row.ai_triage &&
        row.content_hash &&
        row.content_hash.trim() === currentHash
      ) {
        res.status(200).json({
          ok: true,
          aiTriage: row.ai_triage,
          cached: true,
        });
        return;
      }

      if (!isSmartFeedbackAiEnabled(env) && !options.generateJson) {
        res.status(503).json({ error: "ai_disabled" });
        return;
      }

      const aiTriage = await triageSingleFeedback(
        {
          id: row.id,
          rating: Number(row.rating),
          task: row.task,
          comment: row.comment,
          ratingUx: row.rating_ux,
          ratingUsefulness: row.rating_usefulness,
          ratingAi: row.rating_ai,
          taskOutcome: row.task_outcome,
          wouldRecommend: row.would_recommend,
          willingnessToPay: row.willingness_to_pay,
          suggestedPriceUah: row.suggested_price_uah,
          categoryTags: row.category_tags ?? [],
          testerRole: row.tester_role,
        },
        { generateJson: options.generateJson, env },
      );

      await db.query(
        `UPDATE user_feedback
         SET ai_triage = $2::jsonb,
             ai_triaged_at = now(),
             content_hash = $3
         WHERE id = $1`,
        [feedbackId, JSON.stringify(aiTriage), currentHash],
      );

      res.status(200).json({
        ok: true,
        aiTriage,
        cached: false,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/analyze", async (req, res, next) => {
    const parsedBody = refreshBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    if (analyzing) {
      res.status(429).json({ error: "analysis_busy" });
      return;
    }

    analyzing = true;
    const env = getEnv();
    const createdBy = actorLabel(res);

    try {
      const [metrics, items] = await Promise.all([
        loadDeterministicMetrics(db),
        loadAllFeedbackItems(db),
      ]);

      const canUseAi =
        isSmartFeedbackAiEnabled(env) || Boolean(options.generateJson);

      let status: "completed" | "failed" | "deterministic_only" =
        "deterministic_only";
      let aiSynthesis: VerifiedBatchFeedbackSynthesis | null = null;
      let errorMessage: string | null = null;

      if (canUseAi && items.length > 0) {
        try {
          aiSynthesis = await synthesizeFeedbackBatch(items, metrics, {
            generateJson: options.generateJson,
            env,
          });
          status = "completed";
        } catch (err) {
          status = "failed";
          errorMessage = (
            err instanceof Error ? err.message : "ai_synthesis_failed"
          ).slice(0, 300);
        }
      }

      const inserted = await db.query<BatchSynthesisDbRow>(
        `INSERT INTO feedback_batch_syntheses
           (created_by, feedback_count, deterministic_metrics, ai_synthesis, status, error_message)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
         RETURNING id, created_at, created_by, feedback_count,
                   deterministic_metrics, ai_synthesis, status, error_message`,
        [
          createdBy,
          items.length,
          JSON.stringify(metrics),
          aiSynthesis ? JSON.stringify(aiSynthesis) : null,
          status,
          errorMessage,
        ],
      );

      res.status(200).json({
        ok: true,
        synthesis: presentSynthesis(inserted.rows[0]),
      });
    } catch (error) {
      next(error);
    } finally {
      analyzing = false;
    }
  });

  router.get("/export", async (req, res, next) => {
    const rawFormat =
      req.query.format === undefined || req.query.format === ""
        ? "markdown"
        : req.query.format;
    const parsedFormat = exportFormatSchema.safeParse(rawFormat);
    if (!parsedFormat.success) {
      res.status(400).json({ error: "invalid_format" });
      return;
    }

    const format = parsedFormat.data;
    try {
      const [metrics, items, latestSynthesis] = await Promise.all([
        loadDeterministicMetrics(db),
        loadAllFeedbackItems(db),
        loadLatestSynthesis(db),
      ]);
      const generatedAt = now().toISOString();

      if (format === "markdown") {
        const body = renderFeedbackReportMarkdown({
          generatedAt,
          metrics,
          items,
          latestSynthesis,
        });
        res
          .status(200)
          .set("Content-Type", "text/markdown; charset=utf-8")
          .set(
            "Content-Disposition",
            'attachment; filename="grantfolio-feedback-report.md"',
          )
          .send(body);
        return;
      }

      if (format === "csv") {
        const body = renderFeedbackReportCsv(items);
        res
          .status(200)
          .set("Content-Type", "text/csv; charset=utf-8")
          .set(
            "Content-Disposition",
            'attachment; filename="grantfolio-feedback-report.csv"',
          )
          .send(body);
        return;
      }

      const jsonBody = JSON.stringify(
        { generatedAt, metrics, latestSynthesis, items },
        null,
        2,
      );
      res
        .status(200)
        .set("Content-Type", "application/json; charset=utf-8")
        .set(
          "Content-Disposition",
          'attachment; filename="grantfolio-feedback-report.json"',
        )
        .send(jsonBody);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
