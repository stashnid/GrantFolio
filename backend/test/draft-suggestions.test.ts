import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type {Pool} from "pg";
import {parseDraftSuggestions} from "../src/draft-suggestions.js";
import {assistantRouter} from "../src/assistant.js";
const block=(json:string)=>'```grantfolio-draft\n'+json+'\n```';
test('only one strictly valid proposal block yields whitelisted, trimmed suggestions',()=>{
 const raw='Опис нижче.\n'+block('{"projectDescription":"  Пекарня  ","customers":"Мешканці"}');
 assert.deepEqual(parseDraftSuggestions(raw),{reply:'Опис нижче.',suggestions:[{field:'projectDescription',text:'Пекарня'},{field:'customers',text:'Мешканці'}]});
 for(const bad of ['{}','{"other":"x"}','{"customers":" "}','{"customers":15}','{"customers":"'+('x'.repeat(3001))+'"}','not json']){const result=parseDraftSuggestions('Пояснення\n'+block(bad));assert.equal(result.reply,'Пояснення');assert.equal(result.suggestions,undefined);}
 const multiple=parseDraftSuggestions('Пояснення\n'+block('{"customers":"Один"}')+'\n'+block('{"customers":"Два"}'));assert.equal(multiple.reply,'Пояснення');assert.equal(multiple.suggestions,undefined);
 const unclosed=parseDraftSuggestions('Пояснення\n```grantfolio-draft\n{"customers":"secret"}');assert.equal(unclosed.reply,'Пояснення');assert.equal(unclosed.suggestions,undefined);const nested=parseDraftSuggestions('Пояснення\n```grantfolio-draft\nпомилка\n'+block('{\"customers\":\"secret\"}'));assert.equal(nested.reply,'Пояснення');assert.equal(nested.suggestions,undefined);
});
test('POST and history hide metadata, preserve raw database text and enforce ownership',async()=>{
 const id=crypto.randomUUID(),raw='Ось чернетка.\n'+block('{"projectDescription":"Майстерня"}');let stored='';
 const db={query:async(sql:string,values:unknown[])=>{
  if(sql.startsWith('SELECT title'))return {rowCount:values[1]==='owner'?1:0,rows:values[1]==='owner'?[{title:'Назва',revision:1,details:{},items:[],total_kopecks:'0'}]:[]};
  if(sql.startsWith('SELECT business_name'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT question, reply'))return {rowCount:0,rows:[]};
  if(sql.startsWith('WITH inserted')){stored=String(values[4]);return {rowCount:1,rows:[{id:values[0],question:values[3],reply:stored,revision:1,profile_revision:0,current_profile_revision:0,current_revision:1,created_at:'2026-11-16T00:00:00.000Z'}]};}
  if(sql.startsWith('SELECT revision'))return {rowCount:values[1]==='owner'?1:0,rows:[{revision:1}]};
  if(sql.includes('FROM assistant_exchanges e JOIN'))return {rowCount:1,rows:[{id:crypto.randomUUID(),question:'Питання',reply:stored,revision:1,profile_revision:0,current_profile_revision:0,current_revision:1,created_at:'2026-11-16T00:00:00.000Z'}]};
  throw Error('unexpected query');
 }} as unknown as Pool;
 const app=express();app.use(express.json());app.use((req,res,next)=>{res.locals.uid=req.header('x-owner');next();});app.use(assistantRouter(db,async()=>raw));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const addr=server.address();if(!addr||typeof addr==='string')throw Error();const url=`http://127.0.0.1:${addr.port}/${id}/assistant`;
 try{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-owner':'owner'},body:JSON.stringify({expectedRevision:1,message:'Питання'})});assert.equal(response.status,200);const body=await response.json();assert.equal(body.reply,'Ось чернетка.');assert.deepEqual(body.exchange.suggestions,[{field:'projectDescription',text:'Майстерня'}]);assert.equal(stored,raw);const history=await(await fetch(url+'/history',{headers:{'x-owner':'owner'}})).json();assert.deepEqual(history.exchanges[0].suggestions,body.exchange.suggestions);assert(!JSON.stringify(history).includes('grantfolio-draft'));assert.equal((await fetch(url+'/history',{headers:{'x-owner':'other'}})).status,404);}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
