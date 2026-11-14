import { useEffect, useRef, useState } from "react";

export type SuggestedBudgetItem = { name: string; quantity: string; price: string };

type Props = {
  caseId: string;
  revision: number;
  blocked: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  prefilledPrompt?: string;
  onClearPrefilled?: () => void;
  onImportBudgetItems?: (items: SuggestedBudgetItem[]) => void;
};

const STARTER_PROMPTS = [
  {
    icon: "💡",
    label: "Розрахувати кошторис бізнесу",
    text: "Запропонуй конкретні статті витрат з орієнтовними цінами для мого проєкту з урахуванням дозволених напрямків програми «Власна справа» (обладнання, оренда, сировина, маркетинг).",
  },
  {
    icon: "❓",
    label: "Що дозволено купувати за грантом?",
    text: "На які саме цілі дозволено витрачати грант «Власна справа», які є ліміти (оренда, сировина) та що категорично заборонено?",
  },
  {
    icon: "✍️",
    label: "Допоможи описати клієнтів",
    text: "Підкажи, як чітко й переконливо описати цільову аудиторію та канали продажу для мого бізнесу, щоб це переконало грантову комісію.",
  },
  {
    icon: "🔍",
    label: "Перевір готовність моєї заявки",
    text: "Проаналізуй збережені дані мого проєкту. Яких важливих деталей ще бракує для сильної заявки?",
  },
];

type Exchange = {
  id: string;
  question: string;
  reply: string;
  revision: number;
  createdAt: string;
  stale: boolean;
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
    typeof e.stale === "boolean"
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

export function Assistant({
  caseId,
  revision,
  blocked,
  request,
  prefilledPrompt,
  onClearPrefilled,
  onImportBudgetItems,
}: Props) {
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
  const requestRef = useRef(request);
  requestRef.current = request;
  const active = useRef(false);
  const historyController = useRef<AbortController | null>(null);
  const submitController = useRef<AbortController | null>(null);
  const historyBusy = useRef(false);
  const submitBusy = useRef(false);

  useEffect(() => {
    if (prefilledPrompt) {
      setMessage(prefilledPrompt);
      onClearPrefilled?.();
    }
  }, [prefilledPrompt, onClearPrefilled]);

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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exchanges, loading]);

  async function sendQuestion(text: string) {
    if (blocked || submitBusy.current || !text.trim()) return;
    submitBusy.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    const submittedRevision = revision;
    const submittedMessage = text.trim();
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
        const errors: Record<number, string> = {
          404: "Чернетку не знайдено. Оновіть сторінку та спробуйте знову.",
          409: "Чернетка змінилася. Завантажте актуальну версію перед запитом.",
          429: "Забагато запитів. Зачекайте та спробуйте ще раз.",
          503: "Асистент поки не налаштований. Спробуйте пізніше.",
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
      setExchanges((current) => mergeExchanges(current, [exchange]));
      setMessage("");
    } catch {
      if (active.current && !controller.signal.aborted)
        setError(
          "Не вдалося отримати та зберегти відповідь. Перевірте з’єднання та спробуйте ще раз.",
        );
    } finally {
      if (submitController.current === controller) {
        submitBusy.current = false;
        if (active.current && !controller.signal.aborted) setLoading(false);
      }
    }
  }

  function handleImport(items: SuggestedBudgetItem[]) {
    if (!onImportBudgetItems || items.length === 0) return;
    onImportBudgetItems(items);
    setImportedNotice(`Успішно додано ${items.length} поз. до вашого бюджету! Перевірте вкладку «Бюджет гранту».`);
    window.setTimeout(() => setImportedNotice(""), 5000);
  }

  return (
    <section className="live-chat-container" aria-labelledby="live-chat-heading">
      <div className="live-chat-header">
        <div className="chat-header-avatar">✳️</div>
        <div className="chat-header-info">
          <h4 id="live-chat-heading">Асистент із грантів</h4>
          <span className="chat-status-indicator">
            <span className="status-dot-pulse" /> Працює зі збереженою версією проєкту
          </span>
        </div>
      </div>

      <div className="chat-scroll-area" role="log" aria-live="polite">
        {historyLoading && <p className="chat-status-msg" role="status">Завантажуємо історію розмови…</p>}
        {hasMore && !historyError && (
          <button
            type="button"
            className="link load-more-history-btn"
            disabled={historyLoading}
            onClick={() => void loadHistory(nextBefore)}
          >
            ↑ Показати попередні повідомлення
          </button>
        )}

        {exchanges.length === 0 && !historyLoading && (
          <div className="chat-welcome-card">
            <div className="welcome-avatar">👋</div>
            <div className="welcome-content">
              <strong>Вітаю! Я ваш проактивний консультант з грантів.</strong>
              <p>
                Я вже бачу збережений опис вашого проєкту. Допоможу уточнити бізнес-план, структурувати витрати й підготувати чернетку заявки. З чого почнемо?
              </p>
              <div className="welcome-quick-actions">
                {STARTER_PROMPTS.map((sp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="welcome-action-chip"
                    disabled={loading || blocked}
                    onClick={() => void sendQuestion(sp.text)}
                  >
                    <span>{sp.icon}</span> {sp.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {exchanges.map((exchange) => {
          const suggestedItems = extractBudgetItemsFromText(exchange.reply);
          return (
            <div className="chat-turn" key={exchange.id}>
              {/* User message bubble */}
              <div className="chat-bubble user-bubble">
                <div className="bubble-text">{exchange.question}</div>
              </div>

              {/* Assistant message bubble */}
              <div className="chat-bubble assistant-bubble">
                <div className="assistant-bubble-author">
                  <span className="author-name">GrantFolio AI</span>
                  <span className="revision-badge">версія {exchange.revision}</span>
                </div>
                {(exchange.stale || exchange.revision !== revision) && (
                  <div className="stale-alert">
                    ⚠️ Ця відповідь стосується попередньої версії чернетки.
                  </div>
                )}
                <div className="bubble-text assistant-text">{exchange.reply}</div>

                <div className="assistant-bubble-actions">
                  <button
                    type="button"
                    className="bubble-copy-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(exchange.reply);
                      setCopiedId(exchange.id);
                      window.setTimeout(() => setCopiedId(null), 2000);
                    }}
                  >
                    {copiedId === exchange.id ? "✓ Скопійовано в буфер!" : "📋 Скопіювати текст"}
                  </button>
                </div>

                {suggestedItems.length > 0 && onImportBudgetItems && (
                  <div className="chat-actionable-card">
                    <div className="actionable-card-info">
                      <strong>📋 Знайдено статті витрат ({suggestedItems.length}):</strong>
                      <span>Ви можете автоматично перенести їх у свій кошторис.</span>
                    </div>
                    <button
                      type="button"
                      className="primary actionable-import-btn"
                      onClick={() => handleImport(suggestedItems)}
                    >
                      + Додати ці {suggestedItems.length} поз. у мій бюджет ↗
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="chat-bubble assistant-bubble typing-bubble">
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span className="typing-text">Асистент аналізує проєкт та пише відповідь…</span>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {importedNotice && (
        <div className="chat-imported-banner" role="status">
          ✓ {importedNotice}
        </div>
      )}

      {error && (
        <div className="chat-error-banner" role="alert">
          {error}
        </div>
      )}

      {/* Suggested Follow-up Prompts */}
      <div className="chat-followups-bar">
        <span className="followups-label">Підказка:</span>
        <button
          type="button"
          className="followup-chip"
          disabled={loading || blocked}
          onClick={() => void sendQuestion("Яких витрат бракує в моєму кошторисі? Врахуй, що умови програми ще потрібно перевірити.")}
        >
          💡 Додай ще статей витрат
        </button>
        <button
          type="button"
          className="followup-chip"
          disabled={loading || blocked}
          onClick={() => void sendQuestion("Які вимоги до створення робочих місць та офіційного працевлаштування?")}
        >
          👥 Вимоги до працевлаштування
        </button>
        <button
          type="button"
          className="followup-chip"
          disabled={loading || blocked}
          onClick={() => void sendQuestion("Як переконливо обґрунтувати окупність мого бізнесу в заявці?")}
        >
          📈 Окупність проєкту
        </button>
      </div>

      {/* Message input form */}
      <form
        className="chat-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuestion(message);
        }}
      >
        <textarea
          rows={2}
          maxLength={2000}
          aria-label="Ваше запитання"
          value={message}
          disabled={loading}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            blocked
              ? "Спочатку збережіть зміни в описі та бюджеті..."
              : "Напишіть запитання або попросіть поради..."
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendQuestion(message);
            }
          }}
        />
        <button
          type="submit"
          className="primary chat-send-btn"
          disabled={blocked || loading || !message.trim()}
          title="Надіслати повідомлення (Enter)"
        >
          {loading ? "…" : "Надіслати ↗"}
        </button>
      </form>
    </section>
  );
}
