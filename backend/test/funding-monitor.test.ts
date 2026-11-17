import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import {
  createFundingMonitor,
  parseFundingResults,
  canonicalFundingUrl,
} from "../src/funding-monitor.js";
const portal =
  "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const identifier = "HORIZON-TEST-2027-SME-01";
function row(id = identifier, language = "en") {
  return {
    language,
    url: portal + id,
    metadata: {
      identifier: [id],
      title: ["Innovative support for Ukrainian SMEs"],
      language: [language],
      type: ["1"],
      DATASOURCE: ["SEDIA"],
      status: ["31094502"],
      deadlineDate: ["2027-01-20T00:00:00.000+0000"],
      startDate: ["2026-11-01T00:00:00.000+0000"],
    },
  };
}
function response(results = [row()], totalResults = results.length) {
  return Response.json({ results, totalResults });
}
function memoryDb() {
  const candidates = new Map<
    string,
    { candidate: unknown; last_seen_at: Date }
  >();
  let state: Record<string, unknown> | null = null;
  let snapshot: { candidates: typeof candidates; state: typeof state } | null =
    null;
  let lock = true;
  const query = async (
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: any[] }> => {
    if (sql === "BEGIN") {
      snapshot = {
        candidates: new Map(candidates),
        state: state ? { ...state } : null,
      };
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      if (snapshot) {
        candidates.clear();
        for (const [k, v] of snapshot.candidates) candidates.set(k, v);
        state = snapshot.state;
        snapshot = null;
      }
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      snapshot = null;
      return { rows: [] };
    }
    if (sql.includes("pg_try_advisory_xact_lock"))
      return { rows: [{ acquired: lock }] };
    if (sql.startsWith("INSERT INTO funding_discovery_candidates")) {
      candidates.set(String(values[1]), {
        candidate: JSON.parse(String(values[2])),
        last_seen_at: values[3] as Date,
      });
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO funding_discovery_sources")) {
      if (sql.includes("last_success_at"))
        state = {
          last_attempt_at: values[1],
          last_success_at: values[1],
          last_error: null,
          discovered_count: values[2],
          rejected_count: values[3],
          truncated: values[4],
        };
      else
        state = {
          last_success_at: null,
          discovered_count: 0,
          rejected_count: 0,
          truncated: false,
          ...state,
          last_attempt_at: values[1],
          last_error: values[2],
        };
      return { rows: [] };
    }
    if (sql.startsWith("SELECT candidate"))
      return { rows: [...candidates.values()] };
    if (sql.startsWith("SELECT last_attempt_at"))
      return { rows: state ? [state] : [] };
    throw Error(`Unexpected SQL ${sql}`);
  };
  return {
    db: {
      query,
      connect: async () => ({ query, release() {} }),
    } as unknown as Pool,
    candidates,
    setLock(value: boolean) {
      lock = value;
    },
  };
}
const originalIds = new Set(GRANT_CATALOG.map((p) => p.id));
afterEach(() => {
  for (let i = GRANT_CATALOG.length - 1; i >= 0; i--)
    if (!originalIds.has(GRANT_CATALOG[i].id)) GRANT_CATALOG.splice(i, 1);
});
test("strict parser rejects translations, FAQs, arbitrary hosts, malformed titles and mismatched identifiers", () => {
  const faq = row();
  faq.metadata.type = ["2"];
  const evil = row();
  evil.url = "https://ec.europa.eu.evil.example/";
  const wrong = row();
  wrong.url = portal + "ANOTHER-ID";
  const html = row();
  html.metadata.title = ["<script>bad</script>"];
  const parsed = parseFundingResults({
    results: [row(), row(identifier, "de"), faq, evil, wrong, html],
    totalResults: 6,
  });
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.rejected, 5);
  assert.equal(
    canonicalFundingUrl(portal + identifier + "?lang=en"),
    portal + identifier,
  );
  assert.equal(
    canonicalFundingUrl(portal.replace("https", "http") + identifier),
    null,
  );
  assert.equal(
    canonicalFundingUrl(
      "https://user@ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/" +
        identifier,
    ),
    null,
  );
  assert.throws(
    () => parseFundingResults({ results: "not-array", totalResults: 1 }),
    /invalid_search_response/,
  );
  assert.throws(
    () => parseFundingResults({ results: [], totalResults: "1" }),
    /invalid_search_response/,
  );
});
test("discovery persists stable candidates, uses Blob query, deduplicates and never auto-qualifies", async () => {
  const memory = memoryDb();
  let requests = 0;
  const fake: typeof fetch = async (_url, init) => {
    requests++;
    assert.equal(init?.redirect, "error");
    assert.equal(init?.method, "POST");
    const body = init?.body as FormData,
      file = body.get("query") as File;
    assert.equal(file.type, "application/json");
    assert.match(await file.text(), /"language":\["en"\]/);
    return response([row(), row(), row(identifier, "fr")]);
  };
  const monitor = createFundingMonitor(
    memory.db,
    fake,
    () => new Date("2026-11-17T10:00:00Z"),
    { includeBusinessFeed: false },
  );
  const result = await monitor.refresh();
  assert.equal(result.discovered, 1);
  assert.equal(requests, 1);
  assert.equal(memory.candidates.size, 1);
  const found = GRANT_CATALOG.find(
    (p) => p.officialUrl === portal + identifier,
  )!;
  assert.equal(found.reviewStatus, "needs-review");
  assert.equal(found.intakeStatus, "unconfirmed");
  assert.equal(found.availability?.state, "unknown");
  assert.equal(found.programKind, "call");
  assert.equal(found.availability?.deadlineAt, null);
  assert.equal(found.planningLimitKopecks, undefined);
  assert.match(found.eligibilityUkraine!, /Потрібно перевірити/);
  await monitor.refresh();
  assert.equal(
    GRANT_CATALOG.filter((p) => p.officialUrl === portal + identifier).length,
    1,
  );
  const fresh = createFundingMonitor(memory.db, undefined, undefined, {
    includeBusinessFeed: false,
  });
  await fresh.hydrate();
  assert.equal(fresh.status()[0].lastSuccessAt, "2026-11-17T10:00:00.000Z");
});
test("source failure preserves candidates and previous last success; expiry cannot make unknown eligible", async () => {
  const memory = memoryDb();
  let broken = false,
    at = new Date("2026-11-17T10:00:00Z");
  const fake: typeof fetch = async () => {
    if (broken) throw Error("network_unavailable");
    return response();
  };
  const monitor = createFundingMonitor(memory.db, fake, () => at, {
    includeBusinessFeed: false,
  });
  await monitor.refresh();
  const saved = JSON.stringify([...memory.candidates.values()]);
  at = new Date("2027-02-01T10:00:00Z");
  broken = true;
  assert.equal((await monitor.refresh()).failed, 1);
  assert.equal(JSON.stringify([...memory.candidates.values()]), saved);
  assert.equal(monitor.status()[0].lastSuccessAt, "2026-11-17T10:00:00.000Z");
  assert.equal(monitor.status()[0].lastError, "network_unavailable");
  const entry = GRANT_CATALOG.find(
    (p) => p.officialUrl === portal + identifier,
  )!;
  assert.equal(entry.availability?.state, "unknown");
  assert.ok(new Date(entry.availability!.validUntil) < at);
});
test("pagination is bounded to five pages and exposes truncation", async () => {
  const memory = memoryDb();
  let requests = 0;
  const fake: typeof fetch = async () => {
    requests++;
    return response([row("HORIZON-TEST-" + requests)], 400);
  };
  const monitor = createFundingMonitor(memory.db, fake, undefined, {
    includeBusinessFeed: false,
  });
  assert.equal((await monitor.refresh()).truncated, true);
  assert.equal(requests, 5);
  assert.equal(monitor.status()[0].counts.discovered, 5);
});
test("failure on a later page cannot partially replace persisted data", async () => {
  const memory = memoryDb();
  let fail = false;
  const fake: typeof fetch = async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("pageNumber"));
    if (fail && page === 2) return new Response("bad", { status: 503 });
    return response(
      [row(fail ? "HORIZON-NEW-FAILED" : identifier)],
      fail ? 100 : 1,
    );
  };
  const monitor = createFundingMonitor(memory.db, fake, undefined, {
    includeBusinessFeed: false,
  });
  await monitor.refresh();
  fail = true;
  assert.equal((await monitor.refresh()).failed, 1);
  assert.equal(memory.candidates.size, 1);
  assert.equal(memory.candidates.has("HORIZON-NEW-FAILED"), false);
});
test("invalid media, oversized declared and streamed bodies, invalid JSON and redirected response fail closed", async () => {
  const invalid = [
    () =>
      new Response("<html>error</html>", {
        headers: { "content-type": "text/html" },
      }),
    () =>
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "4194305",
        },
      }),
    () =>
      new Response(" ".repeat(4194305), {
        headers: { "content-type": "application/json" },
      }),
    () =>
      new Response("{bad", { headers: { "content-type": "application/json" } }),
    () => {
      const res = response();
      Object.defineProperty(res, "url", {
        value: "https://evil.example/search",
      });
      return res;
    },
  ];
  for (const make of invalid) {
    const memory = memoryDb(),
      monitor = createFundingMonitor(memory.db, async () => make(), undefined, {
        includeBusinessFeed: false,
      });
    assert.equal((await monitor.refresh()).failed, 1);
    assert.equal(memory.candidates.size, 0);
    assert.ok(monitor.status()[0].lastError);
  }
});
test("concurrent calls share work and a held shared lock skips remote access", async () => {
  const memory = memoryDb();
  let requests = 0;
  const monitor = createFundingMonitor(
    memory.db,
    async () => {
      requests++;
      return response();
    },
    undefined,
    { includeBusinessFeed: false },
  );
  await Promise.all([monitor.refresh(), monitor.refresh()]);
  assert.equal(requests, 1);
  memory.setLock(false);
  assert.equal((await monitor.refresh()).skipped, 1);
  assert.equal(requests, 1);
});
test("existing curated official URL and approved discovered entries are never overwritten", async () => {
  const memory = memoryDb(),
    monitor = createFundingMonitor(
      memory.db,
      async () => response(),
      undefined,
      { includeBusinessFeed: false },
    );
  const curated = {
    ...GRANT_CATALOG[0],
    id: "test-curated-eu",
    title: "Manually verified",
    officialUrl: portal + identifier,
    reviewStatus: "curated" as const,
  };
  GRANT_CATALOG.push(curated);
  await monitor.refresh();
  assert.equal(
    GRANT_CATALOG.filter((p) => p.officialUrl === curated.officialUrl).length,
    1,
  );
  assert.equal(curated.title, "Manually verified");
  GRANT_CATALOG.splice(GRANT_CATALOG.indexOf(curated), 1);
  await monitor.hydrate();
  const discovered = GRANT_CATALOG.find(
    (p) => p.officialUrl === portal + identifier,
  )!;
  discovered.reviewStatus = "curated";
  discovered.title = "Approved title";
  await monitor.refresh();
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === discovered.id)?.title,
    "Approved title",
  );
});

test("EU timeout is bounded even when fetch ignores abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const memory = memoryDb();
  const monitor = createFundingMonitor(
    memory.db,
    async () => new Promise<Response>(() => {}),
    undefined,
    { includeBusinessFeed: false },
  );
  const pending = monitor.refresh();
  // Allow the fake connection and BEGIN/lock awaits to reach the HTTP timeout.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  t.mock.timers.tick(10001);
  assert.equal((await pending).failed, 1);
  assert.equal(monitor.status()[0].lastError, "timeout");
});

test("EU and business RSS failures are independent and feed candidates survive hydration", async () => {
  const eu = memoryDb(),
    feed = memoryDb();
  const route = async (sql: string, values: unknown[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
      await eu.db.query(sql);
      await feed.db.query(sql);
      return { rows: [] };
    }
    return (
      String(values[0]).includes("prostir-business") ? feed.db : eu.db
    ).query(sql, values);
  };
  const db = {
    query: route,
    connect: async () => ({ query: route, release() {} }),
  } as unknown as Pool;
  let euFails = true,
    feedFails = false;
  const fake: typeof fetch = async (url) => {
    if (String(url).includes("api.tech.ec.europa.eu")) {
      if (euFails) throw Error("EU unavailable");
      return response();
    }
    if (feedFails) return new Response("unavailable", { status: 503 });
    return new Response(
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Publisher</title><item><title>Грант для бізнесу</title><link>https://www.prostir.ua/?grants=business-monitor-test</link><description>Підтримка підприємців України</description></item></channel></rss>',
    );
  };
  const monitor = createFundingMonitor(db, fake);
  const first = await monitor.refresh();
  assert.equal(first.checked, 1);
  assert.equal(first.failed, 1);
  assert.equal(first.discovered, 1);
  assert.equal(monitor.status()[0].lastError, "EU unavailable");
  assert.equal(monitor.status()[1].lastError, null);
  const feedSuccess = monitor.status()[1].lastSuccessAt;
  assert.ok(
    GRANT_CATALOG.some(
      (p) =>
        p.officialUrl.includes("business-monitor-test") &&
        p.reviewStatus === "needs-review",
    ),
  );
  euFails = false;
  feedFails = true;
  const second = await monitor.refresh();
  assert.equal(second.checked, 1);
  assert.equal(second.failed, 1);
  assert.equal(monitor.status()[0].lastError, null);
  assert.equal(monitor.status()[1].lastSuccessAt, feedSuccess);
  assert.equal(feed.candidates.size, 1);
  const restored = createFundingMonitor(db, fake);
  await restored.hydrate();
  assert.ok(restored.status()[1].lastError?.includes("business_feed_http"));
});

test("a newly curated record replaces an already hydrated unreviewed URL duplicate", async () => {
  const memory = memoryDb(),
    monitor = createFundingMonitor(
      memory.db,
      async () => response(),
      undefined,
      { includeBusinessFeed: false },
    );
  await monitor.refresh();
  const curated = {
    ...GRANT_CATALOG[0],
    id: "test-new-curated-eu",
    title: "New reviewed program",
    officialUrl: portal + identifier,
    reviewStatus: "curated" as const,
  };
  GRANT_CATALOG.push(curated);
  await monitor.hydrate();
  const matching = GRANT_CATALOG.filter(
    (p) => p.officialUrl === curated.officialUrl,
  );
  assert.equal(matching.length, 1);
  assert.equal(matching[0].id, curated.id);
});
