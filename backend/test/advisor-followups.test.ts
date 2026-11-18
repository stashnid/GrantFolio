import test from "node:test";
import assert from "node:assert/strict";
import { advisorFollowups } from "../../frontend/src/advisor-followups.js";

test("follow-ups do not contradict known business status or repeat a stated vehicle use", () => {
  for (const seed of ["Я ще не ФОП, хочу авто для доставки", "Я вже ФОП і потрібне авто для доставки"]) {
    const choices = advisorFollowups(seed, true);
    assert.ok(!choices.includes("Уже працюю як ФОП"));
    assert.ok(!choices.includes("Авто для доставки товарів"));
    assert.ok(!choices.includes("Авто для особистих потреб"));
  }
  assert.ok(!advisorFollowups("Я ще не ФОП, планую кав’ярню", false).includes("Уже працюю як ФОП"));
  for (const seed of ["Потрібне авто", "Чи потрібен ФОП для гранту?", "Чи потрібно відкрити ФОП?"]) {
    assert.ok(advisorFollowups(seed, true).includes("Уже працюю як ФОП"));
    assert.ok(advisorFollowups(seed, false).includes("Уже працюю як ФОП"));
  }
});

test("farm suggestions let the user ask for spending, requirements, and application steps", () => {
  assert.deepEqual(advisorFollowups("Хочу відкрити ферму", false), [
    "На що можна витратити кошти?",
    "Які вимоги до заявника?",
    "Як підготувати й подати заявку?",
  ]);
});
