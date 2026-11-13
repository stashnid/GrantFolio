import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
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
  const history = await db.query(
    "SELECT revision FROM budget_history WHERE case_id=$1 ORDER BY revision",
    [c.id],
  );
  assert.deepEqual(
    history.rows.map((row) => row.revision),
    [1, 2],
  );
});
