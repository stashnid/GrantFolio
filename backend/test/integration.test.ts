import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import express from "express";
import { assistantRouter } from "../src/assistant.js";
import pg from "pg";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";

const config = configuration();
if (
  process.env.AUTH_MODE !== "emulator" ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !config.projectId.startsWith("demo-")
)
  throw new Error("Integration tests require a demo Firebase emulator");
initializeApp({ projectId: config.projectId });
const db = new pg.Pool({ connectionString: config.databaseUrl });
const server = createApp(db).listen(0, "127.0.0.1");
after(async () => {
  server.close();
  await db.end();
});
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("No test port");
const base = `http://127.0.0.1:${address.port}`;
async function signup() {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${crypto.randomUUID()}@example.test`,
        password: "example-password",
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { idToken: string }).idToken;
}
async function api(token?: string, method = "GET", data?: unknown) {
  return fetch(`${base}/api/me`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
test("real emulator identities can only read and update their own SQL profile", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const one = { businessName: "A", region: "Kyiv", description: "First" };
  const two = { businessName: "B", region: "Lviv", description: "Second" };
  assert.equal((await api(a, "PUT", one)).status, 200);
  assert.deepEqual(
    ((await (await api(b)).json()) as { profile: unknown }).profile,
    { businessName: "", region: "", description: "" },
  );
  assert.equal((await api(b, "PUT", two)).status, 200);
  assert.deepEqual(
    ((await (await api(a)).json()) as { profile: unknown }).profile,
    one,
  );
  assert.deepEqual(
    ((await (await api(b)).json()) as { profile: unknown }).profile,
    two,
  );
  assert.equal(
    (await api(a, "PUT", { ...one, owner_id: "another-user" })).status,
    400,
  );
  assert.equal((await api()).status, 401);
  assert.equal((await api("invalid.token.value")).status, 401);
  assert.equal(
    (await api(a, "PUT", { ...one, businessName: "x".repeat(161) })).status,
    400,
  );
  assert.equal((await api(a, "PUT", { ...one, region: 42 })).status, 400);
  const parts = a.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  payload.exp = 1;
  const expired = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
  assert.equal((await api(expired)).status, 401);
  const wrongScheme = await fetch(`${base}/api/me`, {
    headers: { Authorization: `Basic ${a}` },
  });
  assert.equal(wrongScheme.status, 401);
});

test("production refuses emulator configuration", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => configuration(), /emulator/);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test("cases isolate owners and serialize budget commands", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  async function call(
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const created = await call(a, "/api/cases", "POST", { title: "Чернетка" });
  assert.equal(created.status, 201);
  const c = ((await created.json()) as { case: { id: string } }).case;
  const path = `/api/cases/${c.id}`;
  assert.equal((await call(b, path)).status, 404);
  assert.deepEqual(
    ((await (await call(b, "/api/cases")).json()) as { cases: unknown[] })
      .cases,
    [],
  );
  const items = [{ name: "Обладнання", quantity: 3, unitPriceKopecks: 1999 }];
  const command = {
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    items,
  };
  assert.equal((await call(b, `${path}/budget`, "PUT", command)).status, 404);
  const duplicate = await Promise.all([
    call(a, `${path}/budget`, "PUT", command),
    call(a, `${path}/budget`, "PUT", command),
  ]);
  assert.deepEqual(
    duplicate.map((r) => r.status),
    [200, 200],
  );
  const results = await Promise.all(
    duplicate.map(
      (r) =>
        r.json() as Promise<{
          case: { revision: number; totalKopecks: number };
        }>,
    ),
  );
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].case.revision, 1);
  assert.equal(results[0].case.totalKopecks, 5997);
  assert.equal(
    (await call(a, `${path}/budget`, "PUT", { ...command, items: [] })).status,
    409,
  );
  const writes = await Promise.all([
    call(a, `${path}/budget`, "PUT", {
      ...command,
      expectedRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    }),
    call(a, `${path}/budget`, "PUT", {
      ...command,
      expectedRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    }),
  ]);
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await call(a, `${path}/budget`, "PUT", {
        ...command,
        expectedRevision: 2,
        idempotencyKey: crypto.randomUUID(),
        items: [{ name: "x", quantity: 1, unitPriceKopecks: 1.5 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(a, `${path}/budget`, "PUT", {
        ...command,
        expectedRevision: 2,
        idempotencyKey: crypto.randomUUID(),
        items: Array(10).fill({
          name: "x",
          quantity: 1000000,
          unitPriceKopecks: 1000000000,
        }),
      })
    ).status,
    400,
  );
  // Replaying an older command must not overwrite a later revision.
  const retry = await call(a, `${path}/budget`, "PUT", command);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), results[0]);
  const current = await call(a, path);
  assert.equal(
    ((await current.json()) as { case: { revision: number } }).case.revision,
    2,
  );
  assert.equal((await call(b, `${path}/budget`, "PUT", command)).status, 404);

  // All 100 valid items, including multi-byte Ukrainian names, fit the API limit.
  const maxItems = Array.from({ length: 100 }, () => ({
    name: "я".repeat(160),
    quantity: 1,
    unitPriceKopecks: 1,
  }));
  const maxBudget = await call(a, `${path}/budget`, "PUT", {
    expectedRevision: 2,
    idempotencyKey: crypto.randomUUID(),
    items: maxItems,
  });
  assert.equal(maxBudget.status, 200);
  assert.equal(
    ((await maxBudget.json()) as { case: { totalKopecks: number } }).case
      .totalKopecks,
    100,
  );
  const oversized = await call(a, `${path}/budget`, "PUT", {
    expectedRevision: 3,
    idempotencyKey: crypto.randomUUID(),
    items: [{ name: "я".repeat(70000), quantity: 1, unitPriceKopecks: 1 }],
  });
  assert.equal(oversized.status, 413);
  const history = await db.query(
    "SELECT revision FROM budget_history WHERE case_id=$1 ORDER BY revision",
    [c.id],
  );
  assert.deepEqual(
    history.rows.map((row) => row.revision),
    [1, 2, 3],
  );
});

test("case details persist privately, replay safely, and drive general readiness", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const call = (token: string, path: string, method = "GET", body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const created = await call(a, "/api/cases", "POST", { title: "Draft" });
  const c = (
    (await created.json()) as {
      case: { id: string; details: Record<string, string> };
    }
  ).case;
  const path = `/api/cases/${c.id}`;
  const empty = {
    projectDescription: "",
    customers: "",
    salesChannels: "",
    implementationPlan: "",
    expectedResults: "",
  };
  assert.deepEqual(c.details, empty);
  const initial = (await (await call(a, `${path}/readiness`)).json()) as {
    revision: number;
    checks: { status: string }[];
  };
  assert.equal(initial.revision, 0);
  assert.equal(initial.checks.length, 6);
  assert.ok(initial.checks.every((check) => check.status === "missing"));
  const details = {
    ...empty,
    projectDescription: "  Idea  ",
    customers: "People",
  };
  const command = {
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    details,
  };
  assert.equal((await call(b, `${path}/details`, "PUT", command)).status, 404);
  assert.equal((await call(b, `${path}/readiness`)).status, 404);
  assert.equal(
    (
      await call(a, `${path}/details`, "PUT", {
        ...command,
        details: { ...details, extra: "x" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(a, `${path}/details`, "PUT", {
        ...command,
        details: { ...details, customers: "x".repeat(3001) },
      })
    ).status,
    400,
  );
  const responses = await Promise.all([
    call(a, `${path}/details`, "PUT", command),
    call(a, `${path}/details`, "PUT", command),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  const saved = (await responses[0].json()) as {
    case: { revision: number; details: typeof details; items: unknown[] };
  };
  assert.deepEqual(await responses[1].json(), saved);
  assert.equal(saved.case.revision, 1);
  assert.equal(saved.case.details.projectDescription, "Idea");
  assert.deepEqual(saved.case.items, []);
  assert.equal(
    (await call(a, `${path}/details`, "PUT", { ...command, details: empty }))
      .status,
    409,
  );
  const staleBudget = {
    expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(),
    items: [{ name: "x", quantity: 1, unitPriceKopecks: 100 }],
  };
  assert.equal(
    (await call(a, `${path}/budget`, "PUT", staleBudget)).status,
    409,
  );
  assert.equal(
    (
      await call(a, `${path}/budget`, "PUT", {
        ...staleBudget,
        expectedRevision: 1,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    await (await call(a, `${path}/details`, "PUT", command)).json(),
    saved,
  );
  const current = (await (await call(a, path)).json()) as {
    case: {
      revision: number;
      details: typeof details;
      items: unknown[];
      totalKopecks: number;
    };
  };
  assert.equal(current.case.revision, 2);
  assert.deepEqual(current.case.details, {
    ...details,
    projectDescription: "Idea",
  });
  assert.equal(current.case.items.length, 1);
  assert.equal(current.case.totalKopecks, 100);
  const ready = (await (await call(a, `${path}/readiness`)).json()) as {
    revision: number;
    checks: { id: string; status: string }[];
  };
  assert.equal(ready.revision, 2);
  assert.equal(
    ready.checks.find((check) => check.id === "budget")?.status,
    "complete",
  );
  assert.equal(
    ready.checks.find((check) => check.id === "salesChannels")?.status,
    "missing",
  );
});


test("draft export is private and reflects the saved details and budget revision", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const call = (token: string | undefined, path: string, method = "GET", body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const created = await call(a, "/api/cases", "POST", { title: "Майстерня" });
  const id = ((await created.json()) as { case: { id: string } }).case.id;
  const path = `/api/cases/${id}`;
  assert.equal((await call(undefined, `${path}/draft-export`)).status, 401);
  assert.equal((await call(b, `${path}/draft-export`)).status, 404);
  assert.equal((await call(a, "/api/cases/bad/draft-export")).status, 404);
  const initial = await call(a, `${path}/draft-export`);
  assert.equal(initial.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(initial.headers.get("content-disposition"), 'attachment; filename="grantfolio-project.txt"');
  assert.equal(initial.headers.get("cache-control"), "no-store");
  const empty = await initial.text();
  assert.match(empty, /Робоча чернетка\. Не офіційна заявка\./);
  assert.match(empty, /Версія: 0/);
  assert.equal((empty.match(/Не вказано/g) ?? []).length, 6);
  const details = { projectDescription: "Український опис", customers: "Клієнти", salesChannels: "Онлайн", implementationPlan: "План", expectedResults: "Результат" };
  assert.equal((await call(a, `${path}/details`, "PUT", { expectedRevision: 0, idempotencyKey: crypto.randomUUID(), details })).status, 200);
  assert.equal((await call(a, `${path}/budget`, "PUT", { expectedRevision: 1, idempotencyKey: crypto.randomUUID(), items: [{ name: "Інструмент", quantity: 3, unitPriceKopecks: 1999 }, { name: "Матеріали", quantity: 2, unitPriceKopecks: 1 }] })).status, 200);
  const result = await (await call(a, `${path}/draft-export`)).text();
  assert.match(result, /Назва проєкту: Майстерня/);
  assert.match(result, /Версія: 2/);
  for (const value of Object.values(details)) assert.ok(result.includes(value));
  assert.match(result, /3 × 19,99 грн = 59,97 грн/);
  assert.match(result, /2 × 0,01 грн = 0,02 грн/);
  assert.match(result, /Загалом: 59,99 грн/);
});


test("assistant history isolates owners, paginates tied timestamps, and preserves snapshot revisions", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const create = async (token: string) => {
    const response = await fetch(`${base}/api/cases`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "History" }) });
    return ((await response.json()) as { case: { id: string } }).case.id;
  };
  const [id, otherId] = await Promise.all([create(a), create(b)]);
  const owner = (await getAuth().verifyIdToken(a)).uid;
  const otherOwner = (await getAuth().verifyIdToken(b)).uid;
  const ids = Array.from({ length: 21 }, () => crypto.randomUUID()).sort();
  for (const exchangeId of ids) await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision,created_at) VALUES($1,$2,$3,'Q','A',0,'2026-01-01T00:00:00Z')", [exchangeId,id,owner]);
  const foreignId = crypto.randomUUID();
  await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision) VALUES($1,$2,$3,'private','private',0)", [foreignId,otherId,otherOwner]);
  let calls = 0;
  const app = express(); app.use(express.json());
  app.use(async (req, res, next) => { try { res.locals.uid = (await getAuth().verifyIdToken((req.header("authorization") ?? "").replace(/^Bearer /, ""))).uid; next(); } catch { res.sendStatus(401); } });
  app.use(assistantRouter(db, async (snapshot) => { calls++; assert.equal(snapshot.conversation?.length, 2); assert.ok(snapshot.conversation?.every(turn => turn.question === "Q" && turn.reply === "A" && !turn.stale && !turn.truncated)); await db.query("UPDATE cases SET revision=revision+1 WHERE id=$1", [id]); return "Generated"; }));
  const historyServer = app.listen(0, "127.0.0.1"); await once(historyServer, "listening");
  const port = (historyServer.address() as {port: number}).port;
  const call = (token: string, path: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call(b, `${id}/assistant/history`)).status, 404);
    assert.equal((await call(a, `${id}/assistant/history?before=${foreignId}`)).status, 404);
    const first = await (await call(a, `${id}/assistant/history`)).json() as {exchanges: {id:string; stale:boolean}[]; hasMore:boolean; nextBefore:string};
    assert.deepEqual(first.exchanges.map(x => x.id), ids.slice(1)); assert.equal(first.hasMore,true); assert.equal(first.nextBefore,ids[1]);
    const second = await (await call(a, `${id}/assistant/history?before=${first.nextBefore}`)).json() as {exchanges:{id:string}[];hasMore:boolean;nextBefore:null};
    assert.deepEqual(second.exchanges.map(x => x.id), ids.slice(0,1)); assert.equal(second.hasMore,false); assert.equal(second.nextBefore,null); assert.equal(calls,0);
    const response = await call(a, `${id}/assistant`, "POST", { expectedRevision: 0, message: "Question" }); assert.equal(response.status,200);
    const generated = await response.json() as {revision:number;stale:boolean;exchange:{id:string;question:string;revision:number;stale:boolean}};
    assert.equal(generated.revision,0); assert.equal(generated.stale,true); assert.equal(generated.exchange.question,"Question"); assert.equal(generated.exchange.stale,true);
    const history = await (await call(a, `${id}/assistant/history`)).json() as {exchanges:{id:string;revision:number;stale:boolean}[]};
    assert.ok(history.exchanges.every(x => x.revision === 0 && x.stale)); assert.ok(history.exchanges.some(x => x.id === generated.exchange.id)); assert.equal(calls,1);
  } finally { await new Promise<void>((resolve,reject) => historyServer.close(e => e ? reject(e) : resolve())); }
});
