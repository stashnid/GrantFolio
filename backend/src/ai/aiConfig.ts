export type AiRole = "chat" | "pro" | "utility" | "embedding";
export type AiConfig = { chat: string; pro: string; utility: string; embedding: string; promptOverride?: string };
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
function model(value: string | undefined, fallback: string, role: AiRole): string {
  const id = value?.trim() || fallback;
  if (!MODEL_ID.test(id) || ((role === "chat" || role === "pro") && /(?:^|[-_.])lite(?:$|[-_.])/i.test(id))) throw new Error(`invalid_${role}_model`);
  return id;
}
/** Legacy GEMINI_MODEL is deliberately confined to utility; it cannot downgrade chat. */
export function getAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const chat = model(env.GEMINI_CHAT_MODEL, "gemini-3.5-flash", "chat");
  return {
    chat,
    pro: model(env.GEMINI_PRO_MODEL, chat, "pro"),
    utility: model(env.GEMINI_UTILITY_MODEL || env.GEMINI_MODEL, "gemini-3.5-flash-lite", "utility"),
    embedding: model(env.GEMINI_EMBEDDING_MODEL, "gemini-embedding-001", "embedding"),
    promptOverride: env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE?.trim() || undefined,
  };
}
export function modelForRole(role: AiRole, env: NodeJS.ProcessEnv = process.env): string { return getAiConfig(env)[role]; }
/** Endpoint contains no credential; caller must add API-key or Vertex bearer header. */
export function geminiEndpoint(modelId: string, vertexProject?: string): string {
  const id = model(modelId, "", "utility");
  if (vertexProject && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(vertexProject)) throw new Error("invalid_vertex_project");
  return vertexProject
    ? `https://aiplatform.eu.rep.googleapis.com/v1/projects/${vertexProject}/locations/eu/publishers/google/models/${id}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`;
}
