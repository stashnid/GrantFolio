import test from "node:test";
import assert from "node:assert/strict";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { findNamedPrograms, grantIntake, searchGrants } from "../src/grant-discovery.js";

const now = new Date("2026-11-19T12:00:00Z");
const base = GRANT_CATALOG.find(p => p.id === "vlasna-sprava")!;

test("direct identity is found independently of intake and eligibility", () => {
  for (const query of ["brave1", "що таке Brave 1?", "Брейв1", "ua-brave1-core"]) {
    const result = searchGrants(query, GRANT_CATALOG, now);
    const match = result.matches.find(p => p.programId === "ua-brave1-core");
    assert.ok(match, query);
    assert.equal(match.matchKind, "direct");
    assert.equal(match.intake, "unconfirmed");
    assert.equal(match.supportDepth, "catalog-only");
    assert.match(match.reason, /не підтвердження/);
  }
  assert.ok(findNamedPrograms("Власна справа").some(p => p.id === base.id));
  assert.equal(findNamedPrograms("грант для бізнесу").length, 0);
});

test("informational thematic search preserves truthful statuses while open recommendations exclude them", () => {
  const closed = {...base, id: "fixture-closed", title: "Кавові інновації", aliases: [],
    availability: {...base.availability!, state: "closed" as const, checkedAt: "2026-11-19T00:00:00Z", validUntil: "2026-11-20T00:00:00Z"}};
  assert.equal(searchGrants("обладнання", [closed], now).matches.length, 0);
  const result = searchGrants("обладнання", [closed], now, {includeUnavailable: true}).matches[0];
  assert.ok(result);
  assert.equal(result.matchKind, "thematic");
  assert.equal(result.intake, "closed");
  assert.equal(searchGrants("Кавові інновації", [closed], now).matches[0]?.programId, closed.id);
  assert.equal(grantIntake({...closed, availability: {...closed.availability, validUntil: "2026-11-18T00:00:00Z"}}, now).intake, "unconfirmed");
});

test("negative eligibility does not erase explicit informational lookup", () => {
  const q = "UVF компенсація, ще не купив обладнання";
  const direct = searchGrants(q, GRANT_CATALOG, now).matches.find(p => p.programId === "uvf-reimbursement");
  // Provider names used by the pre-existing catalogue remain a lookup too.
  assert.ok(direct);
  assert.match(direct.caution, /відповідність/);
});
