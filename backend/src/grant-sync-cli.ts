import pg from "pg";
import { createGrantSync } from "./grant-sync.js";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sync = createGrantSync(db);
  await sync.hydrate();
  console.log(JSON.stringify(await sync.refresh()));
  console.log(JSON.stringify(sync.status()));
} finally {
  await db.end();
}
