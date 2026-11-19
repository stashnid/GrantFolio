import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { searchGrants } from "./grant-discovery.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import { configuredGeminiResponder } from "./gemini.js";
import type { AssistantResponder } from "./assistant.js";
import { buildDialogueQuery } from "./advisor-dialogue.js";
const input = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();
const uuid = z.string().uuid();
const view = (r: any) => ({
  id: r.id,
  conversationId: r.conversation_id,
  question: r.question,
  reply: r.reply,
  ...r.payload,
  createdAt: r.created_at,
});
// Ask for one missing fact at a time using the current conversation, not just the last message.
export function nextQuestion(query: string, intents: string[], hasMatches: boolean): string {
  const q = query.toLocaleLowerCase("uk");
  // A mention of ФОП alone (e.g. “чи потрібен ФОП?”) is not a status.
  const hasBusinessStatus = /(?:ще\s+)?не\s+(?:є\s+|маю\s+|зареєстрован(?:ий|а)\s+як\s+)?фоп|(?:немає|не маю)\s+(?:зареєстрованого\s+)?фоп|(?:працюю|зареєстрован(?:ий|а)|оформлен(?:ий|а))\s+(?:як\s+)?фоп|(?:маю|відкрив|відкрила|вже)\s+фоп|(?:фоп|бізнес)\s+(?:вже|ще не|немає)|вже працю|планую відкрити/.test(q);
  if (
    /(студент|student)/i.test(q) &&
    !intents.some((i) =>
      ["business", "transport", "production", "garden", "equipment"].includes(
        i,
      ),
    )
  )
    return "Яку справу ви плануєте відкрити або розвинути? На що потрібні кошти?";
  if (
    intents.includes("transport") &&
    /(особист|для себе|власного користування)/.test(q)
  )
    return "Чи є інша потреба, для якої ви шукаєте фінансування?";
  if (intents.includes("transport")) {
    if (!/(достав|робот|бізнес|підприєм|фоп|особист|для себе)/.test(q))
      return "Для чого саме вам потрібне авто?";
    if (!hasBusinessStatus)
      return "Ви вже працюєте як ФОП або тільки плануєте відкрити справу?";
  }
  const withoutAge = q.replace(
    /(?:мені|вік|віком)\s*\d{1,3}(?:\s*рок(?:и|ів|у)?)?/g,
    "",
  );
  if (!/(?:^|\s)\d+(?:[.,]\d+)?(?:\s|$)|тисяч|тис\b|мільйон/.test(withoutAge))
    return "Яка орієнтовна сума вам потрібна?";
  if (
    !/(регіон|област|ки(?:їв|єв)|льв(?:ів|ов)|одес|хар(?:ків|ков)|дніпр|запоріж|полтав|вінниц|черкас|черніг|чернів|житомир|сум|терноп|луц(?:ьк|к)|рівн|ужгород|микола(?:їв|єв)|херсон|кропивницьк|івано|хмельницьк)/.test(
      q,
    )
  )
    return "У якому регіоні ви плануєте працювати?";
  if (
    !hasBusinessStatus
  )
    return "Ви вже працюєте як ФОП або тільки плануєте відкрити справу?";
  return hasMatches
    ? "Наступний крок — переглянути можливі програми та перевірити їхні актуальні умови. Яку з них розглянемо першою?"
    : "Уточніть, будь ласка, які витрати потрібні для справи, щоб я міг допомогти з пошуком.";
}
export function advisorRouter(
  db: Pool,
  responder: AssistantResponder | undefined = configuredGeminiResponder(),
  timeoutMs = 25000,
) {
  const router = Router();
  const active = new Set<string>();
  router.get("/conversations", async (_req, res, next) => {
    try {
      const r = await db.query(
        `SELECT conversation_id AS id, (array_agg(question ORDER BY created_at,id))[1] AS title, MAX(created_at) AS "updatedAt" FROM advisor_messages WHERE owner_id=$1 GROUP BY conversation_id ORDER BY MAX(created_at) DESC LIMIT 30`,
        [res.locals.uid],
      );
      res.json({
        conversations: r.rows.map((r) => ({
          ...r,
          title: r.title.slice(0, 70),
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.get("/", async (req, res, next) => {
    if (
      !uuid.safeParse(req.query.conversationId).success ||
      (req.query.before !== undefined &&
        !uuid.safeParse(req.query.before).success)
    ) {
      res.status(400).json({ error: "invalid_conversation" });
      return;
    }
    try {
      const before = req.query.before;
      if (before) {
        const c = await db.query(
          "SELECT 1 FROM advisor_messages WHERE id=$1 AND owner_id=$2 AND conversation_id=$3",
          [before, res.locals.uid, req.query.conversationId],
        );
        if (!c.rowCount) {
          res.status(404).json({ error: "not_found" });
          return;
        }
      }
      const r = await db.query(
        `SELECT * FROM advisor_messages WHERE owner_id=$1 AND conversation_id=$2 AND ($3::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM advisor_messages WHERE id=$3 AND owner_id=$1 AND conversation_id=$2)) ORDER BY created_at DESC,id DESC LIMIT 31`,
        [res.locals.uid, req.query.conversationId, before ?? null],
      );
      const rows = r.rows.slice(0, 30).reverse();
      res.json({
        messages: rows.map(view),
        hasMore: r.rows.length > 30,
        nextBefore: r.rows.length > 30 ? rows[0]?.id : null,
      });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_message" });
      return;
    }
    const uid: string = res.locals.uid;
    const p = parsed.data;
    try {
      const existing = await db.query(
        "SELECT * FROM advisor_messages WHERE id=$1",
        [p.id],
      );
      if (existing.rowCount) {
        const r = existing.rows[0];
        if (
          r.owner_id !== uid ||
          r.conversation_id !== p.conversationId ||
          r.question !== p.message
        ) {
          res.status(409).json({ error: "message_conflict" });
          return;
        }
        res.json({ message: view(r) });
        return;
      }
      if (active.has(uid)) {
        res.status(429).json({ error: "advisor_busy" });
        return;
      }
      active.add(uid);
      try {
        const history = await db.query(
          "SELECT question,reply,payload FROM advisor_messages WHERE owner_id=$1 AND conversation_id=$2 ORDER BY created_at DESC,id DESC LIMIT 12",
          [uid, p.conversationId],
        );
        const prior = history.rows.reverse();
        const previousSeed: string =
          typeof prior.at(-1)?.payload?.seed === "string"
            ? prior.at(-1).payload.seed
            : prior.map((r) => r.question).join(" ");
        const current = searchGrants(p.message);
        const previous = searchGrants(previousSeed);
        const dialogue = buildDialogueQuery(p.message, previousSeed);
        const distinctNeed = dialogue.intent === "search" &&
          /(хочу|шукаю|потріб|грант.*для)/i.test(p.message) &&
          previous.intents.some((intent) => intent !== "applicant") &&
          !current.intents.some((intent) => intent !== "applicant" && previous.intents.includes(intent));
        const newNeed = dialogue.intent === "topic_change" || (current.intents.length > 0 && distinctNeed);
        const query = newNeed ? p.message : dialogue.query;
        const rawSearch = searchGrants(query);
        const businessIntents = [
          "business",
          "transport",
          "production",
          "garden",
          "equipment",
        ];
        const personalEducation =
          /(стипенді|магістр|бакалавр|навчан|навчат|освіт|scholarship|university)/i.test(
            p.message,
          ) && !current.intents.some((i) => businessIntents.includes(i));
        const studentNeedsIdea =
          /(студент|student)/i.test(query) &&
          !rawSearch.intents.some((i) => businessIntents.includes(i));
        const search = {
          ...rawSearch,
          matches:
            personalEducation || studentNeedsIdea
              ? []
              : rawSearch.matches.filter(
                  (m) => !m.programId.startsWith("erasmus-"),
                ),
        };
        const profile = await db.query(
          'SELECT business_name AS "businessName",description,region,details FROM profiles WHERE owner_id=$1',
          [uid],
        );
        let businessProfile;
        if (profile.rowCount) {
          const { businessName, description, region, details } = profile.rows[0];
          const source = details && typeof details === "object" ? details : {};
          const safe = Object.fromEntries(["legalForm", "industry", "fundingPurpose", "requestedAmount", "teamSize"].filter((key) => typeof source[key] === "string").map((key) => [key, source[key]]));
          businessProfile = { businessName, description, region, details: safe };
        }
        const greeting = /^(привіт|вітаю|добрий день|доброго дня)[!. ]*$/i.test(
          p.message,
        );
        let reply = personalEducation
          ? "GrantFolio допомагає шукати фінансування для відкриття або розвитку бізнесу. Програми для особистого навчання та стипендії не входять до каталогу. Якщо маєте підприємницьку ідею, розкажіть про неї."
          : studentNeedsIdea
            ? "Допоможу розібратися з фінансуванням підприємницької ідеї. Яку справу ви плануєте відкрити або розвинути та на що потрібні кошти?"
            : greeting
              ? "Вітаю! Допоможу розібратися з фінансуванням і підготувати матеріали для заявки. На що вам потрібні кошти? Можна описати своїми словами — знати назву гранту не потрібно."
              : `${search.explanation}\n\n${search.matches
                  .slice(0, 3)
                  .map((m) => `${m.title}. ${m.reason}`)
                  .join("\n\n")}\n\n${nextQuestion(query, search.intents, search.matches.length > 0)}`;
        const selected = (current.matches[0] ?? search.matches[0]);
        const selectedProgram = selected && GRANT_CATALOG.find((program) => program.id === selected.programId);
        if (dialogue.intent === "information" && selectedProgram) {
          reply = `${selectedProgram.title}. ${selectedProgram.summary}\n\nДля кого: ${selectedProgram.targetAudience}\nУмови: ${selectedProgram.keyCondition}\nСтатус прийому та чинні вимоги потрібно перевірити: ${selectedProgram.officialUrl}`;
        } else if (dialogue.intent === "complaint") {
          reply = `Перепрошую, попередня відповідь не допомогла. Я повторно перевірив наявний каталог за вашою попередньою потребою. ${search.matches.length ? search.matches.slice(0, 3).map((m) => `${m.title}: ${m.reason}`).join(" ") : "Підтвердженого результату цього пошуку немає; назву програми або напрям можна перевірити в каталозі."}`;
        } else if (dialogue.intent === "correction") {
          reply = `Врахую ваше уточнення в цій розмові. Збережений профіль не змінено; якщо потрібно оновити його, внесіть зміну в профілі.\n\n${search.explanation}`;
        }
        let mode = "guided";
        let fallbackReason: "not_configured" | "provider_error" | "invalid_response" | undefined = responder ? undefined : "not_configured";
        if (responder && !personalEducation && !studentNeedsIdea && !["complaint", "information", "correction"].includes(dialogue.intent)) {
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const generated = await Promise.race([
              responder(
                {
                  title: "Підбір фінансування за потребою",
                  revision: 0,
                  profileRevision: 0,
                  details: {},
                  items: [],
                  total_kopecks: "0",
                  businessProfile,
                  mode: "discovery",
                  discovery: {
                    query,
                    search,
                    programs: search.matches
                      .slice(0, 4)
                      .map((m) =>
                        GRANT_CATALOG.find((p) => p.id === m.programId),
                      ),
                    history: newNeed
                      ? []
                      : prior
                          .filter((r) => previousSeed.includes(r.question))
                          .slice(-6)
                          .map(({ question, reply }) => ({ question, reply })),
                  },
                },
                p.message,
                controller.signal,
              ),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  controller.abort();
                  reject(Error("timeout"));
                }, timeoutMs);
              }),
            ]);
            if (
              typeof generated === "string" &&
              generated.trim() &&
              generated.length <= 12000
            ) {
              reply = generated.trim();
              mode = "ai";
            } else {
              fallbackReason = "invalid_response";
            }
          } catch {
            fallbackReason = "provider_error";
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        if (fallbackReason === "provider_error" || fallbackReason === "invalid_response") {
          reply = `Модель тимчасово недоступна; нижче наведено обмежений пошук каталогу.\n\n${reply}`;
        }
        search.questions = ["complaint", "information", "correction"].includes(dialogue.intent)
          ? []
          : [nextQuestion(query, search.intents, search.matches.length > 0)];
        const payload = {
          mode,
          search,
          seed: query.slice(-2000),
          dialogueIntent: dialogue.intent,
          fallbackReason,
        };
        const saved = await db.query(
          `INSERT INTO advisor_messages(id,conversation_id,owner_id,question,reply,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING RETURNING *`,
          [
            p.id,
            p.conversationId,
            uid,
            p.message,
            reply,
            JSON.stringify(payload),
          ],
        );
        if (!saved.rowCount) {
          res.status(409).json({ error: "message_conflict" });
          return;
        }
        res.json({ message: view(saved.rows[0]) });
      } finally {
        active.delete(uid);
      }
    } catch (e) {
      next(e);
    }
  });
  return router;
}
