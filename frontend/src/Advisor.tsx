import { grantIntake, grantSupport } from "../../backend/src/grant-discovery";
import { isGrantAvailable } from "../../backend/src/grant-availability";
import { hasGuidedApplication } from "./grants";
import { useGrantPrograms } from "./GrantPrograms";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { authenticatedRequest, ApiError, readableApiError } from "./api";
import type { GrantProgram } from "./grants";
import type { SearchResult } from "../../backend/src/grant-discovery";
import { AiEmblem, CopyActionIcon, FormattedReply, ScrollDownIcon, SendArrowIcon } from "./Assistant";
import { ReplyReveal } from "./ReplyReveal";
import { useConfirm } from "./ConfirmDialog";
import { FeedbackPromptBanner } from "./FeedbackPromptBanner";
import "./Advisor.css";
import { advisorSessionKey, createAdvisorSession, parseAdvisorSession } from "./advisor-session";

export type ExtractedProfileFact = {
  field: string;
  label: string;
  value: string;
  source: string;
};

type Message = {
  id: string;
  question: string;
  reply: string;
  mode: string;
  search: SearchResult;
  seed: string;
  selectedProgramId?: string;
  extractedFacts?: ExtractedProfileFact[];
  fallbackReason?: "not_configured" | "timeout" | "provider_error" | "invalid_response";
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

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function Advisor({
  user,
  onPrepare,
  onView,
  onDirty,
  prefilledMessage,
  prefillConversationId,
  onClearPrefilled,
  onOpenProfile,
  onOpenFeedback,
}: {
  user: User;
  onPrepare: (p: GrantProgram, seed: string) => void;
  onView: (p: GrantProgram) => void;
  onDirty: (dirty: boolean) => void;
  prefilledMessage?: string;
  prefillConversationId?: string;
  onClearPrefilled: () => void;
  onOpenProfile?: () => void;
  onOpenFeedback?: (context?: { programId?: string | null }) => void;
}) {
  const { programs: GRANT_PROGRAMS } = useGrantPrograms();
  const preparablePilot = GRANT_PROGRAMS.find(program =>
    program.id === "vlasna-sprava" && !isGrantAvailable(program),
  );
  const confirm = useConfirm();
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
  const [historyError, setHistoryError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSurface, setEditingSurface] = useState<"desktop" | "mobile">("desktop");
  const [mutatingChatId, setMutatingChatId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const historyOpenRef = useRef(historyOpen);
  historyOpenRef.current = historyOpen;
  const editingIdRef = useRef<string | null>(null);
  editingIdRef.current = editingId;
  const mutatingChatIdRef = useRef<string | null>(null);
  mutatingChatIdRef.current = mutatingChatId;
  const activeUidRef = useRef(user.uid);
  activeUidRef.current = user.uid;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const desktopRenameInputRef = useRef<HTMLInputElement>(null);
  const mobileRenameInputRef = useRef<HTMLInputElement>(null);
  const historyControllerRef = useRef<AbortController | null>(null);
  const skipHistoryFetchId = useRef<string | null>(null);
  const historyPanel = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const restoreHistoryFocus = useCallback((targetConversationId?: string) => {
    window.requestAnimationFrame(() => {
      const container = historyOpenRef.current
        ? historyPanel.current
        : document.getElementById("advisor-history-slot") ??
          document.querySelector<HTMLElement>(".advisor-history-desktop");
      if (!container) return;
      if (targetConversationId) {
        const items = Array.from(container.querySelectorAll<HTMLButtonElement>("button.advisor-history-item"));
        const match = items.find((btn) => btn.dataset.conversationId === targetConversationId);
        if (match) {
          match.focus();
          return;
        }
      }
      const fallback =
        container.querySelector<HTMLButtonElement>("button.advisor-history-item") ??
        container.querySelector<HTMLButtonElement>("button.advisor-new-chat");
      fallback?.focus();
    });
  }, []);
  const cancelRename = useCallback(() => {
    if (mutatingChatIdRef.current !== null) return;
    const targetId = editingIdRef.current ?? undefined;
    setEditingId(null);
    setEditingTitle("");
    setHistoryError("");
    restoreHistoryFocus(targetId);
  }, [restoreHistoryFocus]);
  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    setHistoryError("");
    if (mutatingChatIdRef.current === null) {
      setEditingId(null);
      setEditingTitle("");
    }
    historyButton.current?.focus();
  }, []);
  useEffect(() => {
    if (!editingId) return;
    const target = editingSurface === "mobile" ? mobileRenameInputRef.current : desktopRenameInputRef.current;
    if (target) {
      target.focus();
      target.select();
    }
  }, [editingId, editingSurface]);
  useEffect(() => {
    if (!historyOpen) return;
    historyPanel.current?.focus();
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        if (editingIdRef.current !== null) {
          event.preventDefault();
          cancelRename();
          return;
        }
        event.preventDefault();
        closeHistory();
        return;
      }
      if (event.key === "Tab") {
        const panel = historyPanel.current;
        if (panel && !panel.contains(document.activeElement)) {
          event.preventDefault();
          const firstControl = panel.querySelector<HTMLElement>(
            "button:not(:disabled), input:not(:disabled)"
          );
          (firstControl ?? panel).focus();
        }
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [historyOpen, closeHistory, cancelRename]);

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

  async function loadConversations(signal?: AbortSignal) {
    const uid = user.uid;
    const r = await authenticatedRequest(user, "/api/advisor/conversations", { signal });
    if (!r.ok) throw new ApiError("http", r.status);
    const data = await r.json();
    if (!Array.isArray(data.conversations)) throw Error();
    if (activeUidRef.current !== uid || signal?.aborted) return [];
    setConversations(data.conversations);
    return data.conversations as Conversation[];
  }

  useEffect(() => {
    const currentUid = user.uid;
    const controller = new AbortController();
    let active = true;
    drafts.current = {};
    attempts.current = {};
    textRef.current = "";
    current.current = "";
    skipHistoryFetchId.current = null;
    setText("");
    setConversation("");
    setEditingId(null);
    setEditingTitle("");
    setMutatingChatId(null);
    setHistoryError("");
    setRestored(false);
    setStorageError(false);
    let preferred = "";
    try {
      const saved = parseAdvisorSession(sessionStorage.getItem(advisorSessionKey(currentUid)));
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
    loadConversations(controller.signal)
      .then((rows) => {
        if (active && !controller.signal.aborted && !current.current) {
          const id = rows[0]?.id ?? crypto.randomUUID();
          current.current = id;
          setConversation(id);
        }
      })
      .catch((e) => {
        if (!active || controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
          return;
        }
        setError(readableApiError(e, "Не вдалося відкрити розмови. Можна почати нову."));
        if (!current.current) {
          const id = crypto.randomUUID();
          current.current = id;
          setConversation(id);
        }
      });
    const flush = () => {
      if (activeUidRef.current === currentUid) persistRef.current();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("beforeunload", flush);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (activeUidRef.current === currentUid) flush();
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
    historyControllerRef.current = controller;
    setMessages([]);
    setRevealingId(null);
    nearBottom.current = true;
    setIsAtBottom(true);
    setError("");
    if (skipHistoryFetchId.current === conversation) {
      skipHistoryFetchId.current = null;
      setHasMore(false);
      setCursor(null);
      setLoading(false);
      return () => {
        if (historyControllerRef.current === controller) historyControllerRef.current = null;
      };
    }
    void history(conversation, null, controller.signal);
    return () => {
      controller.abort();
      if (historyControllerRef.current === controller) historyControllerRef.current = null;
    };
  }, [conversation]);

  useEffect(() => {
    onDirty(!!text.trim() || busy || Object.values(drafts.current).some((d) => !!d.trim()));
  }, [text, busy, conversation, draftVersion, onDirty]);

  useEffect(() => {
    if (!prefilledMessage || busy || !conversation || current.current !== conversation) return;
    if (prefillConversationId && prefillConversationId !== conversation) changeConversation(prefillConversationId);
    fill(prefilledMessage);
    onClearPrefilled();
  }, [prefilledMessage, prefillConversationId, busy, conversation, onClearPrefilled]);

  useEffect(() => {
    if (messages.length === 0 && !busy) {
      if (scrollArea.current) scrollArea.current.scrollTop = 0;
      return;
    }
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
    if (busy || mutatingChatId !== null || id === current.current) return;
    setHistoryError("");
    if (editingId !== null) {
      setEditingId(null);
      setEditingTitle("");
    }
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
    if (sending.current || mutatingChatId !== null || !text.trim() || !conversation) return;
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
  const savedIds = new Set(conversations.map((c) => c.id));
  const isSavedConversation = savedIds.has(conversation);
  const isFreshEmptyChat = !!conversation && !isSavedConversation && !text.trim() && messages.length === 0;
  const localIds = Object.keys(drafts.current).filter(
    (id) => !!drafts.current[id].trim() && !savedIds.has(id)
  );
  const entries = [
    ...(!isSavedConversation && conversation && (!!text.trim() || messages.length > 0)
      ? [{ id: conversation, title: draftTitle(text.trim() || messages[0]?.question || "") }]
      : []),
    ...localIds.filter((id) => id !== conversation).map((id) => ({ id, title: draftTitle(drafts.current[id]) })),
    ...conversations,
  ];
  const visibleEntries = entries.filter((entry) =>
    entry.title.toLocaleLowerCase("uk").includes(historySearch.trim().toLocaleLowerCase("uk"))
  );

  const resetActiveChatToFresh = () => {
    historyControllerRef.current?.abort();
    const nextId = crypto.randomUUID();
    skipHistoryFetchId.current = nextId;
    setMessages([]);
    setHasMore(false);
    setCursor(null);
    setLoading(false);
    setRevealingId(null);
    setRestored(false);
    setError("");
    setHistorySearch("");
    textRef.current = "";
    setText("");
    current.current = nextId;
    setConversation(nextId);
  };

  function startRename(entry: Conversation, surface: "desktop" | "mobile") {
    if (busy || mutatingChatId !== null) return;
    setHistoryError("");
    setEditingId(entry.id);
    setEditingTitle(entry.title);
    setEditingSurface(surface);
  }

  async function submitRename(id: string) {
    if (busy || mutatingChatId !== null) return;
    const existing = conversations.find((c) => c.id === id);
    if (!existing) {
      setEditingId(null);
      setEditingTitle("");
      restoreHistoryFocus();
      return;
    }
    const trimmed = editingTitle.trim().slice(0, 70);
    if (!trimmed || trimmed === existing.title) {
      setEditingId(null);
      setEditingTitle("");
      restoreHistoryFocus(id);
      return;
    }
    const uid = user.uid;
    setMutatingChatId(id);
    setHistoryError("");
    try {
      const r = await authenticatedRequest(
        user,
        `/api/advisor/conversations/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        }
      );
      if (!r.ok) throw new ApiError("http", r.status);
      const data = await r.json();
      if (activeUidRef.current !== uid) return;
      const updatedTitle =
        typeof data?.conversation?.title === "string" && data.conversation.title.trim()
          ? data.conversation.title.trim()
          : trimmed;
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updatedTitle } : c))
      );
      setEditingId(null);
      setEditingTitle("");
      restoreHistoryFocus(id);
    } catch (e) {
      if (activeUidRef.current === uid) {
        setHistoryError(readableApiError(e, "Не вдалося перейменувати розмову. Спробуйте ще раз."));
      }
    } finally {
      if (activeUidRef.current === uid) setMutatingChatId(null);
    }
  }

  async function deleteConversation(entry: Conversation, isSaved: boolean) {
    if (busy || mutatingChatId !== null) return;
    setHistoryError("");
    const id = entry.id;
    const uid = user.uid;
    if (!isSaved) {
      const confirmed = await confirm({
        title: "Видалити чернетку розмови?",
        message: "Ненадісланий текст цієї розмови буде видалено.",
        confirmLabel: "Видалити",
        cancelLabel: "Скасувати",
        tone: "danger",
      });
      if (!confirmed || !mountedRef.current || activeUidRef.current !== uid || mutatingChatIdRef.current !== null) return;
      if (editingId === id) {
        setEditingId(null);
        setEditingTitle("");
      }
      delete drafts.current[id];
      delete attempts.current[id];
      if (id === current.current) {
        resetActiveChatToFresh();
      }
      setDraftVersion((v) => v + 1);
      persistRef.current();
      restoreHistoryFocus();
      return;
    }

    const confirmed = await confirm({
      title: "Видалити розмову?",
      message: `Розмову «${entry.title}» та всі повідомлення в цьому чаті буде видалено.`,
      confirmLabel: "Видалити",
      cancelLabel: "Скасувати",
      tone: "danger",
    });
    if (!confirmed || !mountedRef.current || activeUidRef.current !== uid || mutatingChatIdRef.current !== null) return;

    setMutatingChatId(id);
    setHistoryError("");
    try {
      const r = await authenticatedRequest(
        user,
        `/api/advisor/conversations/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!r.ok && r.status !== 404) throw new ApiError("http", r.status);
      if (activeUidRef.current !== uid) return;
      if (editingId === id) {
        setEditingId(null);
        setEditingTitle("");
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      delete drafts.current[id];
      delete attempts.current[id];
      if (id === current.current) {
        resetActiveChatToFresh();
      }
      setDraftVersion((v) => v + 1);
      persistRef.current();
      restoreHistoryFocus();
    } catch (e) {
      if (activeUidRef.current === uid) {
        setHistoryError(readableApiError(e, "Не вдалося видалити розмову. Спробуйте ще раз."));
      }
    } finally {
      if (activeUidRef.current === uid) setMutatingChatId(null);
    }
  }

  const startNewChat = () => {
    if (busy || mutatingChatId !== null) return;
    setHistoryError("");
    if (editingId !== null) {
      setEditingId(null);
      setEditingTitle("");
    }
    if (!isFreshEmptyChat) {
      changeConversation(crypto.randomUUID());
    }
    if (historyOpen) closeHistory();
    input.current?.focus();
  };

  const renderHistoryContents = (surface: "desktop" | "mobile") => {
    const controlsDisabled = busy || mutatingChatId !== null;
    return (
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
          disabled={controlsDisabled}
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
        {historyError && (
          <p className="advisor-history-error" role="alert">
            {historyError}
          </p>
        )}
        <nav aria-label="Список розмов" className="advisor-history-list">
          {visibleEntries.map((entry) => {
            const isActive = entry.id === conversation;
            const isSaved = savedIds.has(entry.id);
            const hasDraft = isActive ? !!text.trim() : !!drafts.current[entry.id]?.trim();
            const canDelete = isSaved || hasDraft || !isActive;
            const isEditing = editingId === entry.id;
            const isMutating = mutatingChatId === entry.id;

            return (
              <div
                key={entry.id}
                className={`advisor-history-row${isActive ? " advisor-history-row-active" : ""}${isEditing ? " is-editing" : ""}`}
              >
                {isEditing ? (
                  <form
                    className="advisor-history-rename-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitRename(entry.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopPropagation();
                        cancelRename();
                      }
                    }}
                  >
                    <input
                      ref={surface === "mobile" ? mobileRenameInputRef : desktopRenameInputRef}
                      type="text"
                      className="advisor-history-rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      maxLength={70}
                      aria-label="Нова назва розмови"
                      disabled={isMutating}
                    />
                    <button
                      type="submit"
                      className="advisor-history-action-btn advisor-history-action-save"
                      aria-label="Зберегти назву"
                      title="Зберегти"
                      disabled={isMutating}
                    >
                      <span aria-hidden="true">✓</span>
                    </button>
                    <button
                      type="button"
                      className="advisor-history-action-btn advisor-history-action-cancel"
                      aria-label="Скасувати перейменування"
                      title="Скасувати"
                      disabled={isMutating}
                      onClick={cancelRename}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className={isActive ? "advisor-history-item is-active" : "advisor-history-item"}
                      data-conversation-id={entry.id}
                      aria-current={isActive ? "page" : undefined}
                      disabled={controlsDisabled}
                      onClick={() => {
                        changeConversation(entry.id);
                        if (historyOpen) closeHistory();
                      }}
                    >
                      <span>{entry.title}</span>
                      {hasDraft && <small>Чернетка</small>}
                    </button>
                    {(isSaved || canDelete) && (
                      <div className="advisor-history-actions">
                        {isSaved && (
                          <button
                            type="button"
                            className="advisor-history-action-btn"
                            aria-label={`Перейменувати розмову «${entry.title}»`}
                            title="Перейменувати"
                            disabled={controlsDisabled}
                            onClick={() => startRename(entry, surface)}
                          >
                            <RenameIcon />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="advisor-history-action-btn advisor-history-action-delete"
                            aria-label={`Видалити розмову «${entry.title}»`}
                            title="Видалити"
                            disabled={controlsDisabled}
                            onClick={() => void deleteConversation(entry, isSaved)}
                          >
                            <DeleteIcon />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
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
  };

  const desktopHistory = (
    <aside className="advisor-history advisor-history-desktop" aria-label="Історія розмов">
      {renderHistoryContents("desktop")}
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
            if (event.defaultPrevented) return;
            if (editingIdRef.current !== null) {
              event.preventDefault();
              cancelRename();
              return;
            }
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
        {renderHistoryContents("mobile")}
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
            {messages.map((m, index) => {
              const isCopied = copiedId === m.id;
              const selectedProgram = GRANT_PROGRAMS.find(program => program.id === m.selectedProgramId);
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
                        {m.mode === "guided"
                          ? m.fallbackReason ? "Модель недоступна · довідка за каталогом" : "Довідка за каталогом"
                          : "Раніше збережена відповідь ШІ"}
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
                    {revealingId !== m.id && m.extractedFacts && m.extractedFacts.length > 0 && (
                      <div className="advisor-context-sync-pill" role="status">
                        <div className="advisor-sync-lead">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                          <span>Можливі дані для профілю. Звірте їх перед збереженням.</span>
                        </div>
                        <div className="advisor-sync-chips">
                          {m.extractedFacts.map((f) => (
                            <span key={f.field} className="advisor-sync-chip" title={f.value}>
                              <strong>{f.label}:</strong> {f.value}
                            </span>
                          ))}
                        </div>
                        {onOpenProfile && (
                          <button
                            type="button"
                            className="advisor-sync-link"
                            onClick={onOpenProfile}
                          >
                            Перевірити й змінити профіль →
                          </button>
                        )}
                      </div>
                    )}
                    {revealingId !== m.id && !selectedProgram && m.search.matches.length > 0 && (
                      <div className="advisor-recommendations" aria-label="Можливі програми">
                        {m.search.matches.slice(0, 3).map((match) => {
                          const p = GRANT_PROGRAMS.find((program) => program.id === match.programId);
                          if (!p) return null;
                          const intake = grantIntake(p);
                          const support = grantSupport(p.id);
                          return (
                            <article key={p.id} className="advisor-grant">
                              <h3>{match.title}</h3>
                              <p>{match.reason}</p>
                              <small>{match.caution}</small>
                              <p><strong>Прийом:</strong> {intake.intakeLabel}</p>
                              <p><strong>Допомога GrantFolio:</strong> {support.supportLabel}</p>
                              <p><a href={p.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`Офіційне джерело програми: ${match.title} (відкриється в новій вкладці)`}>Офіційне джерело ↗</a></p>
                              <div className="advisor-grant-actions">
                                <button
                                  type="button"
                                  className="advisor-grant-secondary"
                                  aria-label={`Умови програми: ${match.title}`}
                                  onClick={() => onView(p)}
                                >
                                  Умови програми
                                </button>
                                {hasGuidedApplication(p.id) && <button
                                  type="button"
                                  className="advisor-grant-primary"
                                  aria-label={`Готувати матеріали для програми: ${match.title}`}
                                  onClick={() => support.supportDepth === "guided-draft"
                                    ? onPrepare(p, m.seed)
                                    : fill(`Які вимоги програми «${p.title}» і що ще потрібно перевірити?`)}
                                >
                                  Готувати робочі матеріали
                                </button>}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    {revealingId !== m.id && !selectedProgram && m.search.matches.length > 0 && index === messages.length - 1 && onOpenFeedback && (
                      <FeedbackPromptBanner
                        milestoneKey="advisor-matches"
                        title="Чи підійшли вам запропоновані гранти?"
                        description="Будь ласка, поділіться, чи легко було розібратися та що варто покращити на сайті."
                        actionLabel="Поділитися думкою"
                        onOpenFeedback={() => onOpenFeedback({ programId: m.search.matches[0]?.programId ?? null })}
                      />
                    )}
                    {revealingId !== m.id && selectedProgram && hasGuidedApplication(selectedProgram.id) &&
                      <div className="advisor-grant-actions">
                        <button type="button" className="advisor-grant-primary" onClick={() => onPrepare(selectedProgram, m.seed)}>
                          Почати чернетку для «{selectedProgram.title}»
                        </button>
                      </div>}
                    {revealingId !== m.id && !selectedProgram && preparablePilot &&
                      !m.search.matches.some(match => match.programId === preparablePilot.id) &&
                      m.search.intents.includes("business") &&
                      !m.search.intents.includes("study") && (
                        <aside className="advisor-grant" aria-label="Підготовка до майбутнього прийому">
                          <h3>Власна справа 2.0 · прийом не підтверджено</h3>
                          <p>Можна заздалегідь підготувати опис і кошторис. Перевірте свій статус, КВЕД і допустимі витрати в умовах програми.</p>
                          <div className="advisor-grant-actions">
                            <button type="button" className="advisor-grant-secondary" onClick={() => onView(preparablePilot)}>Переглянути умови «Власної справи»</button>
                            <button type="button" className="advisor-grant-primary" onClick={() => onPrepare(preparablePilot, m.seed)}>Готувати робочу чернетку</button>
                          </div>
                        </aside>
                      )}
                    {revealingId !== m.id && (
                      <div className="advisor-followups">
                        {m.search.questions.slice(0, 2).map((q) => (
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
                  disabled={busy || loading || mutatingChatId !== null || !text.trim()}
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
