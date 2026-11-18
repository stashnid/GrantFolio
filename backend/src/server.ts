import { createFundingMonitor } from "./funding-monitor.js";
import {createGrantSync} from "./grant-sync.js";
import {GRANT_CATALOG} from "./grant-catalog-data.js";
import { initializeApp } from "firebase-admin/app";
import pg from "pg";
import express from "express";
import { createApp } from "./app.js";
import { configuration } from "./config.js";
const config = configuration();
initializeApp({ projectId: config.projectId });
const db = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const grantSync = createGrantSync(db);
const fundingMonitor = createFundingMonitor(db);
try {
  for (const program of GRANT_CATALOG.filter(p=>p.availability)) {
    const a=program.availability!;
    await db.query("INSERT INTO grant_source_checks(program_id,source_url,availability,last_attempt_at,last_error) VALUES($1,$2,$3::jsonb,$4,NULL) ON CONFLICT(program_id) DO NOTHING",[program.id,a.sourceUrl,JSON.stringify(a),a.checkedAt]);
  }
  await grantSync.hydrate();
  if (config.runCatalogTimers) grantSync.start();
} catch { console.warn("Grant source sync unavailable; apply database migrations."); }
try {
  await fundingMonitor.hydrate();
  if (config.runCatalogTimers) fundingMonitor.start();
} catch { console.warn("New funding discovery unavailable; apply database migrations."); }
const app = createApp(
  db,
  async () => {
    await grantSync.hydrate();
    await fundingMonitor.hydrate();
    return [
      ...grantSync.status().map(s=>({programId:s.programId,url:s.sourceUrl,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.availability?.checkedAt??null,error:s.lastError})),
      ...fundingMonitor.status().map(s=>({programId:s.programId,url:s.sourceUrl,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.lastSuccessAt,error:s.lastError,counts:s.counts,truncated:s.truncated})),
    ];
  },
  undefined,
  async () => {
    await grantSync.hydrate();
  },
);
app.use(express.static("frontend/dist"));
app.get("/{*path}", (_req, res) =>
  res.sendFile("index.html", { root: "frontend/dist" }),
);
app.listen(
  Number(process.env.PORT ?? 8080),
  process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  () => console.log("GrantFolio listening"),
);
