import { test, after } from "node:test";
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
let providerCalls = 0;
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
app.use(
  "/api/advisor",
  advisorRouter(db, async (snapshot) => {
    providerCalls++;
    assert.equal(snapshot.mode, "discovery");
    const data = JSON.stringify(snapshot);
    assert(!data.includes("private-contact"));
    return "Контрольована порада. Уточніть призначення коштів.";
  }),
);
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
after(async () => {
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
  assert.equal(data.message.mode, "ai");
  assert.equal(providerCalls, 1);
  assert.equal((await call(a, "", message)).status, 200);
  assert.equal(providerCalls, 1);
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
test("when model is unavailable, verified guidance still works and is identified as guided", async () => {
  const s = express();
  s.use(express.json());
  s.use((_q, r, n) => {
    r.locals.uid = b;
    n();
  });
  s.use(
    advisorRouter(db, async () => {
      throw Error("quota");
    }),
  );
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
  s.use(
    advisorRouter(db, async () => {
      throw Error("unavailable");
    }),
  );
  const listener = s.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const addr = listener.address();
  if (!addr || typeof addr === "string") throw Error();
  const url = `http://127.0.0.1:${addr.port}/`;
  const conversationId = crypto.randomUUID();
  const send = async (message: string, threadId = conversationId) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        conversationId: threadId,
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
    const inflectedCity = await send("Потрібно 150 тис. грн на пекарню у Львові", crypto.randomUUID());
    assert.doesNotMatch(inflectedCity.reply, /У якому регіоні/);
    await db.query(
      `INSERT INTO profiles(owner_id,business_name,description,region,details) VALUES($1,'Пекарня','','','{"city":"Львів","legalForm":"fop"}')`,
      [b],
    );
    const withoutRestatingProfile = await send("Потрібно 150 тис. грн на пекарню", crypto.randomUUID());
    assert.match(withoutRestatingProfile.reply, /Наступний крок/);
    assert.doesNotMatch(withoutRestatingProfile.reply, /У якому регіоні|Ви вже працюєте як ФОП/);
  } finally {
    await db.query("DELETE FROM profiles WHERE owner_id=$1", [b]);
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
  s.use(
    advisorRouter(db, async () => {
      throw Error("unavailable");
    }),
  );
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
