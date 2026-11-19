import { applicationDefault } from "firebase-admin/app";
import { getAiConfig, resolveModelForRole, type AiModelRole } from "./aiConfig.js";

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiGenerateRequest {
  systemInstruction?: string;
  contents: GeminiContent[];
  tools?: GeminiFunctionDeclaration[];
  role?: AiModelRole;
  modelOverride?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface GeminiGenerateResponse {
  text?: string;
  functionCalls?: {
    name: string;
    args: Record<string, unknown>;
  }[];
  rawCandidate?: unknown;
  rawParts?: GeminiPart[];
}

export async function callGeminiGenerate(
  request: GeminiGenerateRequest,
  fetchImpl: typeof fetch = fetch,
  accessTokenProvider?: () => Promise<{ access_token: string }>
): Promise<GeminiGenerateResponse> {
  const config = getAiConfig();
  const model = request.modelOverride || resolveModelForRole(request.role || "chat");

  const apiKey = config.apiKey || (fetchImpl !== fetch ? "mock-api-key" : undefined);
  const vertexProject = config.vertexProject;

  if (!apiKey && !vertexProject) {
    throw new Error("No Gemini API key or Vertex AI project configured");
  }

  const url = vertexProject
    ? `https://aiplatform.eu.rep.googleapis.com/v1/projects/${vertexProject}/locations/eu/publishers/google/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: request.temperature ?? 0.45,
    maxOutputTokens: request.maxOutputTokens ?? (request.role === "pro" ? 4096 : 3072),
  };

  const isFlashModel = model.includes("2.5-flash") || model.includes("flash");
  if (isFlashModel) {
    generationConfig.thinkingConfig = {
      thinkingBudget: 2048,
    };
  }

  let payload: Record<string, unknown> = {
    contents: request.contents,
    generationConfig,
  };

  if (request.systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: request.systemInstruction }],
    };
  }

  if (request.tools && request.tools.length > 0) {
    payload.tools = [
      {
        functionDeclarations: request.tools,
      },
    ];
  }

  const headers = new Headers({ "content-type": "application/json" });
  if (vertexProject) {
    const getAccessToken = accessTokenProvider ?? (() => applicationDefault().getAccessToken());
    const token = await getAccessToken();
    headers.set("authorization", `Bearer ${token.access_token}`);
  } else {
    headers.set("x-goog-api-key", apiKey!);
  }

  let res: Response | null = null;
  let attempts = 0;

  while (attempts < 4) {
    attempts++;
    res = await fetchImpl(url, {
      method: "POST",
      headers: Object.fromEntries(headers),
      body: JSON.stringify(payload),
      signal: request.signal,
      redirect: "error",
    });

    if (res.status === 400 && generationConfig.thinkingConfig) {
      // Safe fallback: retry without thinkingConfig if the endpoint or model version does not support thinking
      const fallbackGenConfig = { ...generationConfig };
      delete fallbackGenConfig.thinkingConfig;
      payload = {
        ...payload,
        generationConfig: fallbackGenConfig,
      };
      continue;
    }

    if ((res.status === 503 || res.status === 429) && attempts < 4) {
      console.warn(`[AI] Upstream HTTP ${res.status} on model ${model}, retrying attempt ${attempts + 1}...`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempts));
      continue;
    }

    break;
  }

  if (!res || !res.ok) {
    const status = res ? res.status : "unknown";
    const text = res ? await res.text().catch(() => "") : "No response";
    const errorDetails = `Gemini upstream error HTTP ${status} [model: ${model}, url: ${url}]: ${text.slice(0, 1000)}`;
    console.error(`[AI] ${errorDetails}`);
    throw new Error(errorDetails);
  }

  const data = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: GeminiPart[];
      };
      finishReason?: string;
    }[];
  };

  const candidate = data.candidates?.[0];
  if (!candidate || !candidate.content?.parts) {
    return {};
  }

  const parts = candidate.content.parts;
  const textParts = parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text!)
    .join("");

  const functionCalls: { name: string; args: Record<string, unknown> }[] = [];
  for (const part of parts) {
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    }
  }

  return {
    text: textParts.trim() || undefined,
    functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    rawCandidate: candidate,
    rawParts: parts,
  };
}

export async function callGeminiEmbedding(
  text: string,
  fetchImpl: typeof fetch = fetch,
  accessTokenProvider?: () => Promise<{ access_token: string }>
): Promise<number[] | null> {
  const config = getAiConfig();
  if (!config.apiKey && !config.vertexProject) return null;

  const model = config.embeddingModel;
  const vertexProject = config.vertexProject;
  const apiKey = config.apiKey;

  const url = vertexProject
    ? `https://aiplatform.eu.rep.googleapis.com/v1/projects/${vertexProject}/locations/eu/publishers/google/models/${model}:predict`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;

  const payload = vertexProject
    ? {
        instances: [{ content: text.slice(0, 4000) }],
      }
    : {
        model: `models/${model}`,
        content: {
          parts: [{ text: text.slice(0, 4000) }],
        },
      };

  try {
    const headers = new Headers({ "content-type": "application/json" });
    if (vertexProject) {
      const getAccessToken = accessTokenProvider ?? (() => applicationDefault().getAccessToken());
      const token = await getAccessToken();
      headers.set("authorization", `Bearer ${token.access_token}`);
    } else {
      headers.set("x-goog-api-key", apiKey!);
    }

    const res = await fetchImpl(url, {
      method: "POST",
      headers: Object.fromEntries(headers),
      body: JSON.stringify(payload),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.embedding?.values && Array.isArray(data.embedding.values)) {
      return data.embedding.values;
    }
    if (data.predictions?.[0]?.embeddings?.values && Array.isArray(data.predictions[0].embeddings.values)) {
      return data.predictions[0].embeddings.values;
    }
    return null;
  } catch {
    return null;
  }
}
