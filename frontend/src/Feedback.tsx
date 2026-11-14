import React, { useState } from "react";
import type { User } from "firebase/auth";

const TASKS = [
  { value: "profile", label: "Профіль бізнесу" },
  { value: "project", label: "Чернетка проєкту" },
  { value: "budget", label: "Бюджет" },
  { value: "assistant", label: "ШІ-асистент" },
  { value: "catalog", label: "Каталог грантів" },
  { value: "export", label: "Експорт / Плани" },
] as const;

const RATINGS = [
  { value: 5, label: "5 — Відмінно" },
  { value: 4, label: "4 — Добре" },
  { value: 3, label: "3 — Задовільно" },
  { value: 2, label: "2 — Погано" },
  { value: 1, label: "1 — Жахливо" },
] as const;

export function Feedback({ user }: { user: User }) {
  const [feedbackId, setFeedbackId] = useState(() => crypto.randomUUID());
  const [rating, setRating] = useState<number>(0);
  const [task, setTask] = useState<string>("profile");
  const [comment, setComment] = useState("");
  const [lastSubmittedContent, setLastSubmittedContent] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleContentChange(newRating: number, newTask: string, newComment: string) {
    const contentKey = `${newRating}|${newTask}|${newComment}`;
    if (contentKey !== lastSubmittedContent && lastSubmittedContent !== "") {
      setFeedbackId(crypto.randomUUID());
    }
    setRating(newRating);
    setTask(newTask);
    setComment(newComment);
    setError("");
    setSuccess("");
  }

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || !comment.trim()) {
      setError("Оберіть оцінку й додайте коментар.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");

    const currentContent = `${rating}|${task}|${comment.trim()}`;

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          id: feedbackId,
          rating,
          task,
          comment: comment.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("server_error");
      }

      setLastSubmittedContent(currentContent);
      setSuccess("Дякуємо! Ваш відгук успішно збережено.");
      setComment("");
      setFeedbackId(crypto.randomUUID());
      setLastSubmittedContent("");
    } catch {
      setError("Не вдалося надіслати відгук. Спробуйте ще раз.");
      setLastSubmittedContent(currentContent);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Залишити відгук</summary>
        <div style={{ marginTop: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--muted, #666)" }}>
            Відгук добровільний. Він допоможе покращити прототип; узагальнені результати можуть увійти до навчального звіту.
          </p>
          <form onSubmit={submitFeedback}>
            <label>
              Оцінка
              <select
                aria-label="Оцінка прототипу"
                value={rating}
                onChange={(e) => handleContentChange(Number(e.target.value), task, comment)}
                disabled={busy}
              >
                <option value={0} disabled>Оберіть оцінку</option>
                {RATINGS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Розділ або тема
              <select
                aria-label="Розділ для відгуку"
                value={task}
                onChange={(e) => handleContentChange(rating, e.target.value, comment)}
                disabled={busy}
              >
                {TASKS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Коментар (до 3000 символів)
              <textarea
                aria-label="Текст відгуку"
                maxLength={3000}
                rows={3}
                value={comment}
                onChange={(e) => handleContentChange(rating, task, e.target.value)}
                placeholder="Поділіться враженнями або пропозиціями..."
                disabled={busy}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="success" role="status">
                {success}
              </p>
            )}
            <button className="primary" disabled={busy || rating < 1 || !comment.trim()}>
              {busy ? "Надсилаємо..." : "Надіслати відгук"} <span>↗</span>
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
