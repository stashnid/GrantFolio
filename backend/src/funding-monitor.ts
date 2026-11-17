import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  fetchBusinessFeed,
  validateStoredBusinessFeed,
} from "./funding-feed.js";
import { GRANT_CATALOG, type GrantCatalogEntry } from "./grant-catalog-data.js";

const FEED_SOURCE = "discovery:prostir-business";
const FEED_URL = "https://www.prostir.ua/feed/?post_type=grants";
export const FUNDING_DISCOVERY_SOURCE = "discovery:eu-funding";
const API = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const PORTAL =
  "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/";
const MAX_BODY = 4 * 1024 * 1024;
const MAX_PAGES = 5;
const PAGE_SIZE = 50;
const VALID_MS = 36 * 60 * 60 * 1000;
export type FundingCandidate = {
  identifier: string;
  title: string;
  url: string;
  sourceStatus: string;
  deadline: string | null;
  startsAt: string | null;
};
type DiscoveryStatus = {
  programId: string;
  sourceUrl: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  counts: { discovered: number; rejected: number };
  truncated: boolean;
};
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function field(value: unknown): string | null {
  return Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
    ? value[0]
    : null;
}
function date(value: unknown): string | null {
  const text = field(value);
  if (!text || !/^20\d{2}-\d{2}-\d{2}T/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
export function canonicalFundingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "ec.europa.eu" ||
      url.port ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(
      /^\/info\/funding-tenders\/opportunities\/portal\/screen\/opportunities\/topic-details\/([A-Za-z0-9][A-Za-z0-9_-]{2,180})\/?$/,
    );
    return match ? PORTAL + match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}
export function parseFundingResults(value: unknown): {
  candidates: FundingCandidate[];
  total: number;
  rejected: number;
} {
  const page = object(value);
  if (
    !page ||
    !Array.isArray(page.results) ||
    page.results.length > PAGE_SIZE ||
    !Number.isSafeInteger(page.totalResults) ||
    Number(page.totalResults) < 0
  )
    throw Error("invalid_search_response");
  const candidates: FundingCandidate[] = [];
  let rejected = 0;
  for (const raw of page.results) {
    const result = object(raw),
      meta = object(result?.metadata);
    if (!result || !meta) {
      rejected++;
      continue;
    }
    const identifier = field(meta.identifier),
      title = field(meta.title);
    const sourceStatus = field(meta.status);
    const language = result.language ?? field(meta.language);
    const url =
      typeof result.url === "string" ? canonicalFundingUrl(result.url) : null;
    if (
      !identifier ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{2,180}$/.test(identifier) ||
      !title ||
      title.length < 4 ||
      title.length > 600 ||
      /[<>\u0000-\u001f]/.test(title) ||
      language !== "en" ||
      field(meta.type) !== "1" ||
      field(meta.DATASOURCE) !== "SEDIA" ||
      !sourceStatus ||
      !["31094501", "31094502"].includes(sourceStatus) ||
      !url ||
      url !== PORTAL + identifier.toUpperCase()
    ) {
      rejected++;
      continue;
    }
    candidates.push({
      identifier: identifier.toUpperCase(),
      title,
      url,
      sourceStatus,
      deadline: date(meta.deadlineDate),
      startsAt: date(meta.startDate),
    });
  }
  return { candidates, total: Number(page.totalResults), rejected };
}
function idFor(candidate: FundingCandidate) {
  return (
    "eu-call-" +
    createHash("sha256").update(candidate.identifier).digest("hex").slice(0, 20)
  );
}
function entryFor(
  candidate: FundingCandidate,
  checkedAt: string,
): GrantCatalogEntry {
  const caution =
    "Потрібно перевірити право українського бізнесу на участь, умови конкретного конкурсу й прийом заявок.";
  return {
    id: idFor(candidate),
    title: candidate.title,
    provider: "European Commission — Funding & Tenders Portal",
    amount: "Сума та співфінансування потребують перевірки умов конкурсу",
    deadline: candidate.deadline
      ? `Дата у метаданих ЄС: ${candidate.deadline.slice(0, 10)}; точний час та раунд потребують перевірки.`
      : "Дедлайн потребує перевірки",
    category: "international",
    categoryLabel: "Міжнародні програми",
    targetAudience: caution,
    keyCondition: "Автоматично знайдено; умови участі ще не перевірено",
    summary: caution,
    eligibleCosts: [],
    officialUrl: candidate.url,
    checkedAt: checkedAt.slice(0, 10),
    intakeStatus: "unconfirmed",
    reviewStatus: "needs-review",
    programKind: "call",
    eligibilityUkraine: caution,
    tags: ["ЄС", "Автоматично знайдено", "Потребує перевірки"],
    fundingType: "grant",
    searchTerms: [candidate.identifier, candidate.title],
    availability: {
      state: "unknown",
      checkedAt,
      validUntil: new Date(
        new Date(checkedAt).getTime() + VALID_MS,
      ).toISOString(),
      sourceUrl: candidate.url,
      evidence:
        "Метадані офіційного пошуку знайдено; це не перевірка доступності для українського бізнесу.",
      deadlineAt: null,
    },
    details: {
      overview: caution,
      eligibility: [caution],
      exclusions: [],
      funding: [
        "Не виводимо суму або ставку співфінансування із результату пошуку.",
      ],
      costs: [],
      obligations: [
        "Повернення коштів, співфінансування та інші договірні зобов’язання потребують перевірки.",
      ],
      documents: [],
      steps: [
        "Перевірити офіційний topic та call documents перед підготовкою заявки.",
      ],
      timing: [
        `Ідентифікатор: ${candidate.identifier}`,
        `Статус у пошуку ЄС: ${candidate.sourceStatus}`,
        ...(candidate.startsAt
          ? [`Дата початку у метаданих: ${candidate.startsAt}`]
          : []),
        ...(candidate.deadline
          ? [`Дата дедлайну у метаданих: ${candidate.deadline}`]
          : []),
      ],
      pitfalls: [
        "Згадка України у пошуку не доводить eligibility українського МСП.",
      ],
      sources: [
        {
          title: "EU Funding & Tenders — автоматично знайдений конкурс",
          url: candidate.url,
          checkedAt: checkedAt.slice(0, 10),
        },
      ],
      unresolved: [
        caution,
        "Сума, eligible costs, співфінансування, зобов’язання, допустимий тип заявника та точний дедлайн.",
      ],
    },
  };
}
async function readLimited(response: Response) {
  if (Number(response.headers.get("content-length")) > MAX_BODY)
    throw Error("body_too_large");
  if (
    !/application\/(?:[\w.+-]*\+)?json\b/i.test(
      response.headers.get("content-type") ?? "",
    )
  )
    throw Error("invalid_content_type");
  if (!response.body) throw Error("empty_body");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw Error("body_too_large");
      }
      chunks.push(item.value);
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
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
async function fetchPage(fetchImpl: typeof fetch, page: number) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    apiKey: "SEDIA",
    text: "Ukraine",
    pageSize: String(PAGE_SIZE),
    pageNumber: String(page),
  }).toString();
  const body = new FormData();
  body.append(
    "query",
    new Blob(
      [
        JSON.stringify({
          bool: {
            must: [
              { terms: { type: ["1"] } },
              { terms: { status: ["31094501", "31094502"] } },
              { terms: { language: ["en"] } },
            ],
          },
        }),
      ],
      { type: "application/json" },
    ),
    "query.json",
  );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {
          method: "POST",
          body,
          signal: controller.signal,
          redirect: "error",
        });
        if (!response.ok) throw Error(`http_${response.status}`);
        if (
          response.url &&
          new URL(response.url).origin !== new URL(API).origin
        )
          throw Error("invalid_response_url");
        return parseFundingResults(await readLimited(response));
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("timeout"));
        }, 10000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function storedCandidate(value: unknown): FundingCandidate | null {
  const row = object(value);
  if (!row) return null;
  const parsed = parseFundingResults({
    totalResults: 1,
    results: [
      {
        language: "en",
        url: row.url,
        metadata: {
          identifier: [row.identifier],
          title: [row.title],
          status: [row.sourceStatus],
          type: ["1"],
          DATASOURCE: ["SEDIA"],
          deadlineDate: row.deadline ? [row.deadline] : [],
          startDate: row.startsAt ? [row.startsAt] : [],
        },
      },
    ],
  });
  return parsed.candidates[0] ?? null;
}
export function createFundingMonitor(
  db: Pool,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  options: { includeBusinessFeed?: boolean } = {},
) {
  let current: DiscoveryStatus = {
    programId: FUNDING_DISCOVERY_SOURCE,
    sourceUrl: API,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    counts: { discovered: 0, rejected: 0 },
    truncated: false,
  };
  const includeFeed = options.includeBusinessFeed !== false;
  let feedCurrent: DiscoveryStatus = {
    programId: FEED_SOURCE,
    sourceUrl: FEED_URL,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    counts: { discovered: 0, rejected: 0 },
    truncated: false,
  };
  let running: Promise<{
    checked: number;
    failed: number;
    skipped: number;
    discovered: number;
    truncated: boolean;
  }> | null = null;
  let hydrating: Promise<void> | null = null;
  function hydrate(): Promise<void> {
    if (!hydrating) {
      hydrating = hydrateInner().finally(() => {
        hydrating = null;
      });
    }
    return hydrating;
  }
  async function hydrateInner() {
    const result = await db.query(
      "SELECT candidate,last_seen_at FROM funding_discovery_candidates WHERE source_id=$1 ORDER BY external_id",
      [FUNDING_DISCOVERY_SOURCE],
    );
    const curatedUrls = new Set(
      GRANT_CATALOG.filter((p) => !p.id.startsWith("eu-call-"))
        .map((p) => canonicalFundingUrl(p.officialUrl))
        .filter(Boolean),
    );
    // A manually curated record may be added after an earlier discovery was loaded.
    // Remove only our unreviewed duplicate; never remove a reviewed record.
    for (let i = GRANT_CATALOG.length - 1; i >= 0; i--) {
      const entry = GRANT_CATALOG[i];
      if (
        entry.id.startsWith("eu-call-") &&
        entry.reviewStatus === "needs-review" &&
        curatedUrls.has(canonicalFundingUrl(entry.officialUrl))
      )
        GRANT_CATALOG.splice(i, 1);
    }
    for (const row of result.rows) {
      const candidate = storedCandidate(row.candidate);
      const at = new Date(row.last_seen_at);
      if (
        !candidate ||
        !Number.isFinite(at.getTime()) ||
        curatedUrls.has(candidate.url)
      )
        continue;
      const entry = entryFor(candidate, at.toISOString()),
        existing = GRANT_CATALOG.findIndex((p) => p.id === entry.id);
      if (existing < 0) GRANT_CATALOG.push(entry);
      else if (GRANT_CATALOG[existing].reviewStatus === "needs-review")
        GRANT_CATALOG[existing] = entry;
    }
    if (includeFeed) {
      const feeds = await db.query(
        "SELECT candidate,last_seen_at FROM funding_discovery_candidates WHERE source_id=$1 ORDER BY external_id",
        [FEED_SOURCE],
      );
      for (const row of feeds.rows) {
        const record = validateStoredBusinessFeed(row.candidate);
        if (!record) continue;
        const entry = record.entry;
        const sameUrl = GRANT_CATALOG.find(
          (p) =>
            p.officialUrl.replace(/\/$/, "") ===
              entry.officialUrl.replace(/\/$/, "") && p.id !== entry.id,
        );
        if (sameUrl) {
          const duplicate = GRANT_CATALOG.findIndex(
            (p) => p.id === entry.id && p.reviewStatus === "needs-review",
          );
          if (duplicate >= 0) GRANT_CATALOG.splice(duplicate, 1);
          continue;
        }
        const existing = GRANT_CATALOG.findIndex((p) => p.id === entry.id);
        if (existing < 0) GRANT_CATALOG.push(entry);
        else if (GRANT_CATALOG[existing].reviewStatus === "needs-review")
          GRANT_CATALOG[existing] = entry;
      }
      const feedState = await db.query(
        "SELECT last_attempt_at,last_success_at,last_error,discovered_count,rejected_count,truncated FROM funding_discovery_sources WHERE source_id=$1",
        [FEED_SOURCE],
      );
      if (feedState.rows[0]) {
        const row = feedState.rows[0];
        feedCurrent = {
          ...feedCurrent,
          lastAttemptAt: new Date(row.last_attempt_at).toISOString(),
          lastSuccessAt: row.last_success_at
            ? new Date(row.last_success_at).toISOString()
            : null,
          lastError: row.last_error,
          counts: {
            discovered: row.discovered_count,
            rejected: row.rejected_count,
          },
          truncated: row.truncated,
        };
      }
    }
    const state = await db.query(
      "SELECT last_attempt_at,last_success_at,last_error,discovered_count,rejected_count,truncated FROM funding_discovery_sources WHERE source_id=$1",
      [FUNDING_DISCOVERY_SOURCE],
    );
    if (state.rows[0]) {
      const row = state.rows[0];
      current = {
        ...current,
        lastAttemptAt: new Date(row.last_attempt_at).toISOString(),
        lastSuccessAt: row.last_success_at
          ? new Date(row.last_success_at).toISOString()
          : null,
        lastError: row.last_error,
        counts: {
          discovered: row.discovered_count,
          rejected: row.rejected_count,
        },
        truncated: row.truncated,
      };
    }
  }
  async function refreshInner() {
    const client = await db.connect();
    let released = false;
    const release = () => {
      if (!released) {
        client.release();
        released = true;
      }
    };
    let discovered = 0,
      rejected = 0,
      truncated = false;
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
        [FUNDING_DISCOVERY_SOURCE],
      );
      if (!lock.rows[0]?.acquired) {
        await client.query("ROLLBACK");
        release();
        await hydrate();
        return {
          checked: 0,
          failed: 0,
          skipped: 1,
          discovered: 0,
          truncated: false,
        };
      }
      const at = now();
      try {
        const candidates = new Map<string, FundingCandidate>();
        const urls = new Set<string>();
        for (let page = 1; page <= MAX_PAGES; page++) {
          const result = await fetchPage(fetchImpl, page);
          rejected += result.rejected;
          for (const candidate of result.candidates) {
            if (
              !candidates.has(candidate.identifier) &&
              !urls.has(candidate.url)
            ) {
              candidates.set(candidate.identifier, candidate);
              urls.add(candidate.url);
            }
          }
          if (page * PAGE_SIZE >= result.total) break;
          if (page === MAX_PAGES) truncated = true;
        }
        for (const candidate of candidates.values()) {
          await client.query(
            `INSERT INTO funding_discovery_candidates(source_id,external_id,candidate,last_seen_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(source_id,external_id) DO UPDATE SET candidate=EXCLUDED.candidate,last_seen_at=EXCLUDED.last_seen_at`,
            [
              FUNDING_DISCOVERY_SOURCE,
              candidate.identifier,
              JSON.stringify(candidate),
              at,
            ],
          );
        }
        discovered = candidates.size;
        await client.query(
          `INSERT INTO funding_discovery_sources(source_id,last_attempt_at,last_success_at,last_error,discovered_count,rejected_count,truncated) VALUES($1,$2,$2,NULL,$3,$4,$5) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_success_at=EXCLUDED.last_success_at,last_error=NULL,discovered_count=EXCLUDED.discovered_count,rejected_count=EXCLUDED.rejected_count,truncated=EXCLUDED.truncated`,
          [FUNDING_DISCOVERY_SOURCE, at, discovered, rejected, truncated],
        );
      } catch (error) {
        // All pages are fetched before writes; a network/parser failure preserves all earlier observations.
        // Roll back any persistence failure too, then retain only the failed attempt marker.
        await client.query("ROLLBACK");
        release();
        const message =
          error instanceof Error
            ? error.message.slice(0, 200)
            : "discovery_failed";
        await db.query(
          `INSERT INTO funding_discovery_sources(source_id,last_attempt_at,last_error) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_error=EXCLUDED.last_error WHERE funding_discovery_sources.last_attempt_at <= EXCLUDED.last_attempt_at`,
          [FUNDING_DISCOVERY_SOURCE, at, message],
        );
        await hydrate();
        return {
          checked: 0,
          failed: 1,
          skipped: 0,
          discovered: 0,
          truncated: false,
        };
      }
      await client.query("COMMIT");
      release();
      await hydrate();
      return { checked: 1, failed: 0, skipped: 0, discovered, truncated };
    } catch (error) {
      if (!released) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      release();
    }
  }
  async function refreshFeed() {
    const client = await db.connect(),
      at = now();
    let released = false;
    const release = () => {
      if (!released) {
        client.release();
        released = true;
      }
    };
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
        [FEED_SOURCE],
      );
      if (!lock.rows[0]?.acquired) {
        await client.query("ROLLBACK");
        release();
        await hydrate();
        return {
          checked: 0,
          failed: 0,
          skipped: 1,
          discovered: 0,
          truncated: false,
        };
      }
      try {
        const records = await fetchBusinessFeed(fetchImpl);
        const seen = new Set<string>();
        for (const raw of records) {
          const record = validateStoredBusinessFeed(raw);
          if (!record || seen.has(record.externalId)) continue;
          seen.add(record.externalId);
          await client.query(
            `INSERT INTO funding_discovery_candidates(source_id,external_id,candidate,last_seen_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(source_id,external_id) DO UPDATE SET candidate=EXCLUDED.candidate,last_seen_at=EXCLUDED.last_seen_at`,
            [FEED_SOURCE, record.externalId, JSON.stringify(record), at],
          );
        }
        await client.query(
          `INSERT INTO funding_discovery_sources(source_id,last_attempt_at,last_success_at,last_error,discovered_count,rejected_count,truncated) VALUES($1,$2,$2,NULL,$3,$4,$5) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_success_at=EXCLUDED.last_success_at,last_error=NULL,discovered_count=EXCLUDED.discovered_count,rejected_count=EXCLUDED.rejected_count,truncated=EXCLUDED.truncated`,
          [FEED_SOURCE, at, seen.size, records.length - seen.size, false],
        );
        await client.query("COMMIT");
        release();
        await hydrate();
        return {
          checked: 1,
          failed: 0,
          skipped: 0,
          discovered: seen.size,
          truncated: false,
        };
      } catch (error) {
        if (released) throw error;
        await client.query("ROLLBACK");
        release();
        await db.query(
          `INSERT INTO funding_discovery_sources(source_id,last_attempt_at,last_error) VALUES($1,$2,$3) ON CONFLICT(source_id) DO UPDATE SET last_attempt_at=EXCLUDED.last_attempt_at,last_error=EXCLUDED.last_error WHERE funding_discovery_sources.last_attempt_at <= EXCLUDED.last_attempt_at`,
          [
            FEED_SOURCE,
            at,
            error instanceof Error
              ? error.message.slice(0, 200)
              : "feed_failed",
          ],
        );
        await hydrate();
        return {
          checked: 0,
          failed: 1,
          skipped: 0,
          discovered: 0,
          truncated: false,
        };
      }
    } finally {
      release();
    }
  }
  function refresh() {
    if (!running)
      running = (async () => {
        const eu = await refreshInner();
        if (!includeFeed) return eu;
        const feed = await refreshFeed();
        return {
          checked: eu.checked + feed.checked,
          failed: eu.failed + feed.failed,
          skipped: eu.skipped + feed.skipped,
          discovered: eu.discovered + feed.discovered,
          truncated: eu.truncated || feed.truncated,
        };
      })().finally(() => {
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
      6 * 60 * 60 * 1000,
    );
    timer.unref();
    return () => clearInterval(timer);
  }
  return {
    hydrate,
    refresh,
    start,
    status: () =>
      [current, ...(includeFeed ? [feedCurrent] : [])].map((s) => ({
        ...s,
        counts: { ...s.counts },
      })),
  };
}
