import test from "node:test";
import assert from "node:assert/strict";
import { consumeAgentStream } from "../../frontend/src/agent-progress.js";
test("progress stream handles split UTF8 frames and retains JSON contract",async()=>{
 const encoder=new TextEncoder();const wire=encoder.encode('event: progress\ndata: {"type":"tool_start","tool":"search_grants"}\n\nevent: final\ndata: {"message":{"reply":"Знайдено сад"}}\n\n');
 const stream=new ReadableStream({start(c){for(let i=0;i<wire.length;i+=7)c.enqueue(wire.slice(i,i+7));c.close();}});const events:unknown[]=[];
 const response=await consumeAgentStream(new Response(stream,{headers:{"content-type":"text/event-stream"}}),event=>events.push(event));assert.equal(events.length,1);assert.equal((await response.json()).message.reply,"Знайдено сад");
});
test("progress failure is an HTTP error and missing final is not success",async()=>{
 const response=await consumeAgentStream(new Response('event: error\ndata: {"status":504,"error":"assistant_timeout"}\n\n',{headers:{"content-type":"text/event-stream"}}),()=>{});assert.equal(response.status,504);
 await assert.rejects(()=>consumeAgentStream(new Response('event: progress\ndata: {"type":"thinking"}\n\n',{headers:{"content-type":"text/event-stream"}}),()=>{}),/incomplete/);
});
test("server streams only real events and preserves final JSON or failure status",async()=>{
 const express=(await import("express")).default;const{once}=await import("node:events");const{agentProgressMiddleware}=await import("../src/ai/agentProgress.js");
 const app=express();app.use(agentProgressMiddleware);app.post("/api/advisor",(req,res)=>{res.locals.agentProgress?.({type:"tool_start",tool:"search_grants"});if(req.query.fail)res.status(502).json({error:"assistant_error"});else res.json({message:{reply:"OK"}});});
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/advisor`;
 try{const events:unknown[]=[];const response=await consumeAgentStream(await fetch(base,{method:"POST",headers:{Accept:"text/event-stream"}}),event=>events.push(event));assert.equal((await response.json()).message.reply,"OK");assert.equal(events.length,1);
 const failure=await consumeAgentStream(await fetch(`${base}?fail=1`,{method:"POST",headers:{Accept:"text/event-stream"}}),()=>{});assert.equal(failure.status,502);
 const json=await fetch(base,{method:"POST"});assert.match(json.headers.get("content-type")!,/application\/json/);assert.equal((await json.json()).message.reply,"OK");
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
