import { progressLabel, type AgentRequestInit } from "./agent-progress";
import { AgentProposals, type PendingProposal } from "./AgentProposals";
import { ReplyReveal } from "./ReplyReveal";
import { useConfirm } from "./ConfirmDialog";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./Assistant.css";
import { readableApiError } from "./api";

export type FieldKey = "projectDescription" | "customers" | "salesChannels" | "implementationPlan" | "expectedResults";
export type DraftSuggestion = { field: FieldKey; text: string };
const fieldLabels: Record<FieldKey, string> = {
  projectDescription: "Опис проєкту",
  customers: "Клієнти",
  salesChannels: "Канали продажу",
  implementationPlan: "План реалізації",
  expectedResults: "Очікувані результати",
};
const isSuggestion = (value: unknown): value is DraftSuggestion =>
  !!value &&
  typeof value === "object" &&
  Object.hasOwn(fieldLabels, (value as DraftSuggestion).field) &&
  typeof (value as DraftSuggestion).text === "string" &&
  !!(value as DraftSuggestion).text.trim() &&
  (value as DraftSuggestion).text.length <= 3000;

export type SuggestedBudgetItem = { name: string; quantity: string; price: string };

type Props = {
  projectDetails?: Record<FieldKey, string>;
  onApplySuggestion?: (suggestion: DraftSuggestion, mode: "replace" | "append", expectedCurrent: string) => boolean;
  canApplySuggestions?: boolean;
  caseId: string;
  revision: number;
  profileRevision?: number;
  blocked: boolean;
  blockedReason?: string;
  onRevisionConflict?: () => void;
  onProposalApplied?: () => void;
  request: (path: string, init?: AgentRequestInit) => Promise<Response>;
  prefilledPrompt?: string;
  onClearPrefilled?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onImportBudgetItems?: (items: SuggestedBudgetItem[]) => boolean;
  programTitle?: string;
  programSelected?: boolean;
  goalText?: string;
  welcomePrompt?: string;
  nextStep?: { label: string; description: string; onOpen: () => void };
  onReviewDocuments?: () => void;
  embedded?: boolean;
};

type StarterIconKind = "budget" | "rules" | "customers" | "readiness" | "idea" | "plan";

type StarterPrompt = {
  icon: StarterIconKind;
  label: string;
  text: string;
};

export function AiEmblem() {
  return (
    <span className="ai-emblem" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M12 2.2c.4 4.2 2.2 6.9 5.6 8.3.9.4 1.9.6 3 .8-4.2.4-6.9 2.2-8.3 5.6-.4.9-.6 1.9-.8 3-.4-4.2-2.2-6.9-5.6-8.3-.9-.4-1.9-.6-3-.8 4.2-.4 6.9-2.2 8.3-5.6.4-.9.6-1.9.8-3Z" />
      </svg>
    </span>
  );
}

export function CopyActionIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

export function ScrollDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function SendArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function StarterPromptIcon({ kind }: { kind: StarterIconKind }) {
  switch (kind) {
    case "budget":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="3" width="16" height="18" rx="2.5" />
          <path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2" />
        </svg>
      );
    case "rules":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "customers":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <circle cx="16.5" cy="9" r="2.2" />
          <path d="M16.5 14a4.2 4.2 0 0 1 4 4.2" />
        </svg>
      );
    case "readiness":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5.5c0 4.6-3 8.4-7 9.5-4-1.1-7-4.9-7-9.5V6l7-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "idea":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.5 1.2 1.3 1.3 2.1h4.4c.1-.8.6-1.6 1.3-2.1A6 6 0 0 0 12 3Z" />
        </svg>
      );
    case "plan":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 7h14M5 12h10M5 17h7" />
          <circle cx="18" cy="16" r="2.5" />
        </svg>
      );
  }
}

function getStarterPrompts(title = "Власна справа", programSelected = true): StarterPrompt[] {
  if (!programSelected) {
    return [
      {
        icon: "idea",
        label: "Допоможи описати ідею",
        text: "Допоможи чітко описати мою бізнес-ідею і постав запитання про важливі деталі.",
      },
      {
        icon: "customers",
        label: "Визначити клієнтів",
        text: "Допоможи описати потенційних клієнтів і способи продажу для моєї справи.",
      },
      {
        icon: "plan",
        label: "Скласти план дій",
        text: "Допоможи скласти зрозумілий план започаткування або розвитку моєї справи.",
      },
      {
        icon: "budget",
        label: "Підготувати робочий кошторис",
        text: "Допоможи скласти попередній кошторис моєї ідеї. Познач ціни як орієнтовні та не припускай, що витрати дозволені за конкретною програмою.",
      },
    ];
  }
  return [
    {
      icon: "budget",
      label: `Розрахувати кошторис («${title}»)`,
      text: `Запропонуй конкретні статті витрат з орієнтовними цінами для мого проєкту з урахуванням дозволених напрямків програми «${title}» (обладнання, оренда, сировина, маркетинг).`,
    },
    {
      icon: "rules",
      label: "Вимоги програми та ліміти",
      text: `На які саме цілі дозволено витрачати грант «${title}», які є ліміти (оренда, сировина, сума) та які вимоги щодо створення робочих місць?`,
    },
    {
      icon: "customers",
      label: "Допоможи описати клієнтів",
      text: "Підкажи, як чітко й переконливо описати цільову аудиторію та канали продажу для мого бізнесу, щоб це переконало грантову комісію.",
    },
    {
      icon: "readiness",
      label: "Перевір готовність моєї заявки",
      text: "Проаналізуй збережені дані мого проєкту. Яких важливих деталей ще бракує для сильної заявки?",
    },
  ];
}

type Exchange = {
  id: string;
  question: string;
  reply: string;
  revision: number;
  createdAt: string;
  stale: boolean;
  suggestions?: DraftSuggestion[];
  pending_proposals?: PendingProposal[];
};
type History = {
  exchanges: Exchange[];
  hasMore: boolean;
  nextBefore: string | null;
};

function isExchange(value: unknown): value is Exchange {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.question === "string" &&
    typeof e.reply === "string" &&
    typeof e.revision === "number" &&
    typeof e.createdAt === "string" &&
    typeof e.stale === "boolean" &&
    (e.suggestions === undefined || (Array.isArray(e.suggestions) && e.suggestions.every(isSuggestion)))
  );
}
function isHistory(value: unknown): value is History {
  if (!value || typeof value !== "object") return false;
  const h = value as Record<string, unknown>;
  return (
    Array.isArray(h.exchanges) &&
    h.exchanges.every(isExchange) &&
    typeof h.hasMore === "boolean" &&
    (typeof h.nextBefore === "string" || h.nextBefore === null) &&
    (!h.hasMore || typeof h.nextBefore === "string")
  );
}
function mergeExchanges(first: Exchange[], second: Exchange[]) {
  const ids = new Set<string>();
  return [...first, ...second].filter((exchange) => {
    if (ids.has(exchange.id)) return false;
    ids.add(exchange.id);
    return true;
  });
}

function extractBudgetItemsFromText(text: string): SuggestedBudgetItem[] {
  const items: SuggestedBudgetItem[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(
      /(?:[-*•]|\d+\.)\s*(?:(?:Обладнання|Оренда|Сировина|Маркетинг|ПЗ|Послуги|Устаткування):\s*)?([^:—–-]+?)\s*[:—–-]\s*([\d\s.,]+)\s*грн/i
    );
    if (match) {
      const name = match[1].replace(/[*_#]/g, "").trim();
      const rawPrice = match[2].replace(/\s/g, "").replace(",", ".");
      const priceNum = parseFloat(rawPrice);
      if (name.length > 2 && !isNaN(priceNum) && priceNum > 0 && priceNum <= 10000000) {
        const qtyMatch = line.match(/кількість:\s*(\d+)/i);
        const qty = qtyMatch ? qtyMatch[1] : "1";
        items.push({ name, quantity: qty, price: priceNum.toFixed(2) });
      }
    }
  }
  return items;
}

// React renders every unmatched fragment as text; links are restricted to web URLs.
function formatInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code className="chat-inline-code" key={index}>
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const isHeadingLine = (line: string) => /^\s{0,3}#{1,6}\s+(.+)$/.test(line);
const isDividerLine = (line: string) => /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line);
const isBlockquoteLine = (line: string) => /^\s*>\s?/.test(line);
const isUnorderedListLine = (line: string) => /^\s*[-*•]\s+/.test(line);
const isOrderedListLine = (line: string) => /^\s*\d+[.)]\s+/.test(line);

export function FormattedReply({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }
    if (isDividerLine(line)) {
      blocks.push(<hr className="chat-divider" key={index} />);
      index++;
      continue;
    }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3 className="reply-heading" key={index}>
          {formatInline(heading[1])}
        </h3>
      );
      index++;
      continue;
    }
    if (isBlockquoteLine(line)) {
      const start = index;
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index++;
      }
      blocks.push(
        <blockquote className="chat-blockquote" key={start}>
          {quoteLines.map((quoteLine, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {formatInline(quoteLine)}
            </span>
          ))}
        </blockquote>
      );
      continue;
    }
    if (isUnorderedListLine(line)) {
      const start = index;
      const items: ReactNode[] = [];
      while (index < lines.length && isUnorderedListLine(lines[index])) {
        items.push(<li key={index}>{formatInline(lines[index].replace(/^\s*[-*•]\s+/, ""))}</li>);
        index++;
      }
      blocks.push(<ul key={start}>{items}</ul>);
      continue;
    }
    if (isOrderedListLine(line)) {
      const start = index;
      const items: ReactNode[] = [];
      while (index < lines.length && isOrderedListLine(lines[index])) {
        items.push(<li key={index}>{formatInline(lines[index].replace(/^\s*\d+[.)]\s+/, ""))}</li>);
        index++;
      }
      blocks.push(<ol key={start}>{items}</ol>);
      continue;
    }
    const start = index;
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isDividerLine(lines[index]) &&
      !isHeadingLine(lines[index]) &&
      !isBlockquoteLine(lines[index]) &&
      !isUnorderedListLine(lines[index]) &&
      !isOrderedListLine(lines[index])
    ) {
      paragraph.push(lines[index++]);
    }
    blocks.push(
      <p key={start}>
        {paragraph.map((lineText, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 && <br />}
            {formatInline(lineText)}
          </span>
        ))}
      </p>
    );
  }
  return <>{blocks}</>;
}

export function Assistant({
  caseId,
  revision,
  profileRevision = 0,
  blocked,
  blockedReason,
  onRevisionConflict,
  onProposalApplied,
  request,
  prefilledPrompt,
  onClearPrefilled,
  onDraftChange,
  onImportBudgetItems,
  programTitle,
  programSelected = true,
  goalText,
  welcomePrompt,
  nextStep,
  onReviewDocuments,
  projectDetails,
  onApplySuggestion,
  canApplySuggestions = false,
  embedded = false,
}: Props) {
  const confirm = useConfirm();
  const activeCaseIdRef = useRef(caseId);
  activeCaseIdRef.current = caseId;
  const starterPrompts = getStarterPrompts(programTitle, programSelected);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const followReply = () => {
    if (nearBottom.current && scrollArea.current) {
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
    }
  };
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [importedNotice, setImportedNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollToBottom = useRef(false);
  const copyTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [agentProgress, setAgentProgress] = useState("Опрацьовую запит…");
  const [copyError, setCopyError] = useState("");
  const [preview, setPreview] = useState<{ suggestion: DraftSuggestion; exchangeId: string; current: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const suggestedBudgetByExchange = useMemo(() => {
    const map = new Map<string, SuggestedBudgetItem[]>();
    for (const exchange of exchanges) {
      map.set(exchange.id, extractBudgetItemsFromText(exchange.reply));
    }
    return map;
  }, [exchanges]);

  const closePreview = () => {
    setPreview(null);
    setPreviewError("");
    returnFocus.current?.focus();
    returnFocus.current = null;
  };
  useEffect(() => {
    if (preview) dialogRef.current?.focus();
  }, [preview?.exchangeId, preview?.suggestion.field]);
  useEffect(() => {
    setPreview(null);
    setPreviewError("");
  }, [caseId]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [message]);

  const previewExchange = preview && exchanges.find((e) => e.id === preview.exchangeId);
  const previewDisabled = !previewExchange || previewExchange.stale || previewExchange.revision !== revision || !canApplySuggestions || !onApplySuggestion;

  function openPreview(suggestion: DraftSuggestion, exchangeId: string, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setPreviewError("");
    setPreview({ suggestion, exchangeId, current: projectDetails?.[suggestion.field] ?? "" });
  }
  function applySuggestion(mode: "replace" | "append") {
    if (!preview || previewDisabled || !onApplySuggestion) return;
    if (!onApplySuggestion(preview.suggestion, mode, preview.current)) {
      setPreviewError("Не вдалося перенести текст: поле могло змінитися або перевищено допустиму довжину. Оновіть порівняння і перевірте текст.");
      return;
    }
    closePreview();
    setImportedNotice("Перенесено у чернетку, збережіть зміни.");
  }

  const requestRef = useRef(request);
  requestRef.current = request;
  const active = useRef(false);
  const historyController = useRef<AbortController | null>(null);
  const submitController = useRef<AbortController | null>(null);
  const historyBusy = useRef(false);
  const submitBusy = useRef(false);

  async function loadHistory(before: string | null) {
    if (historyBusy.current) return;
    historyBusy.current = true;
    const controller = new AbortController();
    historyController.current = controller;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const query = before ? `?before=${encodeURIComponent(before)}` : "";
      const response = await requestRef.current(`/api/cases/${caseId}/assistant/history${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("history request failed");
      const data: unknown = await response.json();
      if (!isHistory(data)) throw new Error("invalid history");
      if (!active.current || controller.signal.aborted) return;
      if (!before && data.exchanges.length > 0) scrollToBottom.current = true;
      setExchanges((current) => mergeExchanges(data.exchanges, current));
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
    } catch {
      if (active.current && !controller.signal.aborted) setHistoryError(true);
    } finally {
      if (historyController.current === controller) {
        historyBusy.current = false;
        if (active.current && !controller.signal.aborted) setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    active.current = true;
    setExchanges([]);
    setRevealingId(null);
    nearBottom.current = true;
    setIsAtBottom(true);
    setMessage("");
    setError("");
    setLoading(false);
    setPendingQuestion("");
    setHasMore(false);
    setNextBefore(null);
    void loadHistory(null);
    return () => {
      active.current = false;
      historyController.current?.abort();
      submitController.current?.abort();
      historyBusy.current = false;
      submitBusy.current = false;
    };
  }, [caseId]);

  const lastProfileRevision = useRef(profileRevision);
  useEffect(() => {
    if (lastProfileRevision.current === profileRevision) return;
    lastProfileRevision.current = profileRevision;
    setExchanges((current) => current.map((exchange) => ({ ...exchange, stale: true })));
    historyController.current?.abort();
    historyBusy.current = false;
    void loadHistory(null);
  }, [profileRevision]);

  useEffect(() => {
    onDraftChange?.(!!message.trim());
  }, [message, onDraftChange]);

  useEffect(() => {
    if (!prefilledPrompt) return;
    const promptToApply = prefilledPrompt;
    const targetCaseId = caseId;
    onClearPrefilled?.();
    if (!message.trim() || message === promptToApply) {
      setMessage(promptToApply);
      return;
    }
    void confirm({
      title: "Замінити ненадіслане запитання?",
      message: "У полі вводу вже є текст. Замінити його запропонованим запитанням?",
      confirmLabel: "Замінити",
      cancelLabel: "Залишити мій текст",
      tone: "warning",
    }).then((confirmed) => {
      if (confirmed && active.current && activeCaseIdRef.current === targetCaseId) {
        setMessage(promptToApply);
      }
    });
  }, [prefilledPrompt, onClearPrefilled, caseId, confirm]);

  useEffect(() => {
    if (exchanges.length === 0 && !loading) {
      if (scrollArea.current) scrollArea.current.scrollTop = 0;
      scrollToBottom.current = false;
      return;
    }
    if (scrollToBottom.current) {
      followReply();
      scrollToBottom.current = false;
    }
  }, [exchanges, loading]);

  async function sendQuestion(text: string) {
    if (blocked || submitBusy.current || !text.trim()) return;
    submitBusy.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    const submittedRevision = revision;
    const submittedMessage = text.trim();
    nearBottom.current = true;
    setIsAtBottom(true);
    scrollToBottom.current = true;
    setPendingQuestion(submittedMessage);
    setAgentProgress("Опрацьовую запит…");
    setLoading(true);
    setError("");
    setImportedNotice("");
    try {
      const response = await requestRef.current(`/api/cases/${caseId}/assistant`, {
        method: "POST",
        signal: controller.signal,
        onAgentProgress: event => setAgentProgress(progressLabel(event)),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: submittedRevision,
          message: submittedMessage,
        }),
      });
      if (!active.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) onRevisionConflict?.();
        const failure = await response.json().catch(() => null);
        const errors: Record<number, string> = {
          401: "Не вдалося підтвердити вхід. Вийдіть з акаунта й увійдіть знову.",
          403: "Не вдалося підтвердити вхід. Вийдіть з акаунта й увійдіть знову.",
          404: "Чернетку не знайдено. Оновіть сторінку та спробуйте знову.",
          409: "Чернетка змінилася. Завантажте актуальну версію перед запитом.",
          429: "Забагато запитів. Зачекайте та спробуйте ще раз.",
          503:
            failure?.error === "assistant_unavailable"
              ? "Асистент поки не налаштований. Спробуйте пізніше."
              : "Асистент тимчасово недоступний. Спробуйте трохи пізніше.",
          500: "Не вдалося зберегти відповідь. Ваше запитання залишилося у формі.",
          502: "Асистент тимчасово недоступний. Спробуйте ще раз.",
          504: "Асистент не встиг відповісти. Спробуйте ще раз.",
        };
        setError(errors[response.status] || "Не вдалося отримати та зберегти відповідь. Спробуйте ще раз.");
        return;
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !isExchange((result as Record<string, unknown>).exchange)) {
        throw new Error("invalid response");
      }
      if (!active.current || controller.signal.aborted) return;
      const exchange = (result as { exchange: Exchange }).exchange;
      scrollToBottom.current = true;
      setRevealingId(exchanges.some((item) => item.id === exchange.id) ? null : exchange.id);
      setExchanges((current) => mergeExchanges(current, [exchange]));
      setMessage("");
    } catch (err) {
      if (active.current && !controller.signal.aborted) {
        setError(readableApiError(err, "Не вдалося отримати та зберегти відповідь. Спробуйте ще раз."));
      }
    } finally {
      if (submitController.current === controller) {
        submitBusy.current = false;
        if (active.current && !controller.signal.aborted) {
          setLoading(false);
          setPendingQuestion("");
        }
      }
    }
  }

  function handleImport(items: SuggestedBudgetItem[]) {
    if (!onImportBudgetItems || items.length === 0 || blocked || loading) return;
    if (!onImportBudgetItems(items)) {
      setImportedNotice("Не вдалося додати статті до бюджету. Перевірте кількість наявних позицій.");
      return;
    }
    setImportedNotice(`Додано ${items.length} поз. до бюджету. Перевірте назви, кількість і ціни.`);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setImportedNotice("");
    }, 5000);
  }

  async function usePrompt(text: string) {
    const targetCaseId = caseId;
    if (message.trim() && message !== text) {
      const confirmed = await confirm({
        title: "Замінити ненадіслане запитання?",
        message: "У полі вводу вже є текст. Замінити його запропонованим запитанням?",
        confirmLabel: "Замінити",
        cancelLabel: "Залишити мій текст",
        tone: "warning",
      });
      if (!confirmed || !active.current || activeCaseIdRef.current !== targetCaseId) return;
    }
    setMessage(text);
    inputRef.current?.focus();
  }

  async function copyReply(exchange: Exchange) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(exchange.reply);
      setCopiedId(exchange.id);
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

  const hasMessages = exchanges.length > 0 || loading;

  return (
    <section className="live-chat-container" aria-labelledby="live-chat-heading">
      {embedded ? (
        <h2 id="live-chat-heading" className="sr-only">
          Асистент
        </h2>
      ) : (
        <header className="live-chat-header">
          <div className="chat-header-info">
            <h2 id="live-chat-heading">Асистент</h2>
            <span className="chat-status-indicator">Відповідає на основі збереженої версії проєкту</span>
          </div>
        </header>
      )}
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
        {historyLoading && (
          <p className="chat-status-msg" role="status">
            Завантажуємо історію розмови…
          </p>
        )}
        {historyError && (
          <div className="chat-status-msg" role="alert">
            Не вдалося завантажити історію.{" "}
            <button type="button" className="link" onClick={() => void loadHistory(nextBefore)}>
              Спробувати ще раз
            </button>
          </div>
        )}
        {hasMore && !historyError && (
          <button
            type="button"
            className="link load-more-history-btn"
            disabled={historyLoading}
            onClick={() => void loadHistory(nextBefore)}
          >
            Показати попередні повідомлення
          </button>
        )}
        {exchanges.length === 0 && !loading && !historyLoading && !historyError && (
          <div className="chat-welcome-card">
            <div className="welcome-content">
              <span className="welcome-eyebrow">ВАШ ПРОЄКТ · АСИСТЕНТ</span>
              <h3>З чого почнемо?</h3>
              <p>
                {welcomePrompt ??
                  "Обговоріть ідею, кошторис або наступні кроки. Асистент використовує збережені дані проєкту; його відповіді та умови програми варто перевіряти."}
              </p>
              {goalText && <p className="chat-goal-text">{goalText}</p>}
              <p className="welcome-suggestions-label">Запитайте, наприклад</p>
              <div className="welcome-quick-actions">
                {starterPrompts.map((sp) => (
                  <button
                    key={sp.label}
                    type="button"
                    className="welcome-action-chip"
                    onClick={() => usePrompt(sp.text)}
                  >
                    <span className="welcome-action-icon" aria-hidden="true">
                      <StarterPromptIcon kind={sp.icon} />
                    </span>
                    <span className="welcome-action-label">{sp.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {exchanges.map((exchange) => {
          const suggestedItems = suggestedBudgetByExchange.get(exchange.id) ?? [];
          const isCopied = copiedId === exchange.id;
          return (
            <div className="chat-turn" key={exchange.id}>
              <div className="chat-bubble user-bubble">
                <span className="sr-only">Ви</span>
                <div className="bubble-text">{exchange.question}</div>
              </div>
              <div className="chat-bubble assistant-bubble">
                <div className="assistant-bubble-author">
                  <AiEmblem />
                  <strong className="author-name">GrantFolio Асистент</strong>
                  <span className="revision-badge">Версія {exchange.revision}</span>
                </div>
                {(exchange.stale || exchange.revision !== revision) && (
                  <div className="stale-alert">Ця відповідь стосується попередніх даних профілю або проєкту.</div>
                )}
                <div className="bubble-text assistant-text">
                  <ReplyReveal
                    text={exchange.reply}
                    animate={revealingId === exchange.id}
                    onComplete={() => setRevealingId((id) => (id === exchange.id ? null : id))}
                    onProgress={followReply}
                  >
                    {(visible) => <FormattedReply text={visible} />}
                  </ReplyReveal>
                </div>
                {revealingId !== exchange.id && (
                  <div className="assistant-bubble-actions">
                    <button
                      type="button"
                      className={`bubble-copy-btn${isCopied ? " is-copied" : ""}`}
                      aria-label={isCopied ? "Відповідь скопійовано" : "Копіювати відповідь асистента"}
                      onClick={() => void copyReply(exchange)}
                    >
                      <CopyActionIcon copied={isCopied} />
                      <span>{isCopied ? "Скопійовано" : "Копіювати"}</span>
                    </button>
                  </div>
                )}
                {exchange.pending_proposals?.length ? <AgentProposals proposals={exchange.pending_proposals} request={request} blocked={blocked || loading || exchange.stale || exchange.revision !== revision} onApplied={onProposalApplied} /> : null}
                {revealingId !== exchange.id && exchange.suggestions && exchange.suggestions.length > 0 && (
                  <div className="chat-actionable-card suggestion-list">
                    <strong>Текст для заявки</strong>
                    <p>Перегляньте пропозицію перед перенесенням у чернетку.</p>
                    {exchange.suggestions.map((suggestion, index) => (
                      <button
                        type="button"
                        key={`${suggestion.field}-${index}`}
                        className="suggestion-review"
                        onClick={(e) => openPreview(suggestion, exchange.id, e.currentTarget)}
                      >
                        Переглянути текст для заявки · {fieldLabels[suggestion.field]}
                      </button>
                    ))}
                  </div>
                )}
                {revealingId !== exchange.id && suggestedItems.length > 0 && onImportBudgetItems && (
                  <div className="chat-actionable-card">
                    <div className="actionable-card-info">
                      <strong>Можливі статті витрат · {suggestedItems.length}</strong>
                      <span>Перевірте пропозиції перед додаванням до бюджету.</span>
                    </div>
                    <div className="suggested-items-preview">
                      {suggestedItems.map((item, idx) => (
                        <div key={idx} className="suggested-item-chip">
                          <span>
                            {item.name} · {item.quantity} шт.
                          </span>
                          <span>{Number(item.price).toLocaleString("uk-UA")} грн</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="actionable-import-btn"
                      disabled={blocked || loading || exchange.stale || exchange.revision !== revision}
                      onClick={() => handleImport(suggestedItems)}
                    >
                      Додати до бюджету
                    </button>
                    {(exchange.stale || exchange.revision !== revision) && (
                      <p>Попросіть оновити кошторис для поточних даних перед додаванням витрат.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
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
                <span className="chat-pending-text">{agentProgress}</span>
              </div>
            </div>
          </div>
        )}
        {hasMessages && (nextStep || onReviewDocuments) && (
          <section className="chat-next-step" aria-label="Наступні кроки">
            {nextStep && (
              <div className="chat-next-step-content">
                <strong>Наступний крок</strong>
                <p>{nextStep.description}</p>
                <button type="button" className="chat-next-step-primary" onClick={nextStep.onOpen}>
                  {nextStep.label}
                </button>
              </div>
            )}
            {onReviewDocuments && (
              <button type="button" className="chat-next-step-secondary" onClick={onReviewDocuments}>
                Документи та подання
              </button>
            )}
          </section>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copiedId ? "Відповідь скопійовано в буфер обміну." : ""}
      </span>
      {preview && (
        <div className="suggestion-overlay" onClick={closePreview}>
          <div
            className="suggestion-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-heading"
            tabIndex={-1}
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closePreview();
              }
              if (event.key === "Tab") {
                const controls = Array.from(
                  dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
                  ) ?? []
                );
                if (!controls.length) {
                  event.preventDefault();
                  return;
                }
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <div className="suggestion-dialog-header">
              <h2 id="suggestion-heading">Перегляньте текст: {fieldLabels[preview.suggestion.field]}</h2>
              <button
                type="button"
                className="suggestion-dialog-close"
                aria-label="Закрити вікно порівняння"
                onClick={closePreview}
              >
                ×
              </button>
            </div>
            <div className="suggestion-comparison">
              <div>
                <h3>Зараз у чернетці</h3>
                <p>{preview.current || "Поле порожнє"}</p>
              </div>
              <div>
                <h3>Пропозиція асистента</h3>
                <p>{preview.suggestion.text}</p>
              </div>
            </div>
            {previewError && (
              <p className="suggestion-dialog-error" role="alert">
                {previewError}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setPreview({ ...preview, current: projectDetails?.[preview.suggestion.field] ?? "" });
                    setPreviewError("");
                  }}
                >
                  Оновити порівняння
                </button>
              </p>
            )}
            {previewDisabled && (
              <p className="suggestion-dialog-notice" role="status">
                Перенесення зараз недоступне. Перевірте актуальність відповіді та стан збереження проєкту.
              </p>
            )}
            <p className="suggestion-dialog-hint">Виберіть, як перенести текст. Перевірте його перед збереженням.</p>
            <div className="suggestion-dialog-actions">
              <button
                type="button"
                className="suggestion-action-primary"
                disabled={previewDisabled}
                onClick={() => applySuggestion("replace")}
              >
                Замінити текст
              </button>
              <button
                type="button"
                className="suggestion-action-secondary"
                disabled={previewDisabled}
                onClick={() => applySuggestion("append")}
              >
                Додати до тексту
              </button>
              <button type="button" className="suggestion-action-cancel" onClick={closePreview}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
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
        {importedNotice && (
          <div className="chat-imported-banner" role="status">
            {importedNotice}
          </div>
        )}
        {copyError && (
          <div className="chat-error-banner" role="alert">
            {copyError}
          </div>
        )}
        {error && (
          <div className="chat-error-banner" role="alert">
            {error}
          </div>
        )}
        {blocked && (
          <div className="chat-blocked-note" role="status">
            {blockedReason || "Збережіть зміни проєкту, щоб надіслати запит або додати витрати."}
          </div>
        )}
        <form
          className="chat-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(message);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={2000}
            aria-label="Ваше запитання"
            value={message}
            disabled={loading}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Запитайте про ваш проєкт…"
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
                void sendQuestion(message);
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
              disabled={blocked || loading || !message.trim()}
            >
              <SendArrowIcon />
            </button>
          </div>
        </form>
        <p className="chat-disclaimer">Відповіді можуть містити помилки. Перевіряйте важливу інформацію.</p>
      </div>
    </section>
  );
}
