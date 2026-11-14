import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

type Item = { name: string; quantity: number; unitPriceKopecks: number };
type Case = {
  id: string;
  title: string;
  revision: number;
  items: Item[];
  totalKopecks: number;
};
type DraftItem = { name: string; quantity: string; price: string };
const toDraft = (items: Item[]): DraftItem[] =>
  items.map((i) => ({
    name: i.name,
    quantity: String(i.quantity),
    price: (i.unitPriceKopecks / 100).toFixed(2),
  }));
const money = (n: number) =>
  `${Math.floor(n / 100).toLocaleString("uk-UA")},${String(n % 100).padStart(2, "0")} грн`;
export function Cases({ user }: { user: User }) {
  const [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState<Case | null>(null),
    [draft, setDraft] = useState<DraftItem[]>([]),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [listLoading, setListLoading] = useState(false),
    [listFailed, setListFailed] = useState(false),
    [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<{ id: string; body: string } | null>(
    null,
  );
  async function request(path: string, init: RequestInit = {}) {
    const token = await user.getIdToken();
    return fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  }
  const listRequest = useRef(false);
  async function loadList() {
    if (listRequest.current) return;
    listRequest.current = true;
    setListLoading(true);
    setListFailed(false);
    setError("");
    try {
      const r = await request("/api/cases");
      if (!r.ok) throw Error();
      setCases((await r.json()).cases);
      setReady(true);
    } catch {
      setListFailed(true);
      setError("Не вдалося завантажити чернетки.");
    } finally {
      listRequest.current = false;
      setListLoading(false);
    }
  }
  useEffect(() => {
    void loadList();
  }, [user]);
  const dirty = selected !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(selected.items));
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function mayLeaveDraft() {
    if (pending) {
      setError("Спочатку повторіть збереження бюджету, щоб дізнатися його результат.");
      return false;
    }
    return !dirty || window.confirm("У бюджеті є незбережені зміни. Відкрити іншу чернетку та втратити їх?");
  }
  async function select(id: string, discard = false) {
    if (!discard && selected?.id === id) return;
    if (!discard && !mayLeaveDraft()) return;
    setBusy(true);
    setError("");
    try {
      const r = await request(`/api/cases/${id}`);
      if (!r.ok) throw Error();
      const c = (await r.json()).case;
      setSelected(c);
      setDraft(toDraft(c.items));
      setConflict(false);
      setPending(null);
      setNotice("");
    } catch {
      setError("Не вдалося завантажити чернетку.");
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!mayLeaveDraft()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!r.ok) throw Error();
      const c = (await r.json()).case;
      setCases([c, ...cases]);
      setSelected(c);
      setDraft([]);
      setTitle("");
      setPending(null);
      setConflict(false);
    } catch {
      setError("Не вдалося створити чернетку.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!selected) return;
    let command = pending;
    if (!command) {
      const items: Item[] = [];
      for (const row of draft) {
        const price = row.price.trim().replace(",", ".");
        if (
          !row.name.trim() ||
          !/^\d+$/.test(row.quantity) ||
          !/^\d+(\.\d{1,2})?$/.test(price)
        ) {
          setError(
            "Заповніть назву, цілу кількість і ціну з точністю до копійок.",
          );
          return;
        }
        const [whole, decimal = ""] = price.split(".");
        const kopecks = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
        const quantity = Number(row.quantity);
        if (
          !Number.isSafeInteger(kopecks) ||
          kopecks > 1000000000 ||
          quantity < 1 ||
          quantity > 1000000
        ) {
          setError("Кількість або ціна виходить за дозволені межі.");
          return;
        }
        items.push({ name: row.name, quantity, unitPriceKopecks: kopecks });
      }
      command = {
        id: selected.id,
        body: JSON.stringify({
          expectedRevision: selected.revision,
          idempotencyKey: crypto.randomUUID(),
          items,
        }),
      };
      setPending(command);
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${command.id}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: command.body,
      });
      if (r.status === 409) {
        setConflict(true);
        setPending(null);
        setError(
          "Бюджет змінився в іншій вкладці. Ваші зміни нижче збережені в цій формі. Скопіюйте їх перед завантаженням актуальної версії.",
        );
        return;
      }
      if (r.status >= 400 && r.status < 500) {
        setPending(null);
        setError(
          "Не вдалося зберегти бюджет. Перевірте введені дані та увійдіть знову за потреби.",
        );
        return;
      }
      if (!r.ok) throw Error();
      const c = (await r.json()).case;
      setSelected(c);
      setDraft(toDraft(c.items));
      setCases(cases.map((x) => (x.id === c.id ? c : x)));
      setPending(null);
      setNotice("Бюджет збережено.");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Повторіть збереження: повторна спроба перевірить результат тієї самої команди. До цього редагування недоступне.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(index: number, patch: Partial<DraftItem>) {
    setDraft(draft.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setPending(null);
    setNotice("");
  }
  return (
    <div className="card cases-card">
      <div className="card-top">
        <span>02 / ЧЕРНЕТКИ ПЛАНУ</span>
        <span>✳</span>
      </div>
      <h2>Ваші плани</h2>
      <p>
        Створіть чернетку та запишіть витрати. Грантову програму ще не обрано.
      </p>
      <form onSubmit={create}>
        <label>
          Назва чернетки
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            placeholder="Наприклад, обладнання для майстерні"
          />
        </label>
        <button className="primary" disabled={busy || !ready}>
          Створити чернетку <span>↗</span>
        </button>
      </form>
      {listLoading && <p role="status">Завантаження чернеток…</p>}
      {listFailed && (
        <button className="link" disabled={listLoading} onClick={() => void loadList()}>
          Повторити завантаження
        </button>
      )}
      {cases.length > 0 && (
        <div className="case-list" role="group" aria-label="Ваші чернетки">
          {cases.map((c) => (
            <button
              className={
                selected?.id === c.id ? "case-button active" : "case-button"
              }
              key={c.id}
              disabled={busy}
              aria-pressed={selected?.id === c.id}
              onClick={() => void select(c.id)}
            >
              {c.title} <span>↗</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="budget">
          <h3>{selected.title}</h3>
          <p>Бюджет · версія {selected.revision}</p>
          {draft.map((row, index) => (
            <div className="budget-row" key={index} role="group" aria-label={`Витрата ${index + 1}`}>
              <label>
                Назва
                <input
                  maxLength={160}
                  value={row.name}
                  disabled={busy || !!pending}
                  onChange={(e) => edit(index, { name: e.target.value })}
                />
              </label>
              <label>
                Кількість
                <input
                  inputMode="numeric"
                  value={row.quantity}
                  disabled={busy || !!pending}
                  onChange={(e) => edit(index, { quantity: e.target.value })}
                />
              </label>
              <label>
                Ціна за одиницю, грн
                <input
                  inputMode="decimal"
                  value={row.price}
                  disabled={busy || !!pending}
                  onChange={(e) => edit(index, { price: e.target.value })}
                />
              </label>
              <button
                className="link remove-item"
                aria-label={`Видалити витрату ${row.name || index + 1}`}
                disabled={busy || !!pending}
                onClick={() => {
                  setDraft(draft.filter((_, i) => i !== index));
                  setPending(null);
                  setNotice("");
                }}
              >
                Видалити
              </button>
            </div>
          ))}
          <button
            className="link"
            disabled={busy || !!pending || draft.length >= 100}
            onClick={() => {
              setDraft([...draft, { name: "", quantity: "1", price: "0.00" }]);
              setPending(null);
              setNotice("");
            }}
          >
            + Додати витрату
          </button>
          <p>
            Збережений підсумок: <strong>{money(selected.totalKopecks)}</strong>
          </p>
          <button
            className="primary"
            disabled={busy || conflict}
            onClick={() => void save()}
          >
            Зберегти бюджет <span>↗</span>
          </button>
          {conflict && (
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Завантажити актуальну версію? Незбережені зміни буде втрачено.")) void select(selected.id, true);
              }}
            >
              Завантажити актуальну версію
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
