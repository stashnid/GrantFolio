import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { authenticatedRequest } from "./api";

export function EmailLoginCode({ user, autoSend, onVerified, onExit }: {
  user: User;
  autoSend: boolean;
  onVerified: () => void;
  onExit: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const attemptedAutoSend = useRef(false);

  const confirm = useCallback(async (action: "send" | "verify") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedRequest(user, `/api/auth/email-code/${action}`, {
        method: "POST",
        ...(action === "verify" ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        } : {}),
      }, 20000);
      if (response.ok && action === "verify") onVerified();
      else if (response.ok) setMessage("Код надіслано. Він дійсний 10 хвилин.");
      else if (response.status === 429) setError("Поки що не можна надіслати новий код. Спробуйте пізніше.");
      else if (response.status === 400) setError("Код неправильний, прострочений або вичерпано кількість спроб.");
      else setError("Не вдалося виконати запит. Спробуйте ще раз.");
    } catch {
      setError("Немає зв’язку із сервісом. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }, [busy, code, onVerified, user]);

  useEffect(() => {
    if (autoSend && !attemptedAutoSend.current) {
      attemptedAutoSend.current = true;
      void confirm("send");
    }
  }, [autoSend, confirm]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void confirm("verify");
  }

  return (
    <main className="panel">
      <section className="card auth-card">
        <h1>Підтвердьте вхід</h1>
        <p>Введіть код із листа на {user.email}.</p>
        <form onSubmit={submit}>
          <button type="button" className="secondary" disabled={busy} onClick={() => void confirm("send")}>Надіслати код</button>
          <label>
            Код із листа
            <input value={code} onChange={event => setCode(event.target.value)} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} />
          </label>
          {message && <p role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>Підтвердити</button>
          <button type="button" className="link" disabled={busy} onClick={onExit}>Вийти</button>
        </form>
      </section>
    </main>
  );
}
