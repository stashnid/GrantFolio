import React, { useEffect, useState, useRef } from "react";
import type { User } from "firebase/auth";
import { ApiError, authenticatedRequest, readableApiError } from "./api";

type DonationItem = {
  id: string;
  amountKopecks: number;
  target: string;
  note: string;
  status: string;
  createdAt: string;
};

type Stats = {
  totalKopecks: number;
  count: number;
};

const TARGET_OPTIONS = [
  {
    id: "savelife",
    name: "Благодійний фонд «Повернись живим»",
    desc: "Компетентна допомога війську: зв'язок, дрони, оптичні прилади та розмінування",
    url: "https://savelife.in.ua/donate/",
    official: "Офіційний фонд",
  },
  {
    id: "nbu",
    name: "Спецрахунок НБУ на підтримку ЗСУ",
    desc: "Офіційний рахунок Національного банку України для збору коштів на потреби оборони",
    url: "https://bank.gov.ua/ua/about/support-the-armed-forces",
    official: "Державний рахунок",
  },
  {
    id: "prytula",
    name: "Благодійний фонд Сергія Притули",
    desc: "Забезпечення підрозділів транспортом, БПЛА та засобами тактичної медицини",
    url: "https://prytulafoundation.org/donation",
    official: "Офіційний фонд",
  },
];

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2500];

export function Donations({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<DonationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(TARGET_OPTIONS[0].name);
  const [selectedAmount, setSelectedAmount] = useState<number>(250);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loadError, setLoadError] = useState("");
  const submission = useRef<{ body: string; id: string } | null>(null);

  const effectiveAmountUah = customAmount.trim() ? parseFloat(customAmount) : selectedAmount;

  async function loadData() {
    setLoading(true);
    setLoadError("");
    try {
      const [resStats, resList] = await Promise.all([
        authenticatedRequest(user, "/api/donations/stats"),
        authenticatedRequest(user, "/api/donations"),
      ]);
      if (!resStats.ok) throw new ApiError("http", resStats.status);
      if (!resList.ok) throw new ApiError("http", resList.status);
      const [nextStats, nextHistory] = await Promise.all([resStats.json(), resList.json()]);
      setStats(nextStats);
      setHistory(nextHistory.donations ?? []);
    } catch (error) {
      setLoadError(readableApiError(error, "Не вдалося завантажити внески. Спробуйте ще раз."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [user]);

  async function handleRecordDonation(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveAmountUah || effectiveAmountUah <= 0 || isNaN(effectiveAmountUah)) {
      setError("Вкажіть коректну суму внеску (від 1 грн).");
      return;
    }
    if (submitting) return;
    const amountKopecks = Math.round(effectiveAmountUah * 100);
    const body = JSON.stringify({ amountKopecks, target: selectedTarget, note: note.trim(), status: "completed" });
    if (!submission.current || submission.current.body !== body) submission.current = { body, id: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await authenticatedRequest(user, "/api/donations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...JSON.parse(body), id: submission.current.id }),
      });

      if (!response.ok) throw new ApiError("http", response.status);

      submission.current = null;
      setMessage("Ваш запис збережено. Це повідомлення про внесок, а не підтвердження платежу фондом.");
      setNote("");
      setCustomAmount("");
      await loadData();
    } catch (error) {
      setError(readableApiError(error, "Не вдалося підтвердити запис. Можна повторити без дублювання внеску."));
    } finally {
      setSubmitting(false);
    }
  }

  const currentFund = TARGET_OPTIONS.find((t) => t.name === selectedTarget) ?? TARGET_OPTIONS[0];

  return (
    <div className="card donation-card">
      <div className="card-top">
        <span>💙💛 СОЛІДАРНІСТЬ ТА ВНЕСОК У ПЕРЕМОГУ</span>
        <span>✳</span>
      </div>

      <h2>Підтримка сил оборони</h2>
      <p className="donation-lead">
        Ви можете зробити благодійний внесок на підтримку ЗСУ на офіційних сайтах фондів і повідомити про нього тут.
      </p>

      {loading && <p role="status">Завантаження внесків…</p>}
      {loadError && <div><p className="error" role="alert">{loadError}</p><button type="button" className="link" disabled={loading} onClick={() => void loadData()}>Повторити завантаження внесків</button></div>}
      <p className="hint">Записи додають самі користувачі. GrantFolio не проводить і не перевіряє платежі. Зберігайте квитанцію фонду окремо.</p>
      {/* Aggregate Stats */}
      {stats && (
        <div className="donation-stats-row">
          <div className="donation-stat-box">
            <span className="stat-label">Сума внесків, про які повідомили користувачі:</span>
            <span className="stat-value">
              {Math.floor(stats.totalKopecks / 100).toLocaleString("uk-UA")} грн
            </span>
          </div>
          <div className="donation-stat-box">
            <span className="stat-label">Кількість повідомлень про внески:</span>
            <span className="stat-value">{stats.count}</span>
          </div>
        </div>
      )}

      {/* Step 1: Choose Fund */}
      <div className="donation-section">
        <h3>1. Оберіть напрям підтримки</h3>
        <div className="target-cards-grid">
          {TARGET_OPTIONS.map((target) => (
            <div
              key={target.id}
              className={`target-card ${selectedTarget === target.name ? "selected" : ""}`}
            >
              <div className="target-card-header">
                <button type="button" className="link" aria-pressed={selectedTarget === target.name} disabled={submitting} onClick={() => setSelectedTarget(target.name)}>{target.name}</button>
                <span className="target-badge">{target.official}</span>
              </div>
              <p className="target-desc">{target.desc}</p>
              <a
                href={target.url}
                target="_blank"
                rel="noreferrer"
                className="target-link"
              >
                Перейти на офіційну сторінку оплати ↗
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2: Choose Amount and Record */}
      <form onSubmit={handleRecordDonation} className="donation-form">
        <h3>2. Вкажіть суму та зафіксуйте свій внесок</h3>
        <p className="hint">
          Зробіть платіж на офіційному сайті фонду та зафіксуйте його тут як власне повідомлення про внесок. Не додавайте повні реквізити чи інші приватні дані.
        </p>

        <div className="amount-chips">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              type="button"
              disabled={submitting}
              key={amt}
              className={`amount-chip ${selectedAmount === amt && !customAmount ? "active" : ""}`}
              onClick={() => {
                setSelectedAmount(amt);
                setCustomAmount("");
              }}
            >
              {amt} грн
            </button>
          ))}
        </div>

        <label>
          Або введіть довільну суму (грн)
          <input
            type="number"
            disabled={submitting}
            min="1"
            max="100000000"
            step="0.01"
            placeholder="Наприклад: 300"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
        </label>

        <label>
          Коментар або номер квитанції / деталі (за бажанням)
          <input
            maxLength={500}
            disabled={submitting}
            placeholder="Наприклад: внесок на дрони, квитанція №..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="donation-actions">
          <a
            href={currentFund.url}
            target="_blank"
            rel="noreferrer"
            className="secondary-btn external-pay-btn"
          >
            Здійснити платіж у {currentFund.name} ↗
          </a>

          <button type="submit" className="primary record-btn" disabled={submitting}>
            {submitting ? "Зберігаємо…" : `Зафіксувати внесок ${effectiveAmountUah || 0} грн`} <span>↗</span>
          </button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </form>

      {/* History */}
      {history.length > 0 && (
        <div className="donation-history">
          <h3>Ваші зафіксовані внески</h3>
          <table className="donation-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Напрям</th>
                <th>Сума</th>
                <th>Примітка</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleDateString("uk-UA")}</td>
                  <td>{item.target}</td>
                  <td><strong>{(item.amountKopecks / 100).toLocaleString("uk-UA")} грн</strong></td>
                  <td>{item.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
