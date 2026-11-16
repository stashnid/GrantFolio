import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
import pg from "pg";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";

const config = configuration();
if (process.env.AUTH_MODE !== "emulator" || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !config.projectId.startsWith("demo-")) throw Error("Demo emulator required");
initializeApp({ projectId: config.projectId });
const db = new pg.Pool({ connectionString: config.databaseUrl });
const server = createApp(db).listen(0, "127.0.0.1");
after(async () => { server.close(); await db.end(); });
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw Error("Missing test port");
const url = `http://127.0.0.1:${address.port}/api/me`;
async function identity() {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${crypto.randomUUID()}@example.test`, password: "test-only-password", returnSecureToken: true }) });
  assert.equal(response.status, 200);
  return (await response.json() as { idToken: string }).idToken;
}
const profile = { businessName: "Original", description: "Description", region: "Lviv" };
function call(token: string, data?: unknown, version?: string) {
  return fetch(url, { method: data ? "PUT" : "GET", headers: { Authorization: `Bearer ${token}`, ...(data ? { "Content-Type": "application/json" } : {}), ...(version !== undefined ? { "If-Match": version } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
// Regression: two tabs must not silently revert each other's saved profile.
test("profile requires a version and rejects stale and concurrent writes without replacing data", async () => {
  const token = await identity();
  assert.equal((await call(token, profile)).status, 428);
  assert.equal((await call(token, profile, '"bad"')).status, 400);
  const initial = await call(token);
  assert.equal(initial.headers.get("etag"), '"0"');
  assert.equal((await initial.json() as { revision: number }).revision, 0);
  const create = await call(token, profile, '"0"');
  assert.equal(create.status, 200);
  assert.equal(create.headers.get("etag"), '"1"');
  const first = await call(token, { ...profile, businessName: "Saved in tab A" }, '"1"');
  assert.equal(first.status, 200);
  const stale = await call(token, { ...profile, region: "Kyiv" }, '"1"');
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "profile_conflict" });
  const read = await call(token);
  assert.equal((await read.json() as { profile: typeof profile }).profile.businessName, "Saved in tab A");
  const races = await Promise.all([call(token, { ...profile, businessName: "C" }, '"2"'), call(token, { ...profile, businessName: "D" }, '"2"')]);
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
  const foreign = await identity();
  const absent = await call(foreign, profile, '"3"');
  assert.equal(absent.status, 409, "a stale version must not create an absent owner's profile");
  assert.equal((await (await call(foreign)).json() as { revision: number }).revision, 0);
});
