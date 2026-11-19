import { hasSpecialistWeaponRequest } from "./agentSafety.js";
import type { Pool } from "pg";
import { getProgramPlaybook } from "../playbooks/index.js";
import { buildAssistantSystemPrompt } from "./prompts/assistantSystemPrompt.js";
import { getAiConfig } from "./aiConfig.js";
import { configuredGeminiAgentProvider } from "./geminiAgentProvider.js";
import { createAgentOrchestrator, type AgentSearchArgs, type AgentScope, type AgentContent } from "./agentOrchestrator.js";
import { createAgentProposal } from "./agentProposals.js";

export type NativeAgent = (input: {scope:AgentScope; message:string; history:AgentContent[]; snapshot?:unknown; onProgress?:(event:{type:"tool_start"|"tool_end"|"thinking";tool?:string})=>void}, signal:AbortSignal) => Promise<{reply:string;reply_text:string;attached_grants:unknown[];pending_proposals:unknown[]}>;
export function configuredAgentRuntime(db:Pool, searchGrants:(args:AgentSearchArgs, context:AgentScope & {signal:AbortSignal})=>Promise<unknown>):NativeAgent | undefined {
 const provider=configuredGeminiAgentProvider(); if(!provider) return undefined;
 const run=createAgentOrchestrator({provider,searchGrants,getPlaybook:async(id)=>getProgramPlaybook(id)??{error:"playbook_unavailable"},getProjectState:async(scope)=>{
   if(!scope.caseId)return {error:"project_required"};
   const r=await db.query("SELECT title,program_id,revision,details,items,total_kopecks FROM cases WHERE id=$1 AND owner_id=$2",[scope.caseId,scope.ownerId]);
   return r.rows[0]??{error:"not_found"};
 },validateFinancials:async()=>({status:"unavailable",message:"Детермінована перевірка фінансових припущень ще не підключена."}),proposeUpdate:(args,scope)=>createAgentProposal(db,args,scope)});
 return async (input,signal)=>{
   if(hasSpecialistWeaponRequest({message:input.message,history:input.history,snapshot:input.snapshot})) throw Error("unsafe_request");
   const result=await run({scope:input.scope,message:input.message,history:input.history,onProgress:input.onProgress,system:buildAssistantSystemPrompt({mode:input.scope.caseId?"project":"discovery",activeProject:input.snapshot,toolsAvailable:true,override:getAiConfig().promptOverride})},signal);
   if(hasSpecialistWeaponRequest(result.reply)) throw Error("unsafe_response");
   return result;
 };
}
