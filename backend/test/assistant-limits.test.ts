import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import pg from "pg";
import { postgresAssistantLimiter } from "../src/assistant-limits.js";
import { assistantRouter } from "../src/assistant.js";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

test("shared SQL admission serializes routers, isolates owners, and fences expired leases", async () => {
  const owner = `limit-test-${crypto.randomUUID()}`;
  const other = `limit-test-${crypto.randomUUID()}`;
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const limiter = postgresAssistantLimiter(db);
  let unblock!: () => void;
  const held = new Promise<void>(resolve => { unblock = resolve; });
  const servers: ReturnType<express.Express["listen"]>[] = [];
  const waitForCount = async (uid: string, count: number) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await db.query("SELECT token FROM assistant_limit_leases WHERE owner_id=$1", [uid])).rowCount === count) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${count} leases`);
  };
  try {
    for (const [index, id] of ids.entries()) await db.query("INSERT INTO cases(id,owner_id,title) VALUES($1,$2,$3)", [id, index === 2 ? other : owner, "limits test"]);
    for (let i = 0; i < 2; i++) {
      const app = express(); app.use(express.json());
      app.use((req, res, next) => { res.locals.uid = req.header("x-test-user"); next(); });
      app.use(assistantRouter(db, async () => { await held; return "ok"; }));
      const server = app.listen(0, "127.0.0.1"); servers.push(server); await once(server, "listening");
    }
    const call = (router: number, id: string, uid: string) => fetch(`http://127.0.0.1:${(servers[router].address() as {port:number}).port}/${id}/assistant`, { method: "POST", headers: { "content-type": "application/json", "x-test-user": uid }, body: JSON.stringify({ expectedRevision: 0, message: "test" }) });
    const racingOwner = `limit-race-${crypto.randomUUID()}`;
    try {
      const secondPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const admissions = await Promise.all([limiter.acquire(racingOwner, 60000), postgresAssistantLimiter(secondPool).acquire(racingOwner, 60000)]);
        assert.equal(admissions.filter(Boolean).length, 1);
      } finally { await secondPool.end(); }
    } finally { await db.query("DELETE FROM assistant_limit_owners WHERE owner_id=$1", [racingOwner]); }
    const first = call(0, ids[0], owner);
    await waitForCount(owner, 1);
    assert.equal((await call(1, ids[1], owner)).status, 429);
    const independent = call(1, ids[2], other);
    await waitForCount(other, 1);
    await db.query("UPDATE assistant_limit_owners SET last_admitted_at=clock_timestamp()-interval '16 seconds' WHERE owner_id=$1", [owner]);
    const second = call(1, ids[1], owner);
    await waitForCount(owner, 2);
    await db.query("UPDATE assistant_limit_owners SET last_admitted_at=clock_timestamp()-interval '16 seconds' WHERE owner_id=$1", [owner]);
    assert.equal((await call(0, ids[0], owner)).status, 429);
    unblock();
    assert.deepEqual((await Promise.all([first, second, independent])).map(r => r.status), [200, 200, 200]);
    assert.equal((await call(1, ids[0], owner)).status, 200); // cooldown was aged above
    assert.equal((await call(0, ids[1], owner)).status, 429); // shared across cases after completion
    await db.query("UPDATE assistant_limit_owners SET last_admitted_at=clock_timestamp()-interval '16 seconds' WHERE owner_id=$1", [owner]);
    const stale = await limiter.acquire(owner, 1); assert.ok(stale);
    await db.query("UPDATE assistant_limit_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE token=$1", [stale]);
    await db.query("UPDATE assistant_limit_owners SET last_admitted_at=clock_timestamp()-interval '16 seconds' WHERE owner_id=$1", [owner]);
    const fresh = await limiter.acquire(owner, 60000); assert.ok(fresh);
    await limiter.release(owner, stale);
    assert.equal((await db.query("SELECT token FROM assistant_limit_leases WHERE owner_id=$1", [owner])).rows[0].token, fresh);
    await limiter.release(owner, fresh);
  } finally {
    unblock();
    for (const server of servers) await new Promise<void>(resolve => server.close(() => resolve()));
    await db.query("DELETE FROM cases WHERE id=ANY($1::uuid[])", [ids]);
    await db.query("DELETE FROM assistant_limit_owners WHERE owner_id=ANY($1::text[])", [[owner, other]]);
    await db.end();
  }
});
