import test from "node:test";
import assert from "node:assert/strict";
import { advisorSessionKey, createAdvisorSession, parseAdvisorSession } from "../../frontend/src/advisor-session.js";
const conversation = "123e4567-e89b-42d3-a456-426614174000", attempt = "123e4567-e89b-42d3-a456-426614174001";
test("session preserves draft and matching retry id and isolates keys", () => {
 const s = createAdvisorSession(conversation, { [conversation]: "  ідея  " }, { [conversation]: { id: attempt, text: "ідея" } }, 1000);
 assert.equal(parseAdvisorSession(JSON.stringify(s), 1001)?.attempts[conversation].id, attempt);
 assert.notEqual(advisorSessionKey("user1"), advisorSessionKey("user2"));
 assert.equal(parseAdvisorSession(JSON.stringify(s), 1000 + 7*86400000 + 1), null);
 assert.equal(parseAdvisorSession(JSON.stringify(s), 999), null);
});
test("invalid storage and edited retries are not replayed", () => {
 assert.equal(parseAdvisorSession("not json"), null);
 const s = createAdvisorSession(conversation, { [conversation]: "новий текст" }, { [conversation]: { id: attempt, text: "старий текст" } }, 1000);
 assert.deepEqual(s?.attempts, {});
 assert.equal(parseAdvisorSession(JSON.stringify({ ...s, drafts: { invalid: "x" } }), 1000), null);
});
