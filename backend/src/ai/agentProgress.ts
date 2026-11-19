import type { RequestHandler } from "express";
/** Stream only observed tool events; final payload remains identical to the JSON endpoint. */
export const agentProgressMiddleware: RequestHandler = (req,res,next) => {
  const agentPath = req.method === "POST" && (req.path === "/api/advisor" || /^\/api\/cases\/[^/]+\/assistant$/.test(req.path));
  if (!agentPath || !req.accepts("text/event-stream") || !req.headers.accept?.includes("text/event-stream")) { next(); return; }
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    res.set({"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"});
    res.flushHeaders();
  };
  const event = (name:string,data:unknown) => { if(res.destroyed || res.writableEnded)return;open();res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); };
  res.locals.agentProgress = (progress:unknown) => event("progress",progress);
  const originalJson = res.json.bind(res);
  res.json = ((body:unknown) => {
    if (!opened) return originalJson(body);
    const status = res.statusCode;
    if (status >= 400) event("error",{...(body && typeof body==="object" ? body : {error:"assistant_error"}),status});
    else event("final",body);
    res.end();return res;
  }) as typeof res.json;
  next();
};
