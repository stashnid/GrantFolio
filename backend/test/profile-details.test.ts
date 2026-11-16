import assert from "node:assert/strict";
import test from "node:test";
import { profileDetails } from "../src/profile-details.js";

test("profile formats normalize accepted values without corrupting them", () => {
  assert.deepEqual(profileDetails.parse({ phone: " 050 123-45-67 ", kved: "10.10; 99.99,62.01", requestedAmount: "250 000,50", ownContribution: "1 000.25" }), {
    phone: "+380501234567", kved: "10.10, 99.99, 62.01", requestedAmount: "250000.50", ownContribution: "1000.25",
  });
  assert.equal(profileDetails.parse({ phone: "+1 (202) 555-0123" }).phone, "+12025550123");
  assert.equal(profileDetails.parse({ phone: "+1234567" }).phone, "+1234567");
  assert.equal(profileDetails.parse({ phone: "+380 50.123.45.67" }).phone, "+380501234567");
  assert.equal(profileDetails.parse({ requestedAmount: "250 000,50" }).requestedAmount, "250000.50");
  assert.deepEqual(profileDetails.parse({ phone: "", kved: "", requestedAmount: "", ownContribution: "" }), { phone: "", kved: "", requestedAmount: "", ownContribution: "" });
  assert.equal(profileDetails.parse({ requestedAmount: "1000000000" }).requestedAmount, "1000000000");
});

test("profile formats reject malformed values rather than silently altering them", () => {
  for (const phone of ["+380", "380501234567", "++380501234567", "+38050abc1234567", "+380/501234567", "+012345678", "+1234567890123456"]) assert.equal(profileDetails.safeParse({ phone }).success, false, phone);
  for (const kved of ["10.1", "10.10;", "10.10 62.01", "10.10,abc", "1010"]) assert.equal(profileDetails.safeParse({ kved }).success, false, kved);
  for (const requestedAmount of ["-1", "1a2", "1 00", "2 50,00", "1,000,00", "1.000.00", "1.234", "1000000000.01", "250 000,500"]) assert.equal(profileDetails.safeParse({ requestedAmount }).success, false, requestedAmount);
});
