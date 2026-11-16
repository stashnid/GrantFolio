import { useEffect, useRef, useState } from "react";

type Details = { projectDescription: string; customers: string; salesChannels: string; implementationPlan: string; expectedResults: string };
type DraftItem = { name: string; quantity: string; price: string };
export type SessionDraft = { version: 1; baseRevision: number; timestamp: number; details: Details; budget: DraftItem[]; pendingUnknown: boolean };
const maxAge = 7 * 24 * 60 * 60 * 1000;
const keyFor = (uid: string, id: string) => `grantfolio:session-draft:v1:${encodeURIComponent(uid)}:${encodeURIComponent(id)}`;
export function parseSessionDraft(raw: string, now: number): SessionDraft | null {
  try {
    if (raw.length > 100_000) return null;
    const value = JSON.parse(raw) as SessionDraft;
    const fields = ["projectDescription", "customers", "salesChannels", "implementationPlan", "expectedResults"] as const;
    if (!value || typeof value !== "object" || value.version !== 1 || !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0 ||
        typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp) || value.timestamp > now || now - value.timestamp > maxAge ||
        !value.details || !fields.every(field => typeof value.details[field] === "string" && value.details[field].length <= 3000) || !Array.isArray(value.budget) || value.budget.length > 100 ||
        !value.budget.every(row => row && typeof row.name === "string" && row.name.length <= 160 && typeof row.quantity === "string" && typeof row.price === "string") || typeof value.pendingUnknown !== "boolean") return null;
    return value;
  } catch { return null; }
}
function read(key: string): SessionDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = parseSessionDraft(raw, Date.now());
    if (!value) sessionStorage.removeItem(key);
    return value;
  } catch { return null; }
}
export function useSessionDraft(uid: string, selected: { id: string; revision: number } | null, details: Details, budget: DraftItem[], dirty: boolean, pendingUnknown: boolean) {
  const suppressWrite = useRef(false);
  const key = selected ? keyFor(uid, selected.id) : null;
  const [recovery, setRecovery] = useState<{ key: string; draft: SessionDraft } | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key) { setRecovery(null); setCheckedKey(null); return; }
    const saved = read(key);
    setRecovery(saved ? { key, draft: saved } : null);
    setCheckedKey(key);
  }, [key]);
  useEffect(() => {
    if (!key || !selected || checkedKey !== key || recovery?.key === key || (!dirty && !pendingUnknown)) return;
    suppressWrite.current = false;
    const snapshot: SessionDraft = { version: 1, baseRevision: selected.revision, timestamp: Date.now(), details, budget, pendingUnknown };
    const write = () => { if (suppressWrite.current) return; try { sessionStorage.setItem(key, JSON.stringify(snapshot)); setStorageFailed(false); } catch { setStorageFailed(true); } };
    const timer = window.setTimeout(write, 300);
    window.addEventListener("pagehide", write);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", write); write(); };
  }, [key, checkedKey, recovery, selected?.revision, details, budget, dirty, pendingUnknown]);
  function discard() { suppressWrite.current = true; if (key) { try { sessionStorage.removeItem(key); } catch {} } setRecovery(null); }
  function resolved() { setRecovery(null); }
  return { recovery: recovery?.key === key ? recovery.draft : null, storageFailed, discard, resolved };
}
