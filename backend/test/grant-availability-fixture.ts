import type { GrantCatalogEntry } from "../src/grant-catalog-data.js";

export const confirmedTestRound = {
  state: "open",
  checkedAt: "2026-11-16T14:00:00Z",
  validUntil: "2026-11-17T16:00:00Z",
  sourceUrl: "https://example.test/round",
  deadlineAt: "2026-11-27T21:59:59Z",
  startsAt: "2026-11-15T22:00:00Z",
  evidence: "Synthetic confirmed round for ranking tests",
} satisfies NonNullable<GrantCatalogEntry["availability"]>;
