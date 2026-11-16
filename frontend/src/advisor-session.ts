const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export type AdvisorSession = { version: 1; savedAt: number; selected: string; drafts: Record<string, string>; attempts: Record<string, { id: string; text: string }> };
export const advisorSessionKey = (uid: string) => `grantfolio:advisor:v1:${encodeURIComponent(uid)}`;
export function parseAdvisorSession(raw: string | null, now = Date.now()): AdvisorSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as AdvisorSession;
    if (!s || s.version !== 1 || !Number.isFinite(s.savedAt) || s.savedAt > now || now - s.savedAt > MAX_AGE || typeof s.selected !== "string" || !UUID.test(s.selected) || !s.drafts || typeof s.drafts !== "object" || Array.isArray(s.drafts) || !s.attempts || typeof s.attempts !== "object" || Array.isArray(s.attempts)) return null;
    const entries = Object.entries(s.drafts);
    if (entries.length > 30 || entries.some(([id, text]) => !UUID.test(id) || typeof text !== "string" || text.length > 2000)) return null;
    const attempts = Object.entries(s.attempts);
    if (attempts.length > 30 || attempts.some(([id, a]) => !UUID.test(id) || !a || typeof a !== "object" || typeof a.id !== "string" || !UUID.test(a.id) || typeof a.text !== "string" || a.text !== s.drafts[id]?.trim())) return null;
    return s;
  } catch { return null; }
}
export function createAdvisorSession(selected: string, drafts: Record<string, string>, attempts: AdvisorSession["attempts"], now = Date.now()): AdvisorSession | null {
  const entries = Object.entries(drafts).filter(([id, text]) => UUID.test(id) && text.trim() && text.length <= 2000).slice(-30);
  const kept = Object.fromEntries(entries);
  const validAttempts = Object.fromEntries(Object.entries(attempts).filter(([id, a]) => kept[id]?.trim() === a.text && UUID.test(a.id)));
  return parseAdvisorSession(JSON.stringify({ version: 1, savedAt: now, selected, drafts: kept, attempts: validAttempts }), now);
}
