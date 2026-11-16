import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { User } from "firebase/auth";
import { authenticatedRequest, ApiError, readableApiError } from "../../frontend/src/api.js";
const user = { getIdToken: async () => "synthetic-token" } as User;
test("API timeout bounds token refresh and response body; mutation is never replayed", async () => {
  let calls = 0;
  const fetcher = mock.method(globalThis, "fetch", async () => { calls++; return new Response(new ReadableStream({ start() {} })); });
  try {
    await assert.rejects(authenticatedRequest({ getIdToken: () => new Promise(() => {}) } as User, "/api/me", {}, 10), (error: unknown) => error instanceof ApiError && error.kind === "timeout");
    assert.equal(calls, 0);
    await assert.rejects(authenticatedRequest(user, "/api/me", { method: "PUT", body: "{}" }, 10), (error: unknown) => error instanceof ApiError && error.kind === "timeout");
    assert.equal(calls, 1);
  } finally { fetcher.mock.restore(); }
});
test("HTTP failures stay inspectable, authorization is owned by caller identity, cancellation is preserved", async () => {
  let authorization = "";
  const fetcher = mock.method(globalThis, "fetch", async (_url, init) => { authorization = new Headers(init?.headers).get("Authorization") ?? ""; return Response.json({ error: "revision_conflict" }, { status: 409 }); });
  try {
    const response = await authenticatedRequest(user, "/api/cases", { headers: { Authorization: "untrusted" } });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "revision_conflict" });
    assert.equal(authorization, "Bearer synthetic-token");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(authenticatedRequest(user, "/api/me", { signal: controller.signal }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.match(readableApiError(new ApiError("http", 503), "fallback"), /тимчасово/);
    assert.match(readableApiError(new ApiError("session"), "fallback"), /вхід/);
  } finally { fetcher.mock.restore(); }
});
