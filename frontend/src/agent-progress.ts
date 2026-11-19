export type AgentProgress = { type: "tool_start" | "tool_end" | "thinking"; tool?: string };
export type AgentRequestInit = RequestInit & { onAgentProgress?: (event: AgentProgress) => void };
export function progressLabel(event: AgentProgress): string {
  const labels: Record<string,string> = {search_grants:"Шукаю програми…",get_program_playbook:"Перевіряю правила програми…",get_project_state:"Читаю збережений проєкт…",validate_project_financials:"Перевіряю розрахунки…",propose_structured_update:"Готую зміни для вашого перегляду…"};
  return event.type === "tool_end" ? "Готую відповідь за перевіреними даними…" : labels[event.tool ?? ""] ?? "Опрацьовую запит…";
}
/** Consume real server progress, retaining the legacy final JSON response contract. */
export async function consumeAgentStream(response: Response, onProgress: (event:AgentProgress)=>void): Promise<Response> {
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream") || !response.body) return response;
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer="",total=0;let final:unknown;let failure: {error:string;status:number}|undefined;
  const frame=(text:string)=>{
    let event="message";const data:string[]=[];
    for(const line of text.split("\n")){if(line.startsWith("event:"))event=line.slice(6).trim();else if(line.startsWith("data:"))data.push(line.slice(5).trimStart());}
    if(!data.length)return;
    const value=JSON.parse(data.join("\n"));
    if(event==="final")final=value;
    else if(event==="error")failure={error:typeof value.error==="string"?value.error:"assistant_error",status:Number.isInteger(value.status)&&value.status>=400&&value.status<=599?value.status:502};
    else if(event==="progress" && ["tool_start","tool_end","thinking"].includes(value.type))onProgress(value);
  };
  try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>2_000_000)throw Error("assistant_stream_too_large");buffer=(buffer+decoder.decode(chunk.value,{stream:true})).replaceAll("\r\n","\n");let end;while((end=buffer.indexOf("\n\n"))>=0){frame(buffer.slice(0,end));buffer=buffer.slice(end+2);}}buffer+=decoder.decode();if(buffer.trim())frame(buffer);
    if(failure)return Response.json({error:failure.error},{status:failure.status});if(final===undefined)throw Error("assistant_stream_incomplete");return Response.json(final);
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
