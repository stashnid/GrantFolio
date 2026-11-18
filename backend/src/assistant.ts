import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { parseDraftSuggestions } from "./draft-suggestions.js";
import type { ProfileDetails } from "./profile-details.js";

const input = z.object({ expectedRevision: z.number().int().min(0).max(2147483646), message: z.string().trim().min(1).max(2000) }).strict();
type Snapshot = { mode?: "discovery"; discovery?: unknown; title: string; program_id?: string | null; revision: number; profileRevision: number; details: unknown; items: unknown; total_kopecks: string; businessProfile?: { businessName: string; description: string; region: string; details?: Omit<ProfileDetails, "contactName" | "phone" | "website"> }; conversation?: { question: string; reply: string; revision: number; stale: boolean; truncated: boolean }[] };
export type AssistantResponder = (snapshot: Snapshot, message: string, signal: AbortSignal) => Promise<string>;

export function assistantRouter(db: Pool, responder: AssistantResponder | null | undefined = undefined, timeoutMs = 25000) {
  const router = Router();
  const users = new Map<string, { last: number; active: number }>();
  router.get("/:id/assistant/history", async (req, res, next) => {
    if (!z.string().uuid().safeParse(req.params.id).success) { res.status(404).json({ error: "not_found" }); return; }
    const before = req.query.before;
    if (before !== undefined && (typeof before !== "string" || !z.string().uuid().safeParse(before).success)) { res.status(400).json({ error: "invalid_cursor" }); return; }
    try {
      const uid: string = res.locals.uid;
      const owned = await db.query("SELECT revision FROM cases WHERE id=$1 AND owner_id=$2", [req.params.id, uid]);
      if (!owned.rowCount) { res.status(404).json({ error: "not_found" }); return; }
      if (before) {
        const cursor = await db.query("SELECT 1 FROM assistant_exchanges WHERE id=$1 AND case_id=$2 AND owner_id=$3", [before, req.params.id, uid]);
        if (!cursor.rowCount) { res.status(404).json({ error: "not_found" }); return; }
      }
      const result = await db.query(`SELECT e.id, e.question, e.reply, e.revision, e.created_at, e.profile_revision, c.revision AS current_revision, COALESCE(p.revision, 0) AS current_profile_revision
        FROM assistant_exchanges e JOIN cases c ON c.id=e.case_id AND c.owner_id=e.owner_id
        LEFT JOIN profiles p ON p.owner_id=e.owner_id
        WHERE e.case_id=$1 AND e.owner_id=$2 AND ($3::uuid IS NULL OR (e.created_at,e.id) <
          (SELECT created_at,id FROM assistant_exchanges WHERE id=$3 AND case_id=$1 AND owner_id=$2))
        ORDER BY e.created_at DESC, e.id DESC LIMIT 21`, [req.params.id, uid, before ?? null]);
      const hasMore = result.rows.length > 20;
      const rows = result.rows.slice(0, 20).reverse();
      const exchanges = rows.map((row) => ({ id: row.id, question: row.question, ...parseDraftSuggestions(row.reply), revision: row.revision, createdAt: row.created_at, stale: row.revision !== row.current_revision || row.profile_revision === null || row.profile_revision !== row.current_profile_revision }));
      res.set("Cache-Control", "no-store").json({ exchanges, hasMore, nextBefore: hasMore ? exchanges[0].id : null });
    } catch (error) { next(error); }
  });
  router.post("/:id/assistant", async (req, res, next) => {
    if (!z.string().uuid().safeParse(req.params.id).success) { res.status(404).json({ error: "not_found" }); return; }
    const parsed = input.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_assistant_request" }); return; }
    try {
      const result = await db.query("SELECT title, program_id, revision, details, items, total_kopecks FROM cases WHERE id=$1 AND owner_id=$2", [req.params.id, res.locals.uid]);
      if (!result.rowCount) { res.status(404).json({ error: "not_found" }); return; }
      const snapshot: Snapshot = result.rows[0];
      if (snapshot.revision !== parsed.data.expectedRevision) { res.status(409).json({ error: "revision_conflict" }); return; }
      if (!responder) { res.status(503).json({ error: "assistant_unavailable" }); return; }
      const now = Date.now();
      for (const [uid, state] of users) if (!state.active && now - state.last >= 15000) users.delete(uid);
      const uid: string = res.locals.uid;
      const state = users.get(uid);
      if ((state && (state.active >= 2 || now - state.last < 15000)) || (!state && users.size >= 10000)) { res.status(429).json({ error: "rate_limited" }); return; }
      const entry = state ?? { last: now, active: 0 };
      entry.last = now; entry.active++; users.set(uid, entry);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const profile = await db.query('SELECT business_name AS "businessName", description, region, details, revision FROM profiles WHERE owner_id=$1', [uid]);
        snapshot.profileRevision = profile.rowCount ? profile.rows[0].revision : 0;
        if (profile.rowCount) {
          const { details, revision: _revision, ...base } = profile.rows[0];
          const rawDetails = details && typeof details === "object" ? details : {};
          const { contactName: _contactName, phone: _phone, website: _website, newsletterEmail: _newsletterEmail, ...safeDetails } = rawDetails;
          snapshot.businessProfile = Object.keys(safeDetails).length ? { ...base, details: safeDetails } : base;
        }
        const history = await db.query("SELECT question, reply, revision, profile_revision FROM assistant_exchanges WHERE case_id=$1 AND owner_id=$2 ORDER BY created_at DESC, id DESC LIMIT 2", [req.params.id, uid]);
        snapshot.conversation = history.rows.reverse().map((row) => ({ question: row.question.slice(0, 2000), reply: parseDraftSuggestions(row.reply).reply.slice(0, 3000), revision: row.revision, stale: row.revision !== snapshot.revision || row.profile_revision === null || row.profile_revision !== snapshot.profileRevision, truncated: row.question.length > 2000 || row.reply.length > 3000 }));
        const reply = await Promise.race([responder(snapshot, parsed.data.message, controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs); })]);
        if (typeof reply !== "string" || !reply.trim() || reply.length > 12000) throw new Error("upstream");
        let saved;
        try {
          saved = await db.query(`WITH inserted AS (
            INSERT INTO assistant_exchanges (id, case_id, owner_id, question, reply, revision, profile_revision)
            SELECT $1, id, owner_id, $4, $5, $6, $7 FROM cases WHERE id=$2 AND owner_id=$3
            RETURNING id, question, reply, revision, profile_revision, created_at, case_id, owner_id
          ) SELECT inserted.*, cases.revision AS current_revision, COALESCE(profiles.revision, 0) AS current_profile_revision FROM inserted
            JOIN cases ON cases.id=inserted.case_id AND cases.owner_id=inserted.owner_id
            LEFT JOIN profiles ON profiles.owner_id=inserted.owner_id`,
          [randomUUID(), req.params.id, uid, parsed.data.message, reply.trim(), snapshot.revision, snapshot.profileRevision]);
          if (!saved.rowCount) throw new Error("save failed");
        } catch { res.status(500).json({ error: "assistant_save_failed" }); return; }
        const row = saved.rows[0];
        const exchange = { id: row.id, question: row.question, ...parseDraftSuggestions(row.reply), revision: row.revision, createdAt: row.created_at, stale: row.revision !== row.current_revision || row.profile_revision === null || row.profile_revision !== row.current_profile_revision };
        res.set("Cache-Control", "no-store").json({ reply: exchange.reply, revision: exchange.revision, stale: exchange.stale, exchange });
      } catch (error) {
        if (controller.signal.aborted) res.status(504).json({ error: "assistant_timeout" });
        else if (error instanceof Error && error.message === "upstream") res.status(502).json({ error: "assistant_error" });
        else res.status(502).json({ error: "assistant_error" });
      } finally { if (timer) clearTimeout(timer); entry.active--; }
    } catch (error) { next(error); }
  });
  return router;
}
