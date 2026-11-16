import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSessionDraft } from "../../frontend/src/useSessionDraft.js";

const now = 1_800_000_000_000;
const week = 7 * 24 * 60 * 60 * 1000;
const valid = () => ({
  version: 1, baseRevision: 4, timestamp: now, pendingUnknown: true,
  details: { projectDescription: "Опис", customers: "", salesChannels: "", implementationPlan: "", expectedResults: "" },
  budget: [{ name: "Витрата", quantity: "1", price: "25" }],
});
const parse = (value: unknown) => parseSessionDraft(JSON.stringify(value), now);

test("preserves legacy overlong numeric entries alongside the description", () => {
  const copy = valid();
  copy.budget[0].quantity = "1".repeat(33);
  copy.budget[0].price = "9".repeat(40);
  assert.deepEqual(parse(copy), copy);
});

test("expires copies after seven days and rejects future or invalid metadata", () => {
  assert.ok(parse({ ...valid(), timestamp: now - week }));
  for (const patch of [{ timestamp: now - week - 1 }, { timestamp: now + 1 }, { timestamp: null }, { baseRevision: -1 }, { baseRevision: 1.5 }, { version: 2 }, { pendingUnknown: "yes" }]) {
    assert.equal(parse({ ...valid(), ...patch }), null);
  }
});

test("rejects corrupt, oversized and structurally invalid copies", () => {
  assert.equal(parseSessionDraft("{", now), null);
  assert.equal(parseSessionDraft("x".repeat(100_001), now), null);
  assert.equal(parse(null), null);
  assert.equal(parse({ ...valid(), details: { ...valid().details, customers: "x".repeat(3001) } }), null);
  assert.equal(parse({ ...valid(), budget: Array(101).fill(valid().budget[0]) }), null);
  assert.equal(parse({ ...valid(), budget: [{ name: "x", quantity: 1, price: "2" }] }), null);
});
