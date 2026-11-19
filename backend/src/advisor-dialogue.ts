export type DialogueIntent = "complaint" | "correction" | "topic_change" | "information" | "comparison" | "followup" | "search";

/** Classify the current turn independently of old search words. */
export function classifyDialogue(message: string): DialogueIntent {
  const q = message.trim().toLocaleLowerCase("uk");
  if (/(чому|навіщо).*(повтор|не шука|не знайш|помил)|ти (повтор|помил|не шука)/u.test(q)) return "complaint";
  if (/(виправ|помилив|помилилась|насправді|замість|неправильно)/u.test(q)) return "correction";
  if (/(інша тема|інш[аие] потреб|а тепер|передумав|передумала)/u.test(q)) return "topic_change";
  if (/(порівняй|порівняти|різниця між|compare)/u.test(q)) return "comparison";
  if (/(що таке|розкажи про|які (?:умови|вимоги|документи)|умови участі|вимоги до|what is)/u.test(q)) return "information";
  if (/^(?:[\p{L}ʼ’'-]+|\d[\d\s.,]*(?:\s*(?:грн|тис|млн))?)$/u.test(q)) return "followup";
  return "search";
}

export function buildDialogueQuery(message: string, previousSeed: string): { intent: DialogueIntent; query: string } {
  const intent = classifyDialogue(message);
  // A complaint is an instruction about the prior response, not a search term.
  const query = intent === "topic_change" ? message : intent === "complaint" ? previousSeed : [previousSeed, message].filter(Boolean).join(" ");
  return { intent, query: query.slice(-5000) };
}
