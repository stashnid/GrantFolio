import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { authenticatedRequest } from "./api";
import "./ProjectPayment.css";

type Payment = { state: "pending" | "active"; code?: string; jarUrl?: string; available?: boolean };

export function ProjectPayment({ user, caseId, onActive }: { user: User; caseId: string; onActive: () => void }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let pending = false;
    async function check() {
      try {
        const response = await authenticatedRequest(user, `/api/cases/${encodeURIComponent(caseId)}/payment`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const current: Payment | null = data ?? null;
        if (controller.signal.aborted) return;
        if (current && current.state !== "pending" && current.state !== "active") throw new Error();
        if (current?.state === "pending" && (typeof current.code !== "string" || !/^GF-[0-9A-F]{10}$/.test(current.code))) throw new Error();
        pending = current?.state === "pending";
        setPayment(current);
        setError("");
        setLoading(false);
        if (current?.state === "active") onActive();
        else if (current?.state === "pending") timer = window.setTimeout(check, 5000);
      } catch {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError("Не вдалося перевірити оплату. Спробуйте ще раз.");
          if (pending) timer = window.setTimeout(check, 5000);
        }
      }
    }
    setLoading(true);
    setPayment(null);
    void check();
    return () => { controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [user, caseId, onActive, retry]);

  async function createPayment() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedRequest(user, `/api/cases/${encodeURIComponent(caseId)}/payment`, { method: "POST" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const current: Payment = data;
      if (!current || (current.state !== "pending" && current.state !== "active")) throw new Error();
      if (current.state === "active") onActive();
      else { setPayment(current); setRetry(value => value + 1); }
    } catch {
      setError("Не вдалося підготувати оплату. Спробуйте ще раз.");
    } finally { setBusy(false); }
  }

  return <section className="project-payment" aria-labelledby="project-payment-title">
    <h2 id="project-payment-title">Оплата проєкту</h2>
    <p>5 грн одноразово за цей проєкт. Після підтвердження оплати відкриється робота над проєктом.</p>
    {loading && <p role="status">Перевіряємо оплату…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Перевірити ще раз</button></p>}
    {!loading && !error && !payment && <button type="button" className="primary" disabled={busy} onClick={() => void createPayment()}>{busy ? "Готуємо оплату…" : "Отримати код оплати"}</button>}
    {!loading && payment?.state === "pending" && payment.available !== true && <p role="status">Оплата тимчасово недоступна. Очікуємо активації способу оплати.</p>}
    {!loading && payment?.state === "pending" && payment.available === true && <>
      <p>Скопіюйте код і обов’язково вставте його в коментар до платежу на банку monobank.</p>
      <div className="project-payment-code"><strong>{payment.code}</strong><button type="button" onClick={() => { if (payment.code) void navigator.clipboard.writeText(payment.code).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Скопійовано" : "Копіювати"}</button></div>
      <a className="primary project-payment-link" href={payment.jarUrl || "https://send.monobank.ua/jar/9GcNmEBdxD"} target="_blank" rel="noopener noreferrer">Відкрити банку monobank</a>
      <p role="status">Очікуємо підтвердження оплати. Статус перевіряється автоматично.</p>
    </>}
  </section>;
}
