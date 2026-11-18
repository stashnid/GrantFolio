import assert from "node:assert/strict";
import test from "node:test";
import { getGrantApplication, grantApplicationAnswersSchema } from "../src/grant-application.js";
import type { GrantApplicationAnswers } from "../src/grant-application.js";

const answers: GrantApplicationAnswers = {
  track: "start",
  applicantType: "individual",
  location: "Львів",
  activity: "Пекарня, КВЕД 10.71",
  newJobs: 0,
  marketEvidence: "Синтетичний сценарій дослідження попиту",
  financialAssumptions: "Перевірити сезонність і виробничу собівартість",
  permits: "Перевірити вимоги до потужності харчового виробництва",
  projectRisks: "Резервне джерело енергії для зменшення простоїв",
  expectedImpact: "Продаж місцевим споживачам",
  quoteEvidence: "Потрібні дві комерційні пропозиції",
  requestedGrantKopecks: 17_000_000,
  ownContributionKopecks: 6_000_050,
  confirmAccuracy: true,
};
const context = {
  budgetTotalKopecks: "23000050",
  details: {
    projectDescription: "Пекарня",
    customers: "Мешканці району",
    salesChannels: "Продаж на місці",
    implementationPlan: "Облаштувати виробництво",
    expectedResults: "Запуск продажів",
  },
};

test("pilot follows next unanswered field and proposes rather than confirms profile data", () => {
  assert.equal(getGrantApplication("unconfigured", {}), null);
  assert.equal(getGrantApplication("vlasna-sprava", {})?.nextQuestion?.id, "track");
  const step = getGrantApplication("vlasna-sprava", { track: "start" }, { legalForm: "fop", city: "Львів" })!;
  assert.equal(step.nextQuestion?.id, "applicantType");
  assert.equal(step.nextQuestion?.value, undefined);
  assert.equal(step.nextQuestion?.suggestion, "entrepreneur");
  assert(!step.questions.some(q => q.id === "monthsInBusiness"));
});

test("scaling checks tenure, job count and published amount limits", () => {
  const view = getGrantApplication("vlasna-sprava", {
    ...answers, track: "scale", newJobs: 0, monthsInBusiness: 5, requestedGrantKopecks: 250_000_001,
  }, context)!;
  for (const code of ["scale_activity_duration", "scale_new_job_required", "grant_exceeds_published_maximum"]) {
    assert(view.issues.some(issue => issue.code === code && issue.severity === "blocking"));
  }
  assert.equal(view.readyForReview, false);
  assert(view.questions.some(q => q.id === "existingJobs"));
});

test("completion requires matches in integer kopecks, saved details and confirmation", () => {
  const view = getGrantApplication("vlasna-sprava", answers, context)!;
  assert.equal(view.nextQuestion, null);
  assert.equal(view.financials.uncoveredKopecks, 0);
  assert.equal(view.readyForReview, true);
  assert.equal(getGrantApplication("vlasna-sprava", { ...answers, confirmAccuracy: false }, context)?.nextQuestion?.id, "confirmAccuracy");
  assert.equal(getGrantApplication("vlasna-sprava", answers, { ...context, budgetTotalKopecks: "23000051" })?.financials.uncoveredKopecks, 1);
  assert.equal(getGrantApplication("vlasna-sprava", answers, { ...context, details: {} })?.readyForReview, false);
  assert.equal(grantApplicationAnswersSchema.safeParse({ requestedGrantKopecks: 1.1 }).success, false);
  assert.equal(grantApplicationAnswersSchema.safeParse({ ownerId: "forged" }).success, false);
});

test("garden prepares a signed planting plan and enforces distinct land and funding criteria", () => {
  const view = getGrantApplication("agro-gardens", {
    applicantType: "individual", landArea: 0.9, landTenure: "lease", landUseYears: 6,
    cropType: "other", requestedGrantKopecks: 70_001, plantingDocument: "pending",
  }, { budgetTotalKopecks: "100000" })!;
  assert(view.questions.some(q => q.id === "irrigationPlan"));
  assert(!view.questions.some(q => q.id === "track"));
  assert.match(view.submission, /підписом його розробника/);
  for (const code of ["garden_applicant", "garden_area", "garden_land_term", "garden_grant_share", "garden_signed_plan"]) {
    assert(view.issues.some(issue => issue.code === code));
  }
  const vineyard = getGrantApplication("agro-gardens", { cropType: "grape", landTenure: "owned" })!;
  assert(!vineyard.questions.some(q => q.id === "irrigationPlan" || q.id === "landUseYears"));
});
