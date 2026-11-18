import { test } from "node:test";
import assert from "node:assert/strict";
import { GRANT_CATALOG, type GrantCatalogEntry } from "../src/grant-catalog-data.js";
import { GLOBAL_FUNDING_ADDITIONS } from "../src/global-funding-additions.js";
import { isGrantAvailable } from "../src/grant-availability.js";
import { getGrantSourceContext, getProgramDetails } from "../src/grant-sources.js";

const VALID_CATEGORIES = new Set<GrantCatalogEntry["category"]>([
  "erobota",
  "veteran",
  "production",
  "agro",
  "international",
  "startup",
  "women",
  "social",
  "green",
  "export",
  "finance",
  "creative",
  "digital",
  "regional",
  "displaced",
]);

const VALID_FUNDING_TYPES = new Set<NonNullable<GrantCatalogEntry["fundingType"]>>([
  "grant",
  "reimbursement",
  "cofinancing",
  "loan",
  "equity",
  "guarantee",
  "prize",
  "voucher",
  "in-kind",
  "recoverable-grant",
  "blended",
  "leasing",
  "factoring",
  "insurance",
]);

const EXPECTED_GLOBAL_ADDITION_IDS = [
  "y-combinator-accelerator",
  "techstars-accelerator",
  "500-global-flagship",
  "startup-wise-guys",
  "masschallenge-equity-free",
  "mit-solve-global-challenges",
  "google-for-startups-ukraine-fund",
  "google-cloud-for-startups",
  "aws-activate-startups",
  "microsoft-founders-hub",
  "nvidia-inception-program",
  "seeds-of-bravery-uaseeds",
  "eureka-eurostars-ukraine",
  "euipo-sme-fund-ukraine",
  "eu-single-market-programme",
  "enterprise-europe-network-ukraine",
  "eit-community-hub-ukraine",
  "eu-young-entrepreneurs-exchange",
  "ukraine-investment-framework-uif",
  "ebrd-advice-small-businesses-ua",
  "ebrd-women-in-business-ua",
  "umaef-sme-direct-investment",
  "miga-sure-ukraine",
  "us-dfc-ukraine-financing",
  "unido-green-industrial-ukraine",
  "usf-core-grants-ukraine",
  "iom-ukraine-msme-grants",
  "drc-ukraine-business-grants",
  "mercy-corps-uasp-agro",
];

test("catalog and assistant use the same program-specific facts and sources", () => {
  assert.ok(GRANT_CATALOG.length >= 97);
  assert.equal(new Set(GRANT_CATALOG.map(program => program.id)).size, GRANT_CATALOG.length);
  for (const program of GRANT_CATALOG) {
    assert.ok(!program.id.startsWith("erasmus-"), `Unexpected erasmus- ID: ${program.id}`);
    assert.ok(VALID_CATEGORIES.has(program.category), `Invalid category for ${program.id}: ${program.category}`);
    assert.ok(
      program.fundingType !== undefined && VALID_FUNDING_TYPES.has(program.fundingType),
      `Invalid fundingType for ${program.id}: ${program.fundingType}`,
    );
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
  assert.equal(getGrantSourceContext("vlasna-sprava",new Date("2026-11-16T15:00:00Z")).currentRoundOpen, false);
  assert.ok(!JSON.stringify(getGrantSourceContext("processing-business")).includes("2,5 млн"));
});

test("global and Ukrainian business funding additions satisfy strict catalog invariants", () => {
  assert.equal(GLOBAL_FUNDING_ADDITIONS.length, 29);
  const catalogIds = new Set(GRANT_CATALOG.map((program) => program.id));
  for (const id of EXPECTED_GLOBAL_ADDITION_IDS) {
    assert.ok(catalogIds.has(id), `Expected program missing from GRANT_CATALOG: ${id}`);
  }
  assert.deepEqual(
    GLOBAL_FUNDING_ADDITIONS.map((program) => program.id),
    EXPECTED_GLOBAL_ADDITION_IDS,
  );

  const checkTime = new Date("2026-11-18T12:00:00Z");
  for (const program of GLOBAL_FUNDING_ADDITIONS) {
    assert.equal(program.programKind, "program", program.id);
    assert.equal(program.intakeStatus, "unconfirmed", program.id);
    assert.equal(program.reviewStatus, "curated", program.id);
    assert.equal(program.checkedAt, "2026-11-18", program.id);
    assert.equal(program.availability, undefined, `Umbrella program must not fabricate availability: ${program.id}`);
    assert.equal(isGrantAvailable(program, checkTime), false, program.id);
    assert.match(program.officialUrl, /^https:\/\//, program.id);
    assert.ok((program.tags?.length ?? 0) >= 3, program.id);
    assert.ok((program.searchTerms?.length ?? 0) >= 3, program.id);
    assert.ok(program.details.overview.trim().length > 20, program.id);
    assert.ok(program.details.eligibility.length > 0, program.id);
    assert.ok(program.details.exclusions.length > 0, program.id);
    assert.ok(program.details.funding.length > 0, program.id);
    assert.ok(program.details.costs.length > 0, program.id);
    assert.ok(program.details.obligations.length > 0, program.id);
    assert.ok(program.details.documents.length > 0, program.id);
    assert.ok(program.details.steps.length > 0, program.id);
    assert.ok(program.details.timing.length > 0, program.id);
    assert.ok(program.details.pitfalls.length > 0, program.id);
    assert.ok(program.details.unresolved.length > 0, program.id);
    assert.ok(program.details.sources.length > 0, program.id);
    for (const source of program.details.sources) {
      assert.match(source.url, /^https:\/\//, `${program.id} source url`);
      assert.equal(source.checkedAt, "2026-11-18", `${program.id} source checkedAt`);
    }
  }
});
