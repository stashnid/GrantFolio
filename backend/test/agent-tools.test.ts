import test from "node:test";
import assert from "node:assert/strict";
import { createAgentOrchestrator, type AgentContent } from "../src/ai/agentOrchestrator.js";
import { FinancialAssumptionsSchema } from "../src/finance/assumptions.js";
import { AgentProposalSchema } from "../src/ai/agentProposals.js";

const emptyMonth = {salesKopecks:null,additionalIncomeKopecks:null,grantKopecks:null,ownKopecks:null,operatingCostsKopecks:null,capitalCostsKopecks:null,taxableRevenueKopecks:null,paidTaxKopecks:null,eligiblePaidTaxKopecks:null,eligibleTaxBasis:null,staff:[],overrides:{}};
const finance = {schemaVersion:1,startMonth:"2026-11",horizonMonths:24,openingBalanceKopecks:0,tax:{profile:null,vat:null,localSingleTaxKopecks:null,selfEsv:"unknown",exemptionReason:null,futureRates:null},months:Array.from({length:24},()=>({...emptyMonth}))};
test("financial proposal distinguishes unknown and zero, validates horizon and qualified tax",()=>{
 assert(FinancialAssumptionsSchema.safeParse(finance).success);
 assert(!FinancialAssumptionsSchema.safeParse({...finance,months:[]}).success);
 assert(!FinancialAssumptionsSchema.safeParse({...finance,months:[{...emptyMonth,paidTaxKopecks:1,eligiblePaidTaxKopecks:2,eligibleTaxBasis:"x"},...finance.months.slice(1)]}).success);
 assert(!FinancialAssumptionsSchema.safeParse({...finance,months:[{...emptyMonth,paidTaxKopecks:1,eligiblePaidTaxKopecks:1},...finance.months.slice(1)]}).success);
 assert(!AgentProposalSchema.safeParse({kind:"profile_fields",changes:{phone:"secret"}}).success);
 assert(!AgentProposalSchema.safeParse({kind:"text_application_fields",changes:{arbitrary:"bad"}}).success);
});
test("agent retries weak search and preserves call parts, signatures and response IDs",async()=>{
 let round=0; const seen:AgentContent[][]=[];
 const run=createAgentOrchestrator({provider:async({contents})=>{seen.push(structuredClone(contents)); round++; return round===1?{parts:[{thoughtSignature:"sig",functionCall:{name:"search_grants",id:"a",args:{semanticQuery:"x",keywords:[],limit:3}}}]}:round===2?{parts:[{functionCall:{name:"search_grants",id:"b",args:{semanticQuery:"y",keywords:[],limit:3}}}]}:{parts:[{text:"готово"}]}},searchGrants:async(args)=>({matches:args.semanticQuery==="x"?[]:[{id:"test"}],weak:args.semanticQuery==="x"}),getPlaybook:async()=>null,getProjectState:async()=>null,validateFinancials:async()=>null,proposeUpdate:async()=>null});
 const result=await run({scope:{ownerId:"owner"},system:"test",history:[],message:"потреба"},new AbortController().signal);
 assert.equal(result.reply,"готово"); assert.equal(seen[1][1].parts[0].thoughtSignature,"sig"); assert.equal(seen[1][2].parts[0].functionResponse?.id,"a"); assert.equal(result.attached_grants.length,1);
});
test("agent refuses unsupported tools and ungrounded final text",async()=>{
 const common={searchGrants:async()=>({matches:[]}),getPlaybook:async()=>null,getProjectState:async()=>null,validateFinancials:async()=>null,proposeUpdate:async()=>null};
 const run=createAgentOrchestrator({...common,provider:async()=>({parts:[{text:"без пошуку"}]})});
 await assert.rejects(run({scope:{ownerId:"x"},system:"",history:[],message:"x"},new AbortController().signal),/search_required/);
 const bad=createAgentOrchestrator({...common,provider:async()=>({parts:[{functionCall:{name:"write_sql",args:{}}}]})});
 await assert.rejects(bad({scope:{ownerId:"x"},system:"",history:[],message:"x"},new AbortController().signal),/unknown_tool/);
});

test("safety guard distinguishes neutral funding lookup from specialist request in history", async () => {
 const {hasSpecialistWeaponRequest}=await import("../src/ai/agentSafety.js");
 assert.equal(hasSpecialistWeaponRequest({message:"Brave1 фінансування ППО"}),false);
 assert.equal(hasSpecialistWeaponRequest({history:["як виготовити ракету"],message:"грант"}),true);
 assert.equal(hasSpecialistWeaponRequest({history:["Підготуй бізнес-план і кошторис для приватного ППО"],message:"грант"}),true);
 assert.equal(hasSpecialistWeaponRequest({message:"Що таке Brave1 і чи є грант для оборонних інновацій?"}),false);
});

test("proposal apply enforces owner, payment, revisions and idempotent replay", async () => {
 const express=(await import("express")).default; const {agentProposalsRouter}=await import("../src/ai/agentProposals.js");
 const proposalId=crypto.randomUUID(), caseId=crypto.randomUUID(), key=crypto.randomUUID();
 let proposal:any={id:proposalId,owner_id:"owner",case_id:caseId,kind:"text_application_fields",changes:{customers:"Клієнти"},case_revision:3,profile_revision:2,status:"pending"}; let paid=false; let revision=3, updates=0;
 const client={release(){},async query(sql:string,args:any[]=[]):Promise<any>{
  if (["BEGIN","COMMIT","ROLLBACK"].includes(sql)) return {rows:[],rowCount:0};
  if(sql.includes("FROM agent_proposals")) return {rowCount:args[1]===proposal.owner_id?1:0,rows:args[1]===proposal.owner_id?[proposal]:[]};
  if(sql.includes("FROM cases c")) return {rowCount:1,rows:[{id:caseId,revision,paid,details:{}}]};
  if(sql.includes("SELECT details,revision FROM profiles")) return {rowCount:1,rows:[{revision:2,details:{}}]};
  if(sql.startsWith("UPDATE cases SET")) {updates++;return {rowCount:1,rows:[{revision:++revision}]};}
  if(sql.startsWith("UPDATE agent_proposals SET")) {proposal={...proposal,status:"applied",applied_key:args[1],applied_request:JSON.parse(args[2]),applied_result:JSON.parse(args[3])};return {rowCount:1,rows:[]};}
  throw Error(sql);
 }};
 const app=express(); app.use(express.json()); app.use((req,res,next)=>{res.locals.uid=req.header("x-owner");next()}); app.use(agentProposalsRouter({connect:async()=>client} as never));
 const server=app.listen(0,"127.0.0.1"); await new Promise<void>(r=>server.once("listening",r));
 try { const a=server.address(); if(!a||typeof a==="string") throw Error(); const send=(owner:string,data:any)=>fetch(`http://127.0.0.1:${a.port}/${proposalId}/apply`,{method:"POST",headers:{"content-type":"application/json","x-owner":owner},body:JSON.stringify(data)});
  const body={expectedRevision:3,idempotencyKey:key};
  assert.equal((await send("other",body)).status,404); assert.equal((await send("owner",body)).status,402);
  paid=true; assert.equal((await send("owner",{...body,expectedRevision:2})).status,409);
  assert.equal((await send("owner",body)).status,200); assert.equal((await send("owner",body)).status,200); assert.equal(updates,1);
  assert.equal((await send("owner",{...body,idempotencyKey:crypto.randomUUID()})).status,409);
 } finally { server.close(); }
});

test("neutral Brave1 turn rejects specialist tool proposals without any database write", async () => {
 const {configuredAgentRuntime}=await import("../src/ai/agentRuntime.js"); let calls=0, writes=0; let last:any;
 const provider=async(input:any)=>{calls++;last=structuredClone(input.contents); if(calls===1)return {parts:[{functionCall:{name:"search_grants",args:{semanticQuery:"Brave1",keywords:[],limit:3}}}]}; if(calls===2)return {parts:[{functionCall:{name:"propose_structured_update",args:{kind:"text_application_fields",changes:{projectDescription:"кошторис ППО"}}}}]}; return {parts:[{text:"Перегляньте офіційну сторінку Brave1."}]};};
 const runtime=configuredAgentRuntime({query:async()=>{writes++;throw Error("unexpected write")}} as never,async()=>({matches:[{id:"brave"}],weak:false}),provider)!;
 const result=await runtime({scope:{ownerId:"owner",caseId:crypto.randomUUID(),expectedRevision:1,expectedProfileRevision:0},message:"Що таке Brave1?",history:[]},new AbortController().signal);
 assert.equal(result.pending_proposals.length,0); assert.equal(writes,0);
 assert.equal(last.at(-1).parts[0].functionResponse.response.result.error,"directory_only");
});

test("discovery proposal returns a recoverable project-required response without writes", async () => {
 const {configuredAgentRuntime}=await import("../src/ai/agentRuntime.js"); let calls=0,writes=0,last:any;
 const provider=async(input:any)=>{calls++;last=structuredClone(input.contents);if(calls===1)return {parts:[{functionCall:{name:"search_grants",args:{semanticQuery:"кавярня",keywords:[],limit:3}}}]};if(calls===2)return {parts:[{functionCall:{name:"propose_structured_update",args:{kind:"text_application_fields",changes:{customers:"Клієнти"}}}}]};return {parts:[{text:"Створіть проєкт, щоб зберегти чернетку."}]};};
 const runtime=configuredAgentRuntime({query:async()=>{writes++;throw Error("unexpected")}} as never,async()=>({matches:[{id:"a"}],weak:false}),provider)!;
 const result=await runtime({scope:{ownerId:"owner"},message:"кавярня",history:[]},new AbortController().signal);
 assert.equal(writes,0);assert.deepEqual(result.pending_proposals,[]);assert.equal(last.at(-1).parts[0].functionResponse.response.result.error,"project_required");
});
