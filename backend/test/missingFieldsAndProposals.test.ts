import test from "node:test";
import assert from "node:assert/strict";
import { computeMissingRequiredFields } from "../src/playbooks/missingFields.js";

test("computeMissingRequiredFields: vlasna-sprava checks 6 essential fields", () => {
  // Empty project
  const empty = computeMissingRequiredFields("vlasna-sprava", {});
  assert.equal(empty.program_id, "vlasna-sprava");
  assert.equal(empty.total_required_count, 6);
  assert.equal(empty.filled_count, 0);
  assert.equal(empty.is_complete, false);
  assert.equal(empty.missing_fields.length, 6);

  // Partially filled project
  const partial = computeMissingRequiredFields("vlasna-sprava", {
    details: {
      projectDescription: "Пекарня зі свіжою випічкою",
      customers: "Мешканці мікрорайону",
      salesChannels: "Власна крамниця та доставка",
    },
    items: [{ name: "Піч", unitPriceKopecks: 10000000, quantity: 1 }],
  });
  assert.equal(partial.filled_count, 4); // description, customers, salesChannels, budget
  assert.equal(partial.missing_fields.length, 2); // implementationPlan, expectedResults
  assert.equal(partial.is_complete, false);

  // Fully filled project
  const full = computeMissingRequiredFields("vlasna-sprava", {
    details: {
      projectDescription: "Пекарня зі свіжою випічкою",
      customers: "Мешканці мікрорайону",
      salesChannels: "Власна крамниця та доставка",
      implementationPlan: "Запуск за 3 місяці",
      expectedResults: "Виручка 200 тис. на місяць",
    },
    items: [{ name: "Піч", unitPriceKopecks: 10000000, quantity: 1 }],
  });
  assert.equal(full.filled_count, 6);
  assert.equal(full.missing_fields.length, 0);
  assert.equal(full.is_complete, true);
});

test("computeMissingRequiredFields: veteran-grant checks 8 fields including veteranStatus and fundingTier", () => {
  const empty = computeMissingRequiredFields("veteran-grant", {});
  assert.equal(empty.total_required_count, 8);
  assert.equal(empty.filled_count, 0);
  assert.ok(empty.missing_fields.some((f) => f.field_key === "veteranStatus"));
  assert.ok(empty.missing_fields.some((f) => f.field_key === "fundingTier"));

  const full = computeMissingRequiredFields("veteran-grant", {
    details: {
      projectDescription: "СТО для вантажівок",
      customers: "Перевізники",
      salesChannels: "Прямі договори",
      implementationPlan: "Оренда боксу та закупівля гідравліки",
      expectedResults: "Обслуговування 30 авто/міс",
      veteranStatus: "ubd",
      fundingTier: 500000,
    },
    items: [{ name: "Підйомник", unitPriceKopecks: 25000000, quantity: 2 }],
  });
  assert.equal(full.filled_count, 8);
  assert.equal(full.is_complete, true);
});

test("computeMissingRequiredFields: ua-brave1-core checks 12 fields of defense R&D lifecycle", () => {
  const empty = computeMissingRequiredFields("ua-brave1-core", {});
  assert.equal(empty.total_required_count, 12);
  assert.equal(empty.filled_count, 0);

  const full = computeMissingRequiredFields("ua-brave1-core", {
    title: "Система Спектр-1",
    details: {
      defense_category: "РЕБ",
      operational_problem: "Глушіння дронів",
      technical_solution_public: "Широкосмуговий глушник",
      current_trl: 4,
      target_trl: 6,
      trl_evidence: "https://example.com/video",
      rd_milestones: [
        { title: "Етап 1", duration_months: 2, deliverable: "Макет", cost_kopecks: 30000000 },
        { title: "Етап 2", duration_months: 3, deliverable: "Прототип", cost_kopecks: 70000000 },
      ],
      team_engineering_background: "3 інженери-радіофізики",
      testing_and_scaling_plan: "Випробування у камері та полігон",
      supply_chain_and_risks: "Компоненти з ЄС",
    },
    items: [{ name: "Плата FPGA", unitPriceKopecks: 50000000, quantity: 2 }],
  });

  assert.equal(full.filled_count, 12);
  assert.equal(full.missing_fields.length, 0);
  assert.equal(full.is_complete, true);
});
