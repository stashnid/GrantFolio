import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";

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
  {
    id: "grantfolio",
    name: "Підтримка розвитку GrantFolio",
    desc: "Підтримка сервера, API моделей та розробки нових інструментів для українського бізнесу",
    url: "https://send.monobank.ua/",
    official: "Проєкт GrantFolio",
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

  const effectiveAmountUah = customAmount.trim() ? parseFloat(customAmount) : selectedAmount;

  async function loadData() {
    try {
      const token = await user.getIdToken();
      const [resStats, resList] = await Promise.all([
        fetch("/api/donations/stats", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/donations", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resStats.ok) {
        setStats(await resStats.json());
      }
      if (resList.ok) {
        const body = await resList.json();
        setHistory(body.donations ?? []);
      }
    } catch {
      setError("Не вдалося завантажити статистику внесків.");
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
    const amountKopecks = Math.round(effectiveAmountUah * 100);
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amountKopecks,
          target: selectedTarget,
          note: note.trim(),
          status: "completed",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record donation");
      }

      setMessage("💙💛 Дякуємо за ваш внесок! Запис успішно збережено у звіті проєкту.");
      setNote("");
      setCustomAmount("");
      await loadData();
    } catch {
      setError("Не вдалося зафіксувати внесок. Спробуйте ще раз.");
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

      <h2>Підтримка сил оборони та розвитку проєкту</h2>
      <p className="donation-lead">
        Кожен підприємець сьогодні — це надійний тил. Ви можете зробити благодійний внесок до перевірених фондів на підтримку ЗСУ або підтримати розробку відкритого копілота GrantFolio.
      </p>

      {/* Aggregate Stats */}
      {stats && (
        <div className="donation-stats-row">
          <div className="donation-stat-box">
            <span className="stat-label">Зібрано та зафіксовано спільнотою:</span>
            <span className="stat-value">
              {Math.floor(stats.totalKopecks / 100).toLocaleString("uk-UA")} грн
            </span>
          </div>
          <div className="donation-stat-box">
            <span className="stat-label">Кількість внесків підприємців:</span>
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
              onClick={() => setSelectedTarget(target.name)}
            >
              <div className="target-card-header">
                <strong>{target.name}</strong>
                <span className="target-badge">{target.official}</span>
              </div>
              <p className="target-desc">{target.desc}</p>
              <a
                href={target.url}
                target="_blank"
                rel="noreferrer"
                className="target-link"
                onClick={(e) => e.stopPropagation()}
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
          Зробіть платіж на офіційному сайті фонду та зафіксуйте його тут для обліку реальної участі та оцінки готовності платити.
        </p>

        <div className="amount-chips">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              type="button"
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
            min="1"
            step="1"
            placeholder="Наприклад: 300"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
        </label>

        <label>
          Коментар або номер квитанції / деталі (за бажанням)
          <input
            maxLength={500}
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
