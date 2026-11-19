import { applicationDefault } from "firebase-admin/app";
import { getAiConfig } from "../ai/aiConfig.js";

export type Embedder = { model: string; embed(text: string, task: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT", signal?: AbortSignal): Promise<number[]> };
export function validVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 3072 && value.every(v => typeof v === "number" && Number.isFinite(v)) && value.some(v => v !== 0);
}
/** Explicit opt-in: catalog browsing never silently starts a new paid embedding workload. */
export function configuredEmbedder(fetchImpl: typeof fetch = fetch, tokenProvider = () => applicationDefault().getAccessToken()): Embedder | undefined {
  if (process.env.GEMINI_EMBEDDINGS_ENABLED !== "true") return undefined;
  const project = process.env.GEMINI_VERTEX_PROJECT?.trim();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!project && !key) return undefined;
  if (project && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) return undefined;
  let model: string;
  try { model = getAiConfig().embedding; } catch { return undefined; }
  // Embedding 001 does not support the EU multi-region. Keep this workload in europe-west4.
  const url = project
    ? `https://europe-west4-aiplatform.googleapis.com/v1/projects/${project}/locations/europe-west4/publishers/google/models/${model}:predict`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
  return { model, async embed(text, task, signal) {
    const headers = new Headers({ "content-type": "application/json" });
    if (project) headers.set("authorization", `Bearer ${(await tokenProvider()).access_token}`);
    else headers.set("x-goog-api-key", key!);
    const boundedSignal = AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]);
    const response = await fetchImpl(url, { method: "POST", headers, signal: boundedSignal, redirect: "error",
      body: JSON.stringify(project
        ? { instances: [{ task_type: task, content: text.slice(0, 12000) }], parameters: { outputDimensionality: 768, autoTruncate: false } }
        : { model: `models/${model}`, content: { parts: [{ text: text.slice(0, 12000) }] }, taskType: task, outputDimensionality: 768 }) });
    if (!response.ok) throw new Error("embedding_unavailable");
    const body = await response.text();
    if (body.length > 100_000) throw new Error("embedding_invalid");
    const data = JSON.parse(body);
    const vector = project ? data.predictions?.[0]?.embeddings?.values : data.embedding?.values;
    if (!validVector(vector)) throw new Error("embedding_invalid");
    return vector;
  }};
}
