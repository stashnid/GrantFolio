import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDialogueQuery, classifyDialogue } from "../src/advisor-dialogue.js";
import { nextQuestion } from "../src/advisor.js";

test("turn classification preserves context without searching complaint or prior topic", () => {
  assert.equal(classifyDialogue("чому ти зразу не шукаєш?"), "complaint");
  assert.equal(buildDialogueQuery("чому ти зразу не шукаєш?", "хочу ППО brave1").query, "хочу ППО brave1");
  assert.equal(buildDialogueQuery("Львів", "кав'ярня").query, "кав'ярня Львів");
  assert.equal(buildDialogueQuery("а тепер сад", "кав'ярня").query, "а тепер сад");
  assert.equal(classifyDialogue("що таке Brave1?"), "information");
  assert.equal(classifyDialogue("насправді сума 50 тисяч"), "correction");
  assert.equal(classifyDialogue("150 тис."), "followup");
  assert.equal(nextQuestion("brave1", [], false), "Яка орієнтовна сума вам потрібна?");
});
