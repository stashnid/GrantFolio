import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { syncPlaybooksToDatabase } from "./playbooks/syncPlaybooks.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  await db.query(
    "SELECT pg_advisory_xact_lock(hashtext('grantfolio-migrations'))",
  );
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const files = (await readdir("backend/migrations"))
    .filter((f) => /^\d+_[a-z_]+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const applied = await db.query(
      "SELECT 1 FROM schema_migrations WHERE name=$1",
      [file],
    );
    if (applied.rowCount) continue;
    await db.query(await readFile(`backend/migrations/${file}`, "utf8"));
    await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }
  await db.query("COMMIT");

  // Automatically and idempotently sync playbooks & catalog programs
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const syncRes = await syncPlaybooksToDatabase(pool);
    console.log(`Synced ${syncRes.synced} playbooks (${syncRes.catalogTotal} catalog programs)`);
  } finally {
    await pool.end();
  }
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
