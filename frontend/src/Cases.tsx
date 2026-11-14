import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Assistant } from "./Assistant";

type Item = { name: string; quantity: number; unitPriceKopecks: number };
type Details = {
  projectDescription: string;
  customers: string;
  salesChannels: string;
  implementationPlan: string;
  expectedResults: string;
};
type Readiness = {
  revision: number;
  checks: { id: string; label: string; status: "complete" | "missing" }[];
  disclaimer: string;
};
const emptyDetails: Details = {
  projectDescription: "",
  customers: "",
  salesChannels: "",
  implementationPlan: "",
  expectedResults: "",
};
const fields: { key: keyof Details; label: string; hint: string }[] = [
  {
    key: "projectDescription",
    label: "Опис проєкту",
    hint: "Що ви плануєте створити або змінити?",
  },
  {
    key: "customers",
    label: "Клієнти",
    hint: "Хто ваші клієнти та які їхні потреби?",
  },
  {
    key: "salesChannels",
    label: "Канали продажу",
    hint: "Як ви плануєте знаходити клієнтів і продавати?",
  },
  {
    key: "implementationPlan",
    label: "План реалізації",
    hint: "Які основні кроки та строки ви передбачаєте?",
  },
  {
    key: "expectedResults",
    label: "Очікувані результати",
    hint: "Яких результатів ви очікуєте від проєкту?",
  },
];
type Case = {
  id: string;
  title: string;
  revision: number;
  items: Item[];
  details: Details;
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
export function Cases({
  user,
  onUnsavedChange,
}: {
  user: User;
  onUnsavedChange?: (dirty: boolean) => void;
}) {
  const [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState<Case | null>(null),
    [draft, setDraft] = useState<DraftItem[]>([]),
    [details, setDetails] = useState<Details>(emptyDetails),
    [readiness, setReadiness] = useState<Readiness | null>(null),
    [readinessError, setReadinessError] = useState(false),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [listLoading, setListLoading] = useState(false),
    [listFailed, setListFailed] = useState(false),
    [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    body: string;
    kind: "budget" | "details";
  } | null>(null);
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
  const budgetDirty =
    selected !== null &&
    JSON.stringify(draft) !== JSON.stringify(toDraft(selected.items));
  const detailsDirty =
    selected !== null &&
    JSON.stringify(details) !==
      JSON.stringify(selected.details || emptyDetails);
  const dirty = budgetDirty || detailsDirty;
  useEffect(() => {
    onUnsavedChange?.(dirty || !!pending);
  }, [dirty, pending, onUnsavedChange]);
  const readinessRequest = useRef(0);
  async function loadReadiness(id: string) {
    const sequence = ++readinessRequest.current;
    setReadiness(null);
    setReadinessError(false);
    try {
      const r = await request(`/api/cases/${id}/readiness`);
      if (!r.ok) throw Error();
      const result = await r.json();
      if (sequence === readinessRequest.current) setReadiness(result);
    } catch {
      if (sequence === readinessRequest.current) setReadinessError(true);
    }
  }
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
      setError("Спочатку повторіть збереження, щоб дізнатися його результат.");
      return false;
    }
    return (
      !dirty ||
      window.confirm(
        "У чернетці є незбережені зміни. Відкрити іншу чернетку та втратити їх?",
      )
    );
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
      setDetails(c.details || emptyDetails);
      void loadReadiness(c.id);
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
      setDetails(c.details || emptyDetails);
      void loadReadiness(c.id);
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
    const retrying = pending?.kind === "budget";
    let command = retrying ? pending : null;
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
        kind: "budget",
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
          "Чернетка змінилася в іншій вкладці. Ваші незбережені зміни залишилися у формі. Скопіюйте їх перед завантаженням актуальної версії.",
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
      let c: Case = (await r.json()).case;
      // A repeated command returns its original snapshot; another tab may have
      // saved a newer revision since then. Keep the pending command until the
      // current version is known, so a failed refresh remains safe to retry.
      if (retrying) {
        const latest = await request(`/api/cases/${command.id}`);
        if (!latest.ok) throw Error();
        c = (await latest.json()).case;
      }
      setSelected(c);
      setDraft(toDraft(c.items));
      if (!detailsDirty) setDetails(c.details || emptyDetails);
      setCases((old) => old.map((x) => (x.id === c.id ? c : x)));
      setPending(null);
      void loadReadiness(c.id);
      setNotice("Бюджет збережено.");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Повторіть збереження: повторна спроба перевірить результат тієї самої команди. До цього редагування недоступне.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDetails() {
    if (!selected) return;
    const retrying = pending?.kind === "details";
    let command = retrying ? pending : null;
    if (!command) {
      command = {
        id: selected.id,
        kind: "details",
        body: JSON.stringify({
          expectedRevision: selected.revision,
          idempotencyKey: crypto.randomUUID(),
          details,
        }),
      };
      setPending(command);
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${command.id}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: command.body,
      });
      if (r.status === 409) {
        setConflict(true);
        setPending(null);
        setError(
          "Чернетка змінилася в іншій вкладці. Ваші незбережені зміни залишилися у формі. Скопіюйте їх перед завантаженням актуальної версії.",
        );
        return;
      }
      if (r.status >= 400 && r.status < 500) {
        setPending(null);
        setError(
          "Не вдалося зберегти опис. Перевірте введені дані та увійдіть знову за потреби.",
        );
        return;
      }
      if (!r.ok) throw Error();
      let c: Case = (await r.json()).case;
      if (retrying) {
        const latest = await request(`/api/cases/${command.id}`);
        if (!latest.ok) throw Error();
        c = (await latest.json()).case;
      }
      setSelected(c);
      setDetails(c.details || emptyDetails);
      if (!budgetDirty) setDraft(toDraft(c.items));
      setCases((old) => old.map((x) => (x.id === c.id ? c : x)));
      setPending(null);
      void loadReadiness(c.id);
      setNotice("Опис проєкту збережено.");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Повторіть збереження: повторна спроба перевірить результат тієї самої команди. До цього редагування недоступне.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadDraft() {
    if (!selected || dirty || pending) {
      setError("Спочатку збережіть зміни в описі та бюджеті.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request(`/api/cases/${selected.id}/draft-export`);
      if (!response.ok) throw Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "grantfolio-project.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Чернетку підготовлено до завантаження.");
    } catch {
      setError("Не вдалося завантажити чернетку. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteDraft() {
    if (!selected) return;
    if (!window.confirm(`Видалити чернетку «${selected.title}»? Цю дію неможливо скасувати.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${selected.id}`, { method: "DELETE" });
      if (!r.ok) throw Error();
      setCases((old) => old.filter((c) => c.id !== selected.id));
      setSelected(null);
      setDraft([]);
      setDetails(emptyDetails);
      setReadiness(null);
      setPending(null);
      setConflict(false);
      setNotice("Чернетку видалено.");
    } catch {
      setError("Не вдалося видалити чернетку. Спробуйте ще раз.");
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
      <p>Створіть чернетку, опишіть проєкт та запишіть витрати.</p>
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
        <button
          className="link"
          disabled={listLoading}
          onClick={() => void loadList()}
        >
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
          <p>Версія чернетки: {selected.revision}</p>
          <section
            className="project-details"
            aria-labelledby="details-heading"
          >
            <h4 id="details-heading">Опис проєкту</h4>
            <p>
              Запишіть відомі вам факти та плани. Ці дані вводите ви; вони не
              створені штучним інтелектом.
            </p>
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                <span className="field-hint">{field.hint}</span>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={details[field.key]}
                  disabled={busy || !!pending}
                  onChange={(e) => {
                    setDetails({ ...details, [field.key]: e.target.value });
                    setNotice("");
                  }}
                />
              </label>
            ))}
            <button
              className="primary"
              disabled={
                busy || conflict || (!!pending && pending.kind !== "details")
              }
              onClick={() => void saveDetails()}
            >
              {busy && pending?.kind === "details"
                ? "Зберігаємо…"
                : pending?.kind === "details"
                  ? "Повторити збереження опису"
                  : "Зберегти опис"}{" "}
              <span>↗</span>
            </button>
          </section>
          <section className="readiness" aria-labelledby="readiness-heading">
            <h4 id="readiness-heading">Що вже заповнено</h4>
            <p>
              Список показує лише збережені дані для підготовки. Це не перевірка
              відповідності умовам гранту.
            </p>
            {readiness && (
              <>
                <p>Збережена версія у списку: {readiness.revision}</p>
                <ul>
                  {readiness.checks.map((check) => (
                    <li key={check.id}>
                      <span>{check.label}</span>
                      <strong>
                        {check.status === "complete"
                          ? "Заповнено"
                          : "Потрібно заповнити"}
                      </strong>
                    </li>
                  ))}
                </ul>
                <p>{readiness.disclaimer}</p>
              </>
            )}
            {!readiness && !readinessError && (
              <p role="status">Завантаження списку…</p>
            )}
            {readinessError && (
              <p>
                Не вдалося завантажити список.{" "}
                <button
                  className="link"
                  onClick={() => void loadReadiness(selected.id)}
                >
                  Повторити
                </button>
              </p>
            )}
            {dirty && <p>Незбережені зміни ще не враховані у списку.</p>}
          </section>
          <h4>Бюджет</h4>
          {draft.map((row, index) => (
            <div
              className="budget-row"
              key={index}
              role="group"
              aria-label={`Витрата ${index + 1}`}
            >
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
            disabled={
              busy || conflict || (!!pending && pending.kind !== "budget")
            }
            onClick={() => void save()}
          >
            {busy && pending?.kind === "budget"
              ? "Зберігаємо…"
              : pending?.kind === "budget"
                ? "Повторити збереження бюджету"
                : "Зберегти бюджет"}{" "}
            <span>↗</span>
          </button>
          <Assistant
            key={selected.id}
            caseId={selected.id}
            revision={selected.revision}
            blocked={dirty || !!pending || busy || conflict}
            request={request}
          />
          <section aria-labelledby="export-heading">
            <h4 id="export-heading">Завантаження чернетки</h4>
            <p>
              Текстовий файл містить збережений опис проєкту та бюджет. Це
              робоча чернетка, а не офіційна форма грантової заявки.
            </p>
            <button
              className="link"
              disabled={busy || dirty || !!pending || conflict}
              onClick={() => void downloadDraft()}
            >
              Завантажити чернетку (.txt)
            </button>
            {(dirty || pending) && (
              <p>Перед завантаженням збережіть зміни в описі та бюджеті.</p>
            )}
          </section>
          <section aria-labelledby="delete-heading">
            <h4 id="delete-heading">Видалення</h4>
            <button
              className="link danger"
              disabled={busy || !!pending}
              onClick={() => void deleteDraft()}
            >
              Видалити чернетку
            </button>
          </section>
          {conflict && (
            <button
              className="link"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Завантажити актуальну версію? Незбережені зміни буде втрачено.",
                  )
                )
                  void select(selected.id, true);
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
