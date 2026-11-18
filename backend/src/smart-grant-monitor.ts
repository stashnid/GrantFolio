import { applicationDefault } from "firebase-admin/app";
import type { Pool, PoolClient } from "pg";
import {
  PROGRAM_MONITOR_PROFILES,
  type ProgramMonitorProfile,
} from "./program-monitor-profiles.js";
import {
  assertSafeMonitorUrl,
  buildCleanAvailability,
  buildExtractionPrompt,
  computeContentHash,
  normalizeSourceText,
  refreshExistingAvailability,
  VALID_UNTIL_MS,
  verifyExtraction,
  type ExtractedProgramFacts,
  type MonitorAvailability,
  type SuspensionCheck,
} from "./smart-monitor-verifier.js";

export {
  assertSafeMonitorUrl,
  buildExtractionPrompt,
  computeContentHash,
  ExtractedProgramFactsSchema,
  normalizeSourceText,
  verifyExtraction,
  type ExtractedProgramFacts,
  type ExtractionPrompt,
  type VerificationResult,
} from "./smart-monitor-verifier.js";

type Confidence = "high" | "medium" | "low";
type ProposalField =
  | "amount"
  | "eligibilityUkraine"
  | "requiredDocuments"
  | "applicationFormat"
  | "allowedCosts"
  | "availability";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const LLM_TIMEOUT_MS = 15_000;
const MAX_LLM_RESPONSE_BYTES = 65_536;
const MAX_REDIRECTS = 3;
const ALLOWED_GEMINI_MODEL = "gemini-3.5-flash-lite";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TRANSIENT_LLM_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_LLM_RETRY_DELAYS_MS: readonly number[] = [1000, 2500];
const FETCH_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (compatible; GrantFolio-Monitor/1.0; +https://grantfolio.pp.ua)",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "uk,en;q=0.9",
};
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type ProgramFactsExtractor = (
  profile: ProgramMonitorProfile,
  normalizedText: string,
  now: Date,
  signal?: AbortSignal,
) => Promise<unknown>;

export type GeminiExtractorOptions = {
  retryDelayMs?: readonly number[];
};

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error("llm_aborted"));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("llm_aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("body_too_large");
  if (!response.body) throw new Error("empty_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("body_too_large");
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

export function configuredGeminiExtractor(
  fetchImpl: typeof fetch = fetch,
  accessTokenProvider?: () => Promise<{ access_token: string }>,
  options: GeminiExtractorOptions = {},
): ProgramFactsExtractor | undefined {
  if (process.env.SMART_MONITOR_AI_ENABLED !== "true") return undefined;
  const vertexProject = process.env.GEMINI_VERTEX_PROJECT?.trim();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!vertexProject && !apiKey) return undefined;
  if (vertexProject && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(vertexProject)) {
    return undefined;
  }
  const model = process.env.GEMINI_MODEL ?? ALLOWED_GEMINI_MODEL;
  if (model !== ALLOWED_GEMINI_MODEL) return undefined;

  const retryDelays = options.retryDelayMs ?? DEFAULT_LLM_RETRY_DELAYS_MS;
  const getAccessToken = vertexProject
    ? accessTokenProvider ?? (() => applicationDefault().getAccessToken())
    : undefined;
  const endpoint = vertexProject
    ? `https://aiplatform.eu.rep.googleapis.com/v1/projects/${vertexProject}/locations/eu/publishers/google/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  return async (profile, normalizedText, now, externalSignal) => {
    const prompt = buildExtractionPrompt(profile, normalizedText, now);
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: prompt.systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: prompt.userPrompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });
    const headers = new Headers({ "content-type": "application/json" });
    if (getAccessToken) {
      const token = await getAccessToken();
      headers.set("authorization", `Bearer ${token.access_token}`);
    } else {
      headers.set("x-goog-api-key", apiKey!);
    }
    const requestHeaders = Object.fromEntries(headers);

    let rawResponse = "";
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      if (externalSignal?.aborted) throw new Error("llm_aborted");
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      externalSignal?.addEventListener("abort", onAbort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          (async () => {
            const response = await fetchImpl(endpoint, {
              method: "POST",
              headers: requestHeaders,
              body,
              signal: controller.signal,
              redirect: "error",
            });
            if (response.ok) {
              return {
                retry: false,
                body: await readBoundedBody(response, MAX_LLM_RESPONSE_BYTES),
              };
            }
            if (
              TRANSIENT_LLM_STATUSES.has(response.status) &&
              attempt < retryDelays.length
            ) {
              await response.body?.cancel().catch(() => {});
              return { retry: true, body: "" };
            }
            throw new Error(`llm_http_${response.status}`);
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("llm_timeout"));
            }, LLM_TIMEOUT_MS);
          }),
        ]);
        if (!result.retry) {
          rawResponse = result.body;
          break;
        }
      } finally {
        if (timer) clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onAbort);
      }
      await sleepWithSignal(retryDelays[attempt], externalSignal);
    }

    const data = JSON.parse(rawResponse) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    if (data.promptFeedback?.blockReason) throw new Error("llm_blocked");
    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason !== "STOP") throw new Error("llm_incomplete");
    const parts = candidate.content?.parts;
    if (!Array.isArray(parts) || parts.length === 0) throw new Error("llm_empty");
    const text = parts
      .filter((p) => p && p.thought !== true && typeof p.text === "string")
      .map((p) => p.text)
      .join("")
      .trim();
    if (!text) throw new Error("llm_empty");
    return JSON.parse(text);
  };
}

async function fetchSafePage(urlText: string, fetchImpl: typeof fetch): Promise<string> {
  let currentUrl = assertSafeMonitorUrl(urlText).href;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        for (let hop = 0; ; hop += 1) {
          const response = await fetchImpl(currentUrl, {
            method: "GET",
            headers: FETCH_HEADERS,
            signal: controller.signal,
            redirect: "manual",
          });
          if (REDIRECT_STATUSES.has(response.status)) {
            await response.body?.cancel().catch(() => {});
            if (hop >= MAX_REDIRECTS) throw new Error("too_many_redirects");
            const location = response.headers.get("location")?.trim();
            if (!location) throw new Error("invalid_redirect");
            let nextUrl: URL;
            try {
              nextUrl = new URL(location, currentUrl);
            } catch {
              throw new Error("invalid_redirect");
            }
            currentUrl = assertSafeMonitorUrl(nextUrl.href).href;
            continue;
          }
          if (!response.ok) throw new Error(`http_${response.status}`);
          return readBoundedBody(response, MAX_BODY_BYTES);
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("fetch_timeout"));
        }, FETCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkSuspensionBanner(
  profile: ProgramMonitorProfile,
  primaryNormalizedText: string,
  fetchImpl: typeof fetch,
): Promise<SuspensionCheck | null> {
  if (!profile.suspensionUrl || !profile.suspensionPattern) return null;
  const text =
    profile.suspensionUrl === profile.sourceUrl
      ? primaryNormalizedText
      : normalizeSourceText(await fetchSafePage(profile.suspensionUrl, fetchImpl));
  const match = new RegExp(profile.suspensionPattern, "iu").exec(text);
  return {
    suspended: Boolean(match),
    quote: match ? match[0].slice(0, 300) : "",
    sourceUrl: profile.suspensionUrl,
  };
}

async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function insertPendingProposalIfNew(
  client: PoolClient,
  params: {
    programId: string;
    fieldName: ProposalField;
    oldValue: unknown;
    newValue: unknown;
    evidenceQuote: string;
    confidence: Confidence;
    detectedAt: Date;
  },
): Promise<boolean> {
  const newValueJson = JSON.stringify(params.newValue);
  const existing = await client.query(
    `SELECT 1 FROM grant_change_proposals
     WHERE program_id = $1 AND field_name = $2 AND status = 'pending_review' AND new_value = $3::jsonb
     LIMIT 1`,
    [params.programId, params.fieldName, newValueJson],
  );
  if (existing.rows.length > 0) return false;
  await client.query(
    `INSERT INTO grant_change_proposals
       (program_id, field_name, old_value, new_value, evidence_quote, confidence, status, detected_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, 'pending_review', $7)`,
    [
      params.programId,
      params.fieldName,
      params.oldValue == null ? null : JSON.stringify(params.oldValue),
      newValueJson,
      params.evidenceQuote.slice(0, 600),
      params.confidence,
      params.detectedAt,
    ],
  );
  return true;
}

async function upsertSourceCheck(
  client: PoolClient,
  programId: string,
  sourceUrl: string,
  availability: MonitorAvailability,
  at: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO grant_source_checks (program_id, source_url, availability, last_attempt_at, last_error)
     VALUES ($1, $2, $3::jsonb, $4, NULL)
     ON CONFLICT (program_id) DO UPDATE SET
       source_url = EXCLUDED.source_url, availability = EXCLUDED.availability,
       last_attempt_at = EXCLUDED.last_attempt_at, last_error = NULL`,
    [programId, sourceUrl, JSON.stringify(availability), at],
  );
}

async function applyAvailabilityChange(
  client: PoolClient,
  params: {
    autoPromote: boolean;
    programId: string;
    sourceUrl: string;
    oldAvailability: unknown;
    availability: MonitorAvailability;
    evidenceQuote: string;
    confidence: Confidence;
    at: Date;
  },
): Promise<number> {
  if (params.autoPromote) {
    await upsertSourceCheck(
      client,
      params.programId,
      params.sourceUrl,
      params.availability,
      params.at,
    );
    await client.query(
      `INSERT INTO grant_change_proposals
         (program_id, field_name, old_value, new_value, evidence_quote, confidence, status, detected_at, reviewed_at, reviewed_by)
       VALUES ($1, 'availability', $2::jsonb, $3::jsonb, $4, $5, 'auto_applied', $6, $6, 'smart-grant-monitor')`,
      [
        params.programId,
        params.oldAvailability ? JSON.stringify(params.oldAvailability) : null,
        JSON.stringify(params.availability),
        params.evidenceQuote.slice(0, 600),
        params.confidence,
        params.at,
      ],
    );
    return 1;
  }
  const inserted = await insertPendingProposalIfNew(client, {
    programId: params.programId,
    fieldName: "availability",
    oldValue: params.oldAvailability,
    newValue: params.availability,
    evidenceQuote: params.evidenceQuote,
    confidence: params.confidence,
    detectedAt: params.at,
  });
  return inserted ? 1 : 0;
}

type SnapshotRow = {
  content_hash: string;
  extraction_status: string;
  last_extracted_json: Record<string, unknown> | null;
};

type RunStatus = "unmodified" | "verified" | "verifier_failed" | "ai_disabled" | "failed" | "skipped";
type ProgramRunOutcome = { status: RunStatus; proposalsCreated: number };

export type SmartMonitorSummary = {
  total: number;
  unmodified: number;
  verified: number;
  verifierFailed: number;
  aiDisabled: number;
  failed: number;
  skipped: number;
  proposalsCreated: number;
};

export type SmartGrantMonitorOptions = {
  profiles?: readonly ProgramMonitorProfile[];
  fetchImpl?: typeof fetch;
  extractor?: ProgramFactsExtractor | null;
  now?: () => Date;
  concurrency?: number;
};

type SnapshotStatus = "fetch_error" | "ai_disabled" | "llm_error" | "verifier_failed" | "verified";

async function upsertSnapshot(
  client: PoolClient,
  p: {
    programId: string;
    sourceUrl: string;
    contentHash: string;
    at: Date;
    status: SnapshotStatus;
    extractedJson?: ExtractedProgramFacts | null;
    verifierErrors?: string[];
    lastError?: string | null;
    updateHashAndChangedAt: boolean;
  },
): Promise<void> {
  const hashClause = p.updateHashAndChangedAt
    ? "content_hash = EXCLUDED.content_hash, last_changed_at = EXCLUDED.last_changed_at,"
    : "";
  const jsonClause =
    p.extractedJson !== undefined ? "last_extracted_json = EXCLUDED.last_extracted_json," : "";
  const errorsClause =
    p.verifierErrors !== undefined ? "verifier_errors = EXCLUDED.verifier_errors," : "";

  await client.query(
    `INSERT INTO grant_program_snapshots
       (program_id, source_url, content_hash, fetched_at, last_changed_at, last_extracted_json, extraction_status, verifier_errors, last_error)
     VALUES ($1, $2, $3, $4, $4, $5::jsonb, $6, $7::text[], $8)
     ON CONFLICT (program_id) DO UPDATE SET
       source_url = EXCLUDED.source_url, ${hashClause} fetched_at = EXCLUDED.fetched_at,
       ${jsonClause} extraction_status = EXCLUDED.extraction_status,
       ${errorsClause} last_error = EXCLUDED.last_error`,
    [
      p.programId,
      p.sourceUrl,
      p.contentHash,
      p.at,
      p.extractedJson ? JSON.stringify(p.extractedJson) : null,
      p.status,
      p.verifierErrors ?? [],
      p.lastError ? p.lastError.slice(0, 300) : null,
    ],
  );
}

export function createSmartGrantMonitor(
  db: Pool,
  options: SmartGrantMonitorOptions = {},
) {
  const profiles = options.profiles ?? PROGRAM_MONITOR_PROFILES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const concurrency = Math.max(1, Math.min(10, Math.floor(options.concurrency ?? 3)));
  const extractor: ProgramFactsExtractor | undefined =
    options.extractor === null
      ? undefined
      : (options.extractor ?? configuredGeminiExtractor(fetchImpl));

  async function persistUnmodified(
    client: PoolClient,
    profile: ProgramMonitorProfile,
    suspension: SuspensionCheck | null,
    at: Date,
  ): Promise<ProgramRunOutcome> {
    return withTransaction(client, async () => {
      let proposalsCreated = 0;
      const priorRes = await client.query<{ availability: MonitorAvailability | null }>(
        "SELECT availability FROM grant_source_checks WHERE program_id = $1",
        [profile.programId],
      );
      const oldAvailability = priorRes.rows[0]?.availability ?? null;

      if (suspension?.suspended) {
        const closedAvailability: MonitorAvailability = {
          ...(oldAvailability ?? {
            basis: profile.sourceType === "law_calendar" ? "calendar" : "announcement",
            deadlineAt: null,
            deadlinePrecision: "day",
            startsAt: null,
          }),
          state: "closed",
          checkedAt: at.toISOString(),
          validUntil: new Date(at.getTime() + VALID_UNTIL_MS).toISOString(),
          sourceUrl: suspension.sourceUrl,
          evidence: suspension.quote.slice(0, 300),
        };
        proposalsCreated += await applyAvailabilityChange(client, {
          autoPromote: profile.autoPromoteAvailability,
          programId: profile.programId,
          sourceUrl: profile.sourceUrl,
          oldAvailability,
          availability: closedAvailability,
          evidenceQuote: suspension.quote,
          confidence: "high",
          at,
        });
      } else if (profile.autoPromoteAvailability && oldAvailability) {
        await upsertSourceCheck(
          client,
          profile.programId,
          profile.sourceUrl,
          refreshExistingAvailability(oldAvailability, at),
          at,
        );
      }

      await client.query(
        "UPDATE grant_program_snapshots SET fetched_at = $2, last_error = NULL WHERE program_id = $1",
        [profile.programId, at],
      );
      return { status: "unmodified", proposalsCreated };
    });
  }

  async function persistVerified(
    client: PoolClient,
    profile: ProgramMonitorProfile,
    contentHash: string,
    facts: ExtractedProgramFacts,
    existing: SnapshotRow | undefined,
    suspension: SuspensionCheck | null,
    at: Date,
  ): Promise<number> {
    return withTransaction(client, async () => {
      const { availability, quote } = buildCleanAvailability(
        profile,
        facts,
        suspension,
        at,
      );
      await upsertSnapshot(client, {
        programId: profile.programId,
        sourceUrl: profile.sourceUrl,
        contentHash,
        at,
        status: "verified",
        extractedJson: facts,
        verifierErrors: [],
        lastError: null,
        updateHashAndChangedAt: true,
      });

      const priorRes = await client.query<{ availability: MonitorAvailability | null }>(
        "SELECT availability FROM grant_source_checks WHERE program_id = $1",
        [profile.programId],
      );
      let proposalsCreated = await applyAvailabilityChange(client, {
        autoPromote: profile.autoPromoteAvailability && facts.confidence === "high",
        programId: profile.programId,
        sourceUrl: profile.sourceUrl,
        oldAvailability: priorRes.rows[0]?.availability ?? null,
        availability,
        evidenceQuote: quote,
        confidence: facts.confidence,
        at,
      });

      const prev = existing?.last_extracted_json ?? null;
      const material: Array<[ProposalField, unknown, unknown, string | null]> = [
        ["amount", prev?.amount ?? null, facts.amount, facts.amountEvidenceQuote],
        ["eligibilityUkraine", prev?.eligibilitySummary ?? null, facts.eligibilitySummary, facts.eligibilityEvidenceQuote],
        ["applicationFormat", prev?.applicationFormat ?? null, facts.applicationFormat, facts.applicationFormatEvidenceQuote],
        ["requiredDocuments", prev?.requiredDocuments ?? null, facts.requiredDocuments, facts.documentsEvidenceQuote],
      ];
      for (const [fieldName, oldValue, newValue, fieldQuote] of material) {
        if (newValue === null || !fieldQuote) continue;
        if (oldValue != null && JSON.stringify(oldValue) === JSON.stringify(newValue)) {
          continue;
        }
        if (
          await insertPendingProposalIfNew(client, {
            programId: profile.programId,
            fieldName,
            oldValue,
            newValue,
            evidenceQuote: fieldQuote,
            confidence: facts.confidence,
            detectedAt: at,
          })
        ) {
          proposalsCreated += 1;
        }
      }
      return proposalsCreated;
    });
  }

  async function processProgram(profile: ProgramMonitorProfile): Promise<ProgramRunOutcome> {
    const client = await db.connect();
    let lockAcquired = false;
    try {
      const lock = await client.query(
        "SELECT pg_try_advisory_lock(hashtext('smart-monitor:' || $1)) AS acquired",
        [profile.programId],
      );
      if (!lock.rows[0]?.acquired) return { status: "skipped", proposalsCreated: 0 };
      lockAcquired = true;

      const at = now();
      const saveStatus = (
        status: "fetch_error" | "ai_disabled" | "llm_error" | "verifier_failed",
        contentHash: string,
        updateHashAndChangedAt: boolean,
        extra: { verifierErrors?: string[]; lastError?: string | null } = {},
      ) =>
        withTransaction(client, () =>
          upsertSnapshot(client, {
            programId: profile.programId,
            sourceUrl: profile.sourceUrl,
            contentHash,
            at,
            status,
            updateHashAndChangedAt,
            ...extra,
          }),
        );

      let rawBody: string;
      try {
        rawBody = await fetchSafePage(profile.sourceUrl, fetchImpl);
      } catch (err) {
        await saveStatus("fetch_error", EMPTY_SHA256, false, {
          lastError: err instanceof Error ? err.message : "fetch_failed",
        });
        return { status: "failed", proposalsCreated: 0 };
      }

      const normalizedText = normalizeSourceText(rawBody);
      const contentHash = computeContentHash(normalizedText);
      const existing = (
        await client.query<SnapshotRow>(
          "SELECT content_hash, extraction_status, last_extracted_json FROM grant_program_snapshots WHERE program_id = $1",
          [profile.programId],
        )
      ).rows[0];

      const isUnmodified =
        Boolean(existing) &&
        existing.content_hash.trim() === contentHash &&
        (existing.extraction_status === "verified" ||
          existing.extraction_status === "unmodified");

      let suspension: SuspensionCheck | null = null;
      if (profile.suspensionUrl && profile.suspensionPattern) {
        try {
          suspension = await checkSuspensionBanner(profile, normalizedText, fetchImpl);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "suspension_failed";
          if (isUnmodified) {
            await withTransaction(client, () =>
              client.query(
                "UPDATE grant_program_snapshots SET fetched_at = $2, last_error = $3 WHERE program_id = $1",
                [profile.programId, at, msg.slice(0, 300)],
              ),
            );
          } else {
            await saveStatus("fetch_error", EMPTY_SHA256, false, { lastError: msg });
          }
          return { status: "failed", proposalsCreated: 0 };
        }
      }

      if (isUnmodified) return persistUnmodified(client, profile, suspension, at);

      if (!extractor) {
        await saveStatus("ai_disabled", contentHash, true, {
          verifierErrors: [],
          lastError: null,
        });
        return { status: "ai_disabled", proposalsCreated: 0 };
      }

      let rawExtracted: unknown;
      try {
        rawExtracted = await extractor(profile, normalizedText, at);
      } catch (err) {
        await saveStatus("llm_error", contentHash, false, {
          lastError: err instanceof Error ? err.message : "llm_failed",
        });
        return { status: "failed", proposalsCreated: 0 };
      }

      const verification = verifyExtraction(rawExtracted, normalizedText, at);
      if (!verification.ok) {
        await saveStatus("verifier_failed", contentHash, true, {
          verifierErrors: verification.errors,
          lastError: null,
        });
        return { status: "verifier_failed", proposalsCreated: 0 };
      }

      const proposalsCreated = await persistVerified(
        client,
        profile,
        contentHash,
        verification.facts,
        existing,
        suspension,
        at,
      );
      return { status: "verified", proposalsCreated };
    } finally {
      if (lockAcquired) {
        await client
          .query("SELECT pg_advisory_unlock(hashtext('smart-monitor:' || $1))", [
            profile.programId,
          ])
          .catch(() => {});
      }
      client.release();
    }
  }

  async function runAll(filterProgramId?: string): Promise<SmartMonitorSummary> {
    const selected = filterProgramId
      ? profiles.filter((p) => p.programId === filterProgramId)
      : profiles;
    const summary: SmartMonitorSummary = {
      total: selected.length,
      unmodified: 0,
      verified: 0,
      verifierFailed: 0,
      aiDisabled: 0,
      failed: 0,
      skipped: 0,
      proposalsCreated: 0,
    };
    if (selected.length === 0) return summary;

    let nextIndex = 0;
    const workerCount = Math.min(concurrency, selected.length);
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= selected.length) return;
        const outcome = await processProgram(selected[index]);
        summary.proposalsCreated += outcome.proposalsCreated;
        if (outcome.status === "unmodified") summary.unmodified += 1;
        else if (outcome.status === "verified") summary.verified += 1;
        else if (outcome.status === "verifier_failed") summary.verifierFailed += 1;
        else if (outcome.status === "ai_disabled") summary.aiDisabled += 1;
        else if (outcome.status === "failed") summary.failed += 1;
        else if (outcome.status === "skipped") summary.skipped += 1;
      }
    };
    await Promise.all(Array.from({ length: workerCount }, worker));
    return summary;
  }

  return {
    runAll,
    runProgram: (programId: string) => runAll(programId),
  };
}
