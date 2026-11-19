import pg from "pg";
import { syncPlaybooks } from "./sync.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  console.log(JSON.stringify(await syncPlaybooks(db)));
} finally {
  await db.end();
}
