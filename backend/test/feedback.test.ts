import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import pg from "pg";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";
const config = configuration();
if (process.env.AUTH_MODE !== "emulator" || !config.projectId.startsWith("demo-")) throw new Error("Feedback tests require local demo emulator");
initializeApp({ projectId: config.projectId });
const db = new pg.Pool({ connectionString: config.databaseUrl });
const server = createApp(db).listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw Error("Missing test port");
const url = `http://127.0.0.1:${address.port}/api/feedback`;
const uids: string[] = [];
after(async () => {
  await db.query("DELETE FROM user_feedback WHERE owner_id = ANY($1::text[])", [uids]);
  await Promise.all(uids.map((uid) => getAuth().deleteUser(uid)));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.end();
});
async function signup() {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${crypto.randomUUID()}@example.test`, password: "test-password", returnSecureToken: true }) });
  assert.equal(response.status, 200);
  const identity = await response.json() as { localId: string; idToken: string };
  uids.push(identity.localId);
  return identity.idToken;
}
async function call(token?: string, body?: unknown) {
  return fetch(url, { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test("feedback uses real auth/SQL, isolates owners and safely replays concurrent submissions", async () => {
  const [a, b] = await Promise.all([signup(), signup()]);
  assert.equal((await call()).status, 401);
  assert.equal((await call("bad.token")).status, 401);
  const payload = { id: crypto.randomUUID(), rating: 4, task: "budget", comment: "TECHNICAL_TEST: коментар <script>не виконувати</script>" };
  const responses = await Promise.all([call(a, payload), call(a, payload)]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal((await db.query("SELECT count(*) FROM user_feedback WHERE id=$1", [payload.id])).rows[0].count, "1");
  const own = await call(a);
  assert.equal(own.headers.get("cache-control"), "no-store");
  const body = await own.json() as { feedback: { id: string; comment: string }[] };
  assert.equal(body.feedback[0].comment, payload.comment);
  assert.deepEqual(await (await call(b)).json(), { feedback: [] });
  assert.equal((await call(b, payload)).status, 409);
  assert.equal((await call(a, { ...payload, comment: "different" })).status, 409);
  for (const patch of [{ rating: 0 }, { rating: 6 }, { task: "unknown" }, { comment: " " }, { comment: "a".repeat(3001) }, { owner_id: "spoof" }]) {
    assert.equal((await call(a, { ...payload, id: crypto.randomUUID(), ...patch })).status, 400);
  }
});
