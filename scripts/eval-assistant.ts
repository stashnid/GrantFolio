import pg from "pg";
import { configuredAgentRuntime } from "../backend/src/ai/agentRuntime.js";
import { hybridSearch } from "../backend/src/matching/hybridSearch.js";
// Separate from CI: no provider is contacted unless the operator explicitly opts in.
if (process.env.LIVE_ASSISTANT_EVAL !== "true") throw Error("Set LIVE_ASSISTANT_EVAL=true only after authorizing billable model calls. CI uses mocked agent tests.");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const agent=configuredAgentRuntime(db,(args,scope)=>hybridSearch([args.semanticQuery,...args.keywords,...(args.applicantTraits??[])].join(" "),{db,signal:scope.signal,limit:args.limit}));
if (!agent) {await db.end();throw Error("assistant_unavailable");}
const cases=process.argv.includes("--directory")?["Дай лише офіційне посилання і поточний статус каталожного запису Brave1. Без підготовки заявки чи технічних порад."]:[
 "Я студент, хочу відкрити кав’ярню. З чого почати?",
 "Хочу купити комерційне авто для доставки хліба. Які напрями перевірити?",
 "Покажи agro-gardens, навіть якщо прийом призупинено.",
 "Чи існує окрема чинна ветеранська програма? Відокрем поточні умови від історичних.",
 "Я ще не назвав місто, виручку або ціни. Не вигадуй їх: допоможи почати опис швейної майстерні.",
];
try{for(const question of cases){const started=Date.now();try{const result=await agent({scope:{ownerId:"synthetic-live-evaluation"},message:question,history:[]},AbortSignal.timeout(60000));console.log(JSON.stringify({question,ms:Date.now()-started,reply:result.reply_text,attachedGrantIds:result.attached_grants.map((g)=>typeof g==="object"&&g!==null?(g as {programId?:string}).programId:undefined),proposalCount:result.pending_proposals.length}));}catch(e){console.log(JSON.stringify({question,error:e instanceof Error?e.message:"failed"}));process.exitCode=1;}}}finally{await db.end();}
