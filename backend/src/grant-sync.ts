import type { Pool } from "pg";
import { GRANT_CATALOG, type GrantCatalogEntry } from "./grant-catalog-data.js";
import {
  GRANT_SOURCE_RULES,
  type GrantSourceRule,
} from "./grant-source-rules.js";
import { getMonitorProfile } from "./program-monitor-profiles.js";

type Availability = NonNullable<GrantCatalogEntry["availability"]>;
type CheckStatus = {
  programId: string;
  sourceUrl: string;
  lastAttemptAt: string;
  lastError: string | null;
  availability: Availability | null;
};
const MAX_BODY = 4 * 1024 * 1024;
const VALID_MS = 36 * 60 * 60 * 1000;
const CONFIRMED_GATE_EVIDENCE = "Підтверджено сторінкою послуги: ";
const MONTHS = [
  "січ",
  "лют",
  "берез",
  "квіт",
  "трав",
  "черв",
  "лип",
  "серп",
  "верес",
  "жовт",
  "листопад",
  "груд",
];
function textOf(html: string): string {
  return html
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:#(\d+)|#x([\da-f]+));/gi, (_, d, h) =>
      String.fromCodePoint(parseInt(d || h, h ? 16 : 10)),
    )
    .replace(/\s+/g, " ")
    .trim();
}
function kyivInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date | null {
  const base = Date.UTC(year, month - 1, day, hour, minute, second);
  const verify = new Date(Date.UTC(year, month - 1, day));
  if (
    verify.getUTCFullYear() !== year ||
    verify.getUTCMonth() !== month - 1 ||
    verify.getUTCDate() !== day
  )
    return null;
  let timestamp = base;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .map((x) => [x.type, x.value]),
    );
    timestamp +=
      base -
      Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }
  return new Date(timestamp);
}
function parseDate(value: string): Date | null {
  const s = value.toLocaleLowerCase("uk").trim();
  const iso = s.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/),
    dot = s.match(/(\d{1,2})[./](\d{1,2})[./](20\d{2})/);
  const named = s.match(/(\d{1,2})\s+([а-яіїєґ]+)\s+(20\d{2})/u);
  const englishMonths = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const englishDay = s.match(/(\d{1,2})\s+([a-z]+)\s+(20\d{2})/),
    englishMonth = s.match(/([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})/);
  let y: number, m: number, d: number;
  if (iso) {
    y = +iso[1];
    m = +iso[2];
    d = +iso[3];
  } else if (dot) {
    d = +dot[1];
    m = +dot[2];
    y = +dot[3];
  } else if (named) {
    d = +named[1];
    m = MONTHS.findIndex((x) => named[2].startsWith(x)) + 1;
    y = +named[3];
  } else if (englishDay) {
    d = +englishDay[1];
    m = englishMonths.indexOf(englishDay[2]) + 1;
    y = +englishDay[3];
  } else if (englishMonth) {
    m = englishMonths.indexOf(englishMonth[1]) + 1;
    d = +englishMonth[2];
    y = +englishMonth[3];
  } else return null;
  const dateMatch = iso ?? dot ?? named ?? englishDay ?? englishMonth;
  const timePart = dateMatch
    ? s.slice((dateMatch.index ?? 0) + dateMatch[0].length)
    : "";
  const t = timePart.match(/(?:\s|о\s*)(\d{1,2})[.:](\d{2})/);
  const hour = t ? +t[1] : 23,
    minute = t ? +t[2] : 59,
    second = t ? 0 : 59;
  if (m < 1 || m > 12 || hour > 23 || minute > 59) return null;
  const local = kyivInstant(y, m, d, hour, minute, second);
  if (!local) return null;
  if (/\b(?:cet|cest)\b/.test(s)) {
    if (!t) return null;
    const offset = /\bcest\b/.test(s) ? 2 : 1;
    return new Date(Date.UTC(y, m - 1, d, hour - offset, minute, second));
  }
  return local;
}
function calendar(
  scope: string,
  now: Date,
): {
  state: "open" | "closed";
  startsAt: string | null;
  deadlineAt: string | null;
  evidence: string;
} | null {
  const header = scope
    .toLocaleLowerCase("uk")
    .lastIndexOf(
      "місяць день початку подання заяв день закінчення подання заяв",
    );
  if (header < 0) return null;
  const table = scope.slice(header, header + 3000);
  const re =
    /(січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)\s+((?:\d{1,2}\s+){1,4}\d{1,2})/giu;
  const found = [...table.matchAll(re)];
  if (found.length !== 12) return null;
  const year = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
    }).format(now),
  );
  const windows: { start: Date; end: Date; label: string }[] = [];
  for (const match of found) {
    const month =
      MONTHS.findIndex((m) => match[1].toLocaleLowerCase("uk").startsWith(m)) +
      1;
    const days = match[2].trim().split(/\s+/).map(Number);
    if (!month || days.length % 2 !== 0 || days.length > 4) return null;
    for (let i = 0; i < days.length; i += 2) {
      const start = kyivInstant(year, month, days[i], 0, 0),
        end = kyivInstant(year, month, days[i + 1], 23, 59, 59);
      if (!start || !end || start > end) return null;
      windows.push({
        start,
        end,
        label: `${match[1]} ${days[i]}–${days[i + 1]}`,
      });
    }
  }
  const active = windows.find((w) => w.start <= now && now <= w.end);
  const next = windows.find((w) => w.start > now);
  const chosen = active ?? next;
  return {
    state: active ? "open" : "closed",
    startsAt: chosen?.start.toISOString() ?? null,
    deadlineAt: chosen?.end.toISOString() ?? null,
    evidence: chosen
      ? `Календар подання: ${chosen.label}.`
      : "У календарі більше немає періодів цього року.",
  };
}
function interpret(
  rule: GrantSourceRule,
  body: string,
  now: Date,
): Availability {
  const text = textOf(body),
    lower = text.toLocaleLowerCase("uk"),
    anchor = lower.lastIndexOf(rule.requiredText.toLocaleLowerCase("uk"));
  if (!rule.requiredText || anchor < 0) throw Error("required_text_missing");
  const scope = text.slice(
    Math.max(0, anchor - 300),
    Math.min(text.length, anchor + 6000),
  );
  const matches = (pattern: string) => new RegExp(pattern, "iu").exec(scope);
  const closed = rule.closedPatterns?.map(matches).find(Boolean);
  let deadlinePrecision: "day" | "minute" = "day";
  let state: "open" | "closed" | "unknown" = "unknown",
    deadlineAt: string | null = null,
    startsAt: string | null = null,
    evidence = "";
  if (closed) {
    state = "closed";
    evidence = closed[0].slice(0, 300);
  } else if (rule.schedule) {
    const c = calendar(scope, now);
    if (!c) throw Error("schedule_unrecognized");
    ({ state, deadlineAt, startsAt, evidence } = c);
  } else {
    const open = rule.openPattern ? matches(rule.openPattern) : null;
    if (!open) throw Error("open_evidence_missing");
    if (rule.rolling) {
      state = "open";
      evidence = open[0].slice(0, 300);
    } else {
      const deadline = rule.deadlinePattern
        ? matches(rule.deadlinePattern)
        : null;
      const parsed = deadline?.[1] ? parseDate(deadline[1]) : null;
      if (!parsed) throw Error("deadline_unrecognized");
      deadlinePrecision = /(?:at|о)\s*\d{1,2}[.:]\d{2}|\d{1,2}:\d{2}|\d{1,2}\.\d{2}\s*-\s*CET/i.test(
        deadline![1],
      )
        ? "minute"
        : "day";
      deadlineAt = parsed.toISOString();
      state = parsed >= now ? "open" : "closed";
      evidence = (deadline?.[0] ?? open[0]).slice(0, 300);
    }
  }
  return {
    state,
    basis: rule.schedule ? "calendar" : rule.rolling ? "rolling" : "announcement",
    checkedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + VALID_MS).toISOString(),
    sourceUrl: rule.url,
    evidence,
    deadlineAt,
    deadlinePrecision,
    startsAt,
    ...(rule.rolling ? { rolling: true } : {}),
  };
}
async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BODY) throw Error("body_too_large");
  if (!response.body) throw Error("empty_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
async function fetchSource(urlText:string,fetchImpl:typeof fetch):Promise<string> {
  const url=new URL(urlText);
  if(url.protocol!=="https:"||url.username||url.password)throw Error("invalid_source_url");
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([(async()=>{const response=await fetchImpl(urlText,{signal:controller.signal,redirect:"error"});if(!response.ok)throw Error(`http_${response.status}`);return readLimited(response);})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("timeout"));},10000);})]);
  } finally {if(timer)clearTimeout(timer);}
}
export function createGrantSync(
  db: Pool,
  rules: GrantSourceRule[] = GRANT_SOURCE_RULES,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  let statuses: CheckStatus[] = [];
  let running: Promise<{
    checked: number;
    failed: number;
    skipped: number;
  }> | null = null;
  const byId = new Map(rules.map((r) => [r.programId, r]));
  function apply(id: string, availability: Availability | null) {
    const entry = GRANT_CATALOG.find((p) => p.id === id);
    if (entry) entry.availability = availability ?? undefined;
  }
  async function hydrate() {
    const result = await db.query(
      "SELECT program_id,source_url,availability,last_attempt_at,last_error FROM grant_source_checks",
    );
    statuses = [];
    for (const row of result.rows) {
      const rule = byId.get(row.program_id);
      const monitorProfile =
        rules === GRANT_SOURCE_RULES
          ? getMonitorProfile(row.program_id)
          : undefined;
      const matchesRule = Boolean(rule && rule.url === row.source_url);
      const matchesProfile = Boolean(
        monitorProfile && monitorProfile.sourceUrl === row.source_url,
      );
      if (!matchesRule && !matchesProfile) continue;
      let availability = row.availability as Availability | null;
      if (rule?.suspensionOpenDeadlinePattern && availability?.state === "open" &&
          (typeof availability.evidence !== "string" || !availability.evidence.startsWith(CONFIRMED_GATE_EVIDENCE))) {
        availability = null;
      }
      apply(row.program_id, availability);
      statuses.push({
        programId: row.program_id,
        sourceUrl: row.source_url,
        lastAttemptAt: new Date(row.last_attempt_at).toISOString(),
        lastError: row.last_error,
        availability,
      });
    }
  }
  async function refreshInner() {
    let checked = 0,
      failed = 0,
      skipped = 0;
    const groups = new Map<string, GrantSourceRule[]>();
    for (const rule of rules)
      groups.set(rule.url, [...(groups.get(rule.url) ?? []), rule]);
    for (const [sourceUrl, sourceRules] of groups) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const lock = await client.query(
          "SELECT pg_try_advisory_xact_lock(hashtext('grant-source:' || $1)) AS acquired",
          [sourceUrl],
        );
        if (!lock.rows[0].acquired) {
          await client.query("ROLLBACK");
          skipped += sourceRules.length;
          continue;
        }
        const at = now();
        let body: string | undefined;
        let fetchError = "";
        try {
          body = await fetchSource(sourceUrl, fetchImpl);
        } catch (e) {
          fetchError = e instanceof Error ? e.message : "source_failed";
        }
        const updates: { id: string; availability: Availability }[] = [];
        for (const rule of sourceRules) {
          let availability: Availability | undefined;
          let error = fetchError;
          if (!error)
            try {
              availability = interpret(rule, body!, at);
              if (rule.suspensionUrl || rule.suspensionRequiredText || rule.suspensionClosedPattern) {
                if (!rule.suspensionUrl || !rule.suspensionRequiredText || !rule.suspensionClosedPattern) throw Error("suspension_rule_incomplete");
                const gateText=textOf(await fetchSource(rule.suspensionUrl,fetchImpl));
                const gateAnchor=gateText.toLocaleLowerCase("uk").lastIndexOf(rule.suspensionRequiredText.toLocaleLowerCase("uk"));
                if(gateAnchor<0)throw Error("suspension_required_text_missing");
                const paused=new RegExp(rule.suspensionClosedPattern,"iu").exec(gateText);
                if (paused) {
                  availability = {...availability, state: "closed", sourceUrl: rule.suspensionUrl, evidence: `Сторінка послуги: ${paused[0].slice(0,250)}`};
                } else if (availability.state === "open" && rule.suspensionOpenDeadlinePattern) {
                  const deadline = new RegExp(rule.suspensionOpenDeadlinePattern, "iu").exec(gateText);
                  const parsed = deadline?.[1] ? parseDate(deadline[1]) : null;
                  if (!parsed || parsed.toISOString() !== availability.deadlineAt || parsed < at) {
                    throw Error("service_deadline_unconfirmed");
                  }
                  availability = {...availability, evidence: `${CONFIRMED_GATE_EVIDENCE}${deadline![0]}. ${availability.evidence}`};
                }
              }
            } catch (e) {
              availability = undefined;
              error = e instanceof Error ? e.message : "source_failed";
            }
          if (availability) {
            await client.query(
              `INSERT INTO grant_source_checks(program_id,source_url,availability,last_attempt_at,last_error) VALUES($1,$2,$3::jsonb,$4,NULL) ON CONFLICT(program_id) DO UPDATE SET source_url=EXCLUDED.source_url,availability=EXCLUDED.availability,last_attempt_at=EXCLUDED.last_attempt_at,last_error=NULL`,
              [rule.programId, sourceUrl, JSON.stringify(availability), at],
            );
            updates.push({ id: rule.programId, availability });
            checked++;
          } else {
            await client.query(
              `INSERT INTO grant_source_checks(program_id,source_url,availability,last_attempt_at,last_error) VALUES($1,$2,NULL,$3,$4) ON CONFLICT(program_id) DO UPDATE SET availability=CASE WHEN $5::boolean AND grant_source_checks.availability->>'state'='open' THEN NULL WHEN grant_source_checks.source_url=EXCLUDED.source_url THEN grant_source_checks.availability ELSE NULL END,source_url=EXCLUDED.source_url,last_attempt_at=EXCLUDED.last_attempt_at,last_error=EXCLUDED.last_error`,
              [rule.programId, sourceUrl, at, error.slice(0, 200), Boolean(rule.suspensionOpenDeadlinePattern)],
            );
            failed++;
          }
        }
        await client.query("COMMIT");
        for (const update of updates) apply(update.id, update.availability);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
    await hydrate();
    return { checked, failed, skipped };
  }
  function refresh() {
    if (!running)
      running = refreshInner().finally(() => {
        running = null;
      });
    return running;
  }
  function start() {
    void refresh().catch(() => {});
    const timer = setInterval(
      () => {
        void refresh().catch(() => {});
      },
      60 * 60 * 1000,
    );
    timer.unref();
    return () => clearInterval(timer);
  }
  return {
    hydrate,
    refresh,
    start,
    status: () => statuses.map((s) => ({ ...s })),
  };
}
