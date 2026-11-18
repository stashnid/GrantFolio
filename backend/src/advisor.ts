import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { normalize, searchGrants } from "./grant-discovery.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";
import { extractProfileFromText } from "./profile-extractor.js";
const input = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();
const renameInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(70)
      .refine((value) => !/[\u0000-\u001F\u007F]/.test(value)),
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
  if (/ферм|господарств/.test(q) && !/тварин|теплиц|садів|ягід|овоч|молок|бджіл|зерн/.test(q)) {
    return "Що плануєте виробляти на фермі й на яку першу витрату потрібне фінансування? Від цього залежить, чи варто розглядати грант на запуск бізнесу або окрему аграрну програму.";
  }
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
  if (hasMatches)
    return "Наступний крок — переглянути можливі програми та перевірити їхні актуальні умови. Яку з них розглянемо першою?";
  if (intents.some(intent => ["equipment", "transport", "production", "garden"].includes(intent)))
    return "Збережіть опис потреби й перевірте умови програм у каталозі. Робочу чернетку можна підготувати до підтвердження прийому.";
  return "Які витрати ви хочете покрити? Це допоможе звузити пошук.";
}
function namedProgram(message: string) {
  const q = normalize(message);
  return GRANT_CATALOG.find((p) => {
    const name = normalize(p.title);
    return (name.length > 8 && q.includes(name)) ||
      (p.id === "vlasna-sprava" && /власн[ауої] справ[ауиі]/.test(q)) ||
      (p.id === "ua-greenhouse-grant" && /грант(?:у|ом)? на .*теплиц/.test(q)) ||
      (p.id === "agro-gardens" && /грант(?:у|ом)? на (?:сад|ягідник|виноградник)/.test(q));
  });
}
// Answer questions about a catalog program using its curated, source-linked fields.
export function programFollowUp(message: string, previousMatches: { programId: string }[], newNeed: boolean, selectedProgramId?: string, context = ""): string | undefined {
  if (newNeed) return undefined;
  const q = normalize(message);
  const costs = /витрат|витратити|потрат|купити|придбати|закуп|на що|що можна/.test(q);
  const eligibility = /умов|вимог|хто може|чи (?:можу|підход)|право на|чи потрібен фоп/.test(q);
  const apply = /як пода|як подат|подача|подати|заявк|документ|оформ/.test(q);
  if (!costs && !eligibility && !apply) return undefined;
  const named = namedProgram(message) ?? GRANT_CATALOG.find((p) => p.id === selectedProgramId);
  const previous = previousMatches.map((m) => GRANT_CATALOG.find((p) => p.id === m.programId)).filter((p): p is (typeof GRANT_CATALOG)[number] => Boolean(p));
  const farm = /ферм|господарств|агро/i.test(context);
  const farmExample = farm ? GRANT_CATALOG.find(p => p.id === "vlasna-sprava") : undefined;
  const program = named ?? previous[0] ?? farmExample;
  if (!program) return undefined;
  const example = !named && previous.length !== 1;
  const sections: string[] = [];
  if (costs) sections.push(`**На що можна спрямувати кошти**\n${program.details.costs.map(cost => `- ${cost}`).join("\n")}${program.id === "vlasna-sprava" && farm ? "\n\nДля ферми обладнання для сортування, пакування або охолодження може бути кандидатом у кошторис, але допустимість конкретної покупки треба перевірити за чинними правилами." : ""}`);
  if (eligibility) sections.push(`Основні вимоги: ${program.details.eligibility.join(" ")} ${program.details.exclusions.join(" ")} ${program.details.obligations.join(" ")}`);
  if (apply && farm && program.id === "vlasna-sprava") sections.push("Для вашої ферми почніть з продукту, обсягу виробництва та каналів збуту. Для кожної покупки вкажіть кількість, ціну за пропозицією постачальника та яку роботу вона дозволить виконати.");
  if (apply) sections.push(`Документи: ${program.details.documents.join(" ")}\nЯк діяти:\n${program.details.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`);
  const status = program.intakeStatus === "paused" ? "Прийом призупинено; дату відновлення потрібно підтвердити." : program.intakeStatus === "archived" ? "Програма архівна; актуальний прийом не підтверджений." : "Актуальний прийом і вашу відповідність потрібно підтвердити в офіційному джерелі.";
  const statusKnown = /(?:я|ми) (?:ще |вже |уже )?(?:не )?фоп|(?:працюю|зареєстрован\S*) як фоп|(?:вже|уже) (?:працюю|маю фоп)/.test(normalize(context));
  const question = example
    ? previous.length ? "Яку з запропонованих програм ви маєте на увазі?" : "Що плануєте вирощувати або яку продукцію хочете продавати?"
    : costs ? "Яку покупку перевіримо для вашого кошторису?"
    : eligibility ? statusKnown ? "Який КВЕД плануєте вказати для цієї діяльності?" : "Ви вже зареєстровані як ФОП або юридична особа?"
    : "З чого почнемо: з опису продукту, продажів чи кошторису?";
  return [`${example ? "Як приклад розгляну" : "Розглянемо"} «${program.title}».`, ...sections, status, ...(program.details.unresolved.length ? [`Потрібно уточнити: ${program.details.unresolved[0]}`] : []), `[Офіційні умови](${program.officialUrl})`, question].join("\n\n");
}
export function advisorRouter(db: Pool) {
  const router = Router();
  const active = new Set<string>();
  router.get("/conversations", async (_req, res, next) => {
    try {
      const r = await db.query(
        `SELECT m.conversation_id AS id, COALESCE(meta.title, (array_agg(m.question ORDER BY m.created_at, m.id))[1]) AS title, MAX(m.created_at) AS "updatedAt"
         FROM advisor_messages m
         LEFT JOIN advisor_conversation_meta meta
           ON meta.owner_id = m.owner_id AND meta.conversation_id = m.conversation_id
         WHERE m.owner_id=$1
         GROUP BY m.conversation_id, meta.title
         ORDER BY MAX(m.created_at) DESC
         LIMIT 30`,
        [res.locals.uid],
      );
      res.json({
        conversations: r.rows.map((row) => ({
          ...row,
          title: row.title.slice(0, 70),
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.patch("/conversations/:conversationId", async (req, res, next) => {
    const idParsed = uuid.safeParse(req.params.conversationId);
    if (!idParsed.success) {
      res.status(400).json({ error: "invalid_conversation" });
      return;
    }
    const parsed = renameInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_title" });
      return;
    }
    const conversationId = idParsed.data;
    const uid: string = res.locals.uid;
    try {
      const owned = await db.query(
        "SELECT 1 FROM advisor_messages WHERE owner_id=$1 AND conversation_id=$2 LIMIT 1",
        [uid, conversationId],
      );
      if (!owned.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await db.query(
        `INSERT INTO advisor_conversation_meta (owner_id, conversation_id, title, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (owner_id, conversation_id)
         DO UPDATE SET title = EXCLUDED.title, updated_at = now()`,
        [uid, conversationId, parsed.data.title],
      );
      res.json({
        conversation: { id: conversationId, title: parsed.data.title },
      });
    } catch (e) {
      next(e);
    }
  });
  router.delete("/conversations/:conversationId", async (req, res, next) => {
    const idParsed = uuid.safeParse(req.params.conversationId);
    if (!idParsed.success) {
      res.status(400).json({ error: "invalid_conversation" });
      return;
    }
    const uid: string = res.locals.uid;
    if (active.has(uid)) {
      res.status(429).json({ error: "advisor_busy" });
      return;
    }
    const conversationId = idParsed.data;
    try {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const deletedMessages = await client.query(
          "DELETE FROM advisor_messages WHERE owner_id=$1 AND conversation_id=$2",
          [uid, conversationId],
        );
        if (!deletedMessages.rowCount) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "not_found" });
          return;
        }
        await client.query(
          "DELETE FROM advisor_conversation_meta WHERE owner_id=$1 AND conversation_id=$2",
          [uid, conversationId],
        );
        await client.query("COMMIT");
        res.json({ deleted: true, id: conversationId });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
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
        const followUpWording = /витрат|витратити|потрат|купити|придбати|закуп|на що|що можна|умов|вимог|хто може|чи (?:можу|підход)|право на|як пода|як подат|подача|подати|заявк|документ|оформ/i.test(p.message);
        const newNeed =
          explicitChange || (!followUpWording && current.intents.length > 0 && distinctNeed);
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
        const { facts: extractedFacts } = extractProfileFromText(p.message);
        const greeting = /^(привіт|вітаю|добрий день|доброго дня)[!. ]*$/i.test(
          p.message,
        );
        const namedSelection = namedProgram(p.message);
        const selectedProgramId = namedSelection?.id ?? (!newNeed ? prior.at(-1)?.payload?.selectedProgramId : undefined);
        const followUp = programFollowUp(p.message, prior.at(-1)?.payload?.search?.matches ?? [], newNeed && !namedSelection, selectedProgramId, query) ?? (namedSelection ? `Розглянемо «${namedSelection.title}». ${namedSelection.details.overview} ${namedSelection.intakeStatus === "paused" ? "Прийом призупинено; дату відновлення потрібно підтвердити." : "Актуальний прийом і вашу відповідність потрібно підтвердити."} [Офіційні умови](${namedSelection.officialUrl})\n\nЩо хочете з’ясувати: витрати, вимоги чи подання заявки?` : undefined);
        const reply = personalEducation
          ? "GrantFolio допомагає шукати фінансування для відкриття або розвитку бізнесу. Програми для особистого навчання та стипендії не входять до каталогу. Якщо маєте підприємницьку ідею, розкажіть про неї."
          : studentNeedsIdea
            ? "Допоможу розібратися з фінансуванням підприємницької ідеї. Яку справу ви плануєте відкрити або розвинути та на що потрібні кошти?"
            : greeting
              ? "Вітаю! Допоможу розібратися з фінансуванням і підготувати матеріали для заявки. На що вам потрібні кошти? Можна описати своїми словами — знати назву гранту не потрібно."
              : followUp ?? `${search.explanation}\n\n${search.matches
                  .slice(0, 3)
                  .map((m) => `${m.title}. ${m.reason}`)
                  .join("\n\n")}\n\n${nextQuestion(query, search.intents, search.matches.length > 0)}`;
        const payload = {
          mode: "guided",
          selectedProgramId,
          search,
          seed: query.slice(-2000),
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
