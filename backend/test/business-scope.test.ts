import test from "node:test";
import assert from "node:assert/strict";
import { readiness } from "../src/project-details.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";

test("business preparation keeps business fields, budget and sourced submission steps", () => {
  assert(GRANT_CATALOG.every((program) => !program.id.startsWith("erasmus-")));
  const details = {
    projectDescription: "Кав’ярня",
    customers: "Покупці",
    salesChannels: "Продажі",
    implementationPlan: "План запуску",
    expectedResults: "Результат",
  };
  const row = {
    program_id: "vlasna-sprava",
    revision: 1,
    title: "Кав’ярня молодого підприємця",
    details,
    items: [],
    total_kopecks: "0",
  };
  const result = readiness(row);
  assert.equal(result.checks.length, 6);
  assert.equal(
    result.checks.find((check) => check.id === "budget")?.status,
    "missing",
  );
});

test("youth support is an age-qualified business condition, not a student scholarship", () => {
  const program = GRANT_CATALOG.find(
    (program) => program.id === "vlasna-sprava",
  )!;
  assert(
    program.details.sources.some(
      (source) => source.url === "https://madeinukraine.gov.ua/vlasna-sprava",
    ),
  );
  assert(
    program.details.funding.some(
      (item) =>
        item.includes("18–25") &&
        item.includes("+5%") &&
        item.includes("базової"),
    ),
  );
  assert(
    program.details.pitfalls.some((item) =>
      item.includes("Студентський статус не визначає вік"),
    ),
  );
});
