import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import { confirmedTestRound } from "./grant-availability-fixture.js";
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import pg from "pg";
import { advisorRouter } from "../src/advisor.js";
import { createApp } from "../src/app.js";
import { configuration } from "../src/config.js";
const config = configuration();
if (
  process.env.AUTH_MODE !== "emulator" ||
  !config.projectId.startsWith("demo-")
)
  throw Error("Local demo required");
const db = new pg.Pool({ connectionString: config.databaseUrl });
const a = crypto.randomUUID(),
  b = crypto.randomUUID();
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const owner = req.header("X-Test-Owner");
  if (![a, b].includes(owner ?? "")) {
    res.sendStatus(401);
    return;
  }
  res.locals.uid = owner;
  next();
});
app.use("/api/advisor", advisorRouter(db));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw Error();
const base = `http://127.0.0.1:${address.port}/api/advisor`;
const call = (owner: string, path = "", body?: unknown) =>
  fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "X-Test-Owner": owner,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
before(() => {
  GRANT_CATALOG.find(p => p.id === "vlasna-sprava")!.availability = confirmedTestRound;
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-16T15:00:00Z") });
});
const callMethod = (
  owner: string,
  method: "PATCH" | "DELETE",
  path: string,
  body?: unknown,
) =>
  fetch(base + path, {
    method,
    headers: {
      "X-Test-Owner": owner,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
after(async () => {
  mock.timers.reset();
  await db.query(
    "DELETE FROM advisor_conversation_meta WHERE owner_id=ANY($1::text[])",
    [[a, b]],
  );
  await db.query(
    "DELETE FROM advisor_messages WHERE owner_id=ANY($1::text[])",
    [[a, b]],
  );
  await db.query("DELETE FROM profiles WHERE owner_id=ANY($1::text[])", [
    [a, b],
  ]);
  server.close();
  await db.end();
});
test("advisor namespace requires production auth middleware even before a project exists", async () => {
  const s = createApp(db).listen(0, "127.0.0.1");
  await once(s, "listening");
  const x = s.address();
  if (!x || typeof x === "string") throw Error();
  try {
    assert.equal(
      (await fetch(`http://127.0.0.1:${x.port}/api/advisor/conversations`))
        .status,
      401,
    );
  } finally {
    s.close();
  }
});
test("advisor saves private conversation, replays message once and grounds transport/student recommendations", async () => {
  await db.query(
    `INSERT INTO profiles(owner_id,business_name,description,region,details) VALUES($1,'Shop','Delivery','Lviv','{"contactName":"private-contact","city":"Lviv"}')`,
    [a],
  );
  const conversationId = crypto.randomUUID();
  const message = {
    id: crypto.randomUUID(),
    conversationId,
    message: "Потрібне авто для доставки",
  };
  const r = await call(a, "", message);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.message.search.matches[0].programId, "vlasna-sprava");
  assert.equal(data.message.mode, "guided");
  assert.match(data.message.reply, /авто|транспорт/i);
  assert.equal((await call(a, "", message)).status, 200);
  assert.equal((await call(b, "", message)).status, 409);
  assert.equal(
    (await call(a, "", { ...message, message: "Other" })).status,
    409,
  );
  const own = await (await call(a, `?conversationId=${conversationId}`)).json();
  assert.equal(own.messages.length, 1);
  assert.equal(
    (await (await call(b, `?conversationId=${conversationId}`)).json()).messages
      .length,
    0,
  );
  assert.equal(
    (await (await call(a, "/conversations")).json()).conversations[0].id,
    conversationId,
  );
  assert.equal(
    (await call(b, `?conversationId=${conversationId}&before=${message.id}`))
      .status,
    404,
  );
});
test("unmatched funding needs receive guided catalog guidance", async () => {
  const s = express();
  s.use(express.json());
  s.use((_q, r, n) => {
    r.locals.uid = b;
    n();
  });
  s.use(advisorRouter(db));
  const listener = s.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const addr = listener.address();
  if (!addr || typeof addr === "string") throw Error();
  try {
    const r = await fetch(`http://127.0.0.1:${addr.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        message: "Хочу авто для себе",
      }),
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.message.mode, "guided");
    assert.equal(data.message.search.matches.length, 0);
    assert.match(data.message.reply, /особисте авто/);
  } finally {
    listener.close();
  }
});

test("guided follow-ups retain the need and advance after amount and location", async () => {
  const s = express();
  s.use(express.json());
  s.use((_q, r, n) => {
    r.locals.uid = b;
    n();
  });
  s.use(advisorRouter(db));
  const listener = s.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const addr = listener.address();
  if (!addr || typeof addr === "string") throw Error();
  const url = `http://127.0.0.1:${addr.port}/`;
  const conversationId = crypto.randomUUID();
  const send = async (message: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversationId,
        message,
      }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).message;
  };
  try {
    const first = await send("Потрібне авто для доставки");
    assert.match(first.reply, /ФОП/);
    const second = await send("200 тис, Львів");
    assert(second.search.intents.includes("transport"));
    assert.match(second.seed, /авто для доставки/);
    assert.match(second.seed, /200 тис, Львів/);
    assert.match(second.reply, /ФОП/);
    assert(!second.reply.includes("Для чого саме вам потрібне авто?"));
    const third = await send("Я вже ФОП");
    assert.match(third.reply, /Наступний крок/);
    assert(!third.reply.includes("тільки плануєте відкрити справу?"));
    const fourth = await send("Хочу авто для доставки замовлень");
    assert.match(fourth.seed, /200 тис, Львів/);
    assert.match(fourth.seed, /Я вже ФОП/);
    assert(fourth.search.intents.includes("transport"));
  } finally {
    listener.close();
  }
});

test("student questions stay focused on business and personal study is outside scope", async () => {
  const s = express();
  s.use(express.json());
  s.use((_q, r, n) => {
    r.locals.uid = b;
    n();
  });
  s.use(advisorRouter(db));
  const listener = s.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const addr = listener.address();
  if (!addr || typeof addr === "string") throw Error();
  const send = async (
    message: string,
    conversationId = crypto.randomUUID(),
  ) => {
    const response = await fetch(`http://127.0.0.1:${addr.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversationId,
        message,
      }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).message;
  };
  try {
    const cafe = await send("Я студент і хочу відкрити кафе");
    assert(
      cafe.search.matches.some(
        (m: { programId: string }) => m.programId === "vlasna-sprava",
      ),
    );
    assert(!/магістратур|стипенді|скільки вам років/i.test(cafe.reply));
    const vague = await send("Гранти для студентів");
    assert.match(vague.reply, /справу|підприємницьк/);
    assert.equal(vague.search.matches.length, 0);
    assert(!/магістратур|стипенді|скільки вам років/i.test(vague.reply));
    const studentConversation = crypto.randomUUID();
    await send("Я студент, мені 21", studentConversation);
    const followup = await send("Хочу відкрити кав’ярню", studentConversation);
    assert.match(followup.seed, /студент/);
    assert.match(followup.seed, /мені 21/);
    assert.match(followup.reply, /Яка орієнтовна сума/);
    const education = await send("Шукаю стипендію на особисте навчання");
    assert.match(
      education.reply,
      /фінансування для відкриття або розвитку бізнесу/,
    );
    assert.equal(education.search.matches.length, 0);
  } finally {
    listener.close();
  }
});

test("a question about applicant status does not write inferred business facts", async () => {
  const before = await db.query("SELECT * FROM profiles WHERE owner_id=$1", [a]);
  const response = await call(a, "", { id: crypto.randomUUID(), conversationId: crypto.randomUUID(), message: "Чи потрібен ФОП для гранту у Львові?" });
  assert.equal(response.status, 200);
  const after = await db.query("SELECT * FROM profiles WHERE owner_id=$1", [a]);
  assert.deepEqual(after.rows, before.rows);
});

test("unconfirmed rounds stay unconfirmed when a model is configured", async (t) => {
  const program = GRANT_CATALOG.find(p => p.id === "vlasna-sprava")!;
  const original = program.availability;
  program.availability = undefined;
  const apiKey = process.env.GEMINI_API_KEY;
  const vertexProject = process.env.GEMINI_VERTEX_PROJECT;
  process.env.GEMINI_API_KEY = "fixture-only";
  delete process.env.GEMINI_VERTEX_PROJECT;
  const realFetch = globalThis.fetch;
  let modelCalls = 0;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).startsWith("https://generativelanguage.googleapis.com/")) {
      modelCalls++;
      return Promise.resolve(Response.json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Прийом відкрито до 27 листопада." }] } }],
      }));
    }
    return realFetch(input, init);
  });
  const probe = express();
  probe.use(express.json(), (_req, res, next) => { res.locals.uid = b; next(); });
  probe.use(advisorRouter(db));
  const listener = probe.listen(0, "127.0.0.1");
  try {
    await once(listener, "listening");
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const response = await fetch(`http://127.0.0.1:${address.port}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        message: "Хочу відкрити кав’ярню у Львові. Прийом Власної справи зараз відкритий до 27 листопада?",
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(modelCalls, 0);
    const message = (await response.json()).message;
    assert.equal(message.mode, "guided");
    assert(!message.search.matches.some((match: { programId: string }) => match.programId === "vlasna-sprava"));
    assert.doesNotMatch(message.reply, /прийом (?:зараз )?відкрит|27 листопада/i);
  } finally {
    listener.close();
    if (apiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = apiKey;
    if (vertexProject !== undefined) process.env.GEMINI_VERTEX_PROJECT = vertexProject;
    program.availability = original;
  }
});

test("unauthenticated PATCH and DELETE on advisor conversations return 401", async () => {
  const s = createApp(db).listen(0, "127.0.0.1");
  await once(s, "listening");
  const x = s.address();
  if (!x || typeof x === "string") throw Error();
  const id = crypto.randomUUID();
  try {
    const patchRes = await fetch(
      `http://127.0.0.1:${x.port}/api/advisor/conversations/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Нова назва" }),
      },
    );
    assert.equal(patchRes.status, 401);
    const deleteRes = await fetch(
      `http://127.0.0.1:${x.port}/api/advisor/conversations/${id}`,
      { method: "DELETE" },
    );
    assert.equal(deleteRes.status, 401);
  } finally {
    s.close();
  }
});

test("PATCH and DELETE validate conversationId UUID and title payload strictly", async () => {
  const badPatch = await callMethod(a, "PATCH", "/conversations/not-a-uuid", {
    title: "Назва",
  });
  assert.equal(badPatch.status, 400);
  assert.deepEqual(await badPatch.json(), { error: "invalid_conversation" });

  const badDelete = await callMethod(a, "DELETE", "/conversations/not-a-uuid");
  assert.equal(badDelete.status, 400);
  assert.deepEqual(await badDelete.json(), { error: "invalid_conversation" });

  const conversationId = crypto.randomUUID();
  for (const invalidBody of [
    { title: "" },
    { title: "   \t\n  " },
    { title: "а".repeat(71) },
    { title: "Кав'ярня\nінжекція" },
    { title: "Кав'ярня\u0000нуль" },
    { title: "Коректна назва", extra: "forbidden" },
  ]) {
    const res = await callMethod(
      a,
      "PATCH",
      `/conversations/${conversationId}`,
      invalidBody,
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_title" });
  }
});

test("owner can rename and delete own conversation while another user is isolated", async () => {
  const conversationId = crypto.randomUUID();
  const created = await call(a, "", {
    id: crypto.randomUUID(),
    conversationId,
    message: "Потрібне обладнання для пекарні у Львові",
  });
  assert.equal(created.status, 200);

  // Rename trims whitespace and persists in GET /conversations
  const renamed = await callMethod(
    a,
    "PATCH",
    `/conversations/${conversationId}`,
    { title: "   Пекарня у Львові — грант   " },
  );
  assert.equal(renamed.status, 200);
  assert.deepEqual(await renamed.json(), {
    conversation: { id: conversationId, title: "Пекарня у Львові — грант" },
  });

  const listAfterRename = await (await call(a, "/conversations")).json();
  const found = listAfterRename.conversations.find(
    (c: { id: string }) => c.id === conversationId,
  );
  assert.ok(found);
  assert.equal(found.title, "Пекарня у Львові — грант");

  // Re-renaming updates existing metadata row (ON CONFLICT DO UPDATE)
  const renamedAgain = await callMethod(
    a,
    "PATCH",
    `/conversations/${conversationId}`,
    { title: "Оновлена назва чату" },
  );
  assert.equal(renamedAgain.status, 200);
  assert.deepEqual(await renamedAgain.json(), {
    conversation: { id: conversationId, title: "Оновлена назва чату" },
  });

  // Owner isolation: User B cannot PATCH or DELETE User A's conversation
  const bPatch = await callMethod(
    b,
    "PATCH",
    `/conversations/${conversationId}`,
    { title: "Спроба чужої зміни" },
  );
  assert.equal(bPatch.status, 404);
  assert.deepEqual(await bPatch.json(), { error: "not_found" });

  const bDelete = await callMethod(
    b,
    "DELETE",
    `/conversations/${conversationId}`,
  );
  assert.equal(bDelete.status, 404);
  assert.deepEqual(await bDelete.json(), { error: "not_found" });

  // User A's title and messages remain completely intact
  const aListIntact = await (await call(a, "/conversations")).json();
  const intact = aListIntact.conversations.find(
    (c: { id: string }) => c.id === conversationId,
  );
  assert.ok(intact);
  assert.equal(intact.title, "Оновлена назва чату");
  const aMessagesIntact = await (
    await call(a, `?conversationId=${conversationId}`)
  ).json();
  assert.equal(aMessagesIntact.messages.length, 1);

  // User A deletes own conversation: removes messages and metadata
  const deleted = await callMethod(
    a,
    "DELETE",
    `/conversations/${conversationId}`,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true, id: conversationId });

  const metaCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM advisor_conversation_meta WHERE owner_id=$1 AND conversation_id=$2",
    [a, conversationId],
  );
  assert.equal(metaCount.rows[0].count, 0);

  const listAfterDelete = await (await call(a, "/conversations")).json();
  assert.equal(
    listAfterDelete.conversations.some(
      (c: { id: string }) => c.id === conversationId,
    ),
    false,
  );

  const messagesAfterDelete = await (
    await call(a, `?conversationId=${conversationId}`)
  ).json();
  assert.equal(messagesAfterDelete.messages.length, 0);

  // Second DELETE returns 404
  const deletedAgain = await callMethod(
    a,
    "DELETE",
    `/conversations/${conversationId}`,
  );
  assert.equal(deletedAgain.status, 404);
  assert.deepEqual(await deletedAgain.json(), { error: "not_found" });
});


test("DELETE returns 429 advisor_busy while a reply is in flight for the owner", async () => {
  let started!: () => void;
  let finish!: () => void;
  const historyStarted = new Promise<void>(resolve => { started = resolve; });
  const historyReady = new Promise<void>(resolve => { finish = resolve; });
  const gatedDb = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT question,reply,payload FROM advisor_messages")) {
        started();
        await historyReady;
      }
      return db.query(sql, params);
    },
  } as pg.Pool;
  const probe = express();
  probe.use(express.json(), (_req, res, next) => { res.locals.uid = a; next(); });
  probe.use(advisorRouter(gatedDb));
  const listener = probe.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const url = `http://127.0.0.1:${address.port}`;
  const conversationId = crypto.randomUUID();
  const post = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), conversationId, message: "Шукаю грант на обладнання" }),
  });
  try {
    await Promise.race([historyStarted, post.then(() => { throw new Error("Reply completed before reaching query gate"); })]);
    const busy = await fetch(`${url}/conversations/${conversationId}`, { method: "DELETE" });
    assert.equal(busy.status, 429);
    assert.deepEqual(await busy.json(), { error: "advisor_busy" });
    finish();
    assert.equal((await post).status, 200);
  } finally {
    finish();
    await post.catch(() => {});
    listener.close();
  }
});

test("farm consultation answers spending, requirements and application questions in one conversation", async () => {
  const conversationId = crypto.randomUUID();
  async function send(message: string) {
    const response = await call(a, "", { id: crypto.randomUUID(), conversationId, message });
    assert.equal(response.status, 200);
    return (await response.json()).message;
  }
  await send("Хочу відкрити ферму. Я вже ФОП.");
  const costs = await send("На що можна витратити кошти?");
  assert.match(costs.reply, /На що можна спрямувати кошти/);
  await send("Власна справа");
  const requirements = await send("Які вимоги до заявника?");
  assert.equal(requirements.selectedProgramId, "vlasna-sprava");
  assert.match(requirements.reply, /КВЕД/);
  assert.doesNotMatch(requirements.reply, /Ви вже зареєстровані/);
  const application = await send("Як підготувати й подати заявку?");
  assert.match(application.reply, /Для вашої ферми/);
  assert.match(application.reply, /XLSX.*PDF/);
  assert.match(application.reply, /виберіть банк і підпишіть/);
  assert.match(application.reply, /\[Офіційні умови\]\(https:\/\/diia\.gov\.ua/);
  assert.match(application.reply, /підтверди/);
  const greenhouse = await send("Які документи для гранту на модульну теплицю?");
  assert.equal(greenhouse.selectedProgramId, "ua-greenhouse-grant");
  assert.match(greenhouse.reply, /кошторисом/);
  assert.match(greenhouse.reply, /Прийом призупинено/);
  const different = await send("А тепер хочу відкрити кав’ярню");
  assert.equal(different.selectedProgramId, undefined);
});
