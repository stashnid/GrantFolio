import { test } from "node:test";
import assert from "node:assert/strict";
import { assessBudget, readiness } from "../src/project-details.js";
import { draftExport } from "../src/draft-export.js";

const details = {
  projectDescription: "Майстерня ремонтує велосипеди місцевих жителів.",
  customers: "Наші клієнти — власники велосипедів у громаді.",
  salesChannels: "Замовлення приймаємо в майстерні та через сайт.",
  implementationPlan: "Спочатку орендуємо приміщення, потім придбаємо обладнання.",
  expectedResults: "Плануємо надавати послуги ремонту протягом року.",
};
const items = [{ name: "Верстак", quantity: 2, unitPriceKopecks: 1999 }];
const row = { title: "Майстерня", program_id: null, revision: 3, details, items, total_kopecks: "3998" };

test("basic checklist distinguishes substantive entries from empty and placeholder text", () => {
  assert.ok(readiness(row).checks.every(c => c.status === "complete"));
  const incomplete = readiness({ ...row, details: { ...details, customers: "TODO заповнити пізніше", salesChannels: "[додати канал]" }, items: [{ ...items[0], unitPriceKopecks: 0 }] });
  for (const id of ["customers", "salesChannels", "budget"]) assert.equal(incomplete.checks.find(c => c.id === id)?.status, "missing");
  assert.match(incomplete.disclaimer, /не перевіряє відповідність/);
});

test("export reports source, missing work, exact totals and unverified submission", () => {
  const result = draftExport(row);
  assert.match(result, /2 × 19,99 грн = 39,98 грн/);
  assert.match(result, /Джерело відомостей/);
  assert.match(result, /Не офіційна заявка/);
  assert.match(result, /потрібно перевірити/);
  assert.doesNotMatch(result, /заявку підписано|заявку подано/i);
  const inconsistent = { ...row, total_kopecks: "4000" };
  assert.equal(readiness(inconsistent).checks.find(c => c.id === "budget")?.status, "missing");
  assert.match(draftExport(inconsistent), /Підсумок потребує перевірки/);
});

test("legacy malformed items are flagged rather than exported as reliable figures", () => {
  const malformed = { ...row, items: [{ name: "", quantity: -1, unitPriceKopecks: 5 }] };
  assert.equal(readiness(malformed).checks.find(c => c.id === "budget")?.status, "missing");
  assert.match(draftExport(malformed), /Позиції бюджету пошкоджені/);
});

test("shared print and export budget assessment reconciles the saved snapshot", () => {
  assert.deepEqual(assessBudget(items, 3998), { validItems: true, totalMatches: true });
  assert.deepEqual(assessBudget(items, 4000), { validItems: true, totalMatches: false });
  assert.deepEqual(assessBudget([{ ...items[0], quantity: -1 }], 3998), { validItems: false, totalMatches: false });
  assert.deepEqual(assessBudget([], 0), { validItems: true, totalMatches: true });
});

test("repeated boilerplate cannot pass as five distinct sections, while short facts can", () => {
  const repeated = Object.fromEntries(Object.keys(details).map(key => [key, "Наша справа буде успішною."])) as typeof details;
  assert.ok(readiness({ ...row, details: repeated }).checks.filter(c => c.id !== "budget").every(c => c.status === "missing"));
  const brief = { projectDescription: "Ремонт велосипедів", customers: "Мешканці громади", salesChannels: "Майстерня та сайт", implementationPlan: "Оренда, закупівля, запуск", expectedResults: "Надання послуг ремонту" };
  assert.ok(readiness({ ...row, details: brief }).checks.every(c => c.status === "complete"));
  const promotional = { ...brief, projectDescription: "Наша справа буде успішною." };
  assert.equal(readiness({ ...row, details: promotional }).checks[0].status, "missing");
});
