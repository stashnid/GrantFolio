import { z } from "zod";

export type AgentPart = { text?: string; thoughtSignature?: string; functionCall?: { name: string; args?: unknown; id?: string }; functionResponse?: { name: string; response: Record<string, unknown>; id?: string }; [key: string]: unknown };
export type AgentContent = { role: "user" | "model"; parts: AgentPart[] };
export type AgentProvider = (input: { system: string; contents: AgentContent[]; tools: unknown[]; signal: AbortSignal }) => Promise<{ parts: AgentPart[] }>;
const searchArgs = z.object({ semanticQuery: z.string().trim().min(1).max(2000), keywords: z.array(z.string().trim().min(1).max(100)).max(20), applicantTraits: z.array(z.string().max(100)).max(20).optional(), maxAmountUah: z.number().nonnegative().max(1_000_000_000).optional(), limit: z.number().int().min(1).max(20) }).strict();
const programArgs = z.object({ programId: z.string().min(1).max(120) }).strict();
const emptyArgs = z.object({}).strict();
const proposalArgs = z.object({ kind: z.enum(["text_application_fields", "profile_fields", "financial_assumptions"]), changes: z.unknown() }).strict();
export type AgentSearchArgs = z.infer<typeof searchArgs>;
export type AgentScope = { ownerId: string; caseId?: string; expectedRevision?: number; expectedProfileRevision?: number };
export type AgentDependencies = { provider: AgentProvider; searchGrants: (args: AgentSearchArgs, context: AgentScope & {signal: AbortSignal}) => Promise<unknown>; getPlaybook: (programId: string, scope: AgentScope) => Promise<unknown>; getProjectState: (scope: AgentScope) => Promise<unknown>; validateFinancials: (scope: AgentScope) => Promise<unknown>; proposeUpdate: (args: z.infer<typeof proposalArgs>, scope: AgentScope) => Promise<unknown> };
const declaration = (name: string, description: string, properties: object, required: string[] = []) => ({ name, description, parameters: { type: "OBJECT", properties, required } });
export const AGENT_TOOLS = [{ functionDeclarations: [
  declaration("search_grants", "Search grant programs", { semanticQuery: {type:"STRING"}, keywords:{type:"ARRAY",items:{type:"STRING"}}, applicantTraits:{type:"ARRAY",items:{type:"STRING"}}, maxAmountUah:{type:"NUMBER"}, limit:{type:"INTEGER"} }, ["semanticQuery","keywords","limit"]),
  declaration("get_program_playbook", "Read grounded program coverage", {programId:{type:"STRING"}}, ["programId"]),
  declaration("get_project_state", "Read the current owned project", {}),
  declaration("validate_project_financials", "Validate saved project figures", {}),
  declaration("propose_structured_update", "Create a proposal for explicit confirmation", {kind:{type:"STRING",enum:["text_application_fields","profile_fields","financial_assumptions"]},changes:{type:"OBJECT"}}, ["kind","changes"]),
] }];
export function createAgentOrchestrator(deps: AgentDependencies) {
  return async (input: {scope:AgentScope; system:string; history:AgentContent[]; message:string; onProgress?:(event:{type:"tool_start"|"tool_end"|"thinking";tool?:string})=>void}, signal:AbortSignal) => {
    const contents: AgentContent[] = [...input.history.slice(-20), {role:"user",parts:[{text:input.message}]}];
    const attached_grants: unknown[] = [], pending_proposals: unknown[] = [];
    let searched = false, weak = false, searchCalls = 0;
    for (let round = 0; round < 4; round++) {
      if (signal.aborted) throw Error("aborted");
      input.onProgress?.({type:"thinking"});
      const result = await deps.provider({system:input.system,contents,tools:AGENT_TOOLS,signal});
      if (!Array.isArray(result.parts) || !result.parts.length || result.parts.length > 16) throw Error("invalid_provider_response");
      contents.push({role:"model",parts:result.parts});
      const calls = result.parts.filter(p => p.functionCall);
      if (!calls.length) {
        if (!searched || (weak && searchCalls < 2)) {
          if (round === 3) throw Error("search_required");
          contents.push({role:"user",parts:[{text: !searched ? "Спочатку виклич search_grants для цього запиту." : "Пошук слабкий або порожній. Повтори search_grants із суміжними термінами."}]});
          continue;
        }
        const reply = result.parts.filter(p => typeof p.text === "string" && p.thought !== true).map(p => p.text).join("").trim();
        if (!reply || reply.length > 12000) throw Error("invalid_provider_response");
        return { reply, reply_text:reply, attached_grants, pending_proposals };
      }
      const responses: AgentPart[] = [];
      for (const part of calls) {
        const call = part.functionCall!; let value: unknown;
        input.onProgress?.({type:"tool_start",tool:call.name});
        if (call.name === "search_grants") {
          if (++searchCalls > 3) throw Error("search_limit");
          value = await deps.searchGrants(searchArgs.parse(call.args ?? {}), {...input.scope,signal});
          const obj = value as {matches?: unknown[]; results?: unknown[]; weak?: boolean};
          const found = Array.isArray(obj?.matches) ? obj.matches : Array.isArray(obj?.results) ? obj.results : [];
          weak = obj?.weak === true || !found.length; searched = true; attached_grants.push(...found.slice(0,20));
        } else if (call.name === "get_program_playbook") value = await deps.getPlaybook(programArgs.parse(call.args ?? {}).programId,input.scope);
        else if (call.name === "get_project_state") { emptyArgs.parse(call.args ?? {}); value = await deps.getProjectState(input.scope); }
        else if (call.name === "validate_project_financials") { emptyArgs.parse(call.args ?? {}); value = await deps.validateFinancials(input.scope); }
        else if (call.name === "propose_structured_update") { value = await deps.proposeUpdate(proposalArgs.parse(call.args ?? {}),input.scope); pending_proposals.push(value); }
        else throw Error("unknown_tool");
        input.onProgress?.({type:"tool_end",tool:call.name});
        const json = JSON.stringify(value ?? null); if (json.length > 100_000) throw Error("tool_result_too_large");
        responses.push({functionResponse:{name:call.name,...(call.id ? {id:call.id}:{}),response:{result:JSON.parse(json)}}});
      }
      contents.push({role:"user",parts:responses});
    }
    throw Error("agent_round_limit");
  };
}
