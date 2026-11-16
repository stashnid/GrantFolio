import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Assistant.css";
import { readableApiError } from "./api";

export type FieldKey = "projectDescription" | "customers" | "salesChannels" | "implementationPlan" | "expectedResults";
export type DraftSuggestion = { field: FieldKey; text: string };
const fieldLabels: Record<FieldKey, string> = { projectDescription: "Опис проєкту", customers: "Клієнти", salesChannels: "Канали продажу", implementationPlan: "План реалізації", expectedResults: "Очікувані результати" };
const isSuggestion = (value: unknown): value is DraftSuggestion => !!value && typeof value === "object" && Object.hasOwn(fieldLabels, (value as DraftSuggestion).field) && typeof (value as DraftSuggestion).text === "string" && !!(value as DraftSuggestion).text.trim() && (value as DraftSuggestion).text.length <= 3000;

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
  request: (path: string, init?: RequestInit) => Promise<Response>;
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
};

function getStarterPrompts(title = "Власна справа", programSelected = true) {
  if (!programSelected) return [
    { label: "Допоможи описати ідею", text: "Допоможи чітко описати мою бізнес-ідею і постав запитання про важливі деталі." },
    { label: "Визначити клієнтів", text: "Допоможи описати потенційних клієнтів і способи продажу для моєї справи." },
    { label: "Скласти план дій", text: "Допоможи скласти зрозумілий план започаткування або розвитку моєї справи." },
    { label: "Підготувати робочий кошторис", text: "Допоможи скласти попередній кошторис моєї ідеї. Познач ціни як орієнтовні та не припускай, що витрати дозволені за конкретною програмою." },
  ];
  return [
    {
      label: `Розрахувати кошторис («${title}»)`,
      text: `Запропонуй конкретні статті витрат з орієнтовними цінами для мого проєкту з урахуванням дозволених напрямків програми «${title}» (обладнання, оренда, сировина, маркетинг).`,
    },
    {
      label: "Вимоги програми та ліміти",
      text: `На які саме цілі дозволено витрачати грант «${title}», які є ліміти (оренда, сировина, сума) та які вимоги щодо створення робочих місць?`,
    },
    {
      label: "Допоможи описати клієнтів",
      text: "Підкажи, як чітко й переконливо описати цільову аудиторію та канали продажу для мого бізнесу, щоб це переконало грантову комісію.",
    },
    {
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
  const parts = text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function FormattedReply({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 className="reply-heading" key={index}>{formatInline(heading[1])}</h3>);
      index++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const start = index;
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        items.push(<li key={index}>{formatInline(lines[index].replace(/^\s*[-*•]\s+/, ""))}</li>);
        index++;
      }
      blocks.push(<ul key={start}>{items}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = index;
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(<li key={index}>{formatInline(lines[index].replace(/^\s*\d+[.)]\s+/, ""))}</li>);
        index++;
      }
      blocks.push(<ol key={start}>{items}</ol>);
      continue;
    }
    const start = index;
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s{0,3}#{1,6}\s+/.test(lines[index]) && !/^\s*[-*•]\s+/.test(lines[index]) && !/^\s*\d+[.)]\s+/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={start}>{paragraph.map((lineText, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{formatInline(lineText)}</span>)}</p>);
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
}: Props) {
  const starterPrompts = getStarterPrompts(programTitle, programSelected);
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
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollToBottom = useRef(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [copyError, setCopyError] = useState("");
  const [preview, setPreview] = useState<{ suggestion: DraftSuggestion; exchangeId: string; current: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closePreview = () => { setPreview(null); setPreviewError(""); returnFocus.current?.focus(); returnFocus.current = null; };
  useEffect(() => { if (preview) dialogRef.current?.focus(); }, [preview?.exchangeId, preview?.suggestion.field]);
  useEffect(() => { setPreview(null); setPreviewError(""); }, [caseId]);
  const previewExchange = preview && exchanges.find(e => e.id === preview.exchangeId);
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
      const response = await requestRef.current(
        `/api/cases/${caseId}/assistant/history${query}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("history request failed");
      const data: unknown = await response.json();
      if (!isHistory(data)) throw new Error("invalid history");
      if (!active.current || controller.signal.aborted) return;
      if (!before) scrollToBottom.current = true;
      setExchanges((current) => mergeExchanges(data.exchanges, current));
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
    } catch {
      if (active.current && !controller.signal.aborted) setHistoryError(true);
    } finally {
      if (historyController.current === controller) {
        historyBusy.current = false;
        if (active.current && !controller.signal.aborted)
          setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    active.current = true;
    setExchanges([]);
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
    setExchanges(current => current.map(exchange => ({ ...exchange, stale: true })));
    historyController.current?.abort();
    historyBusy.current = false;
    void loadHistory(null);
  }, [profileRevision]);

  useEffect(() => {
    onDraftChange?.(!!message.trim());
  }, [message, onDraftChange]);

  useEffect(() => {
    if (prefilledPrompt) {
      if (!message.trim() || message === prefilledPrompt || window.confirm("Замінити ненадіслане запитання запропонованим текстом?")) {
        setMessage(prefilledPrompt);
      }
      onClearPrefilled?.();
    }
  }, [prefilledPrompt, onClearPrefilled, caseId]);

  useEffect(() => {
    if (scrollToBottom.current) {
      chatBottomRef.current?.scrollIntoView({ block: "nearest" });
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
    scrollToBottom.current = true;
    setPendingQuestion(submittedMessage);
    setLoading(true);
    setError("");
    setImportedNotice("");
    try {
      const response = await requestRef.current(
        `/api/cases/${caseId}/assistant`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: submittedRevision,
            message: submittedMessage,
          }),
        },
      );
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
          503: failure?.error === "assistant_unavailable" ? "Асистент поки не налаштований. Спробуйте пізніше." : "Асистент тимчасово недоступний. Спробуйте трохи пізніше.",
          500: "Не вдалося зберегти відповідь. Ваше запитання залишилося у формі.",
          502: "Асистент тимчасово недоступний. Спробуйте ще раз.",
          504: "Асистент не встиг відповісти. Спробуйте ще раз.",
        };
        setError(
          errors[response.status] ||
            "Не вдалося отримати та зберегти відповідь. Спробуйте ще раз.",
        );
        return;
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !isExchange((result as Record<string, unknown>).exchange)
      )
        throw new Error("invalid response");
      if (!active.current || controller.signal.aborted) return;
      const exchange = (result as { exchange: Exchange }).exchange;
      scrollToBottom.current = true;
      setExchanges((current) => mergeExchanges(current, [exchange]));
      setMessage("");
    } catch (error) {
      if (active.current && !controller.signal.aborted)
        setError(readableApiError(error, "Не вдалося отримати та зберегти відповідь. Спробуйте ще раз."));
    } finally {
      if (submitController.current === controller) {
        submitBusy.current = false;
        if (active.current && !controller.signal.aborted) { setLoading(false); setPendingQuestion(""); }
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
    window.setTimeout(() => setImportedNotice(""), 5000);
  }

  function usePrompt(text: string) {
    if (message.trim() && message !== text && !window.confirm("Замінити ненадіслане запитання запропонованим текстом?")) return;
    setMessage(text);
    inputRef.current?.focus();
  }

  async function copyReply(exchange: Exchange) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(exchange.reply);
      setCopiedId(exchange.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopyError("Не вдалося скопіювати відповідь. Виділіть текст і скопіюйте його вручну.");
    }
  }

  return (
    <section className="live-chat-container" aria-labelledby="live-chat-heading">
      <header className="live-chat-header"><div className="chat-header-info">
        <h4 id="live-chat-heading">Асистент</h4>
        <span className="chat-status-indicator">Відповідає на основі збереженої версії проєкту</span>
      </div></header>
      <div className="chat-scroll-area" role="log" aria-live="polite">
        {historyLoading && <p className="chat-status-msg" role="status">Завантажуємо історію розмови…</p>}
        {historyError && <div className="chat-status-msg" role="alert">Не вдалося завантажити історію. <button type="button" className="link" onClick={() => void loadHistory(nextBefore)}>Спробувати ще раз</button></div>}
        {hasMore && !historyError && <button type="button" className="link load-more-history-btn" disabled={historyLoading} onClick={() => void loadHistory(nextBefore)}>Показати попередні повідомлення</button>}
        {exchanges.length === 0 && !historyLoading && !historyError && <div className="chat-welcome-card"><div className="welcome-content">
          <h2>З чого почнемо?</h2>
          <p>{welcomePrompt ?? ("Обговоріть ідею, кошторис або наступні кроки. Асистент використовує збережені дані проєкту; його відповіді та умови програми варто перевіряти.")}</p>
          {goalText && <p className="chat-goal-text">{goalText}</p>}
          <div className="welcome-quick-actions">{starterPrompts.map((sp) => <button key={sp.label} type="button" className="welcome-action-chip" onClick={() => usePrompt(sp.text)}>{sp.label}<span aria-hidden="true">↗</span></button>)}</div>
        </div></div>}
        {exchanges.map((exchange) => {
          const suggestedItems = extractBudgetItemsFromText(exchange.reply);
          return <div className="chat-turn" key={exchange.id}>
            <div className="chat-bubble user-bubble"><span className="message-label">Ви</span><div className="bubble-text">{exchange.question}</div></div>
            <div className="chat-bubble assistant-bubble">
              <div className="assistant-bubble-author"><span className="author-name">Асистент</span><span className="revision-badge">Версія {exchange.revision}</span></div>
              {(exchange.stale || exchange.revision !== revision) && <div className="stale-alert">Ця відповідь стосується попередніх даних профілю або проєкту.</div>}
              <div className="bubble-text assistant-text"><FormattedReply text={exchange.reply} /></div>
              <div className="assistant-bubble-actions"><button type="button" className="bubble-copy-btn" onClick={() => void copyReply(exchange)}>{copiedId === exchange.id ? "Скопійовано" : "Копіювати"}</button></div>
              {exchange.suggestions && exchange.suggestions.length > 0 && <div className="chat-actionable-card suggestion-list"><strong>Текст для заявки</strong><p>Перегляньте пропозицію перед перенесенням у чернетку.</p>{exchange.suggestions.map((suggestion, index) => <button type="button" key={`${suggestion.field}-${index}`} className="suggestion-review" onClick={e => openPreview(suggestion, exchange.id, e.currentTarget)}>Переглянути текст для заявки · {fieldLabels[suggestion.field]}</button>)}</div>}
              {suggestedItems.length > 0 && onImportBudgetItems && <div className="chat-actionable-card">
                <div className="actionable-card-info"><strong>Можливі статті витрат · {suggestedItems.length}</strong><span>Перевірте пропозиції перед додаванням до бюджету.</span></div>
                <div className="suggested-items-preview">{suggestedItems.map((item, idx) => <div key={idx} className="suggested-item-chip"><span>{item.name} · {item.quantity} шт.</span><span>{Number(item.price).toLocaleString("uk-UA")} грн</span></div>)}</div>
                <button type="button" className="actionable-import-btn" disabled={blocked || loading || exchange.stale || exchange.revision !== revision} onClick={() => handleImport(suggestedItems)}>Додати до бюджету</button>
                {(exchange.stale || exchange.revision !== revision) && <p>Попросіть оновити кошторис для поточних даних перед додаванням витрат.</p>}
              </div>}
            </div>
          </div>;
        })}
        {loading && <div className="chat-turn"><div className="chat-bubble user-bubble"><span className="message-label">Ви</span><div className="bubble-text">{pendingQuestion}</div></div><div className="chat-pending" role="status"><strong>Асистент</strong><span>Готуємо відповідь…</span></div></div>}
        {(nextStep || onReviewDocuments) && <section className="chat-next-step" aria-label="Наступні кроки">
          {nextStep && <div className="chat-next-step-content"><strong>Наступний крок</strong><p>{nextStep.description}</p><button type="button" className="chat-next-step-primary" onClick={nextStep.onOpen}>{nextStep.label}</button></div>}
          {onReviewDocuments && <button type="button" className="chat-next-step-secondary" onClick={onReviewDocuments}>Документи та подання</button>}
        </section>}
        <div ref={chatBottomRef} />
      </div>
      {preview && <div className="suggestion-overlay"><div className="suggestion-dialog" role="dialog" aria-modal="true" aria-labelledby="suggestion-heading" tabIndex={-1} ref={dialogRef} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); closePreview(); }
        if (event.key === "Tab") {
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
          if (!controls.length) { event.preventDefault(); return; }
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        <h2 id="suggestion-heading">Перегляньте текст: {fieldLabels[preview.suggestion.field]}</h2>
        <div className="suggestion-comparison"><div><h3>Зараз у чернетці</h3><p>{preview.current || "Поле порожнє"}</p></div><div><h3>Пропозиція асистента</h3><p>{preview.suggestion.text}</p></div></div>
        {previewError && <p role="alert">{previewError} <button type="button" onClick={() => { setPreview({ ...preview, current: projectDetails?.[preview.suggestion.field] ?? "" }); setPreviewError(""); }}>Оновити порівняння</button></p>}
        {previewDisabled && <p role="status">Перенесення зараз недоступне. Перевірте актуальність відповіді та стан збереження проєкту.</p>}
        <p>Виберіть, як перенести текст. Перевірте його перед збереженням.</p>
        <div className="suggestion-dialog-actions"><button type="button" disabled={previewDisabled} onClick={() => applySuggestion("replace")}>Замінити текст</button><button type="button" disabled={previewDisabled} onClick={() => applySuggestion("append")}>Додати до тексту</button><button type="button" onClick={closePreview}>Скасувати</button></div>
      </div></div>}
      <div className="chat-composer-area">
        {importedNotice && <div className="chat-imported-banner" role="status">{importedNotice}</div>}
        {copyError && <div className="chat-error-banner" role="alert">{copyError}</div>}
        {error && <div className="chat-error-banner" role="alert">{error}</div>}
        {blocked && <div className="chat-blocked-note" role="status">{blockedReason || "Збережіть зміни проєкту, щоб надіслати запит або додати витрати."}</div>}
        <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); void sendQuestion(message); }}>
          <textarea ref={inputRef} rows={2} maxLength={2000} aria-label="Ваше запитання" value={message} disabled={loading} onChange={(event) => setMessage(event.target.value)} placeholder="Запитайте про ваш проєкт…" onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendQuestion(message); }
          }} />
          <div className="chat-input-footer"><span>Enter — надіслати · Shift + Enter — новий рядок</span><button type="submit" className="chat-send-btn" disabled={blocked || loading || !message.trim()}>{loading ? "Очікуйте…" : "Надіслати"}</button></div>
        </form>
        <p className="chat-disclaimer">Відповіді можуть містити помилки. Перевіряйте важливу інформацію.</p>
      </div>
    </section>
  );
}
