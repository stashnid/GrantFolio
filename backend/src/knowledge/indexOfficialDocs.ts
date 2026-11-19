import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { z } from "zod";
import { callGeminiEmbedding } from "../ai/geminiClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const OfficialDocManifestSchema = z.object({
  program_id: z.string(),
  documents: z.array(
    z.object({
      doc_id: z.string(),
      title: z.string(),
      doc_type: z.enum(["regulation", "official_guide", "template"]),
      source_url: z.string().url(),
      verified_at: z.string(),
      local_file: z.string(),
      is_verified_official: z.boolean(),
    })
  ),
});

export type OfficialDocManifest = z.infer<typeof OfficialDocManifestSchema>;

export interface OfficialDocChunk {
  program_id: string;
  doc_id: string;
  section_title: string;
  content: string;
  source_url: string;
  verified_at: string;
}

export function parseMarkdownSections(
  markdownText: string,
  program_id: string,
  doc_id: string,
  source_url: string,
  verified_at: string
): OfficialDocChunk[] {
  const chunks: OfficialDocChunk[] = [];
  const lines = markdownText.split("\n");
  let currentTitle = "Загальні положення";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text.length > 30) {
          chunks.push({
            program_id,
            doc_id,
            section_title: currentTitle,
            content: text,
            source_url,
            verified_at,
          });
        }
      }
      currentTitle = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text.length > 30) {
      chunks.push({
        program_id,
        doc_id,
        section_title: currentTitle,
        content: text,
        source_url,
        verified_at,
      });
    }
  }

  return chunks;
}

export async function syncOfficialDocs(db: pg.Pool): Promise<{ indexedChunks: number }> {
  const sourcesRoot = path.resolve(__dirname, "../../resources/official-sources");
  if (!fs.existsSync(sourcesRoot)) {
    return { indexedChunks: 0 };
  }

  const entries = fs.readdirSync(sourcesRoot, { withFileTypes: true });
  let totalIndexed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(sourcesRoot, entry.name);
    const manifestPath = path.join(dirPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const manifest = OfficialDocManifestSchema.parse(manifestRaw);

      for (const doc of manifest.documents) {
        if (!doc.local_file.endsWith(".md")) continue;
        const filePath = path.join(dirPath, doc.local_file);
        if (!fs.existsSync(filePath)) continue;

        const mdContent = fs.readFileSync(filePath, "utf8");
        const chunks = parseMarkdownSections(
          mdContent,
          manifest.program_id,
          doc.doc_id,
          doc.source_url,
          doc.verified_at
        );

        for (const chunk of chunks) {
          let embedding: number[] | null = null;
          try {
            embedding = await callGeminiEmbedding(`${chunk.section_title}\n${chunk.content}`);
          } catch {
            embedding = null;
          }

          await db.query(
            `DELETE FROM official_doc_chunks WHERE program_id = $1 AND doc_id = $2 AND section_title = $3`,
            [chunk.program_id, chunk.doc_id, chunk.section_title]
          );

          await db.query(
            `INSERT INTO official_doc_chunks (
              program_id, doc_id, section_title, content, source_url, embedding_vector, verified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              chunk.program_id,
              chunk.doc_id,
              chunk.section_title,
              chunk.content,
              chunk.source_url,
              embedding ? JSON.stringify(embedding) : null,
              chunk.verified_at,
            ]
          );
          totalIndexed++;
        }
      }
    } catch (err) {
      console.warn(`[OfficialSources] Failed indexing ${dirPath}:`, err);
    }
  }

  return { indexedChunks: totalIndexed };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith("indexOfficialDocs.ts")) {
  const connectionString = process.env.DATABASE_URL || "postgresql://grantfolio:grantfolio@127.0.0.1:55432/grantfolio";
  const pool = new pg.Pool({ connectionString });
  syncOfficialDocs(pool)
    .then((res) => {
      console.log(`Successfully synced ${res.indexedChunks} official doc chunks to database.`);
      return pool.end();
    })
    .catch((err) => {
      console.error("Official docs sync failed:", err);
      process.exit(1);
    });
}
