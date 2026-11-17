import { GRANT_SOURCE_RULES } from "../src/grant-source-rules.js";
import test from "node:test";
import assert from "node:assert/strict";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { isGrantAvailable } from "../src/grant-availability.js";
import { searchGrants } from "../src/grant-discovery.js";
const now = new Date("2026-11-16T15:00:00Z");
test("catalog hides unknown, stale, closed, future and deadline-expired opportunities", () => {
  const original = GRANT_CATALOG.find((p) => p.id === "vlasna-sprava")!;
  assert(isGrantAvailable(original, now));
  for (const change of [
    { state: "closed" },
    { state: "unknown" },
    { validUntil: "2026-11-16T14:00:00Z" },
    { deadlineAt: "2026-11-16T14:00:00Z" },
    { startsAt: "2026-11-17T00:00:00Z" },
    { deadlineAt: null, rolling: false },
    { deadlineAt: "garbage" },
    { checkedAt: "2026-11-17T12:00:00Z" },
  ]) {
    const p = {
      ...original,
      availability: { ...original.availability!, ...change },
    } as typeof original;
    assert.equal(isGrantAvailable(p, now), false);
    assert.equal(searchGrants("авто", [p], now).matches.length, 0);
  }
  const uvf = GRANT_CATALOG.find((p) => p.id === "uvf-reimbursement")!;
  assert(isGrantAvailable(uvf, now));
  assert.equal(uvf.availability?.deadlineAt, null);
  assert(uvf.availability?.rolling);
  assert(
    !isGrantAvailable(
      GRANT_CATALOG.find((p) => p.id === "processing-business")!,
      now,
    ),
  );
  assert(
    !isGrantAvailable(
      GRANT_CATALOG.find((p) => p.id === "veteran-grant")!,
      now,
    ),
  );
});
test("source-specific funding and veteran support do not disappear with an old round", () => {
  const results = searchGrants(
    "ветеран хочу відкрити майстерню",
    GRANT_CATALOG,
    now,
  ).matches;
  assert(results.some((m) => m.programId === "uvf-reimbursement"));
  assert(results.some((m) => m.programId === "vlasna-sprava"));
  assert(!results.some((m) => m.programId === "veteran-grant"));
  assert(
    searchGrants("міська мобільність", GRANT_CATALOG, now).matches.some(
      (m) => m.programId === "eit-sme-expansion",
    ),
  );
  assert(
    searchGrants(
      "стартап для державних послуг",
      GRANT_CATALOG,
      now,
    ).matches.some((m) => m.programId === "govtech-pilots"),
  );
  assert(
    !isGrantAvailable(
      GRANT_CATALOG.find((p) => p.id === "govtech-pilots")!,
      new Date("2026-11-16T22:00:00Z"),
    ),
  );
});

test("deployed source rules capture exact English deadlines with required time zone", () => {
  const eit = GRANT_SOURCE_RULES.find(
    (r) => r.programId === "eit-sme-expansion",
  )!;
  const text =
    "Call closing (submission of completed application): 1 December 2026 at 17.00 CET";
  assert.equal(
    new RegExp(eit.deadlinePattern!, "iu").exec(text)?.[1],
    "1 December 2026 at 17.00 CET",
  );
});


test("discovery review and umbrella programme cannot claim verified open even with source availability", () => {
  const base=GRANT_CATALOG.find(p=>p.id==="vlasna-sprava")!;
  assert.equal(isGrantAvailable({...base,reviewStatus:"needs-review"},now),false);
  assert.equal(isGrantAvailable({...base,programKind:"program"},now),false);
});
