import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parseMarkdownSections } from "./indexOfficialDocs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OfficialRuleSearchResult {
  doc_id: string;
  section_title: string;
  snippet: string;
  source_url: string;
  verified_at: string;
}

export async function searchOfficialRules(options: {
  program_id: string;
  question: string;
  limit?: number;
  db?: pg.Pool;
}): Promise<OfficialRuleSearchResult[]> {
  const { program_id, question, limit = 5, db } = options;
  const normalizedProgId = program_id === "brave1" ? "ua-brave1-core" : program_id;

  // 1. Try DB search if db pool is provided
  if (db) {
    try {
      const words = question
        .toLowerCase()
        .replace(/[^a-zа-яіїєґ0-9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

      let queryText = `SELECT doc_id, section_title, content, source_url, verified_at FROM official_doc_chunks WHERE program_id = $1`;
      const params: any[] = [normalizedProgId];

      if (words.length > 0) {
        const likeClauses = words.slice(0, 4).map((_, idx) => `(content ILIKE $${idx + 2} OR section_title ILIKE $${idx + 2})`);
        queryText += ` AND (${likeClauses.join(" OR ")})`;
        for (const w of words.slice(0, 4)) {
          params.push(`%${w}%`);
        }
      }

      queryText += ` ORDER BY verified_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await db.query(queryText, params);
      if (res.rowCount && res.rowCount > 0) {
        return res.rows.map((r: any) => ({
          doc_id: r.doc_id,
          section_title: r.section_title,
          snippet: r.content.slice(0, 800),
          source_url: r.source_url,
          verified_at: r.verified_at ? new Date(r.verified_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (_dbErr) {
      // Fallback to local files
    }
  }

  // 2. Local fallback from resources/official-sources/
  const sourcesRoot = path.resolve(__dirname, "../../resources/official-sources");
  const folderName = normalizedProgId === "ua-brave1-core" ? "brave1" : normalizedProgId;
  const dirPath = path.join(sourcesRoot, folderName);

  if (!fs.existsSync(dirPath)) return [];

  const manifestPath = path.join(dirPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const results: OfficialRuleSearchResult[] = [];

    const searchWords = question
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (const doc of manifest.documents || []) {
      if (!doc.local_file?.endsWith(".md")) continue;
      const filePath = path.join(dirPath, doc.local_file);
      if (!fs.existsSync(filePath)) continue;

      const md = fs.readFileSync(filePath, "utf8");
      const chunks = parseMarkdownSections(md, normalizedProgId, doc.doc_id, doc.source_url, doc.verified_at);

      for (const chunk of chunks) {
        const text = `${chunk.section_title} ${chunk.content}`.toLowerCase();
        const score = searchWords.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);
        if (score > 0 || searchWords.length === 0) {
          results.push({
            doc_id: chunk.doc_id,
            section_title: chunk.section_title,
            snippet: chunk.content.slice(0, 800),
            source_url: chunk.source_url,
            verified_at: chunk.verified_at,
          });
        }
      }
    }

    return results.slice(0, limit);
  } catch {
    return [];
  }
}
