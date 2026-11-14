import { useState } from "react";

type Props = {
  caseId: string;
  revision: number;
  blocked: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
};

type Answer = { text: string; revision: number; stale: boolean };

export function Assistant({ caseId, revision, blocked, request }: Props) {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || loading || !message.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await request(`/api/cases/${caseId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          message: message.trim(),
        }),
      });
      if (!response.ok) {
        const errors: Record<number, string> = {
          404: "Чернетку не знайдено. Оновіть сторінку та спробуйте знову.",
          409: "Чернетка змінилася. Завантажте актуальну версію перед запитом.",
          429: "Забагато запитів. Зачекайте та спробуйте ще раз.",
          503: "Асистент поки не налаштований. Спробуйте пізніше.",
          502: "Асистент тимчасово недоступний. Спробуйте ще раз.",
          504: "Асистент не встиг відповісти. Спробуйте ще раз.",
        };
        setError(
          errors[response.status] ||
            "Не вдалося отримати відповідь. Спробуйте ще раз.",
        );
        return;
      }
      const result = await response.json();
      setAnswer({
        text: result.reply,
        revision: result.revision,
        stale: result.stale,
      });
      setMessage("");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Перевірте з’єднання та спробуйте ще раз.",
      );
    } finally {
      setLoading(false);
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
      <form onSubmit={submit}>
        <label htmlFor="assistant-message">Ваше запитання</label>
        <textarea
          id="assistant-message"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Наприклад, що варто уточнити в описі проєкту?"
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
      {answer && (
        <div className="assistant-answer" aria-live="polite">
          <strong>Відповідь · версія {answer.revision}</strong>
          {(answer.stale || answer.revision !== revision) && (
            <p className="assistant-stale">
              Відповідь стосується попередньої версії чернетки. Для актуальної
              відповіді надішліть запит знову.
            </p>
          )}
          <p className="assistant-text">{answer.text}</p>
        </div>
      )}
    </section>
  );
}
