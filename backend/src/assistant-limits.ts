import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface AssistantLimiter {
  acquire(owner: string, leaseMs: number): Promise<string | null>;
  release(owner: string, token: string): Promise<void>;
}

/** Each owner's row serializes admission across all server instances. */
export function postgresAssistantLimiter(db: Pool): AssistantLimiter {
  return {
    async acquire(owner, leaseMs) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL lock_timeout = '2s'");
        await client.query("SET LOCAL statement_timeout = '5s'");
        await client.query("INSERT INTO assistant_limit_owners(owner_id) VALUES($1) ON CONFLICT DO NOTHING", [owner]);
        await client.query("SELECT owner_id FROM assistant_limit_owners WHERE owner_id=$1 FOR UPDATE", [owner]);
        await client.query("DELETE FROM assistant_limit_leases WHERE owner_id=$1 AND expires_at <= clock_timestamp()", [owner]);
        const allowed = await client.query(`SELECT (last_admitted_at IS NULL OR last_admitted_at <= clock_timestamp() - interval '15 seconds')
          AND (SELECT count(*) FROM assistant_limit_leases WHERE owner_id=$1) < 2 AS allowed
          FROM assistant_limit_owners WHERE owner_id=$1`, [owner]);
        if (!allowed.rows[0].allowed) { await client.query("COMMIT"); return null; }
        const token = randomUUID();
        await client.query("UPDATE assistant_limit_owners SET last_admitted_at=clock_timestamp() WHERE owner_id=$1", [owner]);
        await client.query("INSERT INTO assistant_limit_leases(owner_id,token,expires_at) VALUES($1,$2,clock_timestamp()+$3 * interval '1 millisecond')", [owner, token, leaseMs]);
        await client.query("COMMIT");
        return token;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async release(owner, token) {
      await db.query("DELETE FROM assistant_limit_leases WHERE owner_id=$1 AND token=$2", [owner, token]);
    },
  };
}
