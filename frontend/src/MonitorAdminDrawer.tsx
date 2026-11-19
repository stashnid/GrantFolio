import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import { ApiError, authenticatedRequest, readableApiError } from "./api";
import "./MonitorAdminDrawer.css";

type ProposalStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "auto_applied";

type MonitorSnapshot = {
  programId: string;
  programTitle: string;
  sourceUrl: string;
  sourceType: string;
  cadenceHours: number;
  autoPromoteAvailability: boolean;
  extractionStatus: string;
  fetchedAt: string | null;
  lastChangedAt: string | null;
  verifierErrors: string[];
  lastError: string | null;
};

type MonitorStatusResponse = {
  aiEnabled: boolean;
  summary: {
    totalProfiles: number;
    pendingProposals: number;
    verified: number;
    unmodified: number;
    verifierFailed: number;
    aiDisabled: number;
    fetchErrors: number;
    proposalCounts?: Record<ProposalStatus, number>;
  };
  snapshots: MonitorSnapshot[];
};

type MonitorProposal = {
  id: string;
  programId: string;
  programTitle: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  evidenceQuote: string;
  confidence: string;
  status: ProposalStatus;
  detectedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
};

type RunSummary = {
  total?: number;
  unmodified?: number;
  verified?: number;
  verifierFailed?: number;
  aiDisabled?: number;
  failed?: number;
  skipped?: number;
  proposalsCreated?: number;
};

type Props = {
  active: boolean;
  onCatalogMutated?: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  amount: "Сума фінансування",
  eligibilityUkraine: "Умови для України",
  requiredDocuments: "Необхідні документи",
  applicationFormat: "Формат подання",
  allowedCosts: "Дозволені витрати",
  availability: "Доступність прийому",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Висока впевненість",
  medium: "Середня впевненість",
  low: "Низька впевненість",
};

const SNAPSHOT_STATUS_LABELS: Record<string, string> = {
  verified: "Перевірено",
  unmodified: "Без змін",
  ai_disabled: "ШІ вимкнено",
  verifier_failed: "Помилка верифікації",
  fetch_error: "Помилка доступу",
  llm_error: "Помилка доступу",
  never_run: "Ще не перевірялось",
};

const PROPOSAL_FILTERS: ReadonlyArray<{ value: ProposalStatus; label: string }> = [
  { value: "pending_review", label: "Очікують перевірки" },
  { value: "auto_applied", label: "Автозастосовано" },
  { value: "approved", label: "Підтверджено" },
  { value: "rejected", label: "Відхилено" },
];

const AVAILABILITY_STATE_LABELS: Record<string, string> = {
  open: "Прийом відкрито",
  closed: "Прийом завершено / закрито",
  unknown: "Статус не підтверджено",
};

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

function formatDiffValue(value: unknown, fieldName: string): string {
  if (value === null || value === undefined || value === "") {
    return "Не зазначено";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const lines = value.map((item) => `• ${String(item)}`);
    return lines.length > 0 ? lines.join("\n") : "Не зазначено";
  }
  if (typeof value === "object" && fieldName === "availability") {
    const a = value as Record<string, unknown>;
    const lines: string[] = [];
    if (typeof a.state === "string") {
      lines.push(`Статус: ${AVAILABILITY_STATE_LABELS[a.state] ?? a.state}`);
    }
    if (a.rolling === true) {
      lines.push("Режим: постійний прийом");
    }
    if (typeof a.startsAt === "string" && a.startsAt) {
      lines.push(`Початок: ${formatDateTime(a.startsAt)}`);
    }
    if (typeof a.deadlineAt === "string" && a.deadlineAt) {
      lines.push(`Дедлайн: ${formatDateTime(a.deadlineAt)}`);
    }
    if (typeof a.evidence === "string" && a.evidence) {
      lines.push(`Підстава: ${a.evidence}`);
    }
    return lines.length > 0 ? lines.join("\n") : JSON.stringify(value, null, 2);
  }
  return JSON.stringify(value, null, 2);
}

export function MonitorAdminDrawer({ active, onCatalogMutated }: Props) {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authorized, setAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [statusData, setStatusData] = useState<MonitorStatusResponse | null>(null);
  const [drawerTab, setDrawerTab] = useState<"proposals" | "sources">("proposals");
  const [proposalFilter, setProposalFilter] = useState<ProposalStatus>("pending_review");
  const [proposals, setProposals] = useState<MonitorProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [runningProgramId, setRunningProgramId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setAuthorized(false);
        setOpen(false);
        setStatusData(null);
        setProposals([]);
      }
    });
    return unsubscribe;
  }, []);

  const loadStatus = useCallback(
    async (currentUser: User, signal?: AbortSignal): Promise<boolean> => {
      try {
        const response = await authenticatedRequest(
          currentUser,
          "/api/admin/monitor/status",
          { signal },
        );
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setAuthorized(false);
            setOpen(false);
          }
          return false;
        }
        const data = (await response.json()) as MonitorStatusResponse;
        if (!data || typeof data !== "object" || !data.summary) return false;
        setAuthorized(true);
        setStatusData(data);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const loadProposals = useCallback(
    async (
      currentUser: User,
      filter: ProposalStatus,
      signal?: AbortSignal,
    ) => {
      setProposalsLoading(true);
      try {
        const response = await authenticatedRequest(
          currentUser,
          `/api/admin/monitor/proposals?status=${encodeURIComponent(filter)}`,
          { signal },
        );
        if (!response.ok) {
          throw new ApiError("http", response.status);
        }
        const data = (await response.json()) as { proposals?: MonitorProposal[] };
        setProposals(Array.isArray(data.proposals) ? data.proposals : []);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setBanner({
          tone: "error",
          text: readableApiError(error, "Не вдалося завантажити чергу змін."),
        });
      } finally {
        if (!signal?.aborted) {
          setProposalsLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!active || !user) return;
    const controller = new AbortController();
    void loadStatus(user, controller.signal);
    return () => controller.abort();
  }, [active, user, loadStatus]);

  useEffect(() => {
    if (!open || !user || !authorized) return;
    const controller = new AbortController();
    void loadProposals(user, proposalFilter, controller.signal);
    return () => controller.abort();
  }, [open, user, authorized, proposalFilter, loadProposals]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const closeDrawer = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleRun = async (programId?: string) => {
    if (!user || runningProgramId !== null) return;
    setRunningProgramId(programId ?? "__all__");
    setBanner({
      tone: "info",
      text: programId
        ? "Запущено перевірку обраного джерела…"
        : "Запущено перевірку усіх джерел моніторингу…",
    });

    try {
      const response = await authenticatedRequest(
        user,
        "/api/admin/monitor/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(programId ? { programId } : {}),
        },
        60_000,
      );
      if (response.status === 429) {
        setBanner({
          tone: "error",
          text: "Перевірка вже виконується. Зачекайте завершення поточного запуску.",
        });
        return;
      }
      if (!response.ok) {
        throw new ApiError("http", response.status);
      }
      const payload = (await response.json()) as { summary?: RunSummary };
      const s = payload.summary;
      const summaryText = s
        ? `Перевірку завершено: перевірено ${s.verified ?? 0}, без змін ${s.unmodified ?? 0}, нових пропозицій ${s.proposalsCreated ?? 0}, помилок ${(s.failed ?? 0) + (s.verifierFailed ?? 0)}.`
        : "Перевірку джерел завершено.";
      setBanner({ tone: "success", text: summaryText });
      await loadStatus(user);
      await loadProposals(user, proposalFilter);
      onCatalogMutated?.();
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося виконати перевірку джерел."),
      });
    } finally {
      setRunningProgramId(null);
    }
  };

  const handleReview = async (
    proposal: MonitorProposal,
    decision: "approved" | "rejected",
  ) => {
    if (!user || reviewingId !== null) return;
    setReviewingId(proposal.id);
    setBanner(null);

    try {
      const note = notesById[proposal.id]?.trim();
      const response = await authenticatedRequest(
        user,
        `/api/admin/monitor/proposals/${encodeURIComponent(proposal.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            ...(note ? { notes: note } : {}),
          }),
        },
      );
      if (response.status === 409) {
        const result = await response.json().catch(() => null);
        setBanner({
          tone: "info",
          text: result?.error === "availability_requires_service_confirmation"
            ? "Відкриття прийому потребує збігу календаря зі строком на сторінці послуги."
            : "Цю пропозицію вже розглянуто раніше. Список оновлено.",
        });
        await loadStatus(user);
        await loadProposals(user, proposalFilter);
        return;
      }
      if (!response.ok) {
        throw new ApiError("http", response.status);
      }

      setNotesById((prev) => {
        const next = { ...prev };
        delete next[proposal.id];
        return next;
      });

      const appliedAvailability =
        decision === "approved" && proposal.fieldName === "availability";
      setBanner({
        tone: "success",
        text: appliedAvailability
          ? `Доступність для «${proposal.programTitle}» підтверджено та оновлено в каталозі.`
          : decision === "approved"
            ? `Зміну для «${proposal.programTitle}» підтверджено.`
            : `Пропозицію для «${proposal.programTitle}» відхилено.`,
      });

      await loadStatus(user);
      await loadProposals(user, proposalFilter);
      if (appliedAvailability) {
        onCatalogMutated?.();
      }
    } catch (error) {
      setBanner({
        tone: "error",
        text: readableApiError(error, "Не вдалося зберегти рішення."),
      });
    } finally {
      setReviewingId(null);
    }
  };

  if (!authorized || !statusData) {
    return null;
  }

  const { summary, snapshots, aiEnabled } = statusData;
  const totalErrors = summary.fetchErrors + summary.verifierFailed;
  const isRunningAll = runningProgramId === "__all__";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="monitor-trigger-btn"
        onClick={() => {
          setBanner(null);
          setOpen(true);
          if (user) void loadStatus(user);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
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
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
        </svg>
        <span>Моніторинг джерел</span>
        {summary.pendingProposals > 0 && (
          <span
            className="monitor-trigger-badge"
            aria-label={`Очікують перевірки: ${summary.pendingProposals}`}
          >
            {summary.pendingProposals}
          </span>
        )}
      </button>

      {open && (
        <div
          className="monitor-drawer-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDrawer();
            }
          }}
        >
          <section
            className="monitor-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-admin-drawer-title"
          >
            <div className="monitor-drawer-header">
              <div>
                <div className="monitor-drawer-header-meta">
                  <p className="monitor-drawer-eyebrow">Адміністрування каталогу</p>
                  <span
                    className={`monitor-ai-pill ${
                      aiEnabled ? "monitor-ai-pill--on" : "monitor-ai-pill--off"
                    }`}
                  >
                    {aiEnabled ? "ШІ-моніторинг увімкнено" : "ШІ-моніторинг вимкнено"}
                  </span>
                </div>
                <h2 id="monitor-admin-drawer-title" className="monitor-drawer-title">
                  Моніторинг джерел та черга змін
                </h2>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="monitor-close-btn"
                aria-label="Закрити панель моніторингу"
                onClick={closeDrawer}
              >
                ×
              </button>
            </div>

            <div className="monitor-drawer-top">
              <div className="monitor-stats-row">
                <div className="monitor-stats-grid">
                  <div className="monitor-stat-card">
                    <span className="monitor-stat-label">Профілів</span>
                    <span className="monitor-stat-value">{summary.totalProfiles}</span>
                  </div>
                  <div className="monitor-stat-card">
                    <span className="monitor-stat-label">Очікують перевірки</span>
                    <span
                      className={`monitor-stat-value ${
                        summary.pendingProposals > 0 ? "monitor-stat-value--warn" : ""
                      }`}
                    >
                      {summary.pendingProposals}
                    </span>
                  </div>
                  <div className="monitor-stat-card">
                    <span className="monitor-stat-label">Верифіковано</span>
                    <span className="monitor-stat-value monitor-stat-value--ok">
                      {summary.verified}
                    </span>
                  </div>
                  <div className="monitor-stat-card">
                    <span className="monitor-stat-label">Помилки</span>
                    <span
                      className={`monitor-stat-value ${
                        totalErrors > 0 ? "monitor-stat-value--err" : ""
                      }`}
                    >
                      {totalErrors}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="monitor-run-btn"
                  disabled={runningProgramId !== null}
                  onClick={() => void handleRun()}
                >
                  {isRunningAll ? "Перевіряємо джерела…" : "Запустити перевірку"}
                </button>
              </div>

              {banner && (
                <p
                  className={`monitor-banner monitor-banner--${banner.tone}`}
                  role={banner.tone === "error" ? "alert" : "status"}
                >
                  {banner.text}
                </p>
              )}

              <div className="monitor-tabs" role="tablist" aria-label="Розділи моніторингу">
                <button
                  type="button"
                  role="tab"
                  id="monitor-tab-proposals"
                  aria-selected={drawerTab === "proposals"}
                  aria-controls="monitor-panel-proposals"
                  className="monitor-tab"
                  onClick={() => setDrawerTab("proposals")}
                >
                  <span>Черга змін</span>
                  <span className="monitor-tab-count">{summary.pendingProposals}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="monitor-tab-sources"
                  aria-selected={drawerTab === "sources"}
                  aria-controls="monitor-panel-sources"
                  className="monitor-tab"
                  onClick={() => setDrawerTab("sources")}
                >
                  <span>Стан джерел ({summary.totalProfiles} профілів)</span>
                </button>
              </div>
            </div>

            <div className="monitor-drawer-body">
              {drawerTab === "proposals" ? (
                <div
                  id="monitor-panel-proposals"
                  role="tabpanel"
                  aria-labelledby="monitor-tab-proposals"
                >
                  <div
                    className="monitor-filter-bar"
                    role="group"
                    aria-label="Фільтр статусу пропозицій"
                  >
                    {PROPOSAL_FILTERS.map((item) => {
                      const count = summary.proposalCounts?.[item.value];
                      return (
                        <button
                          key={item.value}
                          type="button"
                          className="monitor-filter-pill"
                          aria-pressed={proposalFilter === item.value}
                          onClick={() => setProposalFilter(item.value)}
                        >
                          <span>{item.label}</span>
                          {typeof count === "number" && <span>({count})</span>}
                        </button>
                      );
                    })}
                  </div>

                  {proposalsLoading ? (
                    <p className="monitor-empty" role="status">
                      Завантажуємо пропозиції змін…
                    </p>
                  ) : proposals.length === 0 ? (
                    <p className="monitor-empty">
                      Немає пропозицій у вибраному статусі.
                    </p>
                  ) : (
                    <div className="monitor-proposal-list">
                      {proposals.map((proposal) => {
                        const fieldLabel =
                          FIELD_LABELS[proposal.fieldName] ?? proposal.fieldName;
                        const confidenceLabel =
                          CONFIDENCE_LABELS[proposal.confidence] ?? proposal.confidence;
                        const isBusy = reviewingId === proposal.id;
                        return (
                          <article
                            key={proposal.id}
                            className="monitor-proposal-card"
                          >
                            <div className="monitor-proposal-head">
                              <div>
                                <h3 className="monitor-proposal-title">
                                  {proposal.programTitle}
                                </h3>
                                <p className="monitor-proposal-sub">
                                  {proposal.programId} · виявлено{" "}
                                  {formatDateTime(proposal.detectedAt)}
                                </p>
                              </div>
                              <div className="monitor-pills">
                                <span className="monitor-pill monitor-pill--field">
                                  {fieldLabel}
                                </span>
                                <span
                                  className={`monitor-pill monitor-pill--${proposal.confidence}`}
                                >
                                  {confidenceLabel}
                                </span>
                              </div>
                            </div>

                            <div className="monitor-diff-grid">
                              <div className="monitor-diff-box monitor-diff-box--old">
                                <span className="monitor-diff-label">
                                  Поточне значення
                                </span>
                                <p className="monitor-diff-text">
                                  {formatDiffValue(proposal.oldValue, proposal.fieldName)}
                                </p>
                              </div>
                              <div className="monitor-diff-box monitor-diff-box--new">
                                <span className="monitor-diff-label">
                                  Пропоноване значення
                                </span>
                                <p className="monitor-diff-text">
                                  {formatDiffValue(proposal.newValue, proposal.fieldName)}
                                </p>
                              </div>
                            </div>

                            <div className="monitor-evidence">
                              <span className="monitor-evidence-label">
                                Цитата-доказ із джерела
                              </span>
                              <blockquote>«{proposal.evidenceQuote}»</blockquote>
                            </div>

                            {proposal.status === "pending_review" ? (
                              <div className="monitor-review-controls">
                                <input
                                  type="text"
                                  className="monitor-note-input"
                                  maxLength={500}
                                  aria-label={`Коментар для рішення щодо «${proposal.programTitle}»`}
                                  placeholder="Коментар до рішення (необов’язково)"
                                  value={notesById[proposal.id] ?? ""}
                                  disabled={isBusy}
                                  onChange={(event) =>
                                    setNotesById((prev) => ({
                                      ...prev,
                                      [proposal.id]: event.target.value,
                                    }))
                                  }
                                />
                                <div className="monitor-review-actions">
                                  <button
                                    type="button"
                                    className="monitor-btn-approve"
                                    disabled={reviewingId !== null}
                                    onClick={() => void handleReview(proposal, "approved")}
                                  >
                                    {isBusy ? "Збереження…" : "Підтвердити"}
                                  </button>
                                  <button
                                    type="button"
                                    className="monitor-btn-reject"
                                    disabled={reviewingId !== null}
                                    onClick={() => void handleReview(proposal, "rejected")}
                                  >
                                    Відхилити
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="monitor-review-meta">
                                <span>
                                  Рішення:{" "}
                                  <strong>
                                    {PROPOSAL_FILTERS.find(
                                      (f) => f.value === proposal.status,
                                    )?.label ?? proposal.status}
                                  </strong>
                                </span>
                                {proposal.reviewedBy && (
                                  <span> · {proposal.reviewedBy}</span>
                                )}
                                {proposal.reviewedAt && (
                                  <span> · {formatDateTime(proposal.reviewedAt)}</span>
                                )}
                                {proposal.reviewNotes && (
                                  <div>Коментар: {proposal.reviewNotes}</div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  id="monitor-panel-sources"
                  role="tabpanel"
                  aria-labelledby="monitor-tab-sources"
                  className="monitor-sources-list"
                >
                  {snapshots.map((snapshot) => {
                    const statusLabel =
                      SNAPSHOT_STATUS_LABELS[snapshot.extractionStatus] ??
                      snapshot.extractionStatus;
                    const isRefreshing = runningProgramId === snapshot.programId;
                    const errorDetails =
                      snapshot.lastError ||
                      (snapshot.verifierErrors.length > 0
                        ? snapshot.verifierErrors.join("; ")
                        : null);
                    return (
                      <div key={snapshot.programId} className="monitor-source-row">
                        <div className="monitor-source-main">
                          <div className="monitor-source-info">
                            <p className="monitor-source-title">
                              {snapshot.programTitle}
                            </p>
                            <div className="monitor-source-meta">
                              <span>Перевірка: {formatDateTime(snapshot.fetchedAt)}</span>
                              <span>· кожні {snapshot.cadenceHours} год</span>
                              {snapshot.autoPromoteAvailability && (
                                <span>· автооновлення статусу</span>
                              )}
                              <a
                                className="monitor-source-link"
                                href={snapshot.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Джерело ↗
                              </a>
                            </div>
                          </div>
                          <div className="monitor-source-actions">
                            <span
                              className={`monitor-pill monitor-pill--${snapshot.extractionStatus}`}
                            >
                              {statusLabel}
                            </span>
                            <button
                              type="button"
                              className="monitor-btn-refresh"
                              disabled={runningProgramId !== null}
                              onClick={() => void handleRun(snapshot.programId)}
                            >
                              {isRefreshing ? "Оновлення…" : "Оновити"}
                            </button>
                          </div>
                        </div>
                        {errorDetails && (
                          <p className="monitor-source-error">{errorDetails}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
