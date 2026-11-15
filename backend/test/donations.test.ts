import { test, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import pg from "pg";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";

const config = configuration();
if (process.env.AUTH_MODE !== "emulator" || !config.projectId.startsWith("demo-")) {
  throw new Error("Donations tests require local demo emulator");
}
if (!getApps().length) {
  initializeApp({ projectId: config.projectId });
}
const db = new pg.Pool({ connectionString: config.databaseUrl });
const server = createApp(db).listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw Error("Missing test port");
const baseUrl = `http://127.0.0.1:${address.port}/api/donations`;
const uids: string[] = [];

after(async () => {
  if (uids.length) {
    await db.query("DELETE FROM donations WHERE owner_id = ANY($1::text[])", [uids]);
    await Promise.all(uids.map((uid) => getAuth().deleteUser(uid)));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.end();
});

async function signup() {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${crypto.randomUUID()}@example.test`,
        password: "test-password",
        returnSecureToken: true,
      }),
    }
  );
  assert.equal(response.status, 200);
  const identity = (await response.json()) as { localId: string; idToken: string };
  uids.push(identity.localId);
  return identity.idToken;
}

async function call(token?: string, body?: unknown, path = "") {
  return fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("donations API requires auth, isolates owners, validates amounts, and computes aggregate stats", async () => {
  const [userA, userB] = await Promise.all([signup(), signup()]);

  // Auth requirement
  assert.equal((await call()).status, 401);
  assert.equal((await call("invalid.token")).status, 401);

  // Invalid payload checks
  const invalidPayloads = [
    { amountKopecks: 0, target: "Фонд" },
    { amountKopecks: -500, target: "Фонд" },
    { amountKopecks: 100, target: "" },
    { amountKopecks: "not-a-number", target: "Фонд" },
    { amountKopecks: 100, target: "a".repeat(201) },
  ];
  for (const invalid of invalidPayloads) {
    const res = await call(userA, invalid);
    assert.equal(res.status, 400);
  }

  // Initial state for user A and B
  assert.deepEqual(await (await call(userA)).json(), { donations: [] });
  assert.deepEqual(await (await call(userB)).json(), { donations: [] });

  // Record a donation for user A
  const donationA = {
    amountKopecks: 50000, // 500 грн
    target: "Благодійний фонд «Повернись живим»",
    note: "На підтримку зв'язку підрозділів",
  };
  const resA = await call(userA, donationA);
  assert.equal(resA.status, 201);
  const dataA = (await resA.json()) as { donation: { id: string; amountKopecks: number; target: string; note: string } };
  assert.equal(dataA.donation.amountKopecks, 50000);
  assert.equal(dataA.donation.target, donationA.target);
  assert.equal(dataA.donation.note, donationA.note);

  // User A sees their donation
  const listA = (await (await call(userA)).json()) as { donations: { id: string; amountKopecks: number }[] };
  assert.equal(listA.donations.length, 1);
  assert.equal(listA.donations[0].id, dataA.donation.id);

  // User B cannot see User A's donation (isolation)
  const listB = (await (await call(userB)).json()) as { donations: unknown[] };
  assert.equal(listB.donations.length, 0);

  // Record a donation for user B
  const donationB = {
    amountKopecks: 100000, // 1000 грн
    target: "Спецрахунок НБУ на підтримку ЗСУ",
    note: "Донат перемоги",
  };
  const resB = await call(userB, donationB);
  assert.equal(resB.status, 201);

  // User B sees only their donation
  const listB2 = (await (await call(userB)).json()) as { donations: { amountKopecks: number }[] };
  assert.equal(listB2.donations.length, 1);
  assert.equal(listB2.donations[0].amountKopecks, 100000);

  // Public stats check
  const statsRes = await call(userA, undefined, "/stats");
  assert.equal(statsRes.status, 200);
  const stats = (await statsRes.json()) as { totalKopecks: number; count: number };
  assert.ok(stats.totalKopecks >= 150000);
  assert.ok(stats.count >= 2);
});
