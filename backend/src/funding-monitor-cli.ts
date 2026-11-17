import pg from "pg";
import { createFundingMonitor } from "./funding-monitor.js";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const monitor = createFundingMonitor(db);
  await monitor.hydrate();
  const result = await monitor.refresh();
  console.log(JSON.stringify(result));
  console.log(JSON.stringify(monitor.status()));
  if (result.failed) process.exitCode = 1;
} finally {
  await db.end();
}
