import { applicationDefault } from "firebase-admin/app";
import { getAiConfig, geminiEndpoint } from "./aiConfig.js";
import type { AgentProvider, AgentPart } from "./agentOrchestrator.js";

/** One bounded REST request; orchestration, timeout and tool execution stay server-side. */
export function configuredGeminiAgentProvider(fetchImpl: typeof fetch = fetch, tokenProvider?: () => Promise<{access_token:string}>): AgentProvider | undefined {
  const project = process.env.GEMINI_VERTEX_PROJECT?.trim(), key = process.env.GEMINI_API_KEY?.trim();
  if (!project && !key) return undefined;
  let url: string;
  try { url = geminiEndpoint(getAiConfig().chat, project); } catch { return undefined; }
  // IDs in function responses are supported by Vertex's v1beta1 API.
  if (project) url = url.replace("/v1/projects/", "/v1beta1/projects/");
  const getToken = project ? tokenProvider ?? (() => applicationDefault().getAccessToken()) : undefined;
  return async ({system, contents, tools, signal}) => {
    const headers: Record<string,string> = {"content-type":"application/json"};
    if (getToken) headers.authorization = `Bearer ${(await getToken()).access_token}`; else headers["x-goog-api-key"] = key!;
    const body=JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools,generationConfig:{maxOutputTokens:8192}});
    if (Buffer.byteLength(body,"utf8") > 131072) throw Error("request_too_large");
    const response = await fetchImpl(url, {method:"POST",headers,signal,redirect:"error",body});
    if (!response.ok || !response.body) throw Error("provider_error");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
    try { while (true) { const {done,value} = await reader.read(); if (done) break; total += value.byteLength; if (total > 131072) { await reader.cancel(); throw Error("provider_too_large"); } chunks.push(value); } } finally { reader.releaseLock(); }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const candidate = payload.candidates?.[0];
    if (payload.promptFeedback?.blockReason || candidate?.finishReason !== "STOP" || !Array.isArray(candidate?.content?.parts)) throw Error("provider_error");
    return {parts:candidate.content.parts as AgentPart[]};
  };
}
