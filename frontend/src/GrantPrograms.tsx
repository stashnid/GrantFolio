import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isGrantAvailable } from "../../backend/src/grant-availability";
import { GRANT_PROGRAMS, type GrantProgram } from "./grants";

export type GrantSourceStatus = {
  programId: string;
  url: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
};
type GrantProgramsContext = {
  programs: GrantProgram[];
  availablePrograms: GrantProgram[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  sources: GrantSourceStatus[];
};
const Context = createContext<GrantProgramsContext | null>(null);
const validProgram = (value: unknown): value is GrantProgram => {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const d = p.details as Record<string, unknown> | null;
  return (
    [
      p.id,
      p.title,
      p.provider,
      p.amount,
      p.deadline,
      p.category,
      p.categoryLabel,
      p.targetAudience,
      p.summary,
      p.officialUrl,
      p.checkedAt,
      p.intakeStatus,
    ].every((v) => typeof v === "string") &&
    Array.isArray(p.eligibleCosts) &&
    p.eligibleCosts.every((v) => typeof v === "string") &&
    !!d &&
    typeof d === "object" &&
    typeof d.overview === "string" &&
    [
      "eligibility",
      "exclusions",
      "funding",
      "costs",
      "obligations",
      "documents",
      "steps",
      "timing",
      "pitfalls",
      "unresolved",
      "sources",
    ].every((k) => Array.isArray(d[k])) &&
    [
      "eligibility",
      "exclusions",
      "funding",
      "costs",
      "obligations",
      "documents",
      "steps",
      "timing",
      "pitfalls",
      "unresolved",
    ].every((k) => (d[k] as unknown[]).every((v) => typeof v === "string")) &&
    (d.sources as unknown[]).every(
      (v) =>
        !!v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).url === "string" &&
        typeof (v as Record<string, unknown>).title === "string" &&
        typeof (v as Record<string, unknown>).checkedAt === "string",
    )
  );
};
const validSource = (v: unknown): v is GrantSourceStatus =>
  !!v &&
  typeof v === "object" &&
  typeof (v as GrantSourceStatus).programId === "string" &&
  typeof (v as GrantSourceStatus).url === "string";

export function GrantProgramsProvider({ children }: { children: ReactNode }) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [programs, setPrograms] = useState<GrantProgram[]>(GRANT_PROGRAMS);
  const [sources, setSources] = useState<GrantSourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const reload = useCallback(() => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    void (async () => {
      try {
        const response = await fetch("/api/grants", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("HTTP");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object") throw new Error("shape");
        const body = data as Record<string, unknown>;
        if (
          !Array.isArray(body.programs) ||
          body.programs.length === 0 ||
          !body.programs.every(validProgram) ||
          !Array.isArray(body.sources) ||
          !body.sources.every(validSource)
        )
          throw new Error("shape");
        if (mounted.current && request.current === controller) {
          setHasLoaded(true);
          setPrograms(body.programs);
          setSources(body.sources);
          setError(null);
          setNow(Date.now());
        }
      } catch {
        if (mounted.current && request.current === controller)
          setError("Не вдалося оновити програми. Спробуйте ще раз.");
      } finally {
        window.clearTimeout(timer);
        if (request.current === controller) {
          request.current = null;
          if (mounted.current) setLoading(false);
        }
      }
    })();
  }, []);
  useEffect(() => {
    mounted.current = true;
    reload();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      reload();
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        reload();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      request.current?.abort();
      request.current = null;
    };
  }, [reload]);
  const availablePrograms = useMemo(
    () =>
      hasLoaded
        ? programs.filter((p) => isGrantAvailable(p, new Date(now)))
        : [],
    [programs, now, hasLoaded],
  );
  const value = useMemo(
    () => ({ programs, availablePrograms, loading, error, reload, sources }),
    [programs, availablePrograms, loading, error, reload, sources],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useGrantPrograms() {
  const context = useContext(Context);
  if (!context) throw new Error("GrantProgramsProvider is missing");
  return context;
}
