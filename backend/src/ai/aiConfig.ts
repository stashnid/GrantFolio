export interface AiConfig {
  apiKey?: string;
  vertexProject?: string;
  chatModel: string;
  proModel: string;
  utilityModel: string;
  embeddingModel: string;
  systemPromptOverride?: string;
}

export type AiModelRole = "chat" | "pro" | "utility" | "embedding";

const VALID_MODEL_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function getAiConfig(): AiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const vertexProject = process.env.GEMINI_VERTEX_PROJECT?.trim() || undefined;

  const rawChatModel = process.env.GEMINI_CHAT_MODEL?.trim();
  const rawProModel = process.env.GEMINI_PRO_MODEL?.trim();
  const rawUtilityModel = process.env.GEMINI_UTILITY_MODEL?.trim() || process.env.GEMINI_MODEL?.trim();
  const rawEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  const systemPromptOverride = process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE?.trim() || undefined;

  const chatModel = rawChatModel && VALID_MODEL_NAME_REGEX.test(rawChatModel)
    ? rawChatModel
    : "gemini-2.5-flash";

  const proModel = rawProModel && VALID_MODEL_NAME_REGEX.test(rawProModel)
    ? rawProModel
    : (chatModel || "gemini-2.5-pro");

  const utilityModel = rawUtilityModel && VALID_MODEL_NAME_REGEX.test(rawUtilityModel)
    ? rawUtilityModel
    : "gemini-3.5-flash-lite";

  const embeddingModel = rawEmbeddingModel && VALID_MODEL_NAME_REGEX.test(rawEmbeddingModel)
    ? rawEmbeddingModel
    : "text-embedding-004";

  return {
    apiKey,
    vertexProject,
    chatModel,
    proModel,
    utilityModel,
    embeddingModel,
    systemPromptOverride,
  };
}

export function isAiConfigured(): boolean {
  const config = getAiConfig();
  if (config.apiKey) return true;
  if (config.vertexProject && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.vertexProject)) {
    return true;
  }
  return false;
}

export function resolveModelForRole(role: AiModelRole): string {
  const config = getAiConfig();
  switch (role) {
    case "chat":
      return config.chatModel;
    case "pro":
      return config.proModel;
    case "utility":
      return config.utilityModel;
    case "embedding":
      return config.embeddingModel;
    default:
      return config.chatModel;
  }
}
