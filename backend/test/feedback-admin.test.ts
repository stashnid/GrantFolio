import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { Duplex } from "node:stream";
import { test } from "node:test";
import express from "express";
import type { Pool } from "pg";
import {
  feedbackAdminRouter,
  type FeedbackAdminRouterOptions,
} from "../src/feedback-admin.js";
import {
  computeDeterministicMetrics,
  renderFeedbackReportCsv,
  renderFeedbackReportMarkdown,
  type DeterministicFeedbackMetrics,
  type FeedbackAdminItem,
} from "../src/feedback-report.js";
import type { MonitorAdminToken } from "../src/monitor-admin.js";

type StoredFeedback = {
  id: string;
  owner_id: string;
  rating: number;
  task: string;
  comment: string;
  created_at: string;
  rating_ux: number | null;
  rating_usefulness: number | null;
  rating_ai: number | null;
  task_outcome: string;
  would_recommend: boolean | null;
  willingness_to_pay: string;
  suggested_price_uah: number | null;
  category_tags: string[];
  tester_role: string;
  contact_consent: boolean;
  contact_info: string | null;
  context_snapshot: Record<string, unknown>;
  status: string;
  priority: string;
  resolution_note: string | null;
  resolved_commit_or_pr: string | null;
  resolved_at: string | null;
  reviewed_by: string | null;
  notify_status: string;
  notify_attempts: number;
  notified_at: string | null;
  notify_error: string | null;
  content_hash: string | null;
  ai_triage: unknown | null;
  ai_triaged_at: string | null;
};

type StoredProfile = {
  owner_id: string;
  business_name: string | null;
  region: string | null;
};

type StoredChangeLink = {
  id: string;
  feedback_id: string;
  change_summary: string;
  pull_request_or_commit: string;
  verification_evidence: string | null;
  created_at: string;
  created_by: string;
};

type StoredSynthesis = {
  id: string;
  created_at: string;
  created_by: string;
  feedback_count: number;
  deterministic_metrics: unknown;
  ai_synthesis: unknown | null;
  status: "completed" | "failed" | "deterministic_only";
  error_message: string | null;
};

function makeFeedbackRow(overrides: Partial<StoredFeedback> = {}): StoredFeedback {
  return {
    id: randomUUID(),
    owner_id: "user-1",
    rating: 5,
    task: "assistant",
    comment: "Зручний інтерфейс, усе зрозуміло з першого кроку.",
    created_at: "2026-11-18T10:00:00.000Z",
    rating_ux: 5,
    rating_usefulness: 4,
    rating_ai: 5,
    task_outcome: "completed",
    would_recommend: true,
    willingness_to_pay: "pay_per_application",
    suggested_price_uah: 400,
    category_tags: ["ux", "ai"],
    tester_role: "fop",
    contact_consent: false,
    contact_info: null,
    context_snapshot: {},
    status: "new",
    priority: "medium",
    resolution_note: null,
    resolved_commit_or_pr: null,
    resolved_at: null,
    reviewed_by: null,
    notify_status: "sent",
    notify_attempts: 1,
    notified_at: "2026-11-18T10:01:00.000Z",
    notify_error: null,
    content_hash: null,
    ai_triage: null,
    ai_triaged_at: null,
    ...overrides,
  };
}

function createMockDb(seed?: {
  feedback?: StoredFeedback[];
  profiles?: StoredProfile[];
  changeLinks?: StoredChangeLink[];
  syntheses?: StoredSynthesis[];
  donations?: { count: number; totalKopecks: number };
  pilotPayments?: { count: number; totalKopecks: number } | "missing_table";
}) {
  const feedbackMap = new Map<string, StoredFeedback>(
    (seed?.feedback ?? []).map((f) => [f.id, { ...f }]),
  );
  const profileMap = new Map<string, StoredProfile>(
    (seed?.profiles ?? []).map((p) => [p.owner_id, { ...p }]),
  );
  const changeLinks: StoredChangeLink[] = [...(seed?.changeLinks ?? [])];
  const syntheses: StoredSynthesis[] = [...(seed?.syntheses ?? [])];
  const donations = seed?.donations ?? { count: 0, totalKopecks: 0 };
  const pilotPayments = seed?.pilotPayments ?? { count: 0, totalKopecks: 0 };

  function joinProfile(row: StoredFeedback) {
    const profile = profileMap.get(row.owner_id);
    return {
      ...row,
      business_name: profile?.business_name ?? null,
      region: profile?.region ?? null,
    };
  }

  async function query(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.includes("COUNT(*)::int AS total_count")) {
      const all = [...feedbackMap.values()];
      const newCount = all.filter((f) => f.status === "new").length;
      return {
        rows: [{ total_count: all.length, new_count: newCount }],
        rowCount: 1,
      };
    }

    if (normalized.includes("FROM donations")) {
      return {
        rows: [
          {
            count: donations.count,
            total_kopecks: String(donations.totalKopecks),
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes("FROM grant_preparation_pilot")) {
      if (pilotPayments === "missing_table") {
        throw new Error('relation "grant_preparation_pilot" does not exist');
      }
      return {
        rows: [
          {
            count: pilotPayments.count,
            total_kopecks: String(pilotPayments.totalKopecks),
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("SELECT owner_id, rating, task, rating_ux")) {
      const rows = [...feedbackMap.values()];
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith("SELECT id FROM user_feedback WHERE id = $1")) {
      const row = feedbackMap.get(String(params[0]));
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }

    if (
      normalized.includes("FROM user_feedback f LEFT JOIN profiles p") &&
      normalized.includes("WHERE f.id = $1")
    ) {
      const row = feedbackMap.get(String(params[0]));
      return {
        rows: row ? [joinProfile(row)] : [],
        rowCount: row ? 1 : 0,
      };
    }

    if (normalized.startsWith("SELECT COUNT(*)::int AS total FROM user_feedback f")) {
      const filtered = applyFilters([...feedbackMap.values()], normalized, params);
      return { rows: [{ total: filtered.length }], rowCount: 1 };
    }

    if (normalized.includes("FROM user_feedback f LEFT JOIN profiles p")) {
      const hasLimit = normalized.includes("LIMIT $");
      const filterParams = hasLimit ? params.slice(0, -2) : params;
      const limit = hasLimit ? Number(params[params.length - 2]) : 1000;
      const offset = hasLimit ? Number(params[params.length - 1]) : 0;
      const filtered = applyFilters([...feedbackMap.values()], normalized, filterParams)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .slice(offset, offset + limit)
        .map(joinProfile);
      return { rows: filtered, rowCount: filtered.length };
    }

    if (normalized.includes("FROM feedback_change_links WHERE feedback_id = ANY($1::uuid[])")) {
      const ids = new Set((params[0] as string[]) ?? []);
      const rows = changeLinks
        .filter((l) => ids.has(l.feedback_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows, rowCount: rows.length };
    }

    if (normalized.startsWith("INSERT INTO feedback_change_links")) {
      const [feedbackId, changeSummary, pullRequestOrCommit, verificationEvidence, createdBy] =
        params as [string, string, string, string | null, string];
      const link: StoredChangeLink = {
        id: randomUUID(),
        feedback_id: feedbackId,
        change_summary: changeSummary,
        pull_request_or_commit: pullRequestOrCommit,
        verification_evidence: verificationEvidence,
        created_at: "2026-11-18T12:00:00.000Z",
        created_by: createdBy,
      };
      changeLinks.push(link);
      return { rows: [{ ...link }], rowCount: 1 };
    }

    if (normalized.startsWith("UPDATE user_feedback SET status = $2")) {
      const [
        id,
        status,
        priority,
        hasResolutionNote,
        resolutionNote,
        hasResolvedCommit,
        resolvedCommitOrPr,
        reviewedBy,
      ] = params as [
        string,
        string,
        string | null,
        boolean,
        string | null,
        boolean,
        string | null,
        string,
      ];
      const existing = feedbackMap.get(id);
      if (!existing) return { rows: [], rowCount: 0 };
      const updated: StoredFeedback = {
        ...existing,
        status,
        priority: priority ?? existing.priority,
        resolution_note: hasResolutionNote ? resolutionNote : existing.resolution_note,
        resolved_commit_or_pr: hasResolvedCommit
          ? resolvedCommitOrPr
          : existing.resolved_commit_or_pr,
        resolved_at:
          status === "resolved"
            ? existing.resolved_at ?? "2026-11-18T13:00:00.000Z"
            : null,
        reviewed_by: reviewedBy,
      };
      feedbackMap.set(id, updated);
      return { rows: [{ ...updated }], rowCount: 1 };
    }

    if (normalized.startsWith("UPDATE user_feedback SET ai_triage = $2::jsonb")) {
      const [id, aiTriageJson, contentHash] = params as [string, string, string];
      const existing = feedbackMap.get(id);
      if (!existing) return { rows: [], rowCount: 0 };
      const updated: StoredFeedback = {
        ...existing,
        ai_triage: JSON.parse(aiTriageJson),
        ai_triaged_at: "2026-11-18T14:00:00.000Z",
        content_hash: contentHash,
      };
      feedbackMap.set(id, updated);
      return { rows: [{ ...updated }], rowCount: 1 };
    }

    if (normalized.includes("FROM feedback_batch_syntheses ORDER BY created_at DESC")) {
      const sorted = [...syntheses].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      return { rows: sorted.slice(0, 1), rowCount: sorted.length > 0 ? 1 : 0 };
    }

    if (normalized.startsWith("INSERT INTO feedback_batch_syntheses")) {
      const [
        createdBy,
        feedbackCount,
        metricsJson,
        aiSynthesisJson,
        status,
        errorMessage,
      ] = params as [
        string,
        number,
        string,
        string | null,
        "completed" | "failed" | "deterministic_only",
        string | null,
      ];
      const row: StoredSynthesis = {
        id: randomUUID(),
        created_at: `2026-11-18T15:0${syntheses.length}:00.000Z`,
        created_by: createdBy,
        feedback_count: feedbackCount,
        deterministic_metrics: JSON.parse(metricsJson),
        ai_synthesis: aiSynthesisJson ? JSON.parse(aiSynthesisJson) : null,
        status,
        error_message: errorMessage,
      };
      syntheses.push(row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in mock DB: ${normalized}`);
  }

  function applyFilters(
    rows: StoredFeedback[],
    sql: string,
    params: unknown[],
  ): StoredFeedback[] {
    let result = rows;
    const paramIndex = (clause: string): number | null => {
      const match = new RegExp(`${clause} \\$(\\d+)`).exec(sql);
      return match ? Number(match[1]) - 1 : null;
    };
    const statusIdx = paramIndex("f\\.status =");
    if (statusIdx !== null) {
      result = result.filter((r) => r.status === params[statusIdx]);
    }
    const taskIdx = paramIndex("f\\.task =");
    if (taskIdx !== null) {
      result = result.filter((r) => r.task === params[taskIdx]);
    }
    const minIdx = paramIndex("f\\.rating >=");
    if (minIdx !== null) {
      result = result.filter((r) => r.rating >= Number(params[minIdx]));
    }
    const maxIdx = paramIndex("f\\.rating <=");
    if (maxIdx !== null) {
      result = result.filter((r) => r.rating <= Number(params[maxIdx]));
    }
    return result;
  }

  const db = { query } as unknown as Pool;
  return { db, feedbackMap, changeLinks, syntheses };
}

type TestResponse = {
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

type Requester = (
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<TestResponse>;

function createMemorySocket(): Duplex & { remoteAddress: string } {
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  }) as Duplex & { remoteAddress: string };
  socket.remoteAddress = "127.0.0.1";
  return socket;
}

function invokeApp(
  app: express.Express,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const socket = createMemorySocket();
    const req = new http.IncomingMessage(
      socket as unknown as import("node:net").Socket,
    );
    req.method = method;
    req.url = urlPath;
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    const payload =
      body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    req.headers = {
      host: "127.0.0.1",
      ...(payload
        ? {
            "content-type": "application/json",
            "content-length": String(payload.length),
          }
        : {}),
    };

    const res = new http.ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(res.getHeaders())) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(", "));
        } else if (value !== undefined) {
          headers.set(key, String(value));
        }
      }
      const rawBody = Buffer.concat(chunks).toString("utf8");
      resolve({
        status: res.statusCode,
        headers,
        text: async () => rawBody,
        json: async () => (rawBody ? JSON.parse(rawBody) : null),
      });
      return (origEnd as (...args: unknown[]) => typeof res)(chunk, ...rest);
    }) as typeof res.end;

    res.on("error", reject);
    app(req, res, (err: unknown) => {
      if (err) reject(err);
    });

    if (payload) req.push(payload);
    req.push(null);
  });
}

async function withServer(
  db: Pool,
  getAuth: () => { token?: MonitorAdminToken; emailVerifiedByOtp?: boolean },
  options: FeedbackAdminRouterOptions = {},
  fn: (request: Requester) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    const auth = getAuth();
    res.locals.uid = auth.token?.uid;
    res.locals.firebaseToken = auth.token;
    res.locals.emailVerifiedByOtp = auth.emailVerifiedByOtp === true;
    next();
  });
  app.use("/api/admin/feedback", feedbackAdminRouter(db, options));

  const request: Requester = (path, init) =>
    invokeApp(app, init?.method ?? "GET", `/api/admin/feedback${path}`, init?.body);

  await fn(request);
}

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("non-admin user gets 403 with Cache-Control: no-store on all feedback admin endpoints", async () => {
  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: "admin@grantfolio.ua",
      MONITOR_ADMIN_UIDS: undefined,
      NODE_ENV: "production",
    },
    async () => {
      const { db } = createMockDb();
      const nonAdmin: MonitorAdminToken = {
        uid: "regular-1",
        email: "user@example.com",
        email_verified: true,
      };

      await withServer(db, () => ({ token: nonAdmin }), {}, async (request) => {
        const id = randomUUID();
        const responses = await Promise.all([
          request("/status"),
          request("/metrics"),
          request("/"),
          request(`/${id}/triage`, { method: "PATCH", body: { status: "reviewed" } }),
          request(`/${id}/change-links`, {
            method: "POST",
            body: { changeSummary: "Виправлено баг", pullRequestOrCommit: "PR #1" },
          }),
          request(`/${id}/notify`, { method: "POST" }),
          request(`/${id}/ai-triage`, { method: "POST" }),
          request("/analyze", { method: "POST" }),
          request("/export?format=markdown"),
        ]);

        for (const res of responses) {
          assert.equal(res.status, 403);
          assert.equal(res.headers.get("cache-control"), "no-store");
          assert.deepEqual(await res.json(), { error: "forbidden" });
        }
      });
    },
  );
});

test("deterministic metrics math accurately computes CSAT, averages, WTP, and monetization reconciliation", () => {
  const metrics = computeDeterministicMetrics(
    [
      {
        ownerId: "u1",
        rating: 5,
        task: "assistant",
        ratingUx: 5,
        ratingUsefulness: 5,
        ratingAi: 5,
        taskOutcome: "completed",
        wouldRecommend: true,
        willingnessToPay: "pay_per_application",
        suggestedPriceUah: 500,
        categoryTags: ["ai", "ux"],
        status: "resolved",
        notifyStatus: "sent",
      },
      {
        ownerId: "u2",
        rating: 4,
        task: "budget",
        ratingUx: 4,
        ratingUsefulness: 4,
        ratingAi: null,
        taskOutcome: "completed",
        wouldRecommend: true,
        willingnessToPay: "donation_ready",
        suggestedPriceUah: 200,
        categoryTags: ["ux", "budget"],
        status: "new",
        notifyStatus: "failed",
      },
      {
        ownerId: "u2",
        rating: 2,
        task: "export",
        ratingUx: 2,
        ratingUsefulness: 3,
        ratingAi: 3,
        taskOutcome: "failed",
        wouldRecommend: false,
        willingnessToPay: "free_only",
        suggestedPriceUah: null,
        categoryTags: ["bug"],
        status: "new",
        notifyStatus: "sent",
      },
      {
        ownerId: "u3",
        rating: 5,
        task: "catalog",
        ratingUx: null,
        ratingUsefulness: 5,
        ratingAi: null,
        taskOutcome: "unspecified",
        wouldRecommend: null,
        willingnessToPay: "none",
        suggestedPriceUah: null,
        categoryTags: ["ux"],
        status: "reviewed",
        notifyStatus: "skipped",
      },
    ],
    { count: 2, totalUah: 750.5 },
    { count: 1, totalUah: 499 },
  );

  assert.equal(metrics.totalCount, 4);
  assert.equal(metrics.uniqueTesters, 3);
  assert.equal(metrics.averageRating, 4);
  assert.deepEqual(metrics.ratingDistribution, {
    "1": 0,
    "2": 1,
    "3": 0,
    "4": 1,
    "5": 2,
  });
  assert.deepEqual(metrics.dimensionAverages, {
    ux: 3.67,
    usefulness: 4.25,
    ai: 4,
  });
  // 3 out of 4 ratings >= 4 -> 75%
  assert.equal(metrics.csatPercent, 75);
  // 2 of 3 answered would_recommend -> 66.7%
  assert.equal(metrics.recommendPercent, 66.7);
  // 2 completed out of 3 specified outcomes (completed + partial + failed) -> 66.7%
  assert.equal(metrics.taskCompletionRate, 66.7);
  // 2 positive WTP (pay_per_application + donation_ready) out of 4 -> 50%
  assert.equal(metrics.willingnessToPayCount, 2);
  assert.equal(metrics.willingnessToPayPercent, 50);
  assert.equal(metrics.averageSuggestedPriceUah, 350);
  assert.deepEqual(metrics.actualDonations, { count: 2, totalUah: 750.5 });
  assert.deepEqual(metrics.pilotPayments, { count: 1, totalUah: 499 });
  assert.equal(metrics.notifyFailuresCount, 1);
  assert.equal(metrics.topTags[0].tag, "ux");
  assert.equal(metrics.topTags[0].count, 3);
});

test("verified admin exercises status, metrics, list, triage, change-links, notify, ai-triage, analyze, and exports", async () => {
  const fb1 = makeFeedbackRow({
    id: randomUUID(),
    owner_id: "owner-1",
    rating: 5,
    task: "assistant",
    comment: "ШІ-асистент допоміг підготувати опис кав'ярні для Власної справи.",
    willingness_to_pay: "pay_per_application",
    suggested_price_uah: 350,
    status: "new",
  });
  const fb2 = makeFeedbackRow({
    id: randomUUID(),
    owner_id: "owner-2",
    rating: 2,
    task: "export",
    comment: "=CMD|' /C calc'!A0 Кнопка експорту зсувається на мобільному екрані.",
    task_outcome: "partial",
    would_recommend: false,
    willingness_to_pay: "free_only",
    suggested_price_uah: null,
    status: "reviewed",
    notify_status: "failed",
  });

  const { db } = createMockDb({
    feedback: [fb1, fb2],
    profiles: [
      { owner_id: "owner-1", business_name: "Кава Плюс", region: "Львівська" },
      { owner_id: "owner-2", business_name: "Пекарня Дім", region: "Київ" },
    ],
    donations: { count: 2, totalKopecks: 50_000 },
    pilotPayments: { count: 1, totalKopecks: 29_900 },
  });

  let notifyCalls = 0;
  let aiTriageCalls = 0;
  let aiBatchCalls = 0;

  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: "admin@grantfolio.ua",
      FEEDBACK_NOTIFY_EMAILS: "alerts@grantfolio.ua, founder@grantfolio.ua",
      SMART_FEEDBACK_AI_ENABLED: "true",
      GEMINI_API_KEY: "test-key",
      NODE_ENV: "production",
    },
    async () => {
      const adminToken: MonitorAdminToken = {
        uid: "admin-uid",
        email: "admin@grantfolio.ua",
        email_verified: false,
      };

      await withServer(
        db,
        () => ({ token: adminToken, emailVerifiedByOtp: true }),
        {
          now: () => new Date("2026-11-18T16:00:00.000Z"),
          dispatchNotification: async (_db, _id) => {
            notifyCalls += 1;
            return {
              notifyStatus: "sent",
              recipientsAttempted: 2,
              recipientsSent: 2,
              notifiedAt: "2026-11-18T16:00:00.000Z",
              notifyError: null,
            };
          },
          generateJson: async (prompt) => {
            if (prompt.userPrompt.includes("Обов'язкова JSON-схема") && prompt.userPrompt.includes("clusters")) {
              aiBatchCalls += 1;
              return {
                executiveSummaryUk: "Сильний ШІ-асистент, але потрібне виправлення експорту.",
                sentimentBreakdown: { positive: 1, neutral: 0, negative: 1, mixed: 0 },
                clusters: [
                  {
                    title: "Мобільний експорт",
                    kind: "pain_point",
                    severity: "major",
                    feedbackIds: [fb2.id],
                    verbatimQuotes: [
                      {
                        feedbackId: fb2.id,
                        quote: "Кнопка експорту зсувається на мобільному екрані",
                      },
                    ],
                    summaryUk: "Проблема верстки експорту.",
                    recommendedFixUk: "Виправити flex-wrap для панелі кнопок.",
                  },
                ],
                topPriorities: [
                  {
                    title: "Адаптивність експорту",
                    rationaleUk: "Покращує завершення сценарію.",
                    impact: "high",
                    feedbackIds: [fb2.id],
                  },
                ],
                blindSpotsUk: ["Потрібно більше тестів кошторису."],
              };
            }
            aiTriageCalls += 1;
            return {
              sentiment: "positive",
              urgency: "praise",
              themes: ["асистент", "опис проєкту"],
              summaryUk: "Користувач задоволений підготовкою опису проєкту.",
              suggestedActionUk: "Зберегти поточний шаблон підказок для кав'ярень.",
            };
          },
        },
        async (request) => {
          // 1. GET /status
          const statusRes = await request("/status");
          assert.equal(statusRes.status, 200);
          assert.deepEqual(await statusRes.json(), {
            ok: true,
            isAdmin: true,
            newCount: 1,
            totalCount: 2,
            aiEnabled: true,
            notifyRecipientsCount: 2,
          });

          // 2. GET /metrics
          const metricsRes = await request("/metrics");
          assert.equal(metricsRes.status, 200);
          const metricsBody = (await metricsRes.json()) as {
            metrics: DeterministicFeedbackMetrics;
            latestSynthesis: unknown;
          };
          assert.equal(metricsBody.metrics.totalCount, 2);
          assert.equal(metricsBody.metrics.uniqueTesters, 2);
          assert.equal(metricsBody.metrics.averageRating, 3.5);
          assert.deepEqual(metricsBody.metrics.actualDonations, {
            count: 2,
            totalUah: 500,
          });
          assert.deepEqual(metricsBody.metrics.pilotPayments, {
            count: 1,
            totalUah: 299,
          });
          assert.equal(metricsBody.latestSynthesis, null);

          // 3. GET / with filters
          const listRes = await request("/?status=reviewed&minRating=1&maxRating=3");
          assert.equal(listRes.status, 200);
          const listBody = (await listRes.json()) as {
            total: number;
            items: FeedbackAdminItem[];
          };
          assert.equal(listBody.total, 1);
          assert.equal(listBody.items[0].id, fb2.id);
          assert.equal(listBody.items[0].businessName, "Пекарня Дім");
          assert.equal(listBody.items[0].region, "Київ");

          // 4. PATCH /:id/triage
          const triageRes = await request(`/${fb2.id}/triage`, {
            method: "PATCH",
            body: {
              status: "resolved",
              priority: "high",
              resolutionNote: "Додано адаптивний перенос кнопок експорту.",
              resolvedCommitOrPr: "PR #42",
            },
          });
          assert.equal(triageRes.status, 200);
          const triageBody = (await triageRes.json()) as {
            ok: boolean;
            feedback: FeedbackAdminItem;
          };
          assert.equal(triageBody.ok, true);
          assert.equal(triageBody.feedback.status, "resolved");
          assert.equal(triageBody.feedback.priority, "high");
          assert.equal(triageBody.feedback.reviewedBy, "admin@grantfolio.ua");
          assert.ok(triageBody.feedback.resolvedAt);

          // 5. POST /:id/change-links
          const linkRes = await request(`/${fb2.id}/change-links`, {
            method: "POST",
            body: {
              changeSummary: "Виправлено адаптивність кнопки експорту на екранах 360px",
              pullRequestOrCommit: "commit 9a8b7c6",
              verificationEvidence: "Перевірено в мобільному Chrome 375x812",
            },
          });
          assert.equal(linkRes.status, 201);
          const linkBody = (await linkRes.json()) as {
            ok: boolean;
            changeLink: { feedbackId: string; pullRequestOrCommit: string };
          };
          assert.equal(linkBody.ok, true);
          assert.equal(linkBody.changeLink.feedbackId, fb2.id);
          assert.equal(linkBody.changeLink.pullRequestOrCommit, "commit 9a8b7c6");

          // 6. POST /:id/notify
          const notifyRes = await request(`/${fb1.id}/notify`, { method: "POST" });
          assert.equal(notifyRes.status, 200);
          assert.equal(notifyCalls, 1);

          // 7. POST /:id/ai-triage (first uncached, second cached, third forceRefresh)
          const ai1 = await request(`/${fb1.id}/ai-triage`, { method: "POST", body: {} });
          assert.equal(ai1.status, 200);
          const ai1Body = (await ai1.json()) as { ok: boolean; cached: boolean };
          assert.equal(ai1Body.cached, false);
          assert.equal(aiTriageCalls, 1);

          const ai2 = await request(`/${fb1.id}/ai-triage`, { method: "POST", body: {} });
          assert.equal(ai2.status, 200);
          const ai2Body = (await ai2.json()) as { ok: boolean; cached: boolean };
          assert.equal(ai2Body.cached, true);
          assert.equal(aiTriageCalls, 1);

          const ai3 = await request(`/${fb1.id}/ai-triage`, {
            method: "POST",
            body: { forceRefresh: true },
          });
          assert.equal(ai3.status, 200);
          const ai3Body = (await ai3.json()) as { ok: boolean; cached: boolean };
          assert.equal(ai3Body.cached, false);
          assert.equal(aiTriageCalls, 2);

          // 8. POST /analyze
          const analyzeRes = await request("/analyze", { method: "POST", body: {} });
          assert.equal(analyzeRes.status, 200);
          const analyzeBody = (await analyzeRes.json()) as {
            ok: boolean;
            synthesis: {
              status: string;
              aiSynthesis: { verification: { verifiedQuotesCount: number } };
            };
          };
          assert.equal(analyzeBody.ok, true);
          assert.equal(analyzeBody.synthesis.status, "completed");
          assert.equal(
            analyzeBody.synthesis.aiSynthesis.verification.verifiedQuotesCount,
            1,
          );
          assert.equal(aiBatchCalls, 1);

          // 9. GET /export?format=markdown|csv|json
          const mdRes = await request("/export?format=markdown");
          assert.equal(mdRes.status, 200);
          assert.ok(
            mdRes.headers.get("content-type")?.includes("text/markdown"),
          );
          assert.equal(
            mdRes.headers.get("content-disposition"),
            'attachment; filename="grantfolio-feedback-report.md"',
          );
          const mdText = await mdRes.text();
          assert.ok(mdText.includes("Що змінили за відгуками"));
          assert.ok(mdText.includes("commit 9a8b7c6"));
          assert.ok(mdText.includes("500 грн"));
          assert.ok(mdText.includes("299 грн"));

          const csvRes = await request("/export?format=csv");
          assert.equal(csvRes.status, 200);
          assert.ok(csvRes.headers.get("content-type")?.includes("text/csv"));
          assert.equal(
            csvRes.headers.get("content-disposition"),
            'attachment; filename="grantfolio-feedback-report.csv"',
          );
          const csvText = await csvRes.text();
          assert.ok(csvText.startsWith("\uFEFFid,createdAt,"));
          // CSV formula injection neutralized with leading apostrophe
          assert.ok(csvText.includes("'=CMD|"));
          assert.ok(!csvText.includes(",=CMD|"));
          assert.ok(!csvText.includes('"=CMD|'));

          const jsonRes = await request("/export?format=json");
          assert.equal(jsonRes.status, 200);
          assert.equal(
            jsonRes.headers.get("content-disposition"),
            'attachment; filename="grantfolio-feedback-report.json"',
          );
          const jsonBody = (await jsonRes.json()) as {
            generatedAt: string;
            items: FeedbackAdminItem[];
          };
          assert.equal(jsonBody.generatedAt, "2026-11-18T16:00:00.000Z");
          assert.equal(jsonBody.items.length, 2);
        },
      );
    },
  );
});

test("POST /analyze degrades to deterministic_only when AI disabled, and missing pilot table is handled gracefully", async () => {
  const fb = makeFeedbackRow({ id: randomUUID() });
  const { db } = createMockDb({
    feedback: [fb],
    pilotPayments: "missing_table",
  });

  await withServer(
    db,
    () => ({ token: { uid: "admin-1", email: "admin@grantfolio.ua", email_verified: true } }),
    {
      isAdmin: () => true,
      env: { SMART_FEEDBACK_AI_ENABLED: "false" },
    },
    async (request) => {
      const aiTriageRes = await request(`/${fb.id}/ai-triage`, {
        method: "POST",
        body: {},
      });
      assert.equal(aiTriageRes.status, 503);
      assert.deepEqual(await aiTriageRes.json(), { error: "ai_disabled" });

      const analyzeRes = await request("/analyze", { method: "POST", body: {} });
      assert.equal(analyzeRes.status, 200);
      const body = (await analyzeRes.json()) as {
        ok: boolean;
        synthesis: {
          status: string;
          aiSynthesis: unknown;
          deterministicMetrics: DeterministicFeedbackMetrics;
        };
      };
      assert.equal(body.ok, true);
      assert.equal(body.synthesis.status, "deterministic_only");
      assert.equal(body.synthesis.aiSynthesis, null);
      assert.deepEqual(body.synthesis.deterministicMetrics.pilotPayments, {
        count: 0,
        totalUah: 0,
      });
    },
  );
});

test("report exporters handle empty dataset honestly and neutralize all CSV formula prefixes", () => {
  const emptyMetrics = computeDeterministicMetrics(
    [],
    { count: 0, totalUah: 0 },
    { count: 0, totalUah: 0 },
  );
  const emptyMd = renderFeedbackReportMarkdown({
    generatedAt: "2026-11-18T16:00:00.000Z",
    metrics: emptyMetrics,
    items: [],
    latestSynthesis: null,
  });
  assert.ok(emptyMd.includes("Наразі немає збережених відгуків."));

  const dangerousItem: FeedbackAdminItem = {
    id: randomUUID(),
    ownerId: "u1",
    rating: 4,
    task: "budget",
    comment: "=HYPERLINK(\"http://evil\",\"click\")",
    createdAt: "2026-11-18T10:00:00.000Z",
    ratingUx: null,
    ratingUsefulness: null,
    ratingAi: null,
    taskOutcome: "completed",
    wouldRecommend: true,
    willingnessToPay: "none",
    suggestedPriceUah: null,
    categoryTags: ["+tag"],
    testerRole: "entrepreneur",
    contactConsent: false,
    contactInfo: null,
    contextSnapshot: {},
    status: "new",
    priority: "medium",
    resolutionNote: "@SUM(A1:A2)",
    resolvedCommitOrPr: "-malicious",
    resolvedAt: null,
    reviewedBy: null,
    notifyStatus: "sent",
    notifyAttempts: 1,
    notifiedAt: null,
    notifyError: null,
    contentHash: null,
    aiTriage: null,
    aiTriagedAt: null,
    businessName: "\tTabStart",
    region: "\rCrStart",
    changeLinks: [],
  };

  const csv = renderFeedbackReportCsv([dangerousItem]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""click"")"`));
  assert.ok(csv.includes("'+tag"));
  assert.ok(csv.includes("'@SUM(A1:A2)"));
  assert.ok(csv.includes("'-malicious"));
  assert.ok(csv.includes("'\tTabStart"));
  assert.ok(csv.includes(`"'\rCrStart"`));
});
