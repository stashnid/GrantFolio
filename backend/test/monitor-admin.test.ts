import assert from "node:assert/strict";
import http from "node:http";
import { Duplex } from "node:stream";
import { test } from "node:test";
import express from "express";
import type { Pool } from "pg";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { PROGRAM_MONITOR_PROFILES } from "../src/program-monitor-profiles.js";
import {
  isMonitorAdmin,
  monitorAdminRouter,
  type MonitorAdminOptions,
  type MonitorAdminToken,
} from "../src/monitor-admin.js";

type StoredProposal = {
  id: string;
  program_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  evidence_quote: string;
  confidence: string;
  status: string;
  detected_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
};

type StoredSnapshot = {
  program_id: string;
  source_url: string;
  content_hash: string;
  fetched_at: string;
  last_changed_at: string;
  extraction_status: string;
  verifier_errors: string[];
  last_error: string | null;
};

type SourceCheckUpsert = {
  programId: string;
  sourceUrl: string;
  availability: unknown;
};

function createMockDb(seed?: {
  snapshots?: StoredSnapshot[];
  proposals?: StoredProposal[];
}) {
  const snapshots = [...(seed?.snapshots ?? [])];
  const proposals = new Map<string, StoredProposal>(
    (seed?.proposals ?? []).map((p) => [p.id, { ...p }]),
  );
  const sourceCheckUpserts: SourceCheckUpsert[] = [];
  const txLog: string[] = [];

  async function execute(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      txLog.push(normalized);
      return { rows: [], rowCount: 0 };
    }

    if (normalized.includes("FROM grant_program_snapshots")) {
      return { rows: snapshots, rowCount: snapshots.length };
    }

    if (normalized.includes("GROUP BY status")) {
      const counts = new Map<string, number>();
      for (const p of proposals.values()) {
        counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
      }
      const rows = [...counts.entries()].map(([status, count]) => ({ status, count }));
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("FROM grant_change_proposals WHERE status = $1")) {
      const status = String(params[0]);
      const rows = [...proposals.values()]
        .filter((p) => p.status === status)
        .sort((a, b) => b.detected_at.localeCompare(a.detected_at));
      return { rows, rowCount: rows.length };
    }

    if (normalized.includes("FROM grant_change_proposals WHERE id = $1 FOR UPDATE")) {
      const id = String(params[0]);
      const row = proposals.get(id);
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    if (normalized.startsWith("UPDATE grant_change_proposals")) {
      const [id, decision, reviewedBy, reviewNotes] = params as [
        string,
        string,
        string,
        string | null,
      ];
      const row = proposals.get(id);
      if (!row) return { rows: [], rowCount: 0 };
      const updated: StoredProposal = {
        ...row,
        status: decision,
        reviewed_at: "2026-11-18T10:00:00.000Z",
        reviewed_by: reviewedBy,
        review_notes: reviewNotes,
      };
      proposals.set(id, updated);
      return { rows: [{ ...updated }], rowCount: 1 };
    }

    if (normalized.startsWith("INSERT INTO grant_source_checks")) {
      const [programId, sourceUrl, availabilityJson] = params as [
        string,
        string,
        string,
      ];
      sourceCheckUpserts.push({
        programId,
        sourceUrl,
        availability: JSON.parse(availabilityJson),
      });
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL in mock DB: ${normalized}`);
  }

  const db = {
    query: execute,
    connect: async () => ({
      query: execute,
      release: () => {},
    }),
  } as unknown as Pool;

  return { db, proposals, sourceCheckUpserts, txLog };
}

type TestResponse = {
  status: number;
  headers: Headers;
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
    const req = new http.IncomingMessage(socket as unknown as import("node:net").Socket);
    req.method = method;
    req.url = urlPath;
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
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
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
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
        json: async () => (rawBody ? JSON.parse(rawBody) : null),
      });
      return (origEnd as (...args: unknown[]) => typeof res)(chunk, ...rest);
    }) as typeof res.end;

    res.on("error", reject);

    app(req, res, (err: unknown) => {
      if (err) reject(err);
    });

    if (payload) {
      req.push(payload);
    }
    req.push(null);
  });
}

async function withServer(
  db: Pool,
  getToken: () => MonitorAdminToken | undefined,
  options: MonitorAdminOptions = {},
  fn: (request: Requester) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    const token = getToken();
    res.locals.uid = token?.uid;
    res.locals.firebaseToken = token;
    next();
  });
  app.use("/api/admin/monitor", monitorAdminRouter(db, options));

  const request: Requester = (path, init) =>
    invokeApp(app, init?.method ?? "GET", `/api/admin/monitor${path}`, init?.body);

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

test("isMonitorAdmin enforces production fail-closed, verified emails, UIDs, and emulator dev fallback", async () => {
  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: undefined,
      MONITOR_ADMIN_UIDS: undefined,
      AUTH_MODE: "emulator",
      NODE_ENV: "production",
    },
    () => {
      assert.equal(
        isMonitorAdmin({ uid: "u1", email: "admin@grantfolio.ua", email_verified: true }),
        false,
      );
    },
  );

  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: undefined,
      MONITOR_ADMIN_UIDS: undefined,
      AUTH_MODE: "firebase",
      NODE_ENV: "development",
    },
    () => {
      assert.equal(
        isMonitorAdmin({ uid: "u1", email: "admin@grantfolio.ua", email_verified: true }),
        false,
      );
    },
  );

  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: undefined,
      MONITOR_ADMIN_UIDS: undefined,
      AUTH_MODE: "emulator",
      NODE_ENV: "development",
    },
    () => {
      assert.equal(isMonitorAdmin({ uid: "dev-user" }), true);
      assert.equal(isMonitorAdmin(undefined), false);
    },
  );

  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: " Admin@GrantFolio.ua , ops@grantfolio.ua ",
      MONITOR_ADMIN_UIDS: "uid-super-1",
      AUTH_MODE: "firebase",
      NODE_ENV: "production",
    },
    () => {
      assert.equal(
        isMonitorAdmin({ uid: "u1", email: "admin@grantfolio.ua", email_verified: false }),
        false,
      );
      assert.equal(
        isMonitorAdmin(
          { uid: "u1", email: "admin@grantfolio.ua", email_verified: false },
          { emailVerifiedByOtp: true },
        ),
        true,
      );
      assert.equal(
        isMonitorAdmin(
          { uid: "u2", email: "other@grantfolio.ua", email_verified: false },
          { emailVerifiedByOtp: true },
        ),
        false,
      );
      assert.equal(
        isMonitorAdmin({ uid: "u1", email: "admin@grantfolio.ua" }),
        false,
      );
      assert.equal(
        isMonitorAdmin({ uid: "u1", email: "ADMIN@GRANTFOLIO.UA", email_verified: true }),
        true,
      );
      assert.equal(
        isMonitorAdmin({ uid: "uid-super-1", email: "other@example.com", email_verified: false }),
        true,
      );
      assert.equal(
        isMonitorAdmin({ uid: "regular", email: "user@example.com", email_verified: true }),
        false,
      );
    },
  );
});

test("non-admin user gets 403 on all monitor admin endpoints", async () => {
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
      await withServer(db, () => nonAdmin, {}, async (request) => {
        const proposalId = crypto.randomUUID();
        const responses = await Promise.all([
          request("/status"),
          request("/proposals"),
          request(`/proposals/${proposalId}/review`, {
            method: "POST",
            body: { decision: "approved" },
          }),
          request("/run", {
            method: "POST",
            body: {},
          }),
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

test("admin lists status and proposals with program metadata", async () => {
  await withEnv(
    {
      MONITOR_ADMIN_EMAILS: "admin@grantfolio.ua",
      SMART_MONITOR_AI_ENABLED: "true",
      NODE_ENV: "production",
    },
    async () => {
      const pendingId = crypto.randomUUID();
      const approvedId = crypto.randomUUID();
      const { db } = createMockDb({
        snapshots: [
          {
            program_id: "vlasna-sprava",
            source_url: "https://zakon.rada.gov.ua/laws/show/z1185-26",
            content_hash: "a".repeat(64),
            fetched_at: "2026-11-18T08:00:00.000Z",
            last_changed_at: "2026-11-18T08:00:00.000Z",
            extraction_status: "verified",
            verifier_errors: [],
            last_error: null,
          },
          {
            program_id: "processing-business",
            source_url: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
            content_hash: "b".repeat(64),
            fetched_at: "2026-11-18T08:05:00.000Z",
            last_changed_at: "2026-11-17T08:05:00.000Z",
            extraction_status: "unmodified",
            verifier_errors: [],
            last_error: null,
          },
          {
            program_id: "agro-gardens",
            source_url: "https://diia.gov.ua/services/grant-na-sad",
            content_hash: "c".repeat(64),
            fetched_at: "2026-11-18T08:10:00.000Z",
            last_changed_at: "2026-11-18T08:10:00.000Z",
            extraction_status: "verifier_failed",
            verifier_errors: ["quote_not_found"],
            last_error: null,
          },
          {
            program_id: "uvf-reimbursement",
            source_url: "https://veteranfund.com.ua/projects/20000-2/",
            content_hash: "d".repeat(64),
            fetched_at: "2026-11-18T08:12:00.000Z",
            last_changed_at: "2026-11-18T08:12:00.000Z",
            extraction_status: "fetch_error",
            verifier_errors: [],
            last_error: "http_503",
          },
        ],
        proposals: [
          {
            id: pendingId,
            program_id: "vlasna-sprava",
            field_name: "amount",
            old_value: "до 250 тис. грн",
            new_value: "до 350 тис. грн",
            evidence_quote: "Максимальний розмір гранту до 350 тис. грн",
            confidence: "high",
            status: "pending_review",
            detected_at: "2026-11-18T08:00:00.000Z",
            reviewed_at: null,
            reviewed_by: null,
            review_notes: null,
          },
          {
            id: approvedId,
            program_id: "processing-business",
            field_name: "availability",
            old_value: null,
            new_value: { state: "open", sourceUrl: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo" },
            evidence_quote: "Прийом заявок триває",
            confidence: "high",
            status: "approved",
            detected_at: "2026-11-17T08:00:00.000Z",
            reviewed_at: "2026-11-17T09:00:00.000Z",
            reviewed_by: "admin@grantfolio.ua",
            review_notes: "Перевірено",
          },
        ],
      });

      const adminToken: MonitorAdminToken = {
        uid: "admin-1",
        email: "admin@grantfolio.ua",
        email_verified: true,
      };
      const expectedTitle =
        GRANT_CATALOG.find((p) => p.id === "vlasna-sprava")?.title ?? "vlasna-sprava";

      await withServer(db, () => adminToken, {}, async (request) => {
        const statusRes = await request("/status");
        assert.equal(statusRes.status, 200);
        const statusBody = (await statusRes.json()) as {
          aiEnabled: boolean;
          summary: {
            totalProfiles: number;
            pendingProposals: number;
            verified: number;
            unmodified: number;
            verifierFailed: number;
            aiDisabled: number;
            fetchErrors: number;
          };
          snapshots: Array<{ programId: string; programTitle: string; extractionStatus: string }>;
        };
        assert.equal(statusBody.aiEnabled, true);
        assert.equal(statusBody.summary.totalProfiles, PROGRAM_MONITOR_PROFILES.length);
        assert.equal(statusBody.summary.pendingProposals, 1);
        assert.equal(statusBody.summary.verified, 1);
        assert.equal(statusBody.summary.unmodified, 1);
        assert.equal(statusBody.summary.verifierFailed, 1);
        assert.equal(statusBody.summary.fetchErrors, 1);
        assert.equal(statusBody.snapshots.length, PROGRAM_MONITOR_PROFILES.length);
        const vlasna = statusBody.snapshots.find((s) => s.programId === "vlasna-sprava");
        assert.equal(vlasna?.programTitle, expectedTitle);
        assert.equal(vlasna?.extractionStatus, "verified");

        const proposalsRes = await request("/proposals");
        assert.equal(proposalsRes.status, 200);
        const proposalsBody = (await proposalsRes.json()) as {
          proposals: Array<{ id: string; programTitle: string; status: string }>;
        };
        assert.equal(proposalsBody.proposals.length, 1);
        assert.equal(proposalsBody.proposals[0].id, pendingId);
        assert.equal(proposalsBody.proposals[0].programTitle, expectedTitle);

        const badStatusRes = await request("/proposals?status=invalid");
        assert.equal(badStatusRes.status, 400);
      });
    },
  );
});

test("approving availability proposal updates grant_source_checks and invokes onAvailabilityApproved", async () => {
  const proposalId = crypto.randomUUID();
  const availabilityValue = {
    state: "open",
    basis: "announcement",
    checkedAt: "2026-11-18T08:00:00.000Z",
    validUntil: "2026-11-19T20:00:00.000Z",
    sourceUrl: "https://seedsofbravery.eu/",
    evidence: "Applications are open for Ukrainian tech startups",
    deadlineAt: "2026-12-15T23:59:59.000Z",
  };
  const { db, proposals, sourceCheckUpserts, txLog } = createMockDb({
    proposals: [
      {
        id: proposalId,
        program_id: "seeds-of-bravery-uaseeds",
        field_name: "availability",
        old_value: null,
        new_value: availabilityValue,
        evidence_quote: "Applications are open for Ukrainian tech startups",
        confidence: "high",
        status: "pending_review",
        detected_at: "2026-11-18T08:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
        review_notes: null,
      },
    ],
  });

  let hydratedCount = 0;
  const adminToken: MonitorAdminToken = {
    uid: "admin-1",
    email: "admin@grantfolio.ua",
    email_verified: true,
  };

  await withServer(
    db,
    () => adminToken,
    {
      isAdmin: () => true,
      onAvailabilityApproved: async () => {
        hydratedCount += 1;
      },
    },
    async (request) => {
      const res = await request(`/proposals/${proposalId}/review`, {
        method: "POST",
        body: { decision: "approved", notes: "Verified on portal" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        proposal: { status: string; reviewedBy: string; reviewNotes: string };
      };
      assert.equal(body.proposal.status, "approved");
      assert.equal(body.proposal.reviewedBy, "admin@grantfolio.ua");
      assert.equal(body.proposal.reviewNotes, "Verified on portal");

      assert.deepEqual(txLog, ["BEGIN", "COMMIT"]);
      assert.equal(proposals.get(proposalId)?.status, "approved");
      assert.equal(sourceCheckUpserts.length, 1);
      assert.equal(sourceCheckUpserts[0].programId, "seeds-of-bravery-uaseeds");
      assert.equal(sourceCheckUpserts[0].sourceUrl, "https://seedsofbravery.eu/");
      const storedAvailability = sourceCheckUpserts[0].availability as Record<string, unknown>;
      assert.equal(storedAvailability.state, availabilityValue.state);
      assert.equal(storedAvailability.sourceUrl, availabilityValue.sourceUrl);
      assert.equal(storedAvailability.evidence, availabilityValue.evidence);
      assert.equal(storedAvailability.deadlineAt, availabilityValue.deadlineAt);
      assert.ok(Date.parse(String(storedAvailability.validUntil)) > Date.parse(String(storedAvailability.checkedAt)));
      assert.equal(hydratedCount, 1);

      // Reviewing the same proposal a second time returns 409
      const secondRes = await request(`/proposals/${proposalId}/review`, {
        method: "POST",
        body: { decision: "rejected" },
      });
      assert.equal(secondRes.status, 409);
      assert.deepEqual(await secondRes.json(), { error: "already_reviewed" });
    },
  );
});

test("a calendar-based opening still requires confirmation from the service", async () => {
  const proposalId = crypto.randomUUID();
  const { db, proposals, sourceCheckUpserts } = createMockDb({
    proposals: [{
      id: proposalId,
      program_id: "vlasna-sprava",
      field_name: "availability",
      old_value: null,
      new_value: { state: "open", sourceUrl: "https://zakon.rada.gov.ua/laws/show/z1185-26", deadlineAt: "2026-11-27T21:59:59Z" },
      evidence_quote: "Календар містить дату подання",
      confidence: "high",
      status: "pending_review",
      detected_at: "2026-11-18T08:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      review_notes: null,
    }],
  });
  await withServer(db, () => ({ uid: "admin" }), { isAdmin: () => true }, async request => {
    const res = await request(`/proposals/${proposalId}/review`, {
      method: "POST",
      body: { decision: "approved" },
    });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "availability_requires_service_confirmation" });
    assert.equal(proposals.get(proposalId)?.status, "pending_review");
    assert.equal(sourceCheckUpserts.length, 0);
  });
});

test("rejecting material proposal updates proposal without touching grant_source_checks", async () => {
  const proposalId = crypto.randomUUID();
  const { db, proposals, sourceCheckUpserts } = createMockDb({
    proposals: [
      {
        id: proposalId,
        program_id: "vlasna-sprava",
        field_name: "amount",
        old_value: "до 250 тис. грн",
        new_value: "до 500 тис. грн",
        evidence_quote: "до 500 тис. грн для прифронтових областей",
        confidence: "medium",
        status: "pending_review",
        detected_at: "2026-11-18T08:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
        review_notes: null,
      },
    ],
  });

  let hydratedCount = 0;
  await withServer(
    db,
    () => ({ uid: "admin-uid" }),
    {
      isAdmin: () => true,
      onAvailabilityApproved: async () => {
        hydratedCount += 1;
      },
    },
    async (request) => {
      const res = await request(`/proposals/${proposalId}/review`, {
        method: "POST",
        body: {
          decision: "rejected",
          notes: "Only applies to frontline oblasts, base cap unchanged",
        },
      });
      assert.equal(res.status, 200);
      assert.equal(proposals.get(proposalId)?.status, "rejected");
      assert.equal(
        proposals.get(proposalId)?.review_notes,
        "Only applies to frontline oblasts, base cap unchanged",
      );
      assert.equal(sourceCheckUpserts.length, 0);
      assert.equal(hydratedCount, 0);
    },
  );
});

test("review validates UUID, body schema, and missing proposals", async () => {
  const { db } = createMockDb();
  await withServer(
    db,
    () => ({ uid: "admin-uid" }),
    { isAdmin: () => true },
    async (request) => {
      const invalidIdRes = await request("/proposals/not-a-uuid/review", {
        method: "POST",
        body: { decision: "approved" },
      });
      assert.equal(invalidIdRes.status, 400);
      assert.deepEqual(await invalidIdRes.json(), { error: "invalid_proposal_id" });

      const missingRes = await request(`/proposals/${crypto.randomUUID()}/review`, {
        method: "POST",
        body: { decision: "approved" },
      });
      assert.equal(missingRes.status, 404);

      const badBodyRes = await request(`/proposals/${crypto.randomUUID()}/review`, {
        method: "POST",
        body: { decision: "approved", extra: true },
      });
      assert.equal(badBodyRes.status, 400);
    },
  );
});

test("approving availability proposal with unsafe sourceUrl fails with 400 and rolls back", async () => {
  const proposalId = crypto.randomUUID();
  const { db, proposals, sourceCheckUpserts, txLog } = createMockDb({
    proposals: [
      {
        id: proposalId,
        program_id: "seeds-of-bravery-uaseeds",
        field_name: "availability",
        old_value: null,
        new_value: { state: "open", sourceUrl: "http://127.0.0.1/internal" },
        evidence_quote: "Open now",
        confidence: "high",
        status: "pending_review",
        detected_at: "2026-11-18T08:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
        review_notes: null,
      },
    ],
  });

  await withServer(
    db,
    () => ({ uid: "admin-uid" }),
    { isAdmin: () => true },
    async (request) => {
      const res = await request(`/proposals/${proposalId}/review`, {
        method: "POST",
        body: { decision: "approved" },
      });
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "invalid_availability_proposal" });
      assert.deepEqual(txLog, ["BEGIN", "ROLLBACK"]);
      assert.equal(proposals.get(proposalId)?.status, "pending_review");
      assert.equal(sourceCheckUpserts.length, 0);
    },
  );
});

test("POST /run prevents concurrent runs with 429 and refreshes catalog after completion", async () => {
  const { db } = createMockDb();
  let releaseFirstRun!: () => void;
  let notifyStarted!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let hydratedCount = 0;
  const requestedPrograms: Array<string | undefined> = [];

  await withServer(
    db,
    () => ({ uid: "admin-uid" }),
    {
      isAdmin: () => true,
      onAvailabilityApproved: async () => {
        hydratedCount += 1;
      },
      runMonitor: async (programId) => {
        requestedPrograms.push(programId);
        notifyStarted();
        await new Promise<void>((resolve) => {
          releaseFirstRun = resolve;
        });
        return { total: 1, verified: 1, proposalsCreated: 0 };
      },
    },
    async (request) => {
      const unknownRes = await request("/run", {
        method: "POST",
        body: { programId: "nonexistent-program" },
      });
      assert.equal(unknownRes.status, 400);

      const firstPromise = request("/run", {
        method: "POST",
        body: { programId: "vlasna-sprava" },
      });

      await startedPromise;

      const concurrentRes = await request("/run", {
        method: "POST",
        body: {},
      });
      assert.equal(concurrentRes.status, 429);
      assert.deepEqual(await concurrentRes.json(), { error: "monitor_busy" });

      releaseFirstRun();
      const firstRes = await firstPromise;
      assert.equal(firstRes.status, 200);
      assert.deepEqual(await firstRes.json(), {
        summary: { total: 1, verified: 1, proposalsCreated: 0 },
      });
      assert.deepEqual(requestedPrograms, ["vlasna-sprava"]);
      assert.equal(hydratedCount, 1);
    },
  );
});
