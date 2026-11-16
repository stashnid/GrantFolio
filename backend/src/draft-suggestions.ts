import { z } from "zod";

const text = z.string().trim().min(1).max(3000);
const fields = z.object({
  projectDescription: text.optional(),
  customers: text.optional(),
  salesChannels: text.optional(),
  implementationPlan: text.optional(),
  expectedResults: text.optional(),
}).strict().refine(value => Object.keys(value).length > 0);
export type DraftSuggestion = { field: "projectDescription" | "customers" | "salesChannels" | "implementationPlan" | "expectedResults"; text: string };

/** Treat model output as untrusted: hide all marked blocks, even if malformed. */
export function parseDraftSuggestions(raw: string): {reply: string; suggestions?: DraftSuggestion[]} {
  const marked = /```[ \t]*grantfolio-draft[^\r\n]*(?:\r?\n|$)[\s\S]*?(?:```[ \t]*(?=\r?\n|$)|$)/gi;
  const blocks = [...raw.matchAll(marked)];
  if (!blocks.length) return {reply: raw};
  const cleaned = raw.replace(marked, "").trim();
  let suggestions: DraftSuggestion[] | undefined;
  if (blocks.length === 1) {
    const match = blocks[0][0].match(/^```grantfolio-draft[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/);
    if (match) {
      try {
        const result = fields.safeParse(JSON.parse(match[1]));
        if (result.success) suggestions = Object.entries(result.data).map(([field, value]) => ({field: field as DraftSuggestion["field"], text: value!}));
      } catch { /* Invalid output is never applied. */ }
    }
  }
  return {reply: cleaned || (suggestions ? "Перегляньте запропоновані чернетки перед додаванням до проєкту." : "Не вдалося підготувати текст. Спробуйте уточнити запит."), ...(suggestions ? {suggestions} : {})};
}
