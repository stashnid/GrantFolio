import assert from "node:assert/strict";
import test from "node:test";
import { extractProfileFromText, extractProfileFromHistory } from "../src/profile-extractor.js";

test("extracts cafe in Lviv with FOP and 250k budget", () => {
  const text = "Я маю кав'ярню у Львові, працюю як ФОП, хочу купити нову кавомашину на 250 000 грн. У команді 3 людей. Досвіду немає.";
  const { data, facts } = extractProfileFromText(text);

  assert.equal(data.businessName, "Кав'ярня");
  assert.equal(data.city, "Львів");
  assert.equal(data.region, "Львівська область");
  assert.equal(data.legalForm, "fop");
  assert.equal(data.industry, "Громадське харчування");
  assert.equal(data.requestedAmount, "250000");
  assert.equal(data.teamSize, "3");
  assert.ok(data.fundingPurpose?.includes("придбання обладнання"));
  assert.ok(data.grantExperience?.includes("відсутній"));
  assert.ok(facts.length >= 6);
});

test("extracts sewing production in Kyiv with TOV and 500k budget", () => {
  const text = "У нас швейне виробництво одягу в Києві, зареєстровані як ТОВ. Потрібно 500 тисяч гривень на верстати та тканину, команда 5 працівників.";
  const { data } = extractProfileFromText(text);

  assert.equal(data.businessName, "Швейне виробництво");
  assert.equal(data.city, "Київ");
  assert.equal(data.region, "м. Київ");
  assert.equal(data.legalForm, "company");
  assert.equal(data.industry, "Виробництво");
  assert.equal(data.requestedAmount, "500000");
  assert.equal(data.teamSize, "5");
  assert.ok(data.fundingPurpose?.includes("придбання обладнання"));
});

test("extracts startup idea with no registered business", () => {
  const text = "Планую відкрити дитячий розвивальний центр в Одесі, бізнесу ще немає, тільки ідея. Працюватиму сам на першому етапі.";
  const { data } = extractProfileFromText(text);

  assert.equal(data.businessName, "Дитячий розвивальний центр");
  assert.equal(data.city, "Одеса");
  assert.equal(data.region, "Одеська область");
  assert.equal(data.legalForm, "idea");
  assert.equal(data.industry, "Освіта");
  assert.equal(data.teamSize, "1");
});

test("does not produce false positives on common words (допоможіть, сума, рівні, один)", () => {
  const text = "Допоможіть, будь ласка. Потрібна сума один мільйон на початковому рівні для відкриття медичного кабінету.";
  const { data } = extractProfileFromText(text);

  assert.notEqual(data.industry, "Інформаційні технології");
  assert.equal(data.industry, "Охорона здоров’я");
  assert.notEqual(data.city, "Суми");
  assert.notEqual(data.city, "Рівне");
  assert.notEqual(data.teamSize, "1");
});

test("extracts facts progressively across multiple conversation turns", () => {
  const history = [
    { question: "Привіт! Шукаю грант на відкриття кав'ярні" },
    { question: "Ми знаходимось у Львові, зареєструвались як ФОП" },
    { question: "Потрібно 250 000 грн на кавомашину та ремонт, у команді 3 людей" },
  ];
  const { data, facts } = extractProfileFromHistory(history);

  assert.equal(data.businessName, "Кав'ярня");
  assert.equal(data.city, "Львів");
  assert.equal(data.region, "Львівська область");
  assert.equal(data.legalForm, "fop");
  assert.equal(data.requestedAmount, "250000");
  assert.equal(data.teamSize, "3");
  assert.ok(facts.length >= 5);
});
