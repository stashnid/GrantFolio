import { test } from "node:test";
import assert from "node:assert/strict";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { getGrantSourceContext, getProgramDetails } from "../src/grant-sources.js";

test("catalog and assistant use the same program-specific facts and sources", () => {
  assert.equal(new Set(GRANT_CATALOG.map(program => program.id)).size, 8);
  for (const program of GRANT_CATALOG) {
    const details = getProgramDetails(program.id);
    const context = getGrantSourceContext(program.id);
    assert.equal(details.amountLabel, program.amount);
    assert.deepEqual(details.allowedCosts, program.details.costs);
    assert.equal(context.program, program.title);
    assert.deepEqual(context.sources.map(source => source.url), program.details.sources.map(source => source.url));
    assert.ok(program.details.documents.length > 0);
    assert.ok(program.details.steps.length > 0);
    assert.ok(program.details.obligations.length > 0);
  }
  assert.equal(getGrantSourceContext("veteran-grant").currentRoundOpen, false);
  assert.equal(getGrantSourceContext("processing-business").currentRoundOpen, false);
  assert.equal(getGrantSourceContext("vlasna-sprava",new Date("2026-11-16T15:00:00Z")).currentRoundOpen, true);
  assert.ok(!JSON.stringify(getGrantSourceContext("processing-business")).includes("2,5 млн"));
});
