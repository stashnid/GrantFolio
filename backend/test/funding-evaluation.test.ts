import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import type { Pool } from "pg";
import { advisorRouter } from "../src/advisor.js";
import {
  buildDialogueQuery,
  classifyDialogue,
} from "../src/advisor-dialogue.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { searchGrants } from "../src/grant-discovery.js";
import { getGrantApplication } from "../src/grant-application.js";

const at = new Date("2026-11-16T15:00:00Z");
const future = new Date("2028-01-01T00:00:00Z");
const search = (question: string, time = at) =>
  searchGrants(question, GRANT_CATALOG, time, { includeUnavailable: true });
const ids = (question: string) =>
  search(question).matches.map((match) => match.programId);

type Scenario = [label: string, check: () => void | Promise<void>];
const includes = (
  label: string,
  question: string,
  program: string,
): Scenario => [label, () => assert(ids(question).includes(program), question)];
const excludes = (
  label: string,
  question: string,
  program: string,
): Scenario => [
  label,
  () => assert(!ids(question).includes(program), question),
];
const empty = (label: string, question: string): Scenario => [
  label,
  () => assert.deepEqual(ids(question), [], question),
];
const direct = (
  label: string,
  question: string,
  program: string,
  time = at,
): Scenario => [
  label,
  () => {
    const match = search(question, time).matches[0];
    assert.equal(match?.programId, program, question);
    assert.equal(match.matchKind, "direct");
    assert.equal(
      match.supportDepth,
      ["vlasna-sprava", "agro-gardens"].includes(program)
        ? "guided-draft"
        : "catalog-only",
    );
    if (time === future) assert.notEqual(match.intake, "open");
    if (program === "ua-brave1-core") assert.equal(match.intake, "unconfirmed");
  },
];
const readiness = (
  label: string,
  program: string,
  answers: Parameters<typeof getGrantApplication>[1],
  issue?: string,
): Scenario => [
  label,
  () => {
    const application = getGrantApplication(program, answers);
    assert(application);
    assert.equal(application.readyForReview, false);
    if (issue)
      assert(
        application.issues.some((entry) => entry.code === issue),
        issue,
      );
  },
];

const regression: Scenario[] = [
  includes("launch a café", "хочу відкрити кавʼярню", "vlasna-sprava"),
  includes(
    "retrofit a bakery",
    "потрібне обладнання для пекарні",
    "vlasna-sprava",
  ),
  includes(
    "buy a delivery van",
    "потрібен фургон для доставки",
    "vlasna-sprava",
  ),
  includes(
    "manufacturing equipment",
    "обладнання для виробництва",
    "bloom-sme",
  ),
  includes(
    "past business purchase by veteran",
    "ветеран вже придбала обладнання",
    "uvf-reimbursement",
  ),
  includes(
    "mixed Ukrainian and English bakery request",
    "грант для bakery",
    "vlasna-sprava",
  ),
  includes("typo in a transport query", "автмо", "vlasna-sprava"),
  includes(
    "staff development is a business use",
    "навчання персоналу бізнесу",
    "vlasna-sprava",
  ),
  direct("official name for the pilot", "Власна справа", "vlasna-sprava"),
  direct("stable ID for a garden grant", "agro-gardens", "agro-gardens"),
  direct(
    "explicit programme remains findable with stale evidence",
    "vlasna-sprava",
    "vlasna-sprava",
    future,
  ),
  direct("known programme without verified intake", "Brave1", "ua-brave1-core"),
  direct("case-insensitive programme name", "BRAVE1", "ua-brave1-core"),
  direct("direct programme question", "Що таке Brave1?", "ua-brave1-core"),
  [
    "unavailable thematic results inform the advisor without entering the default browse results",
    () => {
      const question = "хочу посадити ягідник";
      const browse = searchGrants(question, GRANT_CATALOG, at);
      assert(
        !browse.matches.some((match) => match.programId === "agro-gardens"),
      );
      const informed = searchGrants(question, GRANT_CATALOG, at, {
        includeUnavailable: true,
      });
      const garden = informed.matches.find(
        (match) => match.programId === "agro-gardens",
      );
      assert.equal(garden?.matchKind, "thematic");
      assert.notEqual(garden.intake, "open");
      assert.equal(garden.supportDepth, "guided-draft");
    },
  ],
  excludes(
    "negated purchase is not an expense already incurred",
    "ветеран ще не купив обладнання, планую придбати",
    "uvf-reimbursement",
  ),
  excludes(
    "business idea is not a reimbursement request",
    "обладнання для кавʼярні",
    "uvf-reimbursement",
  ),
  excludes(
    "ordinary cafe is not deep tech",
    "відкрити звичайну кавʼярню",
    "women-techeu-2-eic",
  ),
  empty(
    "private transport is outside business scope",
    "авто для особистих потреб",
  ),
  empty(
    "personal degree is outside business scope",
    "хочу стипендію на магістратуру",
  ),
  empty("unrelated query has no business recommendation", "полетіти на Марс"),
  [
    "student status alone does not establish eligibility",
    () => {
      const program = search("я студент хочу відкрити кафе").matches.find(
        (match) => match.programId === "vlasna-sprava",
      );
      assert(program);
      assert.match(program.caution, /вік|уточн|підтверд/i);
    },
  ],
  readiness("blank pilot does not pass review", "vlasna-sprava", {}),
  readiness("blank garden does not pass review", "agro-gardens", {}),
  readiness(
    "scale-up with no new job",
    "vlasna-sprava",
    { track: "scale", newJobs: 0 },
    "scale_new_job_required",
  ),
  readiness(
    "scale-up with insufficient operating history",
    "vlasna-sprava",
    { track: "scale", monthsInBusiness: 5 },
    "scale_activity_duration",
  ),
  readiness(
    "garden pending a signed planting plan",
    "agro-gardens",
    { plantingDocument: "pending" },
    "garden_signed_plan",
  ),
  readiness(
    "garden land tenure term",
    "agro-gardens",
    { landTenure: "lease", landUseYears: 6 },
    "garden_land_term",
  ),
  [
    "catalogue-only programme cannot create a specialist questionnaire",
    () => {
      assert.equal(getGrantApplication("ua-brave1-core", {}), null);
    },
  ],
  [
    "profile context can suggest a value without answering it",
    () => {
      const application = getGrantApplication(
        "vlasna-sprava",
        { track: "start" },
        { legalForm: "fop", city: "Львів" },
      );
      assert.equal(application?.nextQuestion?.id, "applicantType");
      assert.equal(application.nextQuestion.value, undefined);
      assert.equal(application.nextQuestion.suggestion, "entrepreneur");
    },
  ],
];

const heldOut: Scenario[] = [
  includes(
    "food business in Russian-influenced spelling",
    "грант на кофейню",
    "vlasna-sprava",
  ),
  includes(
    "business plus negated education",
    "не для навчання, потрібне авто",
    "vlasna-sprava",
  ),
  [
    "fresh closed intake stays findable by its catalogue ID",
    () => {
      const processing = GRANT_CATALOG.find(
        (program) => program.id === "processing-business",
      );
      assert(processing);
      const closed = {
        ...processing,
        intakeStatus: "unconfirmed" as const,
        availability: {
          state: "closed" as const,
          checkedAt: "2026-11-16T12:00:00Z",
          validUntil: "2026-11-17T12:00:00Z",
          deadlineAt: "2026-11-16T13:00:00Z",
          sourceUrl: processing.officialUrl,
          evidence: "Synthetic intake fixture",
        },
      };
      const result = searchGrants(closed.id, [closed], at).matches[0];
      assert.equal(result?.programId, closed.id);
      assert.equal(result.intake, "closed");
    },
  ],
  direct(
    "another organiser's programme by ID with stale evidence",
    "eic-accelerator",
    "eic-accelerator",
    future,
  ),
  excludes(
    "private education explicitly preferred to transport",
    "не авто а навчання",
    "vlasna-sprava",
  ),
  readiness(
    "garden applicant type incompatible with local fixture rules",
    "agro-gardens",
    { applicantType: "individual" },
    "garden_applicant",
  ),
  readiness(
    "garden land below local fixture minimum",
    "agro-gardens",
    { landArea: 0.9 },
    "garden_area",
  ),
];

type DialogueIntent = ReturnType<typeof classifyDialogue>;
const intent = (
  label: string,
  message: string,
  expected: DialogueIntent,
): Scenario => [
  label,
  () => assert.equal(classifyDialogue(message), expected, message),
];

type AdvisorResult = {
  mode: "ai" | "guided";
  reply: string;
  search: ReturnType<typeof searchGrants>;
  fallbackReason?: string;
};

type StoredMessage = {
  id: string;
  conversation_id: string;
  owner_id: string;
  question: string;
  reply: string;
  payload: Record<string, unknown>;
  created_at: string;
};

async function withGuidedAdvisor(
  responder: Parameters<typeof advisorRouter>[1],
  check: (send: (message: string) => Promise<AdvisorResult>) => Promise<void>,
) {
  const messages: StoredMessage[] = [];
  const db = {
    async query(sql: string, args: string[]) {
      if (sql.startsWith("SELECT * FROM advisor_messages WHERE id=")) {
        const rows = messages.filter((row) => row.id === args[0]);
        return { rows, rowCount: rows.length };
      }
      if (
        sql.startsWith("SELECT question,reply,payload FROM advisor_messages")
      ) {
        const rows = messages
          .filter(
            (row) =>
              row.owner_id === args[0] && row.conversation_id === args[1],
          )
          .reverse();
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM profiles WHERE owner_id="))
        return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO advisor_messages")) {
        const message = {
          id: args[0],
          conversation_id: args[1],
          owner_id: args[2],
          question: args[3],
          reply: args[4],
          payload: JSON.parse(args[5]),
          created_at: at.toISOString(),
        };
        messages.push(message);
        return { rows: [message], rowCount: 1 };
      }
      throw new Error("Unexpected advisor database action");
    },
  };
  const owner = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.uid = owner;
    next();
  });
  app.use(
    advisorRouter(db as unknown as Pool, responder, {
      acquire: async () => "synthetic-lease",
      release: async () => {},
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    await check(async (message) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          conversationId,
          message,
        }),
      });
      assert.equal(response.status, 200, message);
      return (await response.json()).message as AdvisorResult;
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

regression.push(
  intent("direct question about programme", "Що таке Brave1?", "information"),
  intent("programme comparison", "Порівняй ці програми", "comparison"),
  intent("explicit fact correction", "Виправ суму на 200 тис.", "correction"),
  intent(
    "ordinary business need",
    "Потрібне обладнання для виробництва",
    "search",
  ),
  intent("short response to geographic follow-up", "Львів", "followup"),
  [
    "explicit topic change does not retain the prior need in search",
    () => {
      const next = buildDialogueQuery(
        "Інша тема: грант на сад",
        "потрібне авто для доставки",
      );
      assert.equal(next.intent, "topic_change");
      assert(!next.query.includes("доставки"));
      assert(next.query.includes("сад"));
    },
  ],
  [
    "required three-turn regression through the advisor endpoint",
    async () => {
      await withGuidedAdvisor(
        async () => {
          throw new Error("simulated provider unavailable");
        },
        async (send) => {
          const initial = await send("хочу приватне ППО");
          const directLookup = await send("brave1");
          const complaint = await send("чому ти зразу не шукаєш?");
          assert.equal(directLookup.mode, "guided");
          assert.equal(
            directLookup.search.matches[0]?.programId,
            "ua-brave1-core",
          );
          assert.equal(directLookup.search.matches[0]?.intake, "unconfirmed");
          assert.equal(
            directLookup.search.matches[0]?.supportDepth,
            "catalog-only",
          );
          assert.notEqual(directLookup.reply, initial.reply);
          assert.notEqual(complaint.reply, directLookup.reply);
          assert.deepEqual(complaint.search.questions, []);
          assert.doesNotMatch(complaint.reply, /у якому регіоні/i);
        },
      );
    },
  ],
  [
    "provider error retains a useful guided answer",
    async () => {
      let attempts = 0;
      await withGuidedAdvisor(
        async () => {
          attempts++;
          throw new Error("simulated provider unavailable");
        },
        async (send) => {
          const result = await send("потрібен фургон для доставки");
          assert.equal(result.mode, "guided");
          assert.equal(result.fallbackReason, "provider_error");
          assert(
            result.search.matches.some(
              (match) => match.programId === "vlasna-sprava",
            ),
          );
          assert(!result.reply.includes("simulated provider unavailable"));
        },
      );
      assert.equal(attempts, 1);
    },
  ],
  [
    "whitespace-only model reply keeps deterministic guidance",
    async () => {
      await withGuidedAdvisor(
        async () => " \n ",
        async (send) => {
          const result = await send("потрібен фургон для доставки");
          assert.equal(result.mode, "guided");
          assert.match(result.reply, /фургон|комерційний|доставки|авто/i);
          assert.equal(result.fallbackReason, "invalid_response");
        },
      );
    },
  ],
  [
    "isolated numeric answer does not replace the original need",
    () => {
      const next = buildDialogueQuery("150 тис.", "потрібне авто для доставки");
      assert.equal(next.intent, "followup");
      assert.match(next.query, /доставки.*150/);
    },
  ],
);

heldOut.push(
  intent(
    "complaint about repeated response",
    "Чому ти повторюєшся?",
    "complaint",
  ),
  [
    "short location answer retains the active transport need",
    () => {
      const next = buildDialogueQuery("Львів", "потрібен фургон для доставки");
      assert.equal(next.intent, "followup");
      assert.match(next.query, /доставки.*Львів/);
    },
  ],
  [
    "a slow provider falls back without dropping the request",
    async () => {
      let signal: AbortSignal | undefined;
      await withGuidedAdvisor(
        async (_snapshot, _message, abortSignal) => {
          signal = abortSignal;
          return new Promise<string>(() => {});
        },
        async (send) => {
          const result = await send("потрібен фургон для доставки");
          assert.equal(result.mode, "guided");
          assert(
            result.search.matches.some(
              (match) => match.programId === "vlasna-sprava",
            ),
          );
          assert.equal(signal?.aborted, true);
          assert.equal(result.fallbackReason, "timeout");
        },
      );
    },
  ],
);

assert.equal(regression.length, 40);
assert.equal(heldOut.length, 10);

for (const [suite, scenarios] of [
  ["regression", regression],
  ["held-out", heldOut],
] as const) {
  for (const [label, check] of scenarios)
    test(`funding evaluation ${suite} — ${label}`, check);
}

test("selected programme retains a subsequently supplied business idea", async () => {
  await withGuidedAdvisor(undefined, async send => {
    await send("Власна справа");
    const result = await send("я студент хочу відкрити кафе");
    assert(result.search.intents.includes("business"));
    assert(result.search.matches.some(match => match.programId === "vlasna-sprava"));
    assert.doesNotMatch(result.reply, /яку справу ви плануєте/i);
  });
});

test("a new explicit programme replaces a previous selection", async () => {
  await withGuidedAdvisor(undefined, async send => {
    await send("Власна справа");
    const result = await send("що таке Brave1?");
    assert.equal(result.search.matches[0]?.programId, "ua-brave1-core");
    assert.match(result.reply, /Brave1/);
    assert.doesNotMatch(result.reply, /у якому регіоні/i);
  });
});

test("defence catalogue lookup stays informational and does not invoke preparation", async () => {
  let calls = 0;
  await withGuidedAdvisor(async () => { calls++; return "Невикористана ідея"; }, async send => {
    await send("Brave1");
    const result = await send("які документи і витрати потрібні для ППО?");
    assert.equal(calls, 0);
    assert.match(result.reply, /Офіційне джерело/);
    assert.match(result.reply, /Поточний прийом не підтверджений/);
    assert.equal(result.search.matches[0]?.supportDepth, "catalog-only");
  });
});

test("a generic follow-up cannot send prior defence context to the model", async () => {
  let calls = 0;
  await withGuidedAdvisor(async () => { calls++; return "Невикористана ідея"; }, async send => {
    await send("хочу приватне ППО");
    await send("які витрати та документи потрібні?");
    assert.equal(calls, 0);
  });
});
