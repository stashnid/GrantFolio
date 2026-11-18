import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  const version = method === "PUT" && token ? (await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).headers.get("etag") : null;
  return fetch(`${base}/api/me`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(version ? { "If-Match": version } : {}),
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

test("structured profiles round-trip, preserve omitted details, isolate owners, and reject invalid fields", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const base = { businessName: "Business", description: "Description", region: "Kyiv" };
  const details = { contactName: "Name", phone: "+380501234567", website: "https://example.com", legalForm: "fop", registrationYear: "2020", industry: "Food", kved: "10.10", city: "Kyiv", teamSize: "5", teamExperience: "Experience", grantExperience: "None", fundingPurpose: "Equipment", requestedAmount: "1000.50", ownContribution: "100" };
  const response = await api(a, "PUT", { ...base, details: { ...details, contactName: " Name " } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { profile: unknown }).profile, { ...base, details });
  assert.deepEqual((await (await api(a)).json() as { profile: unknown }).profile, { ...base, details });
  assert.deepEqual((await (await api(b)).json() as { profile: unknown }).profile, { businessName: "", description: "", region: "" });
  assert.equal((await api(b, "PUT", { ...base, details: { city: "Lviv" } })).status, 200);
  assert.deepEqual((await (await api(a, "PUT", { ...base, businessName: "Updated" })).json() as { profile: unknown }).profile, { ...base, businessName: "Updated", details });
  assert.deepEqual((await (await api(b)).json() as { profile: unknown }).profile, { ...base, details: { city: "Lviv" } });
  for (const invalid of [{ secret: "x" }, { website: "javascript:alert(1)" }, { legalForm: "other" }, { registrationYear: "1899" }, { registrationYear: String(new Date().getFullYear() + 1) }, { teamSize: "1.2" }, { teamSize: "1000001" }, { requestedAmount: "1000000000.01" }, { ownContribution: "1.234" }, { phone: "x".repeat(41) }, { industry: 42 }]) {
    assert.equal((await api(a, "PUT", { ...base, details: invalid })).status, 400);
  }
  assert.equal((await api(a, "PUT", { ...base, details: {} })).status, 200);
  assert.deepEqual((await (await api(a)).json() as { profile: unknown }).profile, base);
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
  for (const exchangeId of ids) await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision,profile_revision,created_at) VALUES($1,$2,$3,'Q','A',0,0,'2026-01-01T00:00:00Z')", [exchangeId,id,owner]);
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



test("assistant detects profile edits, legacy context and profile creation during generation", async () => {
  const token = await signup();
  const owner = (await getAuth().verifyIdToken(token)).uid;
  const id = crypto.randomUUID();
  await db.query("INSERT INTO cases(id,owner_id,title) VALUES($1,$2,'Profile context')", [id, owner]);
  const legacyId = crypto.randomUUID();
  await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision) VALUES($1,$2,$3,'legacy','old',0)", [legacyId, id, owner]);
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.uid = owner; next(); });
  app.use(assistantRouter(db, async (snapshot) => {
    assert.equal(snapshot.profileRevision, 0);
    assert.equal(snapshot.conversation?.[0].stale, true);
    const created = await fetch(`${base}/api/me`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "If-Match": '"0"' }, body: JSON.stringify({businessName:"New",region:"Kyiv",description:"Business"}) });
    assert.equal(created.status, 200);
    return "Answer before profile creation";
  }));
  const local = app.listen(0, "127.0.0.1"); await once(local, "listening");
  const port = (local.address() as {port:number}).port;
  const endpoint = `http://127.0.0.1:${port}/${id}/assistant`;
  try {
    const response = await fetch(endpoint, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:0,message:"Question"})});
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as {stale:boolean}).stale, true);
    const history = await (await fetch(`${endpoint}/history`)).json() as {exchanges:{id:string;stale:boolean}[]};
    assert.equal(history.exchanges.find((exchange) => exchange.id === legacyId)?.stale, true);
    assert.ok(history.exchanges.every((exchange) => exchange.stale));
    // A reply using the current profile becomes stale after a later real profile edit.
    const currentId = crypto.randomUUID();
    await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision,profile_revision) VALUES($1,$2,$3,'current','answer',0,1)", [currentId,id,owner]);
    const before = await (await fetch(`${endpoint}/history`)).json() as {exchanges:{id:string;stale:boolean}[]};
    assert.equal(before.exchanges.find((exchange) => exchange.id === currentId)?.stale, false);
    const edited = await fetch(`${base}/api/me`, { method:"PUT", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","If-Match":'"1"'}, body:JSON.stringify({businessName:"Edited",region:"Kyiv",description:"Business"}) });
    assert.equal(edited.status, 200);
    const after = await (await fetch(`${endpoint}/history`)).json() as {exchanges:{id:string;stale:boolean}[]};
    assert.equal(after.exchanges.find((exchange) => exchange.id === currentId)?.stale, true);
  } finally { await new Promise<void>((resolve, reject) => local.close((error) => error ? reject(error) : resolve())); }
});

test("deleting a case removes it and its related data; other users cannot delete", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  const create = await fetch(`${base}/api/cases`, { method: "POST", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "ToDelete" }) });
  assert.equal(create.status, 201);
  const { case: c } = await create.json() as { case: { id: string } };
  // save some budget so cascade is tested
  const budget = await fetch(`${base}/api/cases/${c.id}/budget`, { method: "PUT", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, idempotencyKey: crypto.randomUUID(), items: [{ name: "Item", quantity: 1, unitPriceKopecks: 100 }] }) });
  assert.equal(budget.status, 200);
  // other user cannot delete
  const foreignDelete = await fetch(`${base}/api/cases/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${b}` } });
  assert.equal(foreignDelete.status, 404);
  // owner deletes
  const del = await fetch(`${base}/api/cases/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${a}` } });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { deleted: true });
  // case no longer exists
  const after = await fetch(`${base}/api/cases/${c.id}`, { headers: { Authorization: `Bearer ${a}` } });
  assert.equal(after.status, 404);
  // list no longer contains deleted case
  const list = await (await fetch(`${base}/api/cases`, { headers: { Authorization: `Bearer ${a}` } })).json() as { cases: { id: string }[] };
  assert.ok(!list.cases.some((x) => x.id === c.id));
});

test("case preserves programId, allows updating program and validates allowed programs", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);

  // Create case without a program
  const createDefault = await fetch(`${base}/api/cases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Проєкт 1" }),
  });
  assert.equal(createDefault.status, 201);
  const caseDefault = ((await createDefault.json()) as { case: { id: string; programId: string } }).case;
  assert.equal(caseDefault.programId, null);
  const genericExport = await (await fetch(`${base}/api/cases/${caseDefault.id}/draft-export`, {headers: {Authorization: `Bearer ${a}`}})).text();
  assert.match(genericExport, /Фінансування: підберемо далі/);
  assert.doesNotMatch(genericExport, /Власна справа/);

  // Create case with explicit programId
  const createVeteran = await fetch(`${base}/api/cases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Ветеранський бізнес", programId: "veteran-grant" }),
  });
  assert.equal(createVeteran.status, 201);
  const caseVeteran = ((await createVeteran.json()) as { case: { id: string; programId: string } }).case;
  assert.equal(caseVeteran.programId, "veteran-grant");

  // Invalid programId rejected
  const createInvalid = await fetch(`${base}/api/cases`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Невірний", programId: "unknown-grant" }),
  });
  assert.equal(createInvalid.status, 400);
  for (const programId of ["erasmus-study", "erasmus-mundus"]) {
    const createOutsideScope = await fetch(`${base}/api/cases`, {
      method: "POST", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Outside business scope", programId }),
    });
    assert.equal(createOutsideScope.status, 400);
    const changeOutsideScope = await fetch(`${base}/api/cases/${caseDefault.id}/program`, {
      method: "PUT", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
      body: JSON.stringify({ programId, expectedRevision: 0 }),
    });
    assert.equal(changeOutsideScope.status, 400);
  }

  // Update programId
  const updateProgram = await fetch(`${base}/api/cases/${caseDefault.id}/program`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ programId: "processing-business", expectedRevision: 0 }),
  });
  assert.equal(updateProgram.status, 200);
  const updated = ((await updateProgram.json()) as { case: { id: string; programId: string; revision: number } }).case;
  assert.equal(updated.programId, "processing-business");
  assert.equal(updated.revision, 1);
  const programCall = (programId: string | null, expectedRevision: number) => fetch(`${base}/api/cases/${caseDefault.id}/program`, {
    method: "PUT", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ programId, expectedRevision }),
  });
  const noop = await programCall("processing-business", 1);
  assert.equal(noop.status, 200);
  assert.equal(((await noop.json()) as {case:{revision:number}}).case.revision, 1);
  assert.equal((await programCall("veteran-grant", 0)).status, 409);
  const oldBudget = await fetch(`${base}/api/cases/${caseDefault.id}/budget`, {
    method: "PUT", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: 0, idempotencyKey: crypto.randomUUID(), items: [] }),
  });
  assert.equal(oldBudget.status, 409);
  const owner = (await getAuth().verifyIdToken(a)).uid;
  await db.query("INSERT INTO assistant_exchanges(id,case_id,owner_id,question,reply,revision) VALUES($1,$2,$3,'Q','A',0)", [crypto.randomUUID(), caseDefault.id, owner]);
  const history = await fetch(`${base}/api/cases/${caseDefault.id}/assistant/history`, { headers: { Authorization: `Bearer ${a}` } });
  assert.equal(history.status, 200);
  assert.equal(((await history.json()) as {exchanges:{stale:boolean}[]}).exchanges[0].stale, true);

  const removeProgram = await fetch(`${base}/api/cases/${caseVeteran.id}/program`, {
    method: "PUT", headers: { Authorization: `Bearer ${a}`, "Content-Type": "application/json" },
    body: JSON.stringify({ programId: null, expectedRevision: 0 }),
  });
  assert.equal(removeProgram.status, 200);
  assert.equal(((await removeProgram.json()) as {case:{programId:string|null}}).case.programId, null);

  // Another user cannot update program
  const foreignUpdate = await fetch(`${base}/api/cases/${caseDefault.id}/program`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${b}`, "Content-Type": "application/json" },
    body: JSON.stringify({ programId: "veteran-grant", expectedRevision: 1 }),
  });
  assert.equal(foreignUpdate.status, 404);

  // Program details reflected in draft export
  const exportRes = await fetch(`${base}/api/cases/${caseDefault.id}/draft-export`, {
    headers: { Authorization: `Bearer ${a}` },
  });
  assert.equal(exportRes.status, 200);
  const exportText = await exportRes.text();
  assert.match(exportText, /Грант на переробне підприємство/);
  const concurrent = await Promise.all([programCall("veteran-grant", 1), programCall("agro-gardens", 1)]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const winner = concurrent.find((response) => response.status === 200)!;
  assert.equal(((await winner.json()) as {case:{revision:number}}).case.revision, 2);
});

test("health endpoint checks database connectivity", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const body = await response.json() as { status: string };
  assert.equal(body.status, "ok");
});

// Regression: retrying a creation after a lost response must not create a duplicate project.
test("case creation reuses its request identity safely under concurrent retries", async () => {
  const [owner,foreign]=await Promise.all([signup(),signup()]);
  const body={id:crypto.randomUUID(),title:"Creation replay test",programId:"vlasna-sprava"};
  const call=(token:string,payload=body)=>fetch(`${base}/api/cases`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const replies=await Promise.all([call(owner),call(owner)]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,201]);
  for(const reply of replies)assert.equal((await reply.json() as {case:{id:string}}).case.id,body.id);
  assert.equal((await call(owner,{...body,title:"Changed request"})).status,409);
  assert.equal((await call(foreign)).status,409);
});

test("grant applications isolate owners, reject concurrent writes and invalidate confirmation on case edits", async () => {
  const [owner, stranger] = await Promise.all([signup(), signup()]);
  const call = (token: string, path: string, method = "GET", body?: object) =>
    fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
  const created = await call(owner, "/api/cases", "POST", { title: "Тестова пекарня", programId: "vlasna-sprava" });
  assert.equal(created.status, 201);
  const id = (await created.json()).case.id;
  const path = `/api/cases/${id}/grant-application`;
  const template = await call(owner, `${path}/working-example`);
  assert.equal(template.status, 200);
  assert.match(template.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.equal((await template.arrayBuffer()).byteLength > 0, true);
  assert.equal((await call(stranger, `${path}/working-example`)).status, 404);
  const initial = await call(owner, path);
  assert.equal(initial.headers.get("cache-control"), "no-store");
  const initialBody = await initial.json();
  assert.equal(initialBody.application.nextQuestion.id, "track");
  assert(initialBody.documentCoverage.missingOfficialInputs.length > 0);
  assert.equal((await call(stranger, path)).status, 404);
  const command = { expectedRevision: 0, expectedCaseRevision: 0, answers: { track: "start" } };
  assert.equal((await call(stranger, path, "PUT", command)).status, 404);
  const saves = await Promise.all([call(owner, path, "PUT", command), call(owner, path, "PUT", command)]);
  assert.deepEqual(saves.map(response => response.status).sort(), [200, 409]);
  const confirmed = await call(owner, path, "PUT", { ...command, expectedRevision: 1, answers: { ...command.answers, confirmAccuracy: true } });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).answers.confirmAccuracy, true);
  const exportPath = `/api/cases/${id}/draft-export`;
  assert.equal((await call(stranger, exportPath)).status, 404);
  const exported = await (await call(owner, exportPath)).text();
  assert.match(exported, /Анкета програми · версія 2/);
  assert.match(exported, /Напрям гранту:\nЗапочаткування/);
  assert.match(exported, /Тип заявника:\nНе вказано/);
  assert.equal((await call(owner, `${path}/diia-draft/export`, "POST", {
    expectedRevision: 2, expectedCaseRevision: 0,
  })).status, 422);
  assert.equal((await call(owner, `/api/cases/${id}/program`, "PUT", { programId: null, expectedRevision: 0 })).status, 200);
  assert.equal((await call(owner, path, "PUT", { ...command, expectedRevision: 2 })).status, 409);
  assert.equal((await (await call(owner, path)).json()).application, null);
  assert.equal((await call(owner, `/api/cases/${id}/program`, "PUT", { programId: "vlasna-sprava", expectedRevision: 1 })).status, 200);
  const restored = await (await call(owner, path)).json();
  assert.deepEqual(restored.answers, { track: "start" });
  assert.equal(restored.caseRevision, 2);
  assert.equal((await call(owner, `/api/cases/${id}`, "DELETE")).status, 200);
  assert.equal((await db.query("SELECT 1 FROM grant_applications WHERE case_id=$1", [id])).rowCount, 0);
});

test("financial plans reconcile a private snapshot and block stale exports", async () => {
  const [owner, stranger] = await Promise.all([signup(), signup()]);
  const call = (token: string, path: string, method = "GET", body?: object) =>
    fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
    });

  const created = await call(owner, "/api/cases", "POST", { title: "Фінансовий план для тесту", programId: "vlasna-sprava" });
  assert.equal(created.status, 201);
  const id = (await created.json()).case.id;
  const path = `/api/cases/${id}`;
  const financialPath = `${path}/grant-financial-plan`;
  const applicationPath = `${path}/grant-application`;
  const answers = { track: "start", requestedGrantKopecks: 100_500, ownContributionKopecks: 50_000 };
  assert.equal((await call(owner, applicationPath, "PUT", { answers, expectedRevision: 0, expectedCaseRevision: 0 })).status, 200);

  const first = { salesKopecks: 20_000, grantKopecks: 100_500, ownKopecks: 50_000, operatingCostsKopecks: 0, payrollKopecks: 0, taxesKopecks: 500, capitalCostsKopecks: 171_000 };
  const empty = { salesKopecks: 0, grantKopecks: 0, ownKopecks: 0, operatingCostsKopecks: 0, payrollKopecks: 0, taxesKopecks: 0, capitalCostsKopecks: 0 };
  const plan = { openingBalanceKopecks: 0, months: [first, ...Array.from({ length: 23 }, () => empty)] };
  const revisions = { expectedCaseRevision: 0, expectedApplicationRevision: 1, expectedPlanRevision: 0 };
  assert.equal((await call(stranger, financialPath)).status, 404);
  assert.equal((await call(stranger, financialPath, "PUT", { ...revisions, plan })).status, 404);
  const saves = await Promise.all([call(owner, financialPath, "PUT", { ...revisions, plan }), call(owner, financialPath, "PUT", { ...revisions, plan })]);
  assert.deepEqual(saves.map(result => result.status).sort(), [200, 409]);
  const saved = await (await call(owner, financialPath)).json();
  assert.equal(saved.reconciled, true);
  assert.equal(saved.forecast.totals.closingBalanceKopecks, -1000);
  assert.equal(saved.planRevision, 1);
  const attempt = { ...revisions, expectedPlanRevision: 1 };
  assert.equal((await call(stranger, `${financialPath}/export`, "POST", attempt)).status, 404);

  if (process.env.LIBREOFFICE_TEST) {
    const archive = await call(owner, `${financialPath}/export`, "POST", attempt);
    assert.equal(archive.status, 200);
    assert.equal(archive.headers.get("cache-control"), "no-store");
    assert.match(archive.headers.get("content-disposition") ?? "", /grantfolio-financial-draft\.zip/);
    assert.equal(Buffer.from(await archive.arrayBuffer()).subarray(0, 2).toString(), "PK");
  }

  assert.equal((await call(owner, applicationPath, "PUT", { answers: { ...answers, ownContributionKopecks: 49_999 }, expectedRevision: 1, expectedCaseRevision: 0 })).status, 200);
  const updated = await (await call(owner, financialPath)).json();
  assert.equal(updated.stale, true);
  assert.equal(updated.reconciled, false);
  assert.equal((await call(owner, `${financialPath}/export`, "POST", { ...attempt, expectedApplicationRevision: 2 })).status, 409);
  assert.equal((await call(owner, path, "DELETE")).status, 200);
  assert.equal((await db.query("SELECT 1 FROM grant_financial_plans WHERE case_id=$1", [id])).rowCount, 0);
});

test("a pilot Jar payment unlocks only its enrolled application after confirmation", async () => {
  const [owner, stranger] = await Promise.all([signup(), signup()]);
  const call = (token: string, path: string, method = "GET", body?: object) =>
    fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
  async function createCase() {
    const created = await call(owner, "/api/cases", "POST", { title: "Платіжний пілот", programId: "vlasna-sprava" });
    assert.equal(created.status, 201);
    return (await created.json()).case.id as string;
  }
  const first = await createCase();
  const second = await createCase();
  const operator = (...args: string[]) => promisify(execFile)(
    process.execPath, ["--import", "tsx", "backend/src/grant-preparation-pilot-cli.ts", ...args],
  );
  const reference = (await operator("enroll", first)).stdout.trim();
  const otherReference = (await operator("enroll", second)).stdout.trim();
  const statusPath = `/api/cases/${first}/preparation-access`;
  const body = { expectedRevision: 0, expectedCaseRevision: 0, answers: { track: "start" } };
  assert.deepEqual(await (await call(owner, statusPath)).json(), { state: "pending", reference });
  assert.equal((await call(stranger, statusPath)).status, 404);
  for (const route of ["grant-application", "grant-financial-plan", "assistant"]) {
    assert.equal((await call(owner, `/api/cases/${first}/${route}`, route === "assistant" ? "POST" : "PUT", body)).status, 402);
  }
  const operation = crypto.randomUUID();
  await assert.rejects(operator("confirm", reference, operation, "0"));
  await operator("confirm", reference, operation, "137");
  assert.equal((await operator("confirm", reference, operation, "137")).stdout.trim(), reference);
  await assert.rejects(operator("confirm", otherReference, operation, "137"), /Operation already assigned/);
  assert.deepEqual(await (await call(owner, statusPath)).json(), { state: "active", reference });
  assert.equal((await call(owner, `/api/cases/${first}/grant-application`, "PUT", body)).status, 200);
  assert.equal((await call(owner, `/api/cases/${second}/grant-application`, "PUT", body)).status, 402);
});
