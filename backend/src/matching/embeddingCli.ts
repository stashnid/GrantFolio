import pg from "pg";
import { configuredEmbedder } from "./embeddings.js";
import { syncCatalogEmbeddings } from "./syncEmbeddings.js";
import { syncPlaybooks } from "../playbooks/index.js";
const embedder = configuredEmbedder();
if (!embedder) throw new Error("Explicit GEMINI_EMBEDDINGS_ENABLED=true and configured credentials required; this command makes billable model calls.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await syncPlaybooks(db);
  console.log(JSON.stringify(await syncCatalogEmbeddings(db, embedder)));
} finally { await db.end(); }
