import test from "node:test";
import assert from "node:assert/strict";
import { PLAYBOOKS, getProgramPlaybook, isDeepProgram } from "../src/playbooks/index.js";
import { ProgramPlaybookSchema } from "../src/playbooks/schema.js";

test("playbooks schema validates all 5 deep programs", () => {
  const ids = ["vlasna-sprava", "veteran-grant", "ua-brave1-core", "processing-business", "agro-gardens"];

  for (const id of ids) {
    const playbook = getProgramPlaybook(id);
    assert.ok(playbook, `Playbook ${id} must exist`);
    const parsed = ProgramPlaybookSchema.safeParse(playbook);
    assert.ok(parsed.success, `Playbook ${id} failed schema validation: ${JSON.stringify(parsed.error)}`);
    assert.equal(playbook.support_tier, "deep");
    assert.equal(isDeepProgram(id), true);
  }
});

test("Brave1 playbook contains essential defense-tech and air defense terms", () => {
  const brave1 = getProgramPlaybook("ua-brave1-core")!;
  assert.equal(brave1.canonical_name.includes("Brave1"), true);
  assert.ok(brave1.domain_tags.includes("приватне ппо") || brave1.domain_tags.includes("ппо"));
  assert.ok(brave1.domain_tags.includes("антидрон"));
  assert.ok(brave1.domain_tags.includes("реб"));
  assert.ok(brave1.domain_tags.includes("defense tech"));
  assert.ok(brave1.eligibility_rules.stop_factors.length > 0);
  assert.ok(brave1.scoring_rubric.criteria.length >= 3);
});

test("Vlasna Sprava playbook enforces 36-month tax payback and expense caps", () => {
  const vs = getProgramPlaybook("vlasna-sprava")!;
  assert.equal(vs.eligibility_rules.tax_payback_months, 36);
  assert.equal(vs.budget_rules.rent_limit_percent, 25);
  assert.equal(vs.budget_rules.marketing_limit_percent, 10);
  assert.equal(vs.budget_rules.raw_materials_limit_percent, 50);
});

test("Processing business playbook enforces 25 jobs and 50% co-financing", () => {
  const proc = getProgramPlaybook("processing-business")!;
  assert.equal(proc.eligibility_rules.min_jobs, 25);
  assert.equal(proc.eligibility_rules.co_financing_percent, 50);
});
