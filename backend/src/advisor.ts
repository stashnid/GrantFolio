import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { searchGrants } from "./grant-discovery.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import { configuredGeminiResponder } from "./gemini.js";
import type { AssistantResponder } from "./assistant.js";
import { extractProfileFromText } from "./profile-extractor.js";
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
  if (!/(\d|тисяч|тис\b|мільйон)/.test(withoutAge))
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
        const explicitChange =
          /(а тепер|інша тема|інш[аийе] потреб|передумав|передумала)/i.test(
            p.message,
          );
        const distinctNeed =
          /(хочу|шукаю|потріб|грант.*для)/i.test(p.message) &&
          previous.intents.some((intent) => intent !== "applicant") &&
          !current.intents.some(
            (intent) =>
              intent !== "applicant" && previous.intents.includes(intent),
          );
        const newNeed =
          explicitChange || (current.intents.length > 0 && distinctNeed);
        const query = (
          newNeed
            ? p.message
            : [previousSeed, p.message].filter(Boolean).join(" ")
        ).slice(-5000);
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
          const { details, ...base } = profile.rows[0];
          const rawDetails = details && typeof details === "object" ? details : {};
          const { contactName: _n, phone: _p, website: _w, ...safe } = rawDetails;
          businessProfile = { ...base, details: safe };
        }

        // Extract business context facts from user prompt and sync into profile if empty
        const { data: extractedData, facts: extractedFacts } = extractProfileFromText(p.message);
        let profileUpdated = false;
        if (extractedFacts.length > 0) {
          try {
            if (profile.rowCount) {
              const row = profile.rows[0];
              const details = (row.details && typeof row.details === "object" ? { ...row.details } : {}) as Record<string, string>;
              let changed = false;

              let nextBusinessName = row.businessName || "";
              if (!nextBusinessName && extractedData.businessName) {
                nextBusinessName = extractedData.businessName;
                changed = true;
              }
              let nextRegion = row.region || "";
              if (!nextRegion && extractedData.region) {
                nextRegion = extractedData.region;
                changed = true;
              }
              let nextDescription = row.description || "";
              if (!nextDescription && extractedData.description) {
                nextDescription = extractedData.description;
                changed = true;
              }

              for (const key of ["city", "legalForm", "industry", "requestedAmount", "fundingPurpose", "teamSize", "grantExperience"] as const) {
                if (!details[key] && extractedData[key]) {
                  details[key] = extractedData[key]!;
                  changed = true;
                }
              }

              if (changed) {
                await db.query(
                  `UPDATE profiles SET business_name=$2, description=$3, region=$4, details=$5::jsonb, updated_at=now(), revision=revision+1 WHERE owner_id=$1`,
                  [uid, nextBusinessName, nextDescription, nextRegion, JSON.stringify(details)]
                );
                profileUpdated = true;
                const { contactName: _n, phone: _p, website: _w, ...safeDetails } = details;
                businessProfile = { businessName: nextBusinessName, description: nextDescription, region: nextRegion, details: safeDetails };
              }
            } else {
              const details: Record<string, string> = {};
              for (const key of ["city", "legalForm", "industry", "requestedAmount", "fundingPurpose", "teamSize", "grantExperience"] as const) {
                if (extractedData[key]) details[key] = extractedData[key]!;
              }
              await db.query(
                `INSERT INTO profiles(owner_id, business_name, description, region, details, revision)
                 VALUES ($1,$2,$3,$4,$5::jsonb,1)
                 ON CONFLICT (owner_id) DO NOTHING`,
                [uid, extractedData.businessName || "", extractedData.description || "", extractedData.region || "", JSON.stringify(details)]
              );
              profileUpdated = true;
              businessProfile = {
                businessName: extractedData.businessName || "",
                description: extractedData.description || "",
                region: extractedData.region || "",
                details,
              };
            }
          } catch {
            /* Profile auto-sync is non-blocking */
          }
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
        let mode = "guided";
        if (responder && !personalEducation && !studentNeedsIdea) {
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
            }
          } catch {
            /* Verified catalog guidance remains usable when the provider has no quota. */
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        const payload = {
          mode,
          search,
          seed: query.slice(-2000),
          profileUpdated,
          extractedFacts: extractedFacts.length ? extractedFacts : undefined,
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
