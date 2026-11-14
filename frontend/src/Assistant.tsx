import { useEffect, useRef, useState } from "react";

type Props = {
  caseId: string;
  revision: number;
  blocked: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  prefilledPrompt?: string;
  onClearPrefilled?: () => void;
};

const QUICK_PROMPTS = [
  {
    icon: "💡",
    label: "Запропонуй статті бюджету",
    text: "Запропонуй перелік типових витрат та орієнтовний бюджет для мого проєкту з урахуванням дозволених напрямків програми «Власна справа» (обладнання, оренда, сировина, маркетинг).",
  },
  {
    icon: "❓",
    label: "Що дозволено купувати?",
    text: "На які саме цілі дозволено витрачати грант «Власна справа», які є обмеження (наприклад, по оренді чи сировині) та що суворо заборонено?",
  },
  {
    icon: "✍️",
    label: "Як описати клієнтів?",
    text: "Підкажи, як чітко й переконливо описати моїх клієнтів і канали збуту для грантової комісії на основі мого проєкту.",
  },
  {
    icon: "🔍",
    label: "Перевір готовність заявки",
    text: "Проаналізуй збережений опис проєкту та статті бюджету. Яких важливих деталей ще бракує для сильної заявки?",
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

export function Assistant({
  caseId,
  revision,
  blocked,
  request,
  prefilledPrompt,
  onClearPrefilled,
}: Props) {
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || submitBusy.current || !message.trim()) return;
    submitBusy.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    const submittedRevision = revision;
    const submittedMessage = message.trim();
    setLoading(true);
    setError("");
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

  return (
    <section className="assistant" aria-labelledby="assistant-heading">
      <h4 id="assistant-heading">Асистент проєкту</h4>
      <p>
        Поставте запитання про ваш проєкт. Асистент використовує збережений опис
        і бюджет.
      </p>
      <p>
        Відповідь є пропозицією: перевірте її перед використанням. Це не
        юридична консультація.
      </p>
      <div aria-label="Історія розмови">
        {historyLoading && <p role="status">Завантажуємо історію розмови…</p>}
        {historyError && (
          <p className="error" role="alert">
            Не вдалося завантажити історію.{" "}
            <button type="button" onClick={() => void loadHistory(nextBefore)}>
              Спробувати ще раз
            </button>
          </p>
        )}
        {hasMore && !historyError && (
          <button
            type="button"
            disabled={historyLoading}
            onClick={() => void loadHistory(nextBefore)}
          >
            Показати попередні повідомлення
          </button>
        )}
        {exchanges.map((exchange) => (
          <article className="assistant-answer" key={exchange.id}>
            <strong>Ваше запитання</strong>
            <p className="assistant-text">{exchange.question}</p>
            <strong>Відповідь · версія {exchange.revision}</strong>
            {(exchange.stale || exchange.revision !== revision) && (
              <p className="assistant-stale">
                Відповідь стосується попередньої версії чернетки. Для актуальної
                відповіді надішліть запит знову.
              </p>
            )}
            <p className="assistant-text">{exchange.reply}</p>
          </article>
        ))}
      </div>
      <div className="quick-prompts-section">
        <span className="quick-prompts-title">Швидкі запитання до асистента:</span>
        <div className="quick-prompts-list">
          {QUICK_PROMPTS.map((qp, index) => (
            <button
              key={index}
              type="button"
              className="quick-prompt-chip"
              disabled={loading || blocked}
              onClick={() => setMessage(qp.text)}
            >
              <span>{qp.icon}</span> {qp.label}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="assistant-message">Ваше запитання</label>
        <textarea
          id="assistant-message"
          rows={3}
          maxLength={2000}
          value={message}
          disabled={loading}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Наприклад, що варто уточнити в описі проєкту або які статті бюджету додати?"
        />
        {blocked && <p>Спочатку збережіть зміни в описі та бюджеті.</p>}
        <button
          className="primary"
          disabled={blocked || loading || !message.trim()}
        >
          {loading ? "Готуємо відповідь…" : "Запитати асистента"}{" "}
          <span>↗</span>
        </button>
      </form>
      {loading && <p role="status">Асистент готує відповідь…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
