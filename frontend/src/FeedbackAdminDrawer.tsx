import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { ApiError, authenticatedRequest, readableApiError } from "./api";
import { CustomSelect, type SelectOption } from "./CustomSelect";
import "./FeedbackAdminDrawer.css";

export interface FeedbackAdminDrawerProps {
  user: User;
  /** Optional custom class for trigger button placement */
  triggerClassName?: string;
}

type FeedbackStatus = "new" | "reviewed" | "planned" | "resolved" | "dismissed";
type FeedbackPriority = "low" | "medium" | "high" | "critical";
type FeedbackNotifyStatus = "pending" | "sent" | "failed" | "skipped";
type FeedbackTaskOutcome = "completed" | "partial" | "failed" | "unspecified";
type FeedbackWillingnessToPay =
  | "none"
  | "free_only"
  | "pay_per_application"
  | "monthly_subscription"
  | "donation_ready"
  | "already_paid";
type DrawerTab = "overview" | "inbox" | "export";
type RatingBucket = "" | "1-2" | "3" | "4-5";

interface AdminStatusResponse {
  ok: boolean;
  isAdmin: boolean;
  newCount: number;
  totalCount: number;
  aiEnabled: boolean;
  notifyRecipientsCount: number;
}

interface SingleFeedbackTriage {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  urgency: "blocker" | "major" | "minor" | "suggestion" | "praise";
  themes: string[];
  summaryUk: string;
  suggestedActionUk: string;
}

interface BatchSynthesisCluster {
  title: string;
  kind: "pain_point" | "praise" | "feature_request";
  severity: "blocker" | "major" | "minor" | "positive";
  feedbackIds: string[];
  verbatimQuotes: Array<{ feedbackId: string; quote: string }>;
  summaryUk: string;
  recommendedFixUk: string;
}

interface VerifiedBatchFeedbackSynthesis {
  executiveSummaryUk: string;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
  };
  clusters: BatchSynthesisCluster[];
  topPriorities: Array<{
    title: string;
    rationaleUk: string;
    impact: "high" | "medium" | "low";
    feedbackIds: string[];
  }>;
  blindSpotsUk: string[];
  verification?: {
    verifiedQuotesCount: number;
    rejectedQuotesCount: number;
    rejectedFeedbackIdsCount: number;
  };
}

interface DeterministicFeedbackMetrics {
  totalCount: number;
  uniqueTesters: number;
  averageRating: number | null;
  ratingDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  dimensionAverages: {
    ux: number | null;
    usefulness: number | null;
    ai: number | null;
  };
  csatPercent: number | null;
  recommendPercent: number | null;
  taskCompletionRate: number | null;
  willingnessToPayCount: number;
  willingnessToPayPercent: number | null;
  averageSuggestedPriceUah: number | null;
  actualDonations: { count: number; totalUah: number };
  pilotPayments: { count: number; totalUah: number };
  taskBreakdown: Record<string, number>;
  statusBreakdown: Record<FeedbackStatus, number>;
  topTags: Array<{ tag: string; count: number }>;
  notifyFailuresCount: number;
}

interface FeedbackBatchSynthesisRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  feedbackCount: number;
  deterministicMetrics: DeterministicFeedbackMetrics;
  aiSynthesis: VerifiedBatchFeedbackSynthesis | null;
  status: "completed" | "failed" | "deterministic_only";
  errorMessage: string | null;
}

interface FeedbackChangeLink {
  id: string;
  feedbackId: string;
  changeSummary: string;
  pullRequestOrCommit: string;
  verificationEvidence: string | null;
  createdAt: string;
  createdBy: string;
}

interface FeedbackAdminItem {
  id: string;
  ownerId: string;
  rating: number;
  task: string;
  comment: string;
  createdAt: string;
  ratingUx: number | null;
  ratingUsefulness: number | null;
  ratingAi: number | null;
  taskOutcome: FeedbackTaskOutcome;
  wouldRecommend: boolean | null;
  willingnessToPay: FeedbackWillingnessToPay;
  suggestedPriceUah: number | null;
  categoryTags: string[];
  testerRole: string;
  contactConsent: boolean;
  contactInfo: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  resolutionNote: string | null;
  resolvedCommitOrPr: string | null;
  resolvedAt: string | null;
  reviewedBy: string | null;
  notifyStatus: FeedbackNotifyStatus;
  notifyAttempts: number;
  notifiedAt: string | null;
  notifyError: string | null;
  aiTriage: SingleFeedbackTriage | null;
  aiTriagedAt: string | null;
  businessName: string | null;
  region: string | null;
  changeLinks: FeedbackChangeLink[];
}

interface TriageDraft {
  status: FeedbackStatus;
  priority: FeedbackPriority;
  resolutionNote: string;
  resolvedCommitOrPr: string;
}

interface ChangeLinkDraft {
  changeSummary: string;
  pullRequestOrCommit: string;
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Новий",
  reviewed: "Переглянуто",
  planned: "Заплановано",
  resolved: "Виправлено",
  dismissed: "Відхилено",
};

const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: FeedbackStatus | ""; label: string }> = [
  { value: "", label: "Всі" },
  { value: "new", label: "Нові" },
  { value: "reviewed", label: "Переглянуті" },
  { value: "planned", label: "Заплановані" },
  { value: "resolved", label: "Виправлені" },
  { value: "dismissed", label: "Відхилені" },
];

const STATUS_SELECT_OPTIONS: SelectOption[] = [
  { value: "new", label: "Новий" },
  { value: "reviewed", label: "Переглянуто" },
  { value: "planned", label: "Заплановано" },
  { value: "resolved", label: "Виправлено" },
  { value: "dismissed", label: "Відхилено" },
];

const PRIORITY_SELECT_OPTIONS: SelectOption[] = [
  { value: "low", label: "Низький" },
  { value: "medium", label: "Середній" },
  { value: "high", label: "Високий" },
  { value: "critical", label: "Критичний" },
];

const TASK_LABELS: Record<string, string> = {
  assistant: "Асистент",
  project: "Мої проєкти",
  budget: "Кошторис",
  catalog: "Каталог грантів",
  profile: "Профіль бізнесу",
  export: "Експорт",
};

const TASK_FILTER_OPTIONS: SelectOption[] = [
  { value: "", label: "Усі розділи" },
  { value: "assistant", label: "Асистент" },
  { value: "project", label: "Мої проєкти" },
  { value: "budget", label: "Кошторис" },
  { value: "catalog", label: "Каталог грантів" },
  { value: "profile", label: "Профіль бізнесу" },
  { value: "export", label: "Експорт" },
];

const RATING_BUCKETS: ReadonlyArray<{ value: RatingBucket; label: string }> = [
  { value: "", label: "Усі оцінки" },
  { value: "1-2", label: "1–2★" },
  { value: "3", label: "3★" },
  { value: "4-5", label: "4–5★" },
];

const ROLE_LABELS: Record<string, string> = {
  entrepreneur: "Підприємець",
  fop: "ФОП",
  startup_founder: "Засновник стартапу",
  accountant: "Бухгалтер/консультант",
  student_business: "Студент із бізнес-ідеєю",
  volunteer: "Волонтер",
  other: "Інше",
};

const OUTCOME_LABELS: Record<FeedbackTaskOutcome, string> = {
  completed: "Виконано повністю",
  partial: "Виконано частково",
  failed: "Не вдалося виконати",
  unspecified: "",
};

const WTP_LABELS: Record<FeedbackWillingnessToPay, string> = {
  none: "",
  free_only: "Лише безкоштовна версія",
  pay_per_application: "Разова оплата заявки",
  monthly_subscription: "Щомісячна підписка",
  donation_ready: "Донат на збір",
  already_paid: "Уже оплатив",
};

const NOTIFY_LABELS: Record<FeedbackNotifyStatus, string> = {
  sent: "Лист надіслано",
  failed: "Помилка листа",
  skipped: "Лист пропущено",
  pending: "Лист у черзі",
};

const CLUSTER_KIND_LABELS: Record<BatchSynthesisCluster["kind"], string> = {
  pain_point: "Точка болю",
  praise: "Сильна сторона",
  feature_request: "Запит на фічу",
};

const SEVERITY_LABELS: Record<BatchSynthesisCluster["severity"], string> = {
  blocker: "Блокер",
  major: "Суттєво",
  minor: "Незначно",
  positive: "Позитив",
};

const SENTIMENT_LABELS: Record<SingleFeedbackTriage["sentiment"], string> = {
  positive: "Позитивний",
  neutral: "Нейтральний",
  negative: "Негативний",
  mixed: "Змішаний",
};

const URGENCY_LABELS: Record<SingleFeedbackTriage["urgency"], string> = {
  blocker: "Блокер",
  major: "Важливо",
  minor: "Дрібне",
  suggestion: "Ідея",
  praise: "Похвала",
};

const RATING_KEYS: ReadonlyArray<"5" | "4" | "3" | "2" | "1"> = [
  "5",
  "4",
  "3",
  "2",
  "1",
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString("uk-UA", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Kyiv",
  });
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function statusPillTone(status: FeedbackStatus): string {
  if (status === "resolved") return "positive";
  if (status === "planned" || status === "reviewed") return "info";
  if (status === "new") return "warn";
  return "neutral";
}

function notifyPillTone(status: FeedbackNotifyStatus): string {
  if (status === "sent") return "positive";
  if (status === "failed") return "danger";
  if (status === "pending") return "warn";
  return "neutral";
}

function severityPillTone(severity: BatchSynthesisCluster["severity"]): string {
  if (severity === "blocker") return "danger";
  if (severity === "major") return "warn";
  if (severity === "positive") return "positive";
  return "neutral";
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FeedbackAdminDrawer({
  user,
  triggerClassName = "",
}: FeedbackAdminDrawerProps) {
  const titleId = useId();
  const [authorized, setAuthorized] = useState(false);
  const [statusData, setStatusData] = useState<AdminStatusResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const [banner, setBanner] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // Tab 1: Overview & AI Analysis
  const [metrics, setMetrics] = useState<DeterministicFeedbackMetrics | null>(null);
  const [latestSynthesis, setLatestSynthesis] =
    useState<FeedbackBatchSynthesisRecord | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Tab 2: Inbox & Triage
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [ratingBucket, setRatingBucket] = useState<RatingBucket>("");
  const [items, setItems] = useState<FeedbackAdminItem[]>([]);
  const [itemsTotal, setItemsTotal] = useState<number>(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [triageDrafts, setTriageDrafts] = useState<Record<string, TriageDraft>>({});
  const [savingTriageId, setSavingTriageId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [aiTriagingId, setAiTriagingId] = useState<string | null>(null);
  const [openChangeFormId, setOpenChangeFormId] = useState<string | null>(null);
  const [changeDrafts, setChangeDrafts] = useState<Record<string, ChangeLinkDraft>>({});
  const [savingChangeId, setSavingChangeId] = useState<string | null>(null);

  // Tab 3: Export
  const [markdownPreview, setMarkdownPreview] = useState<string>("");
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [exportBusyFormat, setExportBusyFormat] = useState<string | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const backdropMouseDownRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const loadStatus = useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      try {
        const response = await authenticatedRequest(
          user,
          "/api/admin/feedback/status",
          { signal },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setAuthorized(false);
            setOpen(false);
          }
          return false;
        }
        const data = (await response.json()) as AdminStatusResponse;
        if (!data || typeof data !== "object" || data.isAdmin !== true) {
          setAuthorized(false);
          return false;
        }
        setAuthorized(true);
        setStatusData(data);
        return true;
      } catch {
        return false;
      }
    },
    [user],
  );

  const loadMetrics = useCallback(
    async (signal?: AbortSignal) => {
      setMetricsLoading(true);
      try {
        const response = await authenticatedRequest(
          user,
          "/api/admin/feedback/metrics",
          { signal },
        );
        if (!response.ok) throw new ApiError("http", response.status);
        const data = (await response.json()) as {
          metrics: DeterministicFeedbackMetrics;
          latestSynthesis: FeedbackBatchSynthesisRecord | null;
        };
        setMetrics(data.metrics ?? null);
        setLatestSynthesis(data.latestSynthesis ?? null);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setBanner({
          tone: "error",
          text: readableApiError(error, "Не вдалося завантажити аналітику відгуків."),
        });
      } finally {
        if (!signal?.aborted) setMetricsLoading(false);
      }
    },
    [user],
  );

  const loadInbox = useCallback(
    async (signal?: AbortSignal) => {
      setItemsLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        if (taskFilter) params.set("task", taskFilter);
        if (ratingBucket === "1-2") {
          params.set("minRating", "1");
          params.set("maxRating", "2");
        } else if (ratingBucket === "3") {
          params.set("minRating", "3");
          params.set("maxRating", "3");
        } else if (ratingBucket === "4-5") {
          params.set("minRating", "4");
          params.set("maxRating", "5");
        }
        params.set("limit", "100");

        const query = params.toString();
        const response = await authenticatedRequest(
          user,
          `/api/admin/feedback${query ? `?${query}` : ""}`,
          { signal },
        );
        if (!response.ok) throw new ApiError("http", response.status);
        const data = (await response.json()) as {
          total: number;
          items: FeedbackAdminItem[];
        };
        const list = Array.isArray(data.items) ? data.items : [];
        setItems(list);
        setItemsTotal(typeof data.total === "number" ? data.total : list.length);
        setTriageDrafts((prev) => {
          const next = { ...prev };
          for (const item of list) {
            if (!next[item.id]) {
              next[item.id] = {
                status: item.status,
                priority: item.priority,
                resolutionNote: item.resolutionNote ?? "",
                resolvedCommitOrPr: item.resolvedCommitOrPr ?? "",
              };
            }
          }
          return next;
        });
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setBanner({
          tone: "error",
          text: readableApiError(error, "Не вдалося завантажити список відгуків."),
        });
      } finally {
        if (!signal?.aborted) setItemsLoading(false);
      }
    },
    [user, statusFilter, taskFilter, ratingBucket],
  );

  const loadMarkdownPreview = useCallback(
    async (signal?: AbortSignal) => {
      setExportLoading(true);
      try {
        const response = await authenticatedRequest(
          user,
          "/api/admin/feedback/export?format=markdown",
          { signal },
        );
        if (!response.ok) throw new ApiError("http", response.status);
        const text = await response.text();
        setMarkdownPreview(text);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setBanner({
          tone: "error",
          text: readableApiError(error, "Не вдалося сформувати перегляд звіту."),
        });
      } finally {
        if (!signal?.aborted) setExportLoading(false);
      }
    },
    [user],
  );

  // Probe admin authorization when mounted or user changes
  useEffect(() => {
    setAuthorized(false);
    setStatusData(null);
    setOpen(false);
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [user.uid, loadStatus]);

  // Load tab data when drawer is open
  useEffect(() => {
    if (!open || !authorized) return;
    const controller = new AbortController();
    if (activeTab === "overview") {
      void loadMetrics(controller.signal);
    } else if (activeTab === "inbox") {
      void loadInbox(controller.signal);
    } else if (activeTab === "export") {
      void loadMarkdownPreview(controller.signal);
    }
    return () => controller.abort();
  }, [open, authorized, activeTab, loadMetrics, loadInbox, loadMarkdownPreview]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Body scroll lock, focus trap, Escape handling
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeBtnRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[role="alertdialog"]')) return;

      if (event.key === "Escape") {
        if (drawerRef.current?.querySelector(".gf-select.is-open")) return;
        event.preventDefault();
        closeDrawer();
        return;
      }

      if (event.key !== "Tab") return;
      const container = drawerRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!activeEl || activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (!activeEl || activeEl === last || !container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeDrawer]);

  async function handleRunAnalysis() {
    if (analyzing) return;
    setAnalyzing(true);
    setBanner({ tone: "info", text: "Запускаємо розумний аналіз зібраних відгуків…" });

    try {
      const response = await authenticatedRequest(
        user,
        "/api/admin/feedback/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRefresh: true }),
        },
        60_000,
      );
      if (response.status === 429) {
        setBanner({
          tone: "error",
          text: "Аналіз уже виконується. Зачекайте завершення поточного запуску.",
        });
        return;
      }
      if (!response.ok) throw new ApiError("http", response.status);
      const data = (await response.json()) as {
        synthesis: FeedbackBatchSynthesisRecord;
      };
      setLatestSynthesis(data.synthesis ?? null);
      if (data.synthesis?.deterministicMetrics) {
        setMetrics(data.synthesis.deterministicMetrics);
      }
      setBanner({
        tone: data.synthesis?.status === "failed" ? "error" : "success",
        text:
          data.synthesis?.status === "deterministic_only"
            ? "Оновлено детермінований зріз метрик (живий ШІ-синтез вимкнено)."
            : data.synthesis?.status === "failed"
              ? `ШІ-синтез завершився помилкою: ${data.synthesis.errorMessage ?? "невідома помилка"}.`
              : "Розумний аналіз успішно оновлено з перевіреними цитатами.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося виконати аналіз відгуків."),
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveTriage(item: FeedbackAdminItem) {
    const draft = triageDrafts[item.id];
    if (!draft || savingTriageId) return;
    setSavingTriageId(item.id);
    setBanner(null);

    try {
      const response = await authenticatedRequest(
        user,
        `/api/admin/feedback/${encodeURIComponent(item.id)}/triage`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: draft.status,
            priority: draft.priority,
            resolutionNote: draft.resolutionNote.trim() || null,
            resolvedCommitOrPr: draft.resolvedCommitOrPr.trim() || null,
          }),
        },
      );
      if (!response.ok) throw new ApiError("http", response.status);
      const data = (await response.json()) as { feedback?: FeedbackAdminItem };
      if (data.feedback) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  ...data.feedback,
                  businessName: row.businessName,
                  region: row.region,
                  changeLinks: row.changeLinks,
                }
              : row,
          ),
        );
      }
      setBanner({ tone: "success", text: "Тріаж відгуку збережено." });
      void loadStatus();
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося зберегти тріаж відгуку."),
      });
    } finally {
      setSavingTriageId(null);
    }
  }

  async function handleRetryNotify(feedbackId: string) {
    if (notifyingId) return;
    setNotifyingId(feedbackId);
    setBanner(null);

    try {
      const response = await authenticatedRequest(
        user,
        `/api/admin/feedback/${encodeURIComponent(feedbackId)}/notify`,
        { method: "POST" },
      );
      if (!response.ok) throw new ApiError("http", response.status);
      setBanner({ tone: "success", text: "Повторну відправку листа виконано." });
      await loadInbox();
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося повторно надіслати лист."),
      });
    } finally {
      setNotifyingId(null);
    }
  }

  async function handleAiTriage(feedbackId: string) {
    if (aiTriagingId) return;
    setAiTriagingId(feedbackId);
    setBanner(null);

    try {
      const response = await authenticatedRequest(
        user,
        `/api/admin/feedback/${encodeURIComponent(feedbackId)}/ai-triage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRefresh: false }),
        },
        30_000,
      );
      if (!response.ok) throw new ApiError("http", response.status);
      const data = (await response.json()) as {
        aiTriage?: SingleFeedbackTriage;
        cached?: boolean;
      };
      if (data.aiTriage) {
        const triage = data.aiTriage;
        setItems((prev) =>
          prev.map((row) =>
            row.id === feedbackId ? { ...row, aiTriage: triage } : row,
          ),
        );
      }
      setBanner({
        tone: "success",
        text: data.cached
          ? "Використано кешований ШІ-тріаж для цього відгуку."
          : "ШІ-тріаж успішно виконано.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося виконати ШІ-тріаж."),
      });
    } finally {
      setAiTriagingId(null);
    }
  }

  async function handleAddChangeLink(event: FormEvent, feedbackId: string) {
    event.preventDefault();
    const draft = changeDrafts[feedbackId];
    if (!draft || savingChangeId) return;
    const summary = draft.changeSummary.trim();
    const prOrCommit = draft.pullRequestOrCommit.trim();
    if (summary.length < 5 || !prOrCommit) {
      setBanner({
        tone: "error",
        text: "Опишіть зміну (від 5 символів) і вкажіть номер PR або хеш коміту.",
      });
      return;
    }

    setSavingChangeId(feedbackId);
    setBanner(null);
    try {
      const response = await authenticatedRequest(
        user,
        `/api/admin/feedback/${encodeURIComponent(feedbackId)}/change-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changeSummary: summary,
            pullRequestOrCommit: prOrCommit,
          }),
        },
      );
      if (!response.ok) throw new ApiError("http", response.status);
      const data = (await response.json()) as { changeLink?: FeedbackChangeLink };
      if (data.changeLink) {
        const added = data.changeLink;
        setItems((prev) =>
          prev.map((row) =>
            row.id === feedbackId
              ? { ...row, changeLinks: [added, ...row.changeLinks] }
              : row,
          ),
        );
      }
      setChangeDrafts((prev) => ({
        ...prev,
        [feedbackId]: { changeSummary: "", pullRequestOrCommit: "" },
      }));
      setOpenChangeFormId(null);
      setBanner({ tone: "success", text: "Запис «Що змінили» збережено." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося додати запис про зміну."),
      });
    } finally {
      setSavingChangeId(null);
    }
  }

  async function handleExport(format: "markdown" | "csv" | "json") {
    if (exportBusyFormat) return;
    setExportBusyFormat(format);
    setBanner(null);

    try {
      const response = await authenticatedRequest(
        user,
        `/api/admin/feedback/export?format=${format}`,
      );
      if (!response.ok) throw new ApiError("http", response.status);
      const text = await response.text();
      if (format === "markdown") {
        setMarkdownPreview(text);
        triggerFileDownload(
          text,
          "grantfolio-feedback-report.md",
          "text/markdown;charset=utf-8",
        );
      } else if (format === "csv") {
        triggerFileDownload(
          text,
          "grantfolio-feedback-report.csv",
          "text/csv;charset=utf-8",
        );
      } else {
        triggerFileDownload(
          text,
          "grantfolio-feedback-report.json",
          "application/json;charset=utf-8",
        );
      }
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося завантажити експорт."),
      });
    } finally {
      setExportBusyFormat(null);
    }
  }

  async function handleCopyMarkdown() {
    if (exportBusyFormat) return;
    setExportBusyFormat("copy");
    setBanner(null);
    try {
      let text = markdownPreview;
      if (!text) {
        const response = await authenticatedRequest(
          user,
          "/api/admin/feedback/export?format=markdown",
        );
        if (!response.ok) throw new ApiError("http", response.status);
        text = await response.text();
        setMarkdownPreview(text);
      }
      await navigator.clipboard.writeText(text);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      setCopiedMarkdown(true);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedMarkdown(false);
        copyTimerRef.current = null;
      }, 2400);
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося скопіювати Markdown у буфер обміну."),
      });
    } finally {
      setExportBusyFormat(null);
    }
  }

  if (!authorized || !statusData) {
    return null;
  }

  const badgeCount =
    statusData.newCount > 0 ? statusData.newCount : statusData.totalCount;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fb-admin-trigger ${triggerClassName}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setBanner(null);
          setOpen(true);
          void loadStatus();
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Відгуки</span>
        {badgeCount > 0 && (
          <span
            className={`fb-admin-trigger-badge${statusData.newCount > 0 ? " fb-admin-trigger-badge--new" : ""}`}
            aria-label={
              statusData.newCount > 0
                ? `Нових відгуків: ${statusData.newCount}`
                : `Усього відгуків: ${statusData.totalCount}`
            }
          >
            {badgeCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="fb-admin-backdrop"
            onMouseDown={(event) => {
              backdropMouseDownRef.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
              if (backdropMouseDownRef.current && event.target === event.currentTarget) {
                closeDrawer();
              }
              backdropMouseDownRef.current = false;
            }}
          >
            <section
              ref={drawerRef}
              className="fb-admin-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
            >
              <div className="fb-admin-header">
                <div>
                  <div className="fb-admin-header-meta">
                    <p className="fb-admin-eyebrow">Адміністрування відгуків</p>
                    <span
                      className={`fb-admin-ai-pill ${
                        statusData.aiEnabled
                          ? "fb-admin-ai-pill--on"
                          : "fb-admin-ai-pill--off"
                      }`}
                    >
                      {statusData.aiEnabled ? "ШІ-аналіз увімкнено" : "Лише SQL-метрики"}
                    </span>
                  </div>
                  <h2 id={titleId} className="fb-admin-title">
                    Відгуки користувачів і розумна аналітика
                  </h2>
                </div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="fb-admin-close"
                  aria-label="Закрити панель відгуків"
                  onClick={closeDrawer}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="fb-admin-top">
                {banner && (
                  <p
                    className={`fb-admin-banner fb-admin-banner--${banner.tone}`}
                    role={banner.tone === "error" ? "alert" : "status"}
                  >
                    {banner.text}
                  </p>
                )}

                <div
                  className="fb-admin-tabs"
                  role="tablist"
                  aria-label="Розділи адмін-панелі відгуків"
                >
                  <button
                    type="button"
                    role="tab"
                    id="fb-admin-tab-overview"
                    aria-selected={activeTab === "overview"}
                    aria-controls="fb-admin-panel-overview"
                    className="fb-admin-tab"
                    onClick={() => setActiveTab("overview")}
                  >
                    <span>Огляд і ШІ-аналіз</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="fb-admin-tab-inbox"
                    aria-selected={activeTab === "inbox"}
                    aria-controls="fb-admin-panel-inbox"
                    className="fb-admin-tab"
                    onClick={() => setActiveTab("inbox")}
                  >
                    <span>Усі відгуки</span>
                    <span className="fb-admin-tab-count">{statusData.totalCount}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="fb-admin-tab-export"
                    aria-selected={activeTab === "export"}
                    aria-controls="fb-admin-panel-export"
                    className="fb-admin-tab"
                    onClick={() => setActiveTab("export")}
                  >
                    <span>Експорт для звіту</span>
                  </button>
                </div>
              </div>

              <div className="fb-admin-body">
                {activeTab === "overview" && (
                  <div
                    id="fb-admin-panel-overview"
                    role="tabpanel"
                    aria-labelledby="fb-admin-tab-overview"
                    className="fb-admin-stack"
                  >
                    {metricsLoading && !metrics ? (
                      <p className="fb-admin-empty" role="status">
                        Завантажуємо метрики зворотного зв’язку…
                      </p>
                    ) : !metrics || metrics.totalCount === 0 ? (
                      <div className="fb-admin-empty">
                        Ще немає жодного збереженого відгуку. Щойно тестувальники
                        поділяться оцінками, тут з’являться реальні SQL-метрики та
                        ШІ-синтез.
                      </div>
                    ) : (
                      <>
                        <div className="fb-admin-kpi-grid">
                          <div className="fb-admin-kpi-card">
                            <span className="fb-admin-kpi-label">
                              Унікальні тестувальники
                            </span>
                            <span className="fb-admin-kpi-value">
                              {metrics.uniqueTesters}
                            </span>
                            <span className="fb-admin-kpi-sub">
                              Усього відгуків: {metrics.totalCount}
                            </span>
                          </div>
                          <div className="fb-admin-kpi-card">
                            <span className="fb-admin-kpi-label">
                              Середня оцінка / CSAT
                            </span>
                            <span className="fb-admin-kpi-value">
                              {formatNumber(metrics.averageRating)} / 5
                            </span>
                            <span className="fb-admin-kpi-sub">
                              CSAT (4–5★): {formatPercent(metrics.csatPercent)}
                            </span>
                          </div>
                          <div className="fb-admin-kpi-card">
                            <span className="fb-admin-kpi-label">
                              Успішність завдань
                            </span>
                            <span className="fb-admin-kpi-value">
                              {formatPercent(metrics.taskCompletionRate)}
                            </span>
                            <span className="fb-admin-kpi-sub">
                              Рекомендують: {formatPercent(metrics.recommendPercent)}
                            </span>
                          </div>
                          <div className="fb-admin-kpi-card">
                            <span className="fb-admin-kpi-label">
                              Готовність платити
                            </span>
                            <span className="fb-admin-kpi-value">
                              {formatPercent(metrics.willingnessToPayPercent)}
                            </span>
                            <span className="fb-admin-kpi-sub">
                              Донати: {metrics.actualDonations.count} (
                              {metrics.actualDonations.totalUah} грн) · Пілот:{" "}
                              {metrics.pilotPayments.count} (
                              {metrics.pilotPayments.totalUah} грн)
                            </span>
                          </div>
                        </div>

                        <div className="fb-admin-two-col">
                          <section className="fb-admin-card">
                            <div className="fb-admin-card-head">
                              <h3 className="fb-admin-card-title">
                                Розподіл оцінок
                              </h3>
                            </div>
                            <div className="fb-admin-hist">
                              {RATING_KEYS.map((starKey) => {
                                const count = metrics.ratingDistribution[starKey] ?? 0;
                                const pct =
                                  metrics.totalCount > 0
                                    ? Math.round((count / metrics.totalCount) * 100)
                                    : 0;
                                return (
                                  <div key={starKey} className="fb-admin-hist-row">
                                    <span className="fb-admin-hist-label">
                                      {starKey}★
                                    </span>
                                    <div className="fb-admin-hist-track">
                                      <div
                                        className="fb-admin-hist-fill"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="fb-admin-hist-count">
                                      {count} ({pct}%)
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {(metrics.dimensionAverages.ux !== null ||
                              metrics.dimensionAverages.usefulness !== null ||
                              metrics.dimensionAverages.ai !== null) && (
                              <div className="fb-admin-dims">
                                <span className="fb-admin-dim-chip">
                                  UX: {formatNumber(metrics.dimensionAverages.ux)} / 5
                                </span>
                                <span className="fb-admin-dim-chip">
                                  Функціонал:{" "}
                                  {formatNumber(metrics.dimensionAverages.usefulness)} / 5
                                </span>
                                <span className="fb-admin-dim-chip">
                                  ШІ: {formatNumber(metrics.dimensionAverages.ai)} / 5
                                </span>
                              </div>
                            )}
                          </section>

                          <section className="fb-admin-card">
                            <div className="fb-admin-card-head">
                              <h3 className="fb-admin-card-title">
                                Популярні теги та розділи
                              </h3>
                            </div>
                            {metrics.topTags.length > 0 ? (
                              <div className="fb-admin-tag-list">
                                {metrics.topTags.map((entry) => (
                                  <span
                                    key={entry.tag}
                                    className="fb-admin-tag-chip"
                                  >
                                    <span>{entry.tag}</span>
                                    <strong>{entry.count}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="fb-admin-card-sub">
                                Теги ще не накопичені.
                              </p>
                            )}
                            <div className="fb-admin-task-list">
                              {Object.entries(metrics.taskBreakdown).map(
                                ([taskKey, count]) => (
                                  <div key={taskKey} className="fb-admin-task-row">
                                    <span>{TASK_LABELS[taskKey] ?? taskKey}</span>
                                    <strong>{count}</strong>
                                  </div>
                                ),
                              )}
                            </div>
                          </section>
                        </div>

                        <section className="fb-admin-card">
                          <div className="fb-admin-card-head">
                            <div>
                              <h3 className="fb-admin-card-title">
                                Розумний аналіз і перевірені кластери
                              </h3>
                              <p className="fb-admin-card-sub">
                                {latestSynthesis
                                  ? `Останній запуск: ${formatDateTime(latestSynthesis.createdAt)} · проаналізовано ${latestSynthesis.feedbackCount} відгуків`
                                  : "Синтез ще не запускався. Натисніть кнопку праворуч, щоб згрупувати відгуки."}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="fb-admin-btn-primary"
                              disabled={analyzing}
                              onClick={() => void handleRunAnalysis()}
                            >
                              {analyzing
                                ? "Аналізуємо…"
                                : "Запустити розумний аналіз"}
                            </button>
                          </div>

                          {!latestSynthesis ? (
                            <div className="fb-admin-note-box">
                              Детерміновані SQL-метрики активні завжди. Для
                              кластеризації болей, похвал і пріоритетів із
                              перевіреними цитатами запустіть аналіз.
                            </div>
                          ) : latestSynthesis.status === "deterministic_only" ? (
                            <div className="fb-admin-note-box">
                              Живий ШІ-аналіз наразі вимкнено на сервері
                              (потрібен прапорець <code>SMART_FEEDBACK_AI_ENABLED=true</code>{" "}
                              та ключ Gemini). Детерміновані SQL-метрики вище
                              працюють у повному обсязі.
                            </div>
                          ) : latestSynthesis.status === "failed" ? (
                            <div className="fb-admin-note-box">
                              Останній запуск ШІ-синтезу завершився помилкою:{" "}
                              {latestSynthesis.errorMessage ?? "невідома помилка"}.
                            </div>
                          ) : latestSynthesis.aiSynthesis ? (
                            <div>
                              <p className="fb-admin-summary-text">
                                {latestSynthesis.aiSynthesis.executiveSummaryUk}
                              </p>

                              <div className="fb-admin-pills">
                                <span className="fb-admin-pill fb-admin-pill--positive">
                                  Позитивні:{" "}
                                  {latestSynthesis.aiSynthesis.sentimentBreakdown.positive}
                                </span>
                                <span className="fb-admin-pill fb-admin-pill--neutral">
                                  Нейтральні:{" "}
                                  {latestSynthesis.aiSynthesis.sentimentBreakdown.neutral}
                                </span>
                                <span className="fb-admin-pill fb-admin-pill--warn">
                                  Змішані:{" "}
                                  {latestSynthesis.aiSynthesis.sentimentBreakdown.mixed}
                                </span>
                                <span className="fb-admin-pill fb-admin-pill--danger">
                                  Негативні:{" "}
                                  {latestSynthesis.aiSynthesis.sentimentBreakdown.negative}
                                </span>
                                {latestSynthesis.aiSynthesis.verification && (
                                  <span className="fb-admin-pill fb-admin-pill--info">
                                    Перевірених цитат:{" "}
                                    {
                                      latestSynthesis.aiSynthesis.verification
                                        .verifiedQuotesCount
                                    }
                                  </span>
                                )}
                              </div>

                              {latestSynthesis.aiSynthesis.clusters.length > 0 && (
                                <div className="fb-admin-cluster-list">
                                  {latestSynthesis.aiSynthesis.clusters.map(
                                    (cluster, idx) => (
                                      <article
                                        key={`${cluster.title}-${idx}`}
                                        className="fb-admin-cluster"
                                      >
                                        <div className="fb-admin-cluster-head">
                                          <h4 className="fb-admin-cluster-title">
                                            {cluster.title}
                                          </h4>
                                          <div className="fb-admin-pills">
                                            <span className="fb-admin-pill fb-admin-pill--info">
                                              {CLUSTER_KIND_LABELS[cluster.kind]}
                                            </span>
                                            <span
                                              className={`fb-admin-pill fb-admin-pill--${severityPillTone(cluster.severity)}`}
                                            >
                                              {SEVERITY_LABELS[cluster.severity]}
                                            </span>
                                            <span className="fb-admin-pill fb-admin-pill--neutral">
                                              Відгуків: {cluster.feedbackIds.length}
                                            </span>
                                          </div>
                                        </div>
                                        <p className="fb-admin-cluster-summary">
                                          {cluster.summaryUk}
                                        </p>
                                        {cluster.verbatimQuotes.length > 0 && (
                                          <div className="fb-admin-quotes">
                                            <span className="fb-admin-quotes-label">
                                              Перевірені цитати
                                            </span>
                                            {cluster.verbatimQuotes.map(
                                              (q, qIdx) => (
                                                <blockquote
                                                  key={`${q.feedbackId}-${qIdx}`}
                                                  className="fb-admin-quote-item"
                                                >
                                                  «{q.quote}»
                                                </blockquote>
                                              ),
                                            )}
                                          </div>
                                        )}
                                        <p className="fb-admin-cluster-fix">
                                          <strong>Рекомендована дія:</strong>{" "}
                                          {cluster.recommendedFixUk}
                                        </p>
                                      </article>
                                    ),
                                  )}
                                </div>
                              )}

                              {latestSynthesis.aiSynthesis.topPriorities.length > 0 && (
                                <div style={{ marginTop: 14 }}>
                                  <h4 className="fb-admin-cluster-title">
                                    Пріоритети на виправлення
                                  </h4>
                                  <ol className="fb-admin-sublist">
                                    {latestSynthesis.aiSynthesis.topPriorities.map(
                                      (prio, idx) => (
                                        <li key={`${prio.title}-${idx}`}>
                                          <strong>{prio.title}</strong> —{" "}
                                          {prio.rationaleUk}
                                        </li>
                                      ),
                                    )}
                                  </ol>
                                </div>
                              )}

                              {latestSynthesis.aiSynthesis.blindSpotsUk.length > 0 && (
                                <div style={{ marginTop: 14 }}>
                                  <h4 className="fb-admin-cluster-title">
                                    Прогалини даних (що ще варто перевірити)
                                  </h4>
                                  <ul className="fb-admin-sublist">
                                    {latestSynthesis.aiSynthesis.blindSpotsUk.map(
                                      (spot, idx) => (
                                        <li key={idx}>{spot}</li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </section>
                      </>
                    )}
                  </div>
                )}

                {activeTab === "inbox" && (
                  <div
                    id="fb-admin-panel-inbox"
                    role="tabpanel"
                    aria-labelledby="fb-admin-tab-inbox"
                    className="fb-admin-stack"
                  >
                    <div className="fb-admin-filters">
                      <div
                        className="fb-admin-filter-row"
                        role="group"
                        aria-label="Фільтр за статусом"
                      >
                        {STATUS_FILTER_OPTIONS.map((opt) => (
                          <button
                            key={opt.value || "all"}
                            type="button"
                            className="fb-admin-filter-pill"
                            aria-pressed={statusFilter === opt.value}
                            onClick={() => setStatusFilter(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="fb-admin-filter-row">
                        <div className="fb-admin-filter-select-wrap">
                          <CustomSelect
                            ariaLabel="Фільтр за розділом"
                            value={taskFilter}
                            options={TASK_FILTER_OPTIONS}
                            onChange={setTaskFilter}
                          />
                        </div>
                        <div
                          className="fb-admin-filter-row"
                          role="group"
                          aria-label="Фільтр за оцінкою"
                        >
                          {RATING_BUCKETS.map((bucket) => (
                            <button
                              key={bucket.value || "all"}
                              type="button"
                              className="fb-admin-filter-pill"
                              aria-pressed={ratingBucket === bucket.value}
                              onClick={() => setRatingBucket(bucket.value)}
                            >
                              {bucket.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {itemsLoading ? (
                      <p className="fb-admin-empty" role="status">
                        Завантажуємо відгуки…
                      </p>
                    ) : items.length === 0 ? (
                      <div className="fb-admin-empty">
                        За вибраними фільтрами відгуків не знайдено.
                      </div>
                    ) : (
                      <>
                        <p className="fb-admin-card-sub" style={{ margin: 0 }}>
                          Показано {items.length} із {itemsTotal} відгуків
                        </p>
                        {items.map((item) => {
                          const draft = triageDrafts[item.id] ?? {
                            status: item.status,
                            priority: item.priority,
                            resolutionNote: item.resolutionNote ?? "",
                            resolvedCommitOrPr: item.resolvedCommitOrPr ?? "",
                          };
                          const changeDraft = changeDrafts[item.id] ?? {
                            changeSummary: "",
                            pullRequestOrCommit: "",
                          };
                          const showChangeForm = openChangeFormId === item.id;

                          return (
                            <article key={item.id} className="fb-admin-item-card">
                              <div className="fb-admin-item-head">
                                <div>
                                  <span className="fb-admin-stars-inline">
                                    {"★".repeat(item.rating)}
                                    {"☆".repeat(Math.max(0, 5 - item.rating))}{" "}
                                    {item.rating}/5
                                  </span>
                                  <p className="fb-admin-item-meta">
                                    {formatDateTime(item.createdAt)} ·{" "}
                                    {ROLE_LABELS[item.testerRole] ?? item.testerRole}
                                    {item.businessName ? ` · ${item.businessName}` : ""}
                                    {item.region ? ` · ${item.region}` : ""}
                                  </p>
                                </div>
                                <div className="fb-admin-pills">
                                  <span className="fb-admin-pill fb-admin-pill--info">
                                    {TASK_LABELS[item.task] ?? item.task}
                                  </span>
                                  <span
                                    className={`fb-admin-pill fb-admin-pill--${statusPillTone(item.status)}`}
                                  >
                                    {STATUS_LABELS[item.status]}
                                  </span>
                                  <span
                                    className={`fb-admin-pill fb-admin-pill--${notifyPillTone(item.notifyStatus)}`}
                                    title={item.notifyError ?? undefined}
                                  >
                                    {NOTIFY_LABELS[item.notifyStatus]}
                                  </span>
                                </div>
                              </div>

                              <p className="fb-admin-item-comment">{item.comment}</p>

                              <div className="fb-admin-item-details">
                                {item.categoryTags.map((tag) => (
                                  <span key={tag} className="fb-admin-tag-chip">
                                    {tag}
                                  </span>
                                ))}
                                {item.ratingUx !== null && (
                                  <span className="fb-admin-pill fb-admin-pill--neutral">
                                    UX: {item.ratingUx}/5
                                  </span>
                                )}
                                {item.ratingUsefulness !== null && (
                                  <span className="fb-admin-pill fb-admin-pill--neutral">
                                    Функціонал: {item.ratingUsefulness}/5
                                  </span>
                                )}
                                {item.ratingAi !== null && (
                                  <span className="fb-admin-pill fb-admin-pill--neutral">
                                    ШІ: {item.ratingAi}/5
                                  </span>
                                )}
                                {item.taskOutcome !== "unspecified" && (
                                  <span className="fb-admin-pill fb-admin-pill--neutral">
                                    {OUTCOME_LABELS[item.taskOutcome]}
                                  </span>
                                )}
                                {item.wouldRecommend !== null && (
                                  <span
                                    className={`fb-admin-pill fb-admin-pill--${item.wouldRecommend ? "positive" : "warn"}`}
                                  >
                                    {item.wouldRecommend
                                      ? "Рекомендує"
                                      : "Не рекомендує"}
                                  </span>
                                )}
                                {item.willingnessToPay !== "none" && (
                                  <span className="fb-admin-pill fb-admin-pill--info">
                                    {WTP_LABELS[item.willingnessToPay]}
                                    {item.suggestedPriceUah !== null
                                      ? ` (${item.suggestedPriceUah} грн)`
                                      : ""}
                                  </span>
                                )}
                                {item.contactConsent && item.contactInfo && (
                                  <span className="fb-admin-pill fb-admin-pill--positive">
                                    Контакт: {item.contactInfo}
                                  </span>
                                )}
                              </div>

                              {item.aiTriage && (
                                <div className="fb-admin-ai-box">
                                  <div
                                    className="fb-admin-pills"
                                    style={{ marginBottom: 6 }}
                                  >
                                    <span className="fb-admin-pill fb-admin-pill--info">
                                      ШІ-тріаж:{" "}
                                      {SENTIMENT_LABELS[item.aiTriage.sentiment]}
                                    </span>
                                    <span className="fb-admin-pill fb-admin-pill--warn">
                                      {URGENCY_LABELS[item.aiTriage.urgency]}
                                    </span>
                                    {item.aiTriage.themes.map((theme) => (
                                      <span
                                        key={theme}
                                        className="fb-admin-pill fb-admin-pill--neutral"
                                      >
                                        {theme}
                                      </span>
                                    ))}
                                  </div>
                                  <div>{item.aiTriage.summaryUk}</div>
                                  <div style={{ marginTop: 4 }}>
                                    <strong>Рекомендація:</strong>{" "}
                                    {item.aiTriage.suggestedActionUk}
                                  </div>
                                </div>
                              )}

                              <div className="fb-admin-triage-panel">
                                <div className="fb-admin-triage-grid">
                                  <div className="fb-admin-field">
                                    <span className="fb-admin-field-label">
                                      Статус тріажу
                                    </span>
                                    <CustomSelect
                                      ariaLabel={`Статус для відгуку ${item.id}`}
                                      value={draft.status}
                                      options={STATUS_SELECT_OPTIONS}
                                      onChange={(val) =>
                                        setTriageDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            ...draft,
                                            status: val as FeedbackStatus,
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="fb-admin-field">
                                    <span className="fb-admin-field-label">
                                      Пріоритет
                                    </span>
                                    <CustomSelect
                                      ariaLabel={`Пріоритет для відгуку ${item.id}`}
                                      value={draft.priority}
                                      options={PRIORITY_SELECT_OPTIONS}
                                      onChange={(val) =>
                                        setTriageDrafts((prev) => ({
                                          ...prev,
                                          [item.id]: {
                                            ...draft,
                                            priority: val as FeedbackPriority,
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="fb-admin-field">
                                    <label className="fb-admin-field-label">
                                      Нотатка рішення
                                      <input
                                        type="text"
                                        className="fb-admin-input"
                                        maxLength={2000}
                                        placeholder="Що вирішили або виправили"
                                        value={draft.resolutionNote}
                                        onChange={(e) =>
                                          setTriageDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: {
                                              ...draft,
                                              resolutionNote: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>
                                  <div className="fb-admin-field">
                                    <label className="fb-admin-field-label">
                                      Коміт або PR
                                      <input
                                        type="text"
                                        className="fb-admin-input"
                                        maxLength={120}
                                        placeholder="Напр., PR #42 або a1b2c3d"
                                        value={draft.resolvedCommitOrPr}
                                        onChange={(e) =>
                                          setTriageDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: {
                                              ...draft,
                                              resolvedCommitOrPr: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>
                                </div>

                                <div className="fb-admin-action-row">
                                  <div className="fb-admin-pills">
                                    <button
                                      type="button"
                                      className="fb-admin-btn-primary fb-admin-btn-compact"
                                      disabled={savingTriageId === item.id}
                                      onClick={() => void handleSaveTriage(item)}
                                    >
                                      {savingTriageId === item.id
                                        ? "Збереження…"
                                        : "Зберегти тріаж"}
                                    </button>
                                    <button
                                      type="button"
                                      className="fb-admin-btn-secondary fb-admin-btn-compact"
                                      disabled={notifyingId === item.id}
                                      onClick={() => void handleRetryNotify(item.id)}
                                    >
                                      {notifyingId === item.id
                                        ? "Надсилаємо…"
                                        : "Повторити лист"}
                                    </button>
                                    {statusData.aiEnabled && (
                                      <button
                                        type="button"
                                        className="fb-admin-btn-secondary fb-admin-btn-compact"
                                        disabled={aiTriagingId === item.id}
                                        onClick={() => void handleAiTriage(item.id)}
                                      >
                                        {aiTriagingId === item.id
                                          ? "ШІ-тріаж…"
                                          : "ШІ-тріаж"}
                                      </button>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    className="fb-admin-btn-secondary fb-admin-btn-compact"
                                    aria-expanded={showChangeForm}
                                    onClick={() =>
                                      setOpenChangeFormId(
                                        showChangeForm ? null : item.id,
                                      )
                                    }
                                  >
                                    {showChangeForm
                                      ? "Згорнути «Що змінили»"
                                      : `+ Додати запис «Що змінили» (${item.changeLinks.length})`}
                                  </button>
                                </div>

                                {(item.changeLinks.length > 0 || showChangeForm) && (
                                  <div className="fb-admin-changes">
                                    {item.changeLinks.length > 0 && (
                                      <div className="fb-admin-change-list">
                                        {item.changeLinks.map((link) => (
                                          <div
                                            key={link.id}
                                            className="fb-admin-change-item"
                                          >
                                            <div>{link.changeSummary}</div>
                                            <div className="fb-admin-change-meta">
                                              {link.pullRequestOrCommit} ·{" "}
                                              {formatDateTime(link.createdAt)} ·{" "}
                                              {link.createdBy}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {showChangeForm && (
                                      <form
                                        className="fb-admin-triage-grid"
                                        onSubmit={(e) =>
                                          void handleAddChangeLink(e, item.id)
                                        }
                                      >
                                        <div className="fb-admin-field">
                                          <label className="fb-admin-field-label">
                                            Що саме змінили (від 5 символів)
                                            <input
                                              type="text"
                                              className="fb-admin-input"
                                              maxLength={1000}
                                              placeholder="Спростили форму кошторису та додали підказку"
                                              value={changeDraft.changeSummary}
                                              onChange={(e) =>
                                                setChangeDrafts((prev) => ({
                                                  ...prev,
                                                  [item.id]: {
                                                    ...changeDraft,
                                                    changeSummary: e.target.value,
                                                  },
                                                }))
                                              }
                                            />
                                          </label>
                                        </div>
                                        <div className="fb-admin-field">
                                          <label className="fb-admin-field-label">
                                            PR або коміт (обов’язково)
                                            <input
                                              type="text"
                                              className="fb-admin-input"
                                              maxLength={120}
                                              placeholder="PR #48 або c59239d"
                                              value={changeDraft.pullRequestOrCommit}
                                              onChange={(e) =>
                                                setChangeDrafts((prev) => ({
                                                  ...prev,
                                                  [item.id]: {
                                                    ...changeDraft,
                                                    pullRequestOrCommit:
                                                      e.target.value,
                                                  },
                                                }))
                                              }
                                            />
                                          </label>
                                        </div>
                                        <div>
                                          <button
                                            type="submit"
                                            className="fb-admin-btn-primary fb-admin-btn-compact"
                                            disabled={savingChangeId === item.id}
                                          >
                                            {savingChangeId === item.id
                                              ? "Збереження…"
                                              : "Зберегти зміну"}
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {activeTab === "export" && (
                  <div
                    id="fb-admin-panel-export"
                    role="tabpanel"
                    aria-labelledby="fb-admin-tab-export"
                    className="fb-admin-stack"
                  >
                    <section className="fb-admin-card">
                      <div className="fb-admin-card-head">
                        <div>
                          <h3 className="fb-admin-card-title">
                            Експорт фактичних даних для PDF-звіту
                          </h3>
                          <p className="fb-admin-card-sub">
                            Вивантаження формується виключно з реальних записів
                            PostgreSQL (оцінки, коментарі, прив’язки «Що змінили»,
                            фактичні донати та пілотні платежі) — без вигаданих
                            прикладів, відповідно до вимог звіту на 19 листопада.
                          </p>
                        </div>
                      </div>

                      <div className="fb-admin-export-actions">
                        <button
                          type="button"
                          className="fb-admin-btn-primary"
                          disabled={exportBusyFormat !== null}
                          onClick={() => void handleExport("markdown")}
                        >
                          {exportBusyFormat === "markdown"
                            ? "Завантаження…"
                            : "Завантажити Markdown (.md)"}
                        </button>
                        <button
                          type="button"
                          className="fb-admin-btn-secondary"
                          disabled={exportBusyFormat !== null}
                          onClick={() => void handleCopyMarkdown()}
                        >
                          {copiedMarkdown
                            ? "Скопійовано у буфер"
                            : "Скопіювати Markdown"}
                        </button>
                        <button
                          type="button"
                          className="fb-admin-btn-secondary"
                          disabled={exportBusyFormat !== null}
                          onClick={() => void handleExport("csv")}
                        >
                          {exportBusyFormat === "csv"
                            ? "Завантаження…"
                            : "Завантажити CSV (.csv)"}
                        </button>
                        <button
                          type="button"
                          className="fb-admin-btn-secondary"
                          disabled={exportBusyFormat !== null}
                          onClick={() => void handleExport("json")}
                        >
                          {exportBusyFormat === "json"
                            ? "Завантаження…"
                            : "Завантажити JSON (.json)"}
                        </button>
                        <button
                          type="button"
                          className="fb-admin-btn-secondary"
                          disabled={exportLoading}
                          onClick={() => void loadMarkdownPreview()}
                        >
                          {exportLoading ? "Оновлення…" : "Оновити перегляд"}
                        </button>
                      </div>
                    </section>

                    <section className="fb-admin-card">
                      <div className="fb-admin-card-head">
                        <h3 className="fb-admin-card-title">
                          Попередній перегляд Markdown
                        </h3>
                      </div>
                      {exportLoading && !markdownPreview ? (
                        <p className="fb-admin-empty" role="status">
                          Формуємо попередній перегляд звіту…
                        </p>
                      ) : (
                        <pre className="fb-admin-preview">
                          {markdownPreview || "Попередній перегляд порожній."}
                        </pre>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
