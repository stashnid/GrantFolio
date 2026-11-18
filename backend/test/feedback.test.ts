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

async function patchFeedback(token: string, id: string, body: unknown) {
  return fetch(`${url}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("feedback supports extended fields, Step 2 PATCH enrichment, contact consent privacy, cross-owner isolation, and rate limiting", async () => {
  const [owner, other] = await Promise.all([signup(), signup()]);
  const id = crypto.randomUUID();

  // contactInfo must be cleared when contactConsent is false
  const createRes = await call(owner, {
    id,
    rating: 4,
    task: "assistant",
    comment: "Корисний AI-радник, але хочеться швидше експортувати бюджет.",
    taskOutcome: "partial",
    categoryTags: ["ai-advisor", "export"],
    testerRole: "fop",
    contactConsent: false,
    contactInfo: "should-not-persist@example.com",
    contextSnapshot: {
      screen: "advisor",
      programId: "vlasna-sprava",
      viewportClass: "desktop",
      appVersion: "0.1.0",
    },
  });
  assert.equal(createRes.status, 200);
  const createdBody = (await createRes.json()) as {
    feedback: {
      id: string;
      taskOutcome: string;
      categoryTags: string[];
      testerRole: string;
      contactConsent: boolean;
      contactInfo: string | null;
      contextSnapshot: Record<string, string>;
      willingnessToPay: string;
      suggestedPriceUah: number | null;
    };
  };
  assert.equal(createdBody.feedback.id, id);
  assert.equal(createdBody.feedback.taskOutcome, "partial");
  assert.deepEqual(createdBody.feedback.categoryTags, ["ai-advisor", "export"]);
  assert.equal(createdBody.feedback.testerRole, "fop");
  assert.equal(createdBody.feedback.contactConsent, false);
  assert.equal(createdBody.feedback.contactInfo, null);
  assert.equal(createdBody.feedback.contextSnapshot.screen, "advisor");

  // Verify DB did not persist contact_info when contactConsent was false
  const dbRowAfterCreate = await db.query(
    "SELECT contact_info, content_hash FROM user_feedback WHERE id = $1",
    [id],
  );
  assert.equal(dbRowAfterCreate.rows[0].contact_info, null);
  assert.equal(String(dbRowAfterCreate.rows[0].content_hash).length, 64);

  // Cross-owner PATCH must return 404
  assert.equal(
    (await patchFeedback(other, id, { ratingUx: 5 })).status,
    404,
  );

  // Invalid UUID or unknown fields on PATCH must return 400
  assert.equal((await patchFeedback(owner, "not-a-uuid", { ratingUx: 5 })).status, 400);
  assert.equal((await patchFeedback(owner, id, { owner_id: "spoof" })).status, 400);

  // Step 2 enrichment via PATCH
  const patchRes = await patchFeedback(owner, id, {
    ratingUx: 5,
    ratingUsefulness: 4,
    ratingAi: 5,
    wouldRecommend: true,
    willingnessToPay: "monthly_subscription",
    suggestedPriceUah: 350,
    contactConsent: true,
    contactInfo: "founder@example.ua",
  });
  assert.equal(patchRes.status, 200);
  const patchedBody = (await patchRes.json()) as {
    feedback: {
      ratingUx: number | null;
      ratingUsefulness: number | null;
      ratingAi: number | null;
      wouldRecommend: boolean | null;
      willingnessToPay: string;
      suggestedPriceUah: number | null;
      contactConsent: boolean;
      contactInfo: string | null;
    };
  };
  assert.equal(patchedBody.feedback.ratingUx, 5);
  assert.equal(patchedBody.feedback.ratingUsefulness, 4);
  assert.equal(patchedBody.feedback.ratingAi, 5);
  assert.equal(patchedBody.feedback.wouldRecommend, true);
  assert.equal(patchedBody.feedback.willingnessToPay, "monthly_subscription");
  assert.equal(patchedBody.feedback.suggestedPriceUah, 350);
  assert.equal(patchedBody.feedback.contactConsent, true);
  assert.equal(patchedBody.feedback.contactInfo, "founder@example.ua");

  // Revoking contactConsent via PATCH must clear contactInfo
  const revokeRes = await patchFeedback(owner, id, { contactConsent: false });
  assert.equal(revokeRes.status, 200);
  const revokedBody = (await revokeRes.json()) as {
    feedback: { contactConsent: boolean; contactInfo: string | null };
  };
  assert.equal(revokedBody.feedback.contactConsent, false);
  assert.equal(revokedBody.feedback.contactInfo, null);

  // Rate limit: 9 more unique submissions reach 10/10min, 11th returns 429, replay still returns 200
  const tenthPayload = {
    id: crypto.randomUUID(),
    rating: 5,
    task: "catalog",
    comment: "Десятий тестовий запис для перевірки ліміту",
  };
  for (let i = 0; i < 8; i += 1) {
    const res = await call(owner, {
      id: crypto.randomUUID(),
      rating: 5,
      task: "catalog",
      comment: `Тестовий відгук ${i + 2}`,
    });
    assert.equal(res.status, 200);
  }
  assert.equal((await call(owner, tenthPayload)).status, 200);
  // 11th brand new submission is rate limited
  const limited = await call(owner, {
    id: crypto.randomUUID(),
    rating: 5,
    task: "catalog",
    comment: "Одинадцятий запис має бути обмежений",
  });
  assert.equal(limited.status, 429);
  // Idempotent replay of existing submission still succeeds despite limit
  assert.equal((await call(owner, tenthPayload)).status, 200);
});
