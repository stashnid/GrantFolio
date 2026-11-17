import assert from "node:assert/strict";
import { once } from "node:events";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import pg from "pg";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";
import { createEmailLoginCode } from "../src/email-login-code.js";

const config = configuration();
const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbUrl = new URL(config.databaseUrl);
if (process.env.AUTH_MODE !== "emulator" || !emulator || !config.projectId.startsWith("demo-") ||
    !["localhost", "127.0.0.1"].includes(dbUrl.hostname)) {
  throw new Error("Email login integration requires the local Firebase emulator and database");
}
initializeApp({ projectId: config.projectId });
const admin = new pg.Pool({ connectionString: config.databaseUrl });
const schema = `test_email_${crypto.randomUUID().replaceAll("-", "")}`;
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({ connectionString: config.databaseUrl, options: `-c search_path=${schema}` });
const delivered = new Map<string, string>();
const emailCode = createEmailLoginCode(db, crypto.randomUUID(), async (recipient, code) => {
  delivered.set(recipient, code);
});
const server = createApp(db, undefined, emailCode).listen(0, "127.0.0.1");
after(async () => {
  server.close();
  await db.end();
  try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
  finally { await admin.end(); }
});
await once(server, "listening");
await db.query(await readFile("backend/migrations/016_email_login_codes.sql", "utf8"));
await db.query("CREATE TABLE profiles (owner_id TEXT PRIMARY KEY, business_name TEXT, description TEXT, region TEXT, details JSONB, revision INTEGER)");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;

async function signup() {
  const email = `${crypto.randomUUID()}@example.test`;
  const response = await fetch(`http://${emulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "example-password", returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { idToken: string };
  return { email, token: result.idToken };
}

function request(path: string, token: string, options: { method?: string; cookie?: string; code?: string } = {}) {
  return fetch(`${base}/api/${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.code ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.code ? { body: JSON.stringify({ code: options.code }) } : {}),
  });
}

test("password accounts need a single-use email code and the resulting grant stays bound to that user", async () => {
  const [first, second] = await Promise.all([signup(), signup()]);
  assert.equal((await request("me", first.token)).status, 403);
  assert.deepEqual(await (await request("auth/email-code/status", first.token)).json(), { required: true });
  const requests = await Promise.all([1, 2].map(() => request("auth/email-code/send", first.token, { method: "POST" })));
  assert.deepEqual(requests.map(response => response.status).sort(), [204, 429]);
  const code = delivered.get(first.email);
  assert.ok(code);
  const wrongCode = code === "000000" ? "000001" : "000000";
  assert.equal((await request("auth/email-code/verify", first.token, { method: "POST", code: wrongCode })).status, 400);
  assert.equal((await request("auth/email-code/verify", second.token, { method: "POST", code })).status, 400);
  const verified = await request("auth/email-code/verify", first.token, { method: "POST", code });
  assert.equal(verified.status, 204);
  const setCookie = verified.headers.get("set-cookie");
  assert.match(setCookie ?? "", /HttpOnly; Secure; SameSite=Strict/);
  const cookie = setCookie?.split(";")[0];
  assert.equal((await request("me", first.token, { cookie })).status, 200);
  assert.equal((await request("me", second.token, { cookie })).status, 403);
  assert.equal((await request("auth/email-code/verify", first.token, { method: "POST", code })).status, 400);
});
