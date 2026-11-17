import { advisorFollowups } from "./advisor-followups";
import { isGrantAvailable } from "../../backend/src/grant-availability";
import { useGrantPrograms } from "./GrantPrograms";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { authenticatedRequest, ApiError, readableApiError } from "./api";
import type { GrantProgram } from "./grants";
import type { SearchResult } from "../../backend/src/grant-discovery";
import { AiEmblem, CopyActionIcon, FormattedReply, ScrollDownIcon, SendArrowIcon } from "./Assistant";
import { ReplyReveal } from "./ReplyReveal";
import "./Advisor.css";
import { advisorSessionKey, createAdvisorSession, parseAdvisorSession } from "./advisor-session";

type Message = {
  id: string;
  question: string;
  reply: string;
  mode: string;
  search: SearchResult;
  seed: string;
};
type Conversation = { id: string; title: string };

type AdvisorStarterKind = "coffee" | "delivery" | "student" | "equipment";

const ADVISOR_STARTERS: { kind: AdvisorStarterKind; text: string }[] = [
  { kind: "coffee", text: "Хочу відкрити кав’ярню" },
  { kind: "delivery", text: "Потрібне авто для доставки" },
  { kind: "student", text: "Я студент і хочу відкрити бізнес" },
  { kind: "equipment", text: "Потрібне обладнання для виробництва" },
];

function AdvisorStarterIcon({ kind }: { kind: AdvisorStarterKind }) {
  switch (kind) {
    case "coffee":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
          <path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2" />
          <path d="M7.5 4.5c0 1.2 1 1.5 1 2.5M11.5 4.5c0 1.2 1 1.5 1 2.5" />
        </svg>
      );
    case "delivery":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7h11v9H3V7Z" />
          <path d="M14 10h4l3 3v3h-7v-6Z" />
          <circle cx="7.5" cy="17.5" r="2" />
          <circle cx="17.5" cy="17.5" r="2" />
        </svg>
      );
    case "student":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4 3 8.5 12 13l9-4.5L12 4Z" />
          <path d="M6 10.5v5c0 1.8 2.7 3.2 6 3.2s6-1.4 6-3.2v-5" />
          <path d="M21 9v6" />
        </svg>
      );
    case "equipment":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 20V10l6 3V10l6 3V7h6v13H3Z" />
          <path d="M7 16h2M12 16h2M17 16h1" />
        </svg>
      );
  }
}

export function Advisor({
  user,
  onPrepare,
  onView,
  onDirty,
  prefilledMessage,
  prefillConversationId,
  onClearPrefilled,
}: {
  user: User;
  onPrepare: (p: GrantProgram, seed: string) => void;
  onView: (p: GrantProgram) => void;
  onDirty: (dirty: boolean) => void;
  prefilledMessage?: string;
  prefillConversationId?: string;
  onClearPrefilled: () => void;
}) {
  const { programs: GRANT_PROGRAMS } = useGrantPrograms();
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const copyTimerRef = useRef<number | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const followReply = () => {
    if (nearBottom.current && scrollArea.current) {
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
    }
  };
  const [historySlot, setHistorySlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHistorySlot(document.getElementById("advisor-history-slot"));
  }, []);
  const [historySearch, setHistorySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyPanel = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    historyButton.current?.focus();
  }, []);
  useEffect(() => {
    if (!historyOpen) return;
    historyPanel.current?.focus();
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistory();
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [historyOpen, closeHistory]);

  const input = useRef<HTMLTextAreaElement>(null),
    attempts = useRef<Record<string, { id: string; text: string }>>({}),
    sending = useRef(false);
  const drafts = useRef<Record<string, string>>({});
  const textRef = useRef(text);
  textRef.current = text;
  const [storageError, setStorageError] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageReady = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const persist = () => {
    if (!storageReady.current || !current.current) return;
    try {
      const all = { ...drafts.current, [current.current]: textRef.current };
      const snapshot = createAdvisorSession(current.current, all, attempts.current);
      if (snapshot && Object.keys(snapshot.drafts).length) {
        sessionStorage.setItem(advisorSessionKey(user.uid), JSON.stringify(snapshot));
      } else {
        sessionStorage.removeItem(advisorSessionKey(user.uid));
      }
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const current = useRef(conversation);
  current.current = conversation;

  async function loadConversations() {
    const r = await authenticatedRequest(user, "/api/advisor/conversations");
    if (!r.ok) throw new ApiError("http", r.status);
    const data = await r.json();
    if (!Array.isArray(data.conversations)) throw Error();
    setConversations(data.conversations);
    return data.conversations as Conversation[];
  }

  useEffect(() => {
    let active = true;
    drafts.current = {};
    attempts.current = {};
    textRef.current = "";
    current.current = "";
    setText("");
    setConversation("");
    setRestored(false);
    setStorageError(false);
    let preferred = "";
    try {
      const saved = parseAdvisorSession(sessionStorage.getItem(advisorSessionKey(user.uid)));
      if (saved) {
        drafts.current = { ...saved.drafts };
        attempts.current = { ...saved.attempts };
        if (saved.drafts[saved.selected]?.trim()) {
          preferred = saved.selected;
          current.current = preferred;
          textRef.current = saved.drafts[preferred];
          delete drafts.current[preferred];
          setConversation(preferred);
          setText(textRef.current);
          setRestored(true);
        }
      }
    } catch {
      setStorageError(true);
    }
    storageReady.current = true;
    loadConversations()
      .then((rows) => {
        if (active && !current.current) {
          const id = rows[0]?.id ?? crypto.randomUUID();
          current.current = id;
          setConversation(id);
        }
      })
      .catch((e) => {
        if (active) {
          setError(readableApiError(e, "Не вдалося відкрити розмови. Можна почати нову."));
          if (!current.current) {
            const id = crypto.randomUUID();
            current.current = id;
            setConversation(id);
          }
        }
      });
    const flush = () => persistRef.current();
    window.addEventListener("beforeunload", flush);
    return () => {
      active = false;
      window.removeEventListener("beforeunload", flush);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      flush();
      storageReady.current = false;
    };
  }, [user.uid]);

  useEffect(() => {
    if (!storageReady.current || !conversation) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => persistRef.current(), 250);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [text, conversation]);

  async function history(id: string, before: string | null = null, signal?: AbortSignal) {
    setLoading(true);
    try {
      const r = await authenticatedRequest(
        user,
        `/api/advisor?conversationId=${id}${before ? `&before=${before}` : ""}`,
        { signal }
      );
      if (!r.ok) throw new ApiError("http", r.status);
      const data = await r.json();
      if (!Array.isArray(data.messages)) throw Error();
      if (current.current !== id || signal?.aborted) return;
      setMessages((previous) =>
        before
          ? [
              ...data.messages,
              ...previous.filter((m) => !data.messages.some((n: Message) => n.id === m.id)),
            ]
          : data.messages
      );
      setHasMore(data.hasMore);
      setCursor(data.nextBefore);
    } catch (e) {
      if (!signal?.aborted && current.current === id) {
        setError(readableApiError(e, "Не вдалося завантажити розмову. Спробуйте ще раз."));
      }
    } finally {
      if (!signal?.aborted && current.current === id) setLoading(false);
    }
  }

  useEffect(() => {
    if (!conversation) return;
    const controller = new AbortController();
    setMessages([]);
    setRevealingId(null);
    nearBottom.current = true;
    setIsAtBottom(true);
    setError("");
    void history(conversation, null, controller.signal);
    return () => controller.abort();
  }, [conversation]);

  useEffect(() => {
    onDirty(!!text.trim() || busy || Object.values(drafts.current).some((d) => !!d.trim()));
  }, [text, busy, conversation, onDirty]);

  useEffect(() => {
    if (!prefilledMessage || busy || !conversation || current.current !== conversation) return;
    if (prefillConversationId && prefillConversationId !== conversation) changeConversation(prefillConversationId);
    fill(prefilledMessage);
    onClearPrefilled();
  }, [prefilledMessage, prefillConversationId, busy, conversation, onClearPrefilled]);

  useEffect(() => {
    followReply();
  }, [messages, busy]);

  function updateText(value: string) {
    textRef.current = value;
    setText(value);
    const attempt = attempts.current[current.current];
    if (attempt && attempt.text !== value.trim()) delete attempts.current[current.current];
  }

  function fill(value: string) {
    const previous = textRef.current;
    updateText((!previous.trim() ? value : previous === value ? previous : `${previous}\n${value}`).slice(0, 2000));
    input.current?.focus();
  }

  function changeConversation(id: string) {
    if (busy || id === current.current) return;
    if (!conversations.some((c) => c.id === id) && !drafts.current[id]) setHistorySearch("");
    if (current.current) drafts.current[current.current] = textRef.current;
    const draft = drafts.current[id] ?? "";
    delete drafts.current[id];
    current.current = id;
    updateText(draft);
    setConversation(id);
    setRestored(!!draft.trim());
  }

  async function send() {
    if (sending.current || !text.trim() || !conversation) return;
    sending.current = true;
    const question = text.trim(),
      id = conversation;
    setPendingQuestion(question);
    nearBottom.current = true;
    setIsAtBottom(true);
    setBusy(true);
    setError("");
    if (!attempts.current[id] || attempts.current[id].text !== question) {
      attempts.current[id] = { id: crypto.randomUUID(), text: question };
    }
    persistRef.current();
    try {
      const r = await authenticatedRequest(
        user,
        "/api/advisor",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: attempts.current[id].id,
            conversationId: id,
            message: question,
          }),
        },
        40000
      );
      if (!r.ok) throw new ApiError("http", r.status);
      const data = await r.json();
      const m = data.message;
      if (!m || typeof m.reply !== "string" || !Array.isArray(m.search?.matches)) throw Error();
      if (current.current !== id) return;
      setRevealingId(messages.some((item) => item.id === m.id) ? null : m.id);
      setMessages((previous) => [...previous.filter((x) => x.id !== m.id), m]);
      updateText("");
      delete drafts.current[id];
      delete attempts.current[id];
      setRestored(false);
      persistRef.current();
      void loadConversations().catch(() => {});
    } catch (e) {
      setError(
        readableApiError(e, "Не вдалося підтвердити відповідь. Запитання залишилося; можна повторити без дублювання.")
      );
    } finally {
      setBusy(false);
      setPendingQuestion("");
      sending.current = false;
    }
  }

  async function copyReply(m: Message) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(m.reply);
      setCopiedId(m.id);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedId(null);
      }, 2000);
    } catch {
      setCopyError("Не вдалося скопіювати відповідь. Виділіть текст і скопіюйте його вручну.");
    }
  }

  function scrollToBottomNow() {
    const el = scrollArea.current;
    if (!el) return;
    nearBottom.current = true;
    setIsAtBottom(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }

  const draftTitle = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 64) || "Нова розмова";
  const isSavedConversation = conversations.some((c) => c.id === conversation);
  const isFreshEmptyChat = !!conversation && !isSavedConversation && !text.trim() && messages.length === 0;
  const localIds = Object.keys(drafts.current).filter(
    (id) => !!drafts.current[id].trim() && !conversations.some((c) => c.id === id)
  );
  const entries = [
    ...(!isSavedConversation && conversation && (!!text.trim() || messages.length > 0)
      ? [{ id: conversation, title: draftTitle(text) }]
      : []),
    ...localIds.filter((id) => id !== conversation).map((id) => ({ id, title: draftTitle(drafts.current[id]) })),
    ...conversations,
  ];
  const visibleEntries = entries.filter((entry) =>
    entry.title.toLocaleLowerCase("uk").includes(historySearch.trim().toLocaleLowerCase("uk"))
  );

  const startNewChat = () => {
    if (!isFreshEmptyChat) {
      changeConversation(crypto.randomUUID());
    }
    if (historyOpen) closeHistory();
    input.current?.focus();
  };

  const historyContents = (
    <>
      <div className="advisor-history-heading">
        <h2>Розмови</h2>
        <button type="button" className="advisor-history-close" aria-label="Закрити історію" onClick={closeHistory}>
          ×
        </button>
      </div>
      <button
        type="button"
        className={`advisor-new-chat${isFreshEmptyChat ? " is-current" : ""}`}
        disabled={busy}
        onClick={startNewChat}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Нова розмова</span>
      </button>
      <label className="advisor-history-search">
        <span className="sr-only">Пошук розмов</span>
        <input
          type="search"
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder="Пошук розмов…"
        />
      </label>
      <nav aria-label="Список розмов" className="advisor-history-list">
        {visibleEntries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === conversation ? "advisor-history-item is-active" : "advisor-history-item"}
            aria-current={entry.id === conversation ? "page" : undefined}
            disabled={busy}
            onClick={() => {
              changeConversation(entry.id);
              if (historyOpen) closeHistory();
            }}
          >
            <span>{entry.title}</span>
            {(entry.id === conversation ? !!text.trim() : !!drafts.current[entry.id]?.trim()) && <small>Чернетка</small>}
          </button>
        ))}
        {visibleEntries.length === 0 && (
          <p className="advisor-history-empty">
            {historySearch.trim()
              ? "Розмов не знайдено."
              : "Ваші розмови з’являться тут після першого запитання."}
          </p>
        )}
      </nav>
    </>
  );

  const desktopHistory = (
    <aside className="advisor-history advisor-history-desktop" aria-label="Історія розмов">
      {historyContents}
    </aside>
  );

  const hasMessages = messages.length > 0 || busy;

  return (
    <div className="advisor-layout">
      {historySlot ? createPortal(desktopHistory, historySlot) : desktopHistory}
      {historyOpen && (
        <button
          type="button"
          className="advisor-history-scrim"
          aria-label="Закрити історію"
          onClick={closeHistory}
          tabIndex={-1}
        />
      )}
      <aside
        id="advisor-mobile-history"
        ref={historyPanel}
        tabIndex={-1}
        className={`advisor-history advisor-history-mobile ${historyOpen ? "is-open" : ""}`}
        aria-label="Історія розмов"
        role={historyOpen ? "dialog" : undefined}
        aria-modal={historyOpen ? true : undefined}
        aria-hidden={!historyOpen || undefined}
        onKeyDown={(event) => {
          if (!historyOpen) return;
          if (event.key === "Escape") {
            event.preventDefault();
            closeHistory();
          }
          if (event.key === "Tab") {
            const controls = Array.from(
              historyPanel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []
            );
            if (!controls.length) {
              event.preventDefault();
              return;
            }
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === historyPanel.current)) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {historyContents}
      </aside>
      <div className="advisor-page">
        <div className="advisor-toolbar">
          <button
            ref={historyButton}
            type="button"
            className="advisor-history-toggle"
            aria-expanded={historyOpen}
            aria-controls="advisor-mobile-history"
            onClick={() => setHistoryOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h11" />
            </svg>
            <span>Розмови</span>
          </button>
          <div>
            <h1>Асистент</h1>
            <p>Від бізнес-ідеї до підготовленої заявки</p>
          </div>
        </div>
        <section className="live-chat-container" aria-label="Підбір фінансування з асистентом">
          <div
            ref={scrollArea}
            className="chat-scroll-area"
            role="log"
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              nearBottom.current = atBottom;
              setIsAtBottom(atBottom);
            }}
          >
            {loading && (
              <p className="chat-status-msg" role="status">
                Завантажуємо розмову…
              </p>
            )}
            {!loading && !busy && messages.length === 0 && (
              <div className="chat-welcome-card">
                <div className="welcome-content">
                  <span className="welcome-eyebrow">ВАША ІДЕЯ · НАСТУПНИЙ КРОК</span>
                  <h2>На що вам потрібні кошти?</h2>
                  <p>
                    Опишіть бізнес-ідею або потребу вашої справи своїми словами. Допоможу знайти можливості,
                    розібратися в умовах і крок за кроком підготувати матеріали. Знати назву гранту чи мати готовий
                    проєкт не потрібно.
                  </p>
                  <p className="welcome-suggestions-label">Або почніть із прикладу</p>
                  <div className="welcome-quick-actions">
                    {ADVISOR_STARTERS.map((starter) => (
                      <button
                        type="button"
                        key={starter.text}
                        className="welcome-action-chip"
                        onClick={() => fill(starter.text)}
                      >
                        <span className="welcome-action-icon" aria-hidden="true">
                          <AdvisorStarterIcon kind={starter.kind} />
                        </span>
                        <span className="welcome-action-label">{starter.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {hasMore && (
              <button
                type="button"
                className="link load-more-history-btn"
                disabled={loading}
                onClick={() => void history(conversation, cursor)}
              >
                Попередні повідомлення
              </button>
            )}
            {messages.map((m) => {
              const isCopied = copiedId === m.id;
              return (
                <div className="chat-turn" key={m.id}>
                  <div className="chat-bubble user-bubble">
                    <span className="sr-only">Ви</span>
                    <div className="bubble-text">{m.question}</div>
                  </div>
                  <div className="chat-bubble assistant-bubble">
                    <div className="assistant-bubble-author">
                      <AiEmblem />
                      <strong className="author-name">GrantFolio Асистент</strong>
                      <span className="revision-badge">
                        {m.mode === "guided" ? "Підбір за умовами каталогу" : "З урахуванням вашої розмови"}
                      </span>
                    </div>
                    <div className="bubble-text assistant-text">
                      <ReplyReveal
                        text={m.reply}
                        animate={revealingId === m.id}
                        onComplete={() => setRevealingId((id) => (id === m.id ? null : id))}
                        onProgress={followReply}
                      >
                        {(visible) => <FormattedReply text={visible} />}
                      </ReplyReveal>
                    </div>
                    {revealingId !== m.id && (
                      <div className="assistant-bubble-actions">
                        <button
                          type="button"
                          className={`bubble-copy-btn${isCopied ? " is-copied" : ""}`}
                          aria-label={isCopied ? "Відповідь скопійовано" : "Копіювати відповідь асистента"}
                          onClick={() => void copyReply(m)}
                        >
                          <CopyActionIcon copied={isCopied} />
                          <span>{isCopied ? "Скопійовано" : "Копіювати"}</span>
                        </button>
                      </div>
                    )}
                    {revealingId !== m.id && m.search.matches.length > 0 && (
                      <div className="advisor-recommendations" aria-label="Можливі програми">
                        {m.search.matches.slice(0, 3).map((match) => {
                          const p = GRANT_PROGRAMS.find((program) => program.id === match.programId);
                          if (!p || !isGrantAvailable(p)) return null;
                          return (
                            <article key={p.id} className="advisor-grant">
                              <h3>{match.title}</h3>
                              <p>{match.reason}</p>
                              <small>{match.caution}</small>
                              <div className="advisor-grant-actions">
                                <button
                                  type="button"
                                  className="advisor-grant-secondary"
                                  aria-label={`Умови програми: ${match.title}`}
                                  onClick={() => onView(p)}
                                >
                                  Умови програми
                                </button>
                                <button
                                  type="button"
                                  className="advisor-grant-primary"
                                  aria-label={`Готувати матеріали для програми: ${match.title}`}
                                  onClick={() => onPrepare(p, m.seed)}
                                >
                                  Готувати матеріали
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    {revealingId !== m.id && (
                      <div className="advisor-followups">
                        {advisorFollowups(m.seed, m.search.intents.includes("transport")).map((q) => (
                          <button type="button" key={q} onClick={() => fill(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="chat-turn">
                <div className="chat-bubble user-bubble">
                  <span className="sr-only">Ви</span>
                  <div className="bubble-text">{pendingQuestion}</div>
                </div>
                <div className="chat-bubble assistant-bubble chat-pending" role="status">
                  <div className="assistant-bubble-author">
                    <AiEmblem />
                    <strong className="author-name">GrantFolio Асистент</strong>
                  </div>
                  <div className="chat-pending-body">
                    <span className="typing-wave" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="chat-pending-text">Аналізую запит і шукаю можливі програми…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {copiedId ? "Відповідь скопійовано в буфер обміну." : ""}
          </span>
          <div className="chat-composer-area">
            {!isAtBottom && hasMessages && (
              <button
                type="button"
                className="chat-scroll-bottom-btn"
                aria-label="Прокрутити вниз до останніх повідомлень"
                title="До останніх повідомлень"
                onClick={scrollToBottomNow}
              >
                <ScrollDownIcon />
              </button>
            )}
            {restored && (
              <p className="chat-status-msg" role="status">
                Ненадіслане запитання відновлено в цій вкладці.
              </p>
            )}
            {storageError && (
              <p className="chat-error-banner" role="alert">
                Не вдалося зберегти запитання в цій вкладці. Скопіюйте його перед перезавантаженням.
              </p>
            )}
            {copyError && (
              <div className="chat-error-banner" role="alert">
                {copyError}
              </div>
            )}
            {error && (
              <div className="chat-error-banner" role="alert">
                {error}{" "}
                <button
                  type="button"
                  className="link"
                  disabled={busy || loading}
                  onClick={() => void history(conversation)}
                >
                  Оновити розмову
                </button>
              </div>
            )}
            <form
              className="chat-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={input}
                aria-label="Опишіть вашу потребу"
                placeholder="Наприклад: хочу купити авто для доставки, працюю як ФОП у Львові…"
                value={text}
                rows={1}
                maxLength={2000}
                disabled={busy}
                onChange={(e) => updateText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey &&
                    !e.repeat &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="chat-input-footer">
                <span>Enter — надіслати · Shift + Enter — новий рядок</span>
                <button
                  type="submit"
                  className="chat-send-btn"
                  aria-label="Надіслати запитання"
                  title="Надіслати запитання"
                  disabled={busy || loading || !text.trim()}
                >
                  <SendArrowIcon />
                </button>
              </div>
            </form>
            <p className="chat-disclaimer">
              Можливі програми потребують перевірки умов. Рішення про фінансування ухвалює організатор.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
