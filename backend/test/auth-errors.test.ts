import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Pool } from "pg";
import { createApp } from "../src/app.js";
initializeApp({ projectId: "demo-auth-error-test" });
// Regression: identity provider outages must not be labeled bad credentials.
test("invalid tokens return 401 while verifier infrastructure failures return 503", async () => {
  let code = "app/network-error";
  const verifier = mock.method(getAuth(), "verifyIdToken", async () => { throw Object.assign(new Error("private diagnostic"), { code }); });
  const db = { query: async () => { throw Error("must not query private data"); } } as unknown as Pool;
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing test port");
  try {
    const request = () => fetch(`http://127.0.0.1:${address.port}/api/me`, { headers: { Authorization: "Bearer synthetic" } });
    const outage = await request();
    assert.equal(outage.status, 503);
    assert.deepEqual(await outage.json(), { error: "auth_unavailable" });
    for (code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error", "auth/invalid-id-token"]) assert.equal((await request()).status, 401);
  } finally { verifier.mock.restore(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
