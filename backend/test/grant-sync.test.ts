import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createGrantSync } from "../src/grant-sync.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
import type { GrantSourceRule } from "../src/grant-source-rules.js";
if (
  process.env.AUTH_MODE !== "emulator" ||
  !process.env.FIREBASE_PROJECT_ID?.startsWith("demo-")
)
  throw Error("Local demo required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ids = ["vlasna-sprava", "processing-business", "agro-gardens"];
const saved = new Map(
  ids.map((id) => [id, GRANT_CATALOG.find((p) => p.id === id)?.availability]),
);
let priorRows: any[] = [];
before(async () => {
  priorRows = (
    await db.query(
      "SELECT * FROM grant_source_checks WHERE program_id=ANY($1::text[])",
      [ids],
    )
  ).rows;
});
after(async () => {
  await db.query("DELETE FROM grant_source_checks WHERE source_url LIKE $1", [
    "https://test.example/%",
  ]);
  for (const row of priorRows)
    await db.query(
      "INSERT INTO grant_source_checks(program_id,source_url,availability,last_attempt_at,last_error) VALUES($1,$2,$3,$4,$5) ON CONFLICT(program_id) DO UPDATE SET source_url=EXCLUDED.source_url,availability=EXCLUDED.availability,last_attempt_at=EXCLUDED.last_attempt_at,last_error=EXCLUDED.last_error",
      [
        row.program_id,
        row.source_url,
        row.availability,
        row.last_attempt_at,
        row.last_error,
      ],
    );
  for (const [id, value] of saved) {
    const p = GRANT_CATALOG.find((x) => x.id === id);
    if (p) p.availability = value;
  }
  await db.end();
});
const rules: GrantSourceRule[] = [
  {
    programId: ids[0],
    url: "https://test.example/calendar",
    requiredText: "Кінцеві строки подання заяв",
    schedule: true,
  },
  {
    programId: ids[1],
    url: "https://test.example/deadline",
    requiredText: "Програма виробництва",
    openPattern: "прийом відкрито",
    deadlinePattern: "до (\\d{2}\\.\\d{2}\\.\\d{4})",
  },
  {
    programId: ids[2],
    url: "https://test.example/rolling",
    requiredText: "Сади",
    openPattern: "прийом відкрито",
    closedPatterns: ["прийом закрито"],
    rolling: true,
  },
];
const table =
  "Кінцеві строки подання заяв Місяць День початку подання заяв День закінчення подання заяв Січень 08 14 18 27 Лютий 01 12 16 25 Березень 01 12 16 27 Квітень 01 12 16 27 Травень 01 12 16 27 Червень 01 12 16 27 Липень 01 12 16 27 Серпень 01 12 16 27 Вересень 01 12 16 27 Жовтень 01 12 16 27 Листопад 01 12 16 27 Грудень 01 15";
test("source checks persist verified results and failures cannot renew evidence", async () => {
  let time = new Date("2026-11-16T12:00:00Z");
  let broken = false;
  const fake = async (input: string | URL | Request) => {
    const url = String(input);
    if (broken) throw Error("network");
    return new Response(
      url.endsWith("/calendar")
        ? table
        : url.endsWith("/deadline")
          ? "Програма виробництва: прийом відкрито до 15.11.2026"
          : "Сади: прийом відкрито, але прийом закрито",
      { status: 200 },
    );
  };
  const sync = createGrantSync(db, rules, fake as typeof fetch, () => time);
  assert.deepEqual(await sync.refresh(), { checked: 3, failed: 0, skipped: 0 });
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === ids[0])?.availability?.state,
    "open",
  );
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === ids[0])?.availability?.deadlineAt,
    "2026-11-27T21:59:59.000Z",
  );
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === ids[1])?.availability?.state,
    "closed",
  );
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === ids[1])?.availability?.deadlineAt,
    "2026-11-15T21:59:59.000Z",
  );
  assert.equal(
    GRANT_CATALOG.find((p) => p.id === ids[2])?.availability?.state,
    "closed",
  );
  const before = sync
    .status()
    .find((s) => s.programId === ids[0])?.availability;
  broken = true;
  time = new Date("2026-11-17T12:00:00Z");
  assert.equal((await sync.refresh()).failed, 3);
  const afterCheck = sync.status().find((s) => s.programId === ids[0]);
  assert.deepEqual(afterCheck?.availability, before);
  assert.equal(afterCheck?.lastError, "network");
  const restored = createGrantSync(db, rules, fake as typeof fetch, () => time);
  await restored.hydrate();
  assert.deepEqual(
    restored.status().find((s) => s.programId === ids[0])?.availability,
    before,
  );
});
test("unrecognized source and oversized response do not open a grant", async () => {
  const when = new Date("2026-11-18T12:00:00Z");
  const rule = { ...rules[1], url: "https://test.example/invalid" };
  const fake = async () =>
    new Response("Програма виробництва прийом відкрито дата незрозуміла");
  const sync = createGrantSync(db, [rule], fake as typeof fetch, () => when);
  assert.equal((await sync.refresh()).failed, 1);
  assert.equal(sync.status()[0].availability, null);
  const oversized = createGrantSync(
    db,
    [rule],
    (async () => new Response("x".repeat(4 * 1024 * 1024 + 1))) as typeof fetch,
    () => when,
  );
  assert.equal((await oversized.refresh()).failed, 1);
  assert.equal(oversized.status()[0].lastError, "body_too_large");
});
test("one source is fetched once and a concurrent lease skips it", async () => {
  const source = "https://test.example/shared";
  const shared: GrantSourceRule[] = ids
    .slice(0, 2)
    .map((programId, index) => ({
      programId,
      url: source,
      requiredText: index ? "Другий напрям" : "Перший напрям",
      openPattern: "прийом відкрито",
      rolling: true,
    }));
  let calls = 0;
  const fake = async () => {
    calls++;
    return new Response(
      "Перший напрям прийом відкрито. Другий напрям прийом відкрито.",
    );
  };
  const sync = createGrantSync(
    db,
    shared,
    fake as typeof fetch,
    () => new Date("2026-11-16T12:00:00Z"),
  );
  assert.deepEqual(await sync.refresh(), { checked: 2, failed: 0, skipped: 0 });
  assert.equal(calls, 1);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grant-source:' || $1))",
      [source],
    );
    assert.deepEqual(await sync.refresh(), {
      checked: 0,
      failed: 0,
      skipped: 2,
    });
    assert.equal(calls, 1);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("English deadline captures honor CET, CEST and Kyiv time", async () => {
  const english: GrantSourceRule[] = [
    {
      programId: "test-eit",
      url: "https://test.example/eit",
      requiredText: "Call closing",
      openPattern: "Call closing",
      deadlinePattern:
        "Call closing\\s*\\(submission of completed application\\)\\s*:\\s*((?:\\d{1,2}\\s+[A-Za-z]+\\s+20\\d{2})\\s+at\\s+\\d{1,2}[.:]\\d{2}\\s+CE(?:ST|T))",
    },
    {
      programId: "test-gov",
      url: "https://test.example/gov",
      requiredText: "Accepting applications until",
      openPattern: "Accepting applications until",
      deadlinePattern:
        "Accepting applications until ([A-Za-z]+\\s+\\d{1,2},?\\s+20\\d{2}\\s+at\\s+\\d{1,2}:\\d{2}\\s+Kyiv Time)",
    },
    {
      programId: "test-cest",
      url: "https://test.example/cest",
      requiredText: "Call closing",
      openPattern: "Call closing",
      deadlinePattern:
        "Call closing\\s*\\(submission of completed application\\)\\s*:\\s*((?:\\d{1,2}\\s+[A-Za-z]+\\s+20\\d{2})\\s+at\\s+\\d{1,2}[.:]\\d{2}\\s+CE(?:ST|T))",
    },
  ];
  const fake = async (input: string | URL | Request) =>
    new Response(
      String(input).endsWith("/gov")
        ? "Accepting applications until November 16, 2026 at 23:59 Kyiv Time (EET)"
        : String(input).endsWith("/cest")
          ? "Call closing (submission of completed application): 1 July 2027 at 17.00 CEST"
          : "Call closing (submission of completed application): 1 December 2026 at 17.00 CET",
    );
  const sync = createGrantSync(
    db,
    english,
    fake as typeof fetch,
    () => new Date("2026-11-16T12:00:00Z"),
  );
  try {
    assert.deepEqual(await sync.refresh(), {
      checked: 3,
      failed: 0,
      skipped: 0,
    });
    const status = sync.status();
    assert.equal(
      status.find((s) => s.programId === "test-eit")?.availability?.deadlineAt,
      "2026-12-01T16:00:00.000Z",
    );
    assert.equal(
      status.find((s) => s.programId === "test-gov")?.availability?.deadlineAt,
      "2026-11-16T21:59:00.000Z",
    );
    assert.equal(
      status.find((s) => s.programId === "test-cest")?.availability?.deadlineAt,
      "2027-07-01T15:00:00.000Z",
    );
  } finally {
    await db.query(
      "DELETE FROM grant_source_checks WHERE program_id=ANY($1::text[])",
      [english.map((r) => r.programId)],
    );
  }
});
test('calendar is overridden by an explicit suspension, and a failed gate cannot renew evidence',async()=>{
 let at=new Date('2026-11-16T12:00:00Z');let gate='Сторінка бізнес-гранту. Прийом заяв призупинено';
 const rule:GrantSourceRule={programId:'test-gate',url:'https://test.example/gate-calendar',requiredText:'Кінцеві строки подання заяв',schedule:true,suspensionUrl:'https://test.example/service',suspensionRequiredText:'Сторінка бізнес-гранту',suspensionClosedPattern:'прийом заяв призупинено'};
 const fake=async(input:string|URL|Request)=>{if(String(input).endsWith('/service')){if(gate==='error')return new Response('',{status:503});return new Response(gate);}return new Response(table);};
 const sync=createGrantSync(db,[rule],fake as typeof fetch,()=>at);
 try{assert.deepEqual(await sync.refresh(),{checked:1,failed:0,skipped:0});const first=sync.status()[0].availability;assert.equal(first?.state,'closed');assert.equal(first?.basis,'calendar');assert.equal(first?.sourceUrl,rule.suspensionUrl);assert.match(first?.evidence??'',/призупинено/i);at=new Date('2026-11-16T13:00:00Z');gate='error';assert.equal((await sync.refresh()).failed,1);assert.deepEqual(sync.status()[0].availability,first);gate='Невідома сторінка';assert.equal((await sync.refresh()).failed,1);assert.deepEqual(sync.status()[0].availability,first);gate='Сторінка бізнес-гранту. Інформація про послугу.';assert.equal((await sync.refresh()).checked,1);assert.equal(sync.status()[0].availability?.state,'open');}finally{await db.query('DELETE FROM grant_source_checks WHERE program_id=$1',[rule.programId]);}
});

test("calendar opening requires a matching current service deadline", async () => {
  const at = new Date("2026-11-18T12:00:00Z");
  const rule: GrantSourceRule = {
    programId: "test-calendar-confirmation",
    url: "https://test.example/confirmed-calendar",
    requiredText: "Кінцеві строки подання заяв",
    schedule: true,
    suspensionUrl: "https://test.example/confirmed-service",
    suspensionRequiredText: "Сторінка бізнес-гранту",
    suspensionClosedPattern: "прийом заяв призупинено",
    suspensionOpenDeadlinePattern: "поточний етап прийому заявок триває до (\\d{1,2}\\s+[а-яіїєґ]+\\s+20\\d{2})",
  };
  let service = "Сторінка бізнес-гранту. поточний етап прийому заявок триває до 27 листопада 2026";
  const fake = async (input: string | URL | Request) => new Response(String(input).endsWith("/confirmed-service") ? service : table);
  const sync = createGrantSync(db, [rule], fake as typeof fetch, () => at);
  try {
    await db.query(
      "INSERT INTO grant_source_checks(program_id,source_url,availability,last_attempt_at,last_error) VALUES($1,$2,$3::jsonb,$4,NULL) ON CONFLICT(program_id) DO UPDATE SET source_url=EXCLUDED.source_url,availability=EXCLUDED.availability,last_attempt_at=EXCLUDED.last_attempt_at,last_error=NULL",
      [rule.programId, rule.url, JSON.stringify({state: "open", basis: "calendar", checkedAt: at.toISOString(), validUntil: new Date(at.getTime() + 3600000).toISOString(), sourceUrl: rule.url, evidence: "Old calendar only", deadlineAt: "2026-11-27T21:59:59.000Z"}), at],
    );
    await sync.hydrate();
    assert.equal(sync.status()[0].availability, null);
    assert.equal((await sync.refresh()).checked, 1);
    assert.equal(sync.status()[0].availability?.state, "open");
    for (const uncertain of [
      "Сторінка бізнес-гранту. поточний етап прийому заявок триває до 27 жовтня 2026",
      "Сторінка бізнес-гранту. поточний етап прийому заявок триває до 15 грудня 2026",
      "Сторінка бізнес-гранту. Інформація про послугу.",
    ]) {
      service = uncertain;
      assert.equal((await sync.refresh()).failed, 1);
      assert.equal(sync.status()[0].availability, null);
      assert.equal(sync.status()[0].lastError, "service_deadline_unconfirmed");
    }
    service = "Сторінка бізнес-гранту. Прийом заяв призупинено. поточний етап прийому заявок триває до 27 листопада 2026";
    assert.equal((await sync.refresh()).checked, 1);
    assert.equal(sync.status()[0].availability?.state, "closed");
  } finally {
    await db.query("DELETE FROM grant_source_checks WHERE program_id=$1", [rule.programId]);
  }
});
