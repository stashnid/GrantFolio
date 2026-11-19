import type { Pool } from "pg";
import pg from "pg";
import { PLAYBOOKS } from "./index.js";
import { GRANT_CATALOG } from "../grant-catalog-data.js";

export async function syncPlaybooksToDatabase(db: Pool): Promise<{ synced: number; catalogTotal: number }> {
  // Ensure table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS catalog_programs (
      program_id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      support_tier TEXT NOT NULL DEFAULT 'catalog_only' CHECK (support_tier IN ('deep', 'catalog_only')),
      search_tags TEXT[] NOT NULL DEFAULT '{}',
      search_synonyms TEXT[] NOT NULL DEFAULT '{}',
      use_case_examples TEXT[] NOT NULL DEFAULT '{}',
      embedding_vector JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_programs_tier ON catalog_programs (support_tier);
  `);

  let synced = 0;
  // Upsert deep flagship programs from playbooks
  for (const playbook of Object.values(PLAYBOOKS)) {
    await db.query(
      `INSERT INTO catalog_programs (
        program_id, canonical_name, support_tier, search_tags, search_synonyms, use_case_examples, updated_at
      ) VALUES ($1, $2, 'deep', $3, $4, $5, now())
      ON CONFLICT (program_id) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        support_tier = 'deep',
        search_tags = EXCLUDED.search_tags,
        search_synonyms = EXCLUDED.search_synonyms,
        use_case_examples = EXCLUDED.use_case_examples,
        updated_at = now()`,
      [
        playbook.program_id,
        playbook.canonical_name,
        playbook.domain_tags,
        playbook.synonyms_uk_en,
        playbook.use_case_examples,
      ]
    );
    synced++;
  }

  // Populate remaining catalog programs as catalog_only if not present
  for (const entry of GRANT_CATALOG) {
    if (PLAYBOOKS[entry.id]) continue; // already synced as deep
    await db.query(
      `INSERT INTO catalog_programs (
        program_id, canonical_name, support_tier, search_tags, search_synonyms, use_case_examples, updated_at
      ) VALUES ($1, $2, 'catalog_only', $3, $4, '{}', now())
      ON CONFLICT (program_id) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        search_tags = EXCLUDED.search_tags,
        search_synonyms = EXCLUDED.search_synonyms,
        updated_at = now()`,
      [
        entry.id,
        entry.title,
        entry.tags ?? [],
        entry.searchTerms ?? [],
      ]
    );
  }

  return { synced, catalogTotal: GRANT_CATALOG.length };
}

// Standalone CLI runner
if (process.argv[1]?.endsWith("syncPlaybooks.ts") || process.argv[1]?.endsWith("syncPlaybooks.js")) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required to run syncPlaybooks CLI");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString });
  syncPlaybooksToDatabase(pool)
    .then((result) => {
      console.log(`Successfully synced ${result.synced} deep playbooks and updated catalog metadata (${result.catalogTotal} total programs)`);
      return pool.end();
    })
    .catch((err) => {
      console.error("Failed to sync playbooks:", err);
      pool.end().finally(() => process.exit(1));
    });
}
