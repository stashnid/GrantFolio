import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogSearchKnowledge, cosineSimilarity, hybridSearch } from "../src/matching/hybridSearch.js";
import { configuredEmbedder } from "../src/matching/embeddings.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";
const program = GRANT_CATALOG.find(p=>p.id==="agro-gardens")!;
test("hybrid search keeps a direct paused program and reports actual support",async()=>{
 const result=await hybridSearch("agro-gardens",{embedder:null});
 assert.equal(result.matches[0].programId,"agro-gardens");
 assert.equal(result.matches[0].matchKind,"direct");
 assert.notEqual(result.matches[0].intake,"open");
 assert.equal(result.retrieval,"lexical");
});
test("semantic retrieval uses finite matching-model current vectors and prescribed weights",async()=>{
 const db={query:async()=>({rows:[{program_id:program.id,embedding_vector:[1,0],embedding_hash:catalogSearchKnowledge(program).hash,embedding_model:"mock"}]})};
 let calls=0;
 const result=await hybridSearch("orchard investment",{programs:[program],db:db as never,embedder:{model:"mock",embed:async()=>{calls++;return [1,0];}}});
 assert.equal(calls,1);assert.equal(result.retrieval,"hybrid");assert.equal(result.matches[0].programId,program.id);assert.ok(result.matches[0].score>=60);
 assert.equal(cosineSimilarity([1,0],[1,0]),1);assert.equal(cosineSimilarity([1],[1,2]),0);assert.equal(cosineSimilarity([0],[1]),0);
});
test("stale vectors are never queried and provider errors explicitly fall back",async()=>{
 let calls=0;
 const stale={query:async()=>({rows:[{program_id:program.id,embedding_vector:[1,0],embedding_hash:"stale"}]})};
 const embedder={model:"mock",embed:async()=>{calls++;throw Error("offline");}};
 const staleResult=await hybridSearch("ягідник",{db:stale as never,embedder});
 assert.equal(calls,0);assert.equal(staleResult.retrieval,"lexical");
 const current={query:async()=>({rows:[{program_id:program.id,embedding_vector:[1,0],embedding_hash:catalogSearchKnowledge(program).hash}]})};
 const fallback=await hybridSearch("ягідник",{db:current as never,embedder});
 assert.equal(calls,1);assert.equal(fallback.retrieval,"lexical");assert.ok(fallback.matches.some(p=>p.programId===program.id));
});
test("offline matching preserves personal/study/future-reimbursement exclusions",async()=>{
 assert.equal((await hybridSearch("Особисте авто для себе",{embedder:null})).matches.length,0);
 assert.equal((await hybridSearch("стипендія для навчання",{embedder:null})).matches.length,0);
 assert.ok(!(await hybridSearch("Ветеран планую купити обладнання",{embedder:null})).matches.some(m=>m.programId==="uvf-reimbursement"));
});
test("embedding direct adapter validates request/response without a live call",async()=>{
 const saved={enabled:process.env.GEMINI_EMBEDDINGS_ENABLED,key:process.env.GEMINI_API_KEY,project:process.env.GEMINI_VERTEX_PROJECT};
 try{
 process.env.GEMINI_EMBEDDINGS_ENABLED="false";assert.equal(configuredEmbedder(),undefined);
 process.env.GEMINI_EMBEDDINGS_ENABLED="true";process.env.GEMINI_API_KEY="mock";delete process.env.GEMINI_VERTEX_PROJECT;
 const embedder=configuredEmbedder(async(url,init)=>{assert.match(String(url),/:embedContent$/);const body=JSON.parse(String(init?.body));assert.equal(body.taskType,"RETRIEVAL_QUERY");assert.equal(new Headers(init?.headers).get("x-goog-api-key"),"mock");return Response.json({embedding:{values:[1,0]}});});
 assert.deepEqual(await embedder!.embed("ягідник","RETRIEVAL_QUERY"),[1,0]);
 }finally{for(const[key,value]of Object.entries({GEMINI_EMBEDDINGS_ENABLED:saved.enabled,GEMINI_API_KEY:saved.key,GEMINI_VERTEX_PROJECT:saved.project})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test("catalog embedding synchronization is resumable and handles entries without a playbook", {skip:!process.env.TEST_DATABASE_URL}, async()=>{
 const pg=await import("pg");const{readFile}=await import("node:fs/promises");const{syncCatalogEmbeddings}=await import("../src/matching/syncEmbeddings.js");
 const pool=new pg.default.Pool({connectionString:process.env.TEST_DATABASE_URL});const client=await pool.connect();
 try{
 await client.query("BEGIN");const ns=`embedding_${crypto.randomUUID().replaceAll("-","")}`;await client.query(`CREATE SCHEMA "${ns}"`);await client.query(`SET LOCAL search_path TO "${ns}"`);
 for(const file of["026_grant_program_knowledge.sql","028_catalog_embedding_cache.sql"])await client.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),"utf8"));
 const selected=GRANT_CATALOG.filter(p=>["agro-gardens","processing-business"].includes(p.id));let calls=0;const embedder={model:"mock",embed:async()=>{calls++;return [1,0];}};
 assert.deepEqual(await syncCatalogEmbeddings(client as never,embedder,selected),{updated:2,unchanged:0});
 assert.deepEqual(await syncCatalogEmbeddings(client as never,embedder,selected),{updated:0,unchanged:2});assert.equal(calls,2);
 const result=await hybridSearch("агро",{db:client as never,programs:selected,embedder});assert.equal(result.retrieval,"hybrid");
 }finally{await client.query("ROLLBACK");client.release();await pool.end();}
});
