import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  computeFeedbackContentHash,
  dispatchFeedbackNotification,
} from "./feedback-notifier.js";

const TASK_VALUES = [
  "profile",
  "project",
  "budget",
  "assistant",
  "catalog",
  "export",
] as const;

const TASK_OUTCOME_VALUES = [
  "completed",
  "partial",
  "failed",
  "unspecified",
] as const;

const WILLINGNESS_TO_PAY_VALUES = [
  "none",
  "free_only",
  "pay_per_application",
  "monthly_subscription",
  "donation_ready",
  "already_paid",
] as const;

const TESTER_ROLE_VALUES = [
  "entrepreneur",
  "fop",
  "startup_founder",
  "accountant",
  "student_business",
  "volunteer",
  "other",
] as const;

const SCREEN_VALUES = [
  "advisor",
  "cases",
  "catalog",
  "budget",
  "profile",
  "export",
] as const;

const VIEWPORT_VALUES = ["desktop", "tablet", "mobile"] as const;

const RATE_LIMIT_MAX_SUBMISSIONS = 10;

const uuidSchema = z.string().uuid();

const categoryTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(6)
  .transform((tags) => Array.from(new Set(tags)));

const contextSnapshotSchema = z
  .object({
    screen: z.enum(SCREEN_VALUES).optional(),
    programId: z.string().trim().min(1).max(120).optional(),
    viewportClass: z.enum(VIEWPORT_VALUES).optional(),
    appVersion: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

const feedbackSchema = z
  .object({
    id: uuidSchema,
    rating: z.number().int().min(1).max(5),
    task: z.enum(TASK_VALUES),
    comment: z.string().trim().min(1).max(3000),
    ratingUx: z.number().int().min(1).max(5).optional(),
    ratingUsefulness: z.number().int().min(1).max(5).optional(),
    ratingAi: z.number().int().min(1).max(5).optional(),
    taskOutcome: z.enum(TASK_OUTCOME_VALUES).optional(),
    wouldRecommend: z.boolean().optional(),
    willingnessToPay: z.enum(WILLINGNESS_TO_PAY_VALUES).optional(),
    suggestedPriceUah: z.number().int().min(0).max(500000).optional(),
    categoryTags: categoryTagsSchema.optional(),
    testerRole: z.enum(TESTER_ROLE_VALUES).optional(),
    contactConsent: z.boolean().optional(),
    contactInfo: z.string().trim().max(254).optional(),
    contextSnapshot: contextSnapshotSchema.optional(),
  })
  .strict();

const patchFeedbackSchema = z
  .object({
    ratingUx: z.number().int().min(1).max(5).nullable().optional(),
    ratingUsefulness: z.number().int().min(1).max(5).nullable().optional(),
    ratingAi: z.number().int().min(1).max(5).nullable().optional(),
    taskOutcome: z.enum(TASK_OUTCOME_VALUES).optional(),
    wouldRecommend: z.boolean().nullable().optional(),
    willingnessToPay: z.enum(WILLINGNESS_TO_PAY_VALUES).optional(),
    suggestedPriceUah: z.number().int().min(0).max(500000).nullable().optional(),
    categoryTags: categoryTagsSchema.optional(),
    testerRole: z.enum(TESTER_ROLE_VALUES).optional(),
    contactConsent: z.boolean().optional(),
    contactInfo: z.string().trim().max(254).nullable().optional(),
  })
  .strict();

export interface FeedbackRouterOptions {
  notifier?: (
    db: Pool,
    feedbackId: string,
    options?: { isUpdate?: boolean },
  ) => Promise<unknown>;
}

type FeedbackRow = {
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
  content_hash: string | null;
};

const FEEDBACK_SELECT_COLUMNS = `
  id, owner_id, rating, task, comment, created_at,
  rating_ux, rating_usefulness, rating_ai,
  task_outcome, would_recommend, willingness_to_pay,
  suggested_price_uah, category_tags, tester_role,
  contact_consent, contact_info, context_snapshot,
  status, content_hash
`;

function canonicalJson(value: Record<string, unknown> | null | undefined): string {
  const source = value ?? {};
  const entries = Object.keys(source)
    .sort()
    .filter((key) => source[key] !== undefined)
    .map((key) => [key, source[key]]);
  return JSON.stringify(Object.fromEntries(entries));
}

function stringArraysEqual(a: string[] | null | undefined, b: string[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  return left.every((item, index) => item === b[index]);
}

function view(row: FeedbackRow) {
  return {
    id: row.id,
    rating: row.rating,
    task: row.task,
    comment: row.comment,
    ratingUx: row.rating_ux ?? null,
    ratingUsefulness: row.rating_usefulness ?? null,
    ratingAi: row.rating_ai ?? null,
    taskOutcome: row.task_outcome ?? "unspecified",
    wouldRecommend: row.would_recommend ?? null,
    willingnessToPay: row.willingness_to_pay ?? "none",
    suggestedPriceUah: row.suggested_price_uah ?? null,
    categoryTags: Array.isArray(row.category_tags) ? row.category_tags : [],
    testerRole: row.tester_role ?? "entrepreneur",
    contactConsent: Boolean(row.contact_consent),
    contactInfo: row.contact_consent ? (row.contact_info ?? null) : null,
    contextSnapshot: row.context_snapshot ?? {},
    status: row.status ?? "new",
    createdAt: row.created_at,
  };
}

type NormalizedFeedbackInput = {
  id: string;
  rating: number;
  task: (typeof TASK_VALUES)[number];
  comment: string;
  ratingUx: number | null;
  ratingUsefulness: number | null;
  ratingAi: number | null;
  taskOutcome: (typeof TASK_OUTCOME_VALUES)[number];
  wouldRecommend: boolean | null;
  willingnessToPay: (typeof WILLINGNESS_TO_PAY_VALUES)[number];
  suggestedPriceUah: number | null;
  categoryTags: string[];
  testerRole: (typeof TESTER_ROLE_VALUES)[number];
  contactConsent: boolean;
  contactInfo: string | null;
  contextSnapshot: Record<string, unknown>;
  contentHash: string;
};

function normalizeInput(
  raw: z.infer<typeof feedbackSchema>,
): NormalizedFeedbackInput {
  const contactConsent = Boolean(raw.contactConsent);
  const contactInfo = contactConsent ? (raw.contactInfo?.trim() || null) : null;
  const taskOutcome = raw.taskOutcome ?? "unspecified";
  const willingnessToPay = raw.willingnessToPay ?? "none";
  const categoryTags = raw.categoryTags ?? [];
  const testerRole = raw.testerRole ?? "entrepreneur";
  const contextSnapshot = raw.contextSnapshot ?? {};
  const contentHash = computeFeedbackContentHash({
    rating: raw.rating,
    task: raw.task,
    comment: raw.comment,
    taskOutcome,
    categoryTags,
    willingnessToPay,
  });

  return {
    id: raw.id,
    rating: raw.rating,
    task: raw.task,
    comment: raw.comment,
    ratingUx: raw.ratingUx ?? null,
    ratingUsefulness: raw.ratingUsefulness ?? null,
    ratingAi: raw.ratingAi ?? null,
    taskOutcome,
    wouldRecommend: raw.wouldRecommend ?? null,
    willingnessToPay,
    suggestedPriceUah: raw.suggestedPriceUah ?? null,
    categoryTags,
    testerRole,
    contactConsent,
    contactInfo,
    contextSnapshot,
    contentHash,
  };
}

function matchesIdempotentReplay(
  row: FeedbackRow,
  uid: string,
  input: NormalizedFeedbackInput,
): boolean {
  return (
    row.owner_id === uid &&
    row.rating === input.rating &&
    row.task === input.task &&
    row.comment === input.comment &&
    (row.rating_ux ?? null) === input.ratingUx &&
    (row.rating_usefulness ?? null) === input.ratingUsefulness &&
    (row.rating_ai ?? null) === input.ratingAi &&
    row.task_outcome === input.taskOutcome &&
    (row.would_recommend ?? null) === input.wouldRecommend &&
    row.willingness_to_pay === input.willingnessToPay &&
    (row.suggested_price_uah ?? null) === input.suggestedPriceUah &&
    stringArraysEqual(row.category_tags, input.categoryTags) &&
    row.tester_role === input.testerRole &&
    Boolean(row.contact_consent) === input.contactConsent &&
    (row.contact_info ?? null) === input.contactInfo &&
    canonicalJson(row.context_snapshot) === canonicalJson(input.contextSnapshot)
  );
}

export function feedbackRouter(db: Pool, options: FeedbackRouterOptions = {}) {
  const router = Router();
  const notify = options.notifier ?? dispatchFeedbackNotification;

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/", async (_req, res, next) => {
    try {
      const uid = res.locals.uid;
      const result = await db.query<FeedbackRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS}
         FROM user_feedback
         WHERE owner_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
        [uid],
      );
      res.json({ feedback: result.rows.map(view) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    try {
      const uid = res.locals.uid;
      const input = normalizeInput(parsed.data);

      const preExisting = await db.query<FeedbackRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS} FROM user_feedback WHERE id = $1`,
        [input.id],
      );
      if (preExisting.rowCount) {
        const row = preExisting.rows[0];
        if (matchesIdempotentReplay(row, uid, input)) {
          res.status(200).json({ feedback: view(row) });
          return;
        }
        res.status(409).json({ error: "conflict" });
        return;
      }

      const rateCheck = await db.query<{ recent_count: number }>(
        `SELECT count(*)::int AS recent_count
         FROM user_feedback
         WHERE owner_id = $1 AND created_at >= now() - interval '10 minutes'`,
        [uid],
      );
      const recentCount = Number(rateCheck.rows[0]?.recent_count ?? 0);
      if (recentCount >= RATE_LIMIT_MAX_SUBMISSIONS) {
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }

      const inserted = await db.query<FeedbackRow>(
        `INSERT INTO user_feedback (
           id, owner_id, rating, task, comment,
           rating_ux, rating_usefulness, rating_ai,
           task_outcome, would_recommend, willingness_to_pay,
           suggested_price_uah, category_tags, tester_role,
           contact_consent, contact_info, context_snapshot, content_hash
         )
         VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11,
           $12, $13, $14,
           $15, $16, $17::jsonb, $18
         )
         ON CONFLICT (id) DO NOTHING
         RETURNING ${FEEDBACK_SELECT_COLUMNS}`,
        [
          input.id,
          uid,
          input.rating,
          input.task,
          input.comment,
          input.ratingUx,
          input.ratingUsefulness,
          input.ratingAi,
          input.taskOutcome,
          input.wouldRecommend,
          input.willingnessToPay,
          input.suggestedPriceUah,
          input.categoryTags,
          input.testerRole,
          input.contactConsent,
          input.contactInfo,
          JSON.stringify(input.contextSnapshot),
          input.contentHash,
        ],
      );

      if (inserted.rowCount) {
        const created = inserted.rows[0];
        void notify(db, created.id).catch(() => {});
        res.status(200).json({ feedback: view(created) });
        return;
      }

      const existing = await db.query<FeedbackRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS} FROM user_feedback WHERE id = $1`,
        [input.id],
      );
      if (!existing.rowCount) {
        res.status(409).json({ error: "conflict" });
        return;
      }

      const row = existing.rows[0];
      if (matchesIdempotentReplay(row, uid, input)) {
        res.status(200).json({ feedback: view(row) });
        return;
      }

      res.status(409).json({ error: "conflict" });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    const idParsed = uuidSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const bodyParsed = patchFeedbackSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    try {
      const uid = res.locals.uid;
      const feedbackId = idParsed.data;
      const patch = bodyParsed.data;

      const existing = await db.query<FeedbackRow>(
        `SELECT ${FEEDBACK_SELECT_COLUMNS}
         FROM user_feedback
         WHERE id = $1 AND owner_id = $2`,
        [feedbackId, uid],
      );
      if (!existing.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const prev = existing.rows[0];
      const nextRatingUx =
        patch.ratingUx !== undefined ? patch.ratingUx : prev.rating_ux;
      const nextRatingUsefulness =
        patch.ratingUsefulness !== undefined
          ? patch.ratingUsefulness
          : prev.rating_usefulness;
      const nextRatingAi =
        patch.ratingAi !== undefined ? patch.ratingAi : prev.rating_ai;
      const nextTaskOutcome = patch.taskOutcome ?? prev.task_outcome;
      const nextWouldRecommend =
        patch.wouldRecommend !== undefined
          ? patch.wouldRecommend
          : prev.would_recommend;
      const nextWillingnessToPay =
        patch.willingnessToPay ?? prev.willingness_to_pay;
      const nextSuggestedPriceUah =
        patch.suggestedPriceUah !== undefined
          ? patch.suggestedPriceUah
          : prev.suggested_price_uah;
      const nextCategoryTags =
        patch.categoryTags !== undefined
          ? patch.categoryTags
          : (prev.category_tags ?? []);
      const nextTesterRole = patch.testerRole ?? prev.tester_role;
      const nextContactConsent =
        patch.contactConsent !== undefined
          ? patch.contactConsent
          : Boolean(prev.contact_consent);
      const nextContactInfo = nextContactConsent
        ? patch.contactInfo !== undefined
          ? patch.contactInfo?.trim() || null
          : (prev.contact_info ?? null)
        : null;

      const nextContentHash = computeFeedbackContentHash({
        rating: prev.rating,
        task: prev.task,
        comment: prev.comment,
        taskOutcome: nextTaskOutcome,
        categoryTags: nextCategoryTags,
        willingnessToPay: nextWillingnessToPay,
      });
      const contentHashChanged = nextContentHash !== prev.content_hash;

      const updated = await db.query<FeedbackRow>(
        `UPDATE user_feedback
         SET
           rating_ux = $3,
           rating_usefulness = $4,
           rating_ai = $5,
           task_outcome = $6,
           would_recommend = $7,
           willingness_to_pay = $8,
           suggested_price_uah = $9,
           category_tags = $10,
           tester_role = $11,
           contact_consent = $12,
           contact_info = $13,
           content_hash = $14,
           ai_triage = CASE WHEN $15::boolean THEN NULL ELSE ai_triage END,
           ai_triaged_at = CASE WHEN $15::boolean THEN NULL ELSE ai_triaged_at END
         WHERE id = $1 AND owner_id = $2
         RETURNING ${FEEDBACK_SELECT_COLUMNS}`,
        [
          feedbackId,
          uid,
          nextRatingUx,
          nextRatingUsefulness,
          nextRatingAi,
          nextTaskOutcome,
          nextWouldRecommend,
          nextWillingnessToPay,
          nextSuggestedPriceUah,
          nextCategoryTags,
          nextTesterRole,
          nextContactConsent,
          nextContactInfo,
          nextContentHash,
          contentHashChanged,
        ],
      );

      const updatedRow = updated.rows[0];
      const contactConsentBecameTrue =
        !prev.contact_consent && nextContactConsent;
      const wtpBecameNonNone =
        nextWillingnessToPay !== "none" &&
        nextWillingnessToPay !== prev.willingness_to_pay;

      if (contactConsentBecameTrue || wtpBecameNonNone) {
        void notify(db, updatedRow.id, { isUpdate: true }).catch(() => {});
      }

      res.status(200).json({ feedback: view(updatedRow) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
