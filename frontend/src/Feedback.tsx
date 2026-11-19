import React, { useState } from "react";
import type { User } from "firebase/auth";
import { ApiError, authenticatedRequest, readableApiError } from "./api";
import { CustomSelect } from "./CustomSelect";

const TASKS = [
  { value: "project", label: "Весь сайт загалом" },
  { value: "catalog", label: "Пошук грантів" },
  { value: "assistant", label: "Поради помічника" },
  { value: "budget", label: "Розрахунок витрат" },
  { value: "profile", label: "Дані про бізнес" },
  { value: "export", label: "Завантаження документів" },
] as const;

const RATINGS = [
  { value: 1, label: "1 — Потрібно значно доопрацювати" },
  { value: 2, label: "2 — Складно розібратися" },
  { value: 3, label: "3 — Нормально, є що покращити" },
  { value: 4, label: "4 — Добре, майже все зрозуміло" },
  { value: 5, label: "5 — Відмінно, дуже допомогло" },
] as const;

export function Feedback({ user }: { user: User }) {
  const [feedbackId, setFeedbackId] = useState(() => crypto.randomUUID());
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [task, setTask] = useState<string>("project");
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
      const response = await authenticatedRequest(user, "/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: feedbackId,
          rating,
          task,
          comment: comment.trim(),
        }),
      });

      if (!response.ok) throw new ApiError("http", response.status);

      setLastSubmittedContent(currentContent);
      setSuccess("Дякуємо. Ваш відгук успішно збережено.");
      setComment("");
      setFeedbackId(crypto.randomUUID());
      setLastSubmittedContent("");
    } catch (error) {
      setError(readableApiError(error, "Не вдалося надіслати відгук. Спробуйте ще раз."));
      setLastSubmittedContent(currentContent);
    } finally {
      setBusy(false);
    }
  }

  const activeRating = hoveredRating || rating;
  const activeRatingInfo = RATINGS.find((r) => r.value === activeRating);

  return (
    <section className="card feedback-card" aria-labelledby="feedback-heading">
      <div className="card-top">
        <span>ЗВОРОТНИЙ ЗВ’ЯЗОК</span>
      </div>
      <h2 id="feedback-heading">Залишити відгук</h2>
      <p className="feedback-lead">
        Відгук добровільний. Він допоможе покращити прототип; узагальнені результати можуть увійти до навчального звіту.
      </p>

      <form onSubmit={submitFeedback} noValidate>
        <fieldset
          className="feedback-rating-fieldset"
          aria-describedby={error && rating < 1 ? "feedback-error" : undefined}
        >
          <legend className="feedback-rating-legend">Оцінка прототипу</legend>
          <div className="feedback-rating-row">
            <div
              className="rating-stars"
              role="group"
              aria-label="Оцінка від 1 до 5"
              onMouseLeave={() => setHoveredRating(0)}
            >
              {RATINGS.map((r) => {
                const isFilled = r.value <= activeRating;
                const isSelected = r.value === rating;
                return (
                  <button
                    key={r.value}
                    type="button"
                    className={`star-btn${isFilled ? " active" : ""}${isSelected ? " is-selected" : ""}`}
                    aria-label={r.label}
                    aria-pressed={isSelected}
                    title={r.label}
                    disabled={busy}
                    onMouseEnter={() => setHoveredRating(r.value)}
                    onFocus={() => setHoveredRating(r.value)}
                    onBlur={() => setHoveredRating(0)}
                    onClick={() => handleContentChange(r.value, task, comment)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
                    </svg>
                  </button>
                );
              })}
            </div>
            <span className={`feedback-rating-caption${activeRating > 0 ? " is-selected" : ""}`} aria-live="polite">
              {activeRatingInfo ? activeRatingInfo.label : "Оберіть оцінку"}
            </span>
          </div>
        </fieldset>

        <div style={{ display: "grid", gap: "7px" }}>
          <label htmlFor="feedback-task">Розділ або тема</label>
          <CustomSelect
            id="feedback-task"
            value={task}
            options={[...TASKS]}
            onChange={(nextTask) => handleContentChange(rating, nextTask, comment)}
            disabled={busy}
          />
        </div>

        <label htmlFor="feedback-comment">
          <span className="feedback-field-meta">
            <span>Коментар</span>
            <span className="feedback-char-count">{comment.length} / 3000</span>
          </span>
          <textarea
            id="feedback-comment"
            maxLength={3000}
            rows={4}
            value={comment}
            onChange={(e) => handleContentChange(rating, task, e.target.value)}
            placeholder="Напишіть своїми словами: чи все було зрозуміло, що викликало труднощі, та що варто змінити чи додати на сайті…"
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? "feedback-error" : undefined}
          />
        </label>

        {error && (
          <p id="feedback-error" className="error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p id="feedback-success" className="success" role="status">
            {success}
          </p>
        )}

        <div className="feedback-actions">
          <button type="submit" className="primary" disabled={busy || rating < 1 || !comment.trim()}>
            <span>{busy ? "Надсилаємо…" : "Надіслати відгук"}</span>
            <span className="primary-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
