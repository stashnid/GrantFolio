import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { Assistant } from "./Assistant";
import type { GrantProgram } from "./GrantCatalog";

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
const basicsFields = [
  {
    key: "projectDescription" as const,
    label: "Опис проєкту / ідеї",
    hint: "Що саме ви створюєте чи розвиваєте? У чому цінність вашого бізнесу?",
    placeholder: "Наприклад: Відкриття затишної кав'ярні формату «to-go» зі свіжою випічкою та якісною спешелті кавою в спальному районі міста...",
  },
  {
    key: "customers" as const,
    label: "Цільова аудиторія (клієнти)",
    hint: "Хто ваші покупці, які їхні потреби та чому вони оберуть саме вас?",
    placeholder: "Наприклад: Мешканці навколишніх будинків, молоді батьки, офісні працівники та студенти, які цінують швидкість та якість...",
  },
  {
    key: "salesChannels" as const,
    label: "Канали продажу та залучення",
    hint: "Як клієнти дізнаються про вас і як ви будете продавати?",
    placeholder: "Наприклад: Офлайн-точка на першій лінії, сторінка в Instagram, локальна реклама, програма лояльності для постійних гостей...",
  },
];

const planFields = [
  {
    key: "implementationPlan" as const,
    label: "Покроковий план реалізації",
    hint: "Які основні етапи запуску та строки ви передбачаєте?",
    placeholder: "Наприклад: Місяць 1: підписання договору оренди та ремонт. Місяць 2: закупівля обладнання, оформлення ФОП та отримання дозволів. Місяць 3: найм персоналу, тестовий запуск та відкриття...",
  },
  {
    key: "expectedResults" as const,
    label: "Очікувані результати та робочі місця",
    hint: "Яких фінансових показників плануєте досягти та скільки людей працевлаштуєте?",
    placeholder: "Наприклад: Створення 2 офіційних робочих місць (бариста). Вихід на самоокупність на 3-й місяць роботи з прогнозованим доходом від 120 000 грн на місяць...",
  },
];

const BUDGET_TEMPLATES = [
  { label: "⚙️ Обладнання / техніка", name: "Виробниче або торгове обладнання", price: "80000.00" },
  { label: "🏢 Оренда", name: "Оренда нежитлового приміщення", price: "25000.00" },
  { label: "📦 Сировина", name: "Сировина та витратні матеріали", price: "35000.00" },
  { label: "📢 Маркетинг і реклама", name: "Маркетингові послуги та реклама", price: "15000.00" },
  { label: "💻 ПРРО / Каса / ПЗ", name: "Програмне забезпечення та термінал ПРРО", price: "10000.00" },
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
  selectedProgram,
  onClearProgram,
}: {
  user: User;
  onUnsavedChange?: (dirty: boolean) => void;
  selectedProgram?: GrantProgram | null;
  onClearProgram?: () => void;
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
    [conflict, setConflict] = useState(false),
    [activeStep, setActiveStep] = useState<"basics" | "plan" | "budget" | "review" | "assistant">("basics"),
    [assistantPrompt, setAssistantPrompt] = useState<string>("");
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
      setActiveStep("basics");
      setAssistantPrompt("");
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
      setActiveStep("basics");
      setAssistantPrompt("");
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
  function addBudgetItem(name = "", price = "0.00", quantity = "1") {
    if (draft.length >= 100) return;
    setDraft([...draft, { name, quantity, price }]);
    setPending(null);
    setNotice("");
  }
  function askAssistant(promptText: string) {
    setAssistantPrompt(promptText);
    setActiveStep("assistant");
  }
  function importSuggestedBudgetItems(items: { name: string; quantity: string; price: string }[]) {
    if (draft.length + items.length > 100) return;
    setDraft((prev) => [...prev, ...items]);
    setPending(null);
    setNotice(`Успішно імпортовано ${items.length} статей до бюджету. Перейдіть на Крок 3 для збереження.`);
  }
  const liveBudgetKopecks = draft.reduce((sum, row) => {
    const price = row.price.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^\d+$/.test(row.quantity)) return Number.NaN;
    const [whole, decimal = ""] = price.split(".");
    const kopecks = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    const quantity = Number(row.quantity);
    if (!Number.isSafeInteger(kopecks) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 || kopecks > 1000000000) return Number.NaN;
    const total = sum + kopecks * quantity;
    return Number.isSafeInteger(total) ? total : Number.NaN;
  }, 0);
  return (
    <div className="card cases-card">
      {selected && createPortal(
        <article className="print-document" aria-label="Чернетка проєкту для друку">
          <p>GrantFolio · Робоча чернетка</p>
          <h1>{selected.title}</h1>
          <p>Збережена версія: {selected.revision}. Документ не замінює офіційної форми заявки.</p>
          {[...basicsFields, ...planFields].map((field) => (
            <section key={field.key}>
              <h2>{field.label}</h2>
              <p className="print-paragraph">{selected.details[field.key] || "Не заповнено"}</p>
            </section>
          ))}
          <h2>Бюджет</h2>
          <table>
            <thead><tr><th>Витрата</th><th>Кількість</th><th>Ціна за одиницю</th><th>Сума</th></tr></thead>
            <tbody>{selected.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unitPriceKopecks)}</td><td>{money(item.quantity * item.unitPriceKopecks)}</td></tr>)}</tbody>
          </table>
          <p><strong>Разом: {money(selected.totalKopecks)}</strong></p>
          <p>Умови участі, актуальний прийом і дозволені витрати перевіряйте на офіційній сторінці програми.</p>
        </article>, document.body
      )}
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
        <div className="case-workspace">
          <div className="case-header">
            <div>
              <h3>{selected.title}</h3>
              <span className="case-revision">Версія чернетки: {selected.revision}</span>
            </div>
          </div>

          {selectedProgram ? (
            <div className="applied-program-banner">
              <div className="applied-program-info">
                <span className="applied-program-tag">Довідкова програма:</span>
                <strong>{selectedProgram.title}</strong>
                <span className="applied-program-desc">
                  Фінансування: <strong>{selectedProgram.amount}</strong> · Ключова умова: {selectedProgram.keyCondition}
                </span>
              </div>
              {onClearProgram && (
                <button
                  type="button"
                  className="link change-program-btn"
                  onClick={onClearProgram}
                >
                  Змінити програму ↗
                </button>
              )}
            </div>
          ) : (
            <div className="applied-program-banner neutral">
              <div className="applied-program-info">
                <span className="applied-program-tag">Пілотна програма:</span>
                <strong>Програма «Власна справа»</strong>
                <span className="applied-program-desc">
                  Ви можете обрати іншу програму у вкладці «Каталог грантів» або готувати заявку під Власну справу.
                </span>
              </div>
            </div>
          )}

          <div className="case-steps-nav" role="tablist" aria-label="Етапи проєкту">
            <button
              type="button"
              className={activeStep === "basics" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("basics")}
            >
              <span className="step-num">1</span>
              <span>Ідея та клієнти</span>
            </button>
            <button
              type="button"
              className={activeStep === "plan" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("plan")}
            >
              <span className="step-num">2</span>
              <span>План запуску</span>
            </button>
            <button
              type="button"
              className={activeStep === "budget" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("budget")}
            >
              <span className="step-num">3</span>
              <span>Бюджет гранту</span>
            </button>
            <button
              type="button"
              className={activeStep === "review" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("review")}
            >
              <span className="step-num">4</span>
              <span>Готовність та експорт</span>
            </button>
            <button
              type="button"
              className={activeStep === "assistant" ? "step-tab active assistant-tab" : "step-tab assistant-tab"}
              onClick={() => setActiveStep("assistant")}
            >
              <span className="step-icon">🤖</span>
              <span>ШІ-Асистент</span>
            </button>
          </div>

          {activeStep === "basics" && (
            <section className="step-panel" aria-labelledby="step1-heading">
              <div className="step-panel-header">
                <h4 id="step1-heading">Крок 1: Ідея бізнесу та цільові клієнти</h4>
                <p>
                  Опишіть вашу ідею, клієнтів та як ви будете продавати. Грантова комісія оцінює розуміння ринку та цінність продукту.
                </p>
              </div>
              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>💡 Потрібна порада ШІ для формулювання?</strong>
                  <span>Асистент допоможе чітко розписати цільову аудиторію та переваги вашого продукту.</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Допоможи мені сформулювати та переконливо описати ідею бізнесу, цільових клієнтів та канали продажу для грантової заявки.")}
                >
                  Запитати ШІ-асистента ↗
                </button>
              </div>
              {basicsFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <span className="field-hint">{field.hint}</span>
                  <textarea
                    rows={4}
                    maxLength={3000}
                    placeholder={field.placeholder}
                    value={details[field.key]}
                    disabled={busy || !!pending}
                    onChange={(e) => {
                      setDetails({ ...details, [field.key]: e.target.value });
                      setNotice("");
                    }}
                  />
                </label>
              ))}
              <div className="step-actions">
                <button
                  className="primary"
                  disabled={busy || conflict || (!!pending && pending.kind !== "details")}
                  onClick={() => void saveDetails()}
                >
                  {busy && pending?.kind === "details"
                    ? "Зберігаємо…"
                    : pending?.kind === "details"
                      ? "Повторити збереження опису"
                      : "Зберегти крок 1"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("plan")}
                >
                  Далі: План запуску ➡️
                </button>
              </div>
            </section>
          )}

          {activeStep === "plan" && (
            <section className="step-panel" aria-labelledby="step2-heading">
              <div className="step-panel-header">
                <h4 id="step2-heading">Крок 2: План реалізації та очікувані результати</h4>
                <p>
                  Зазначте основні кроки запуску (графік) та ключові результати: плановий дохід та робочі місця, якщо вони передбачені вашим планом і умовами програми.
                </p>
              </div>
              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>💡 Скласти графік запуску разом із ШІ?</strong>
                  <span>Асистент підкаже помісячні етапи запуску та вимоги до працевлаштування за грантом.</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Запропонуй помісячний план реалізації (етапи запуску) та очікувані результати (включаючи створення робочих місць) для мого проєкту.")}
                >
                  Запитати ШІ-асистента ↗
                </button>
              </div>
              {planFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <span className="field-hint">{field.hint}</span>
                  <textarea
                    rows={4}
                    maxLength={3000}
                    placeholder={field.placeholder}
                    value={details[field.key]}
                    disabled={busy || !!pending}
                    onChange={(e) => {
                      setDetails({ ...details, [field.key]: e.target.value });
                      setNotice("");
                    }}
                  />
                </label>
              ))}
              <div className="step-actions">
                <button
                  className="primary"
                  disabled={busy || conflict || (!!pending && pending.kind !== "details")}
                  onClick={() => void saveDetails()}
                >
                  {busy && pending?.kind === "details"
                    ? "Зберігаємо…"
                    : pending?.kind === "details"
                      ? "Повторити збереження плану"
                      : "Зберегти крок 2"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("budget")}
                >
                  Далі: Бюджет гранту ➡️
                </button>
              </div>
            </section>
          )}

          {activeStep === "budget" && (
            <section className="step-panel" aria-labelledby="step3-heading">
              <div className="step-panel-header">
                <h4 id="step3-heading">Крок 3: Бюджет грантової заявки</h4>
                <p>
                  Вкажіть конкретні витрати, на які ви плануєте залучити грант. Держава фінансує лише безготівкову оплату затверджених цільових статей.
                </p>
              </div>

              <div className="budget-rules-card">
                <div className="budget-rules-title">Підготовка кошторису</div>
                <ul className="budget-rules-list">
                  <li>Для кожної витрати вкажіть назву, кількість та ціну за одиницю.</li>
                  <li>Приклади нижче — початкові шаблони. Замініть ціни на пропозиції постачальників.</li>
                  <li>Дозволені витрати, максимальна сума та співфінансування залежать від програми. Перевірте їх в офіційних умовах.</li>
                </ul>
              </div>

              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>💡 Не знаєте, що включити до кошторису?</strong>
                  <span>ШІ підбере типові статті витрат та орієнтовні суми під ваш профіль бізнесу.</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Допоможи скласти перелік витрат для мого бізнесу. Відділи орієнтовні приклади від підтверджених цін; запитай про невідомі суми й умови програми.")}
                >
                  Підібрати витрати з ШІ ↗
                </button>
              </div>

              <div className="budget-templates-section">
                <span className="templates-label">Приклади витрат — перевірте ціни та умови:</span>
                <div className="templates-list">
                  {BUDGET_TEMPLATES.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="template-chip"
                      disabled={busy || !!pending || draft.length >= 100}
                      onClick={() => addBudgetItem(tmpl.name, tmpl.price, "1")}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                  <button
                    key="custom"
                    type="button"
                    className="template-chip custom"
                    disabled={busy || !!pending || draft.length >= 100}
                    onClick={() => addBudgetItem("", "0.00", "1")}
                  >
                    + Додати свою витрату
                  </button>
                </div>
              </div>

              <div className="budget-summary-banner">
                <div className="summary-col">
                  <span className="summary-label">Загальна сума у формі:</span>
                  <span className="summary-value">{Number.isFinite(liveBudgetKopecks) ? money(liveBudgetKopecks) : "Перевірте кількість і ціну"}</span>
                </div>
                <div className="summary-col">
                  <span className="summary-label">Збережено в базі:</span>
                  <span className="summary-value secondary">{money(selected.totalKopecks)}</span>
                </div>
                <div className="summary-badge">
                  <span className="badge-warn">Сума кошторису не визначає відповідність умовам гранту.</span>
                </div>
              </div>

              {draft.length === 0 && (
                <div className="empty-budget-notice">
                  Поки не додано жодної статті витрат. Скористайтеся кнопками швидкого додавання вище або додайте статтю вручну.
                </div>
              )}

              {draft.map((row, index) => (
                <div
                  className="budget-row"
                  key={index}
                  role="group"
                  aria-label={`Витрата ${index + 1}`}
                >
                  <label>
                    Назва витрати
                    <input
                      maxLength={160}
                      value={row.name}
                      placeholder="Наприклад: Професійна кавомашина"
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
                    Ціна за од., грн
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

              <div className="step-actions">
                <button
                  className="primary"
                  disabled={busy || conflict || (!!pending && pending.kind !== "budget")}
                  onClick={() => void save()}
                >
                  {busy && pending?.kind === "budget"
                    ? "Зберігаємо…"
                    : pending?.kind === "budget"
                      ? "Повторити збереження бюджету"
                      : "Зберегти бюджет"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("review")}
                >
                  Далі: Перевірка та експорт ➡️
                </button>
              </div>
            </section>
          )}

          {activeStep === "review" && (
            <section className="step-panel" aria-labelledby="step4-heading">
              <div className="step-panel-header">
                <h4 id="step4-heading">Крок 4: Перевірка готовності та експорт чернетки</h4>
                <p>
                  Перевірте заповненість усіх блоків. Після збереження завантажте робочу чернетку для підготовки офіційної заявки.
                </p>
              </div>

              <section className="readiness" aria-labelledby="readiness-heading">
                <h4 id="readiness-heading">Чек-лист заповненості проєкту</h4>
                {readiness && (
                  <>
                    <p>Збережена версія у списку: {readiness.revision}</p>
                    <ul>
                      {readiness.checks.map((check) => (
                        <li key={check.id}>
                          <span>{check.label}</span>
                          <strong className={check.status === "complete" ? "check-complete" : "check-missing"}>
                            {check.status === "complete" ? "✓ Заповнено" : "Потрібно заповнити"}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <p className="readiness-disclaimer">{readiness.disclaimer}</p>
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
                {dirty && <p className="readiness-dirty">Незбережені зміни ще не враховані у списку.</p>}
              </section>

              <section className="export-section" aria-labelledby="export-heading">
                <h4 id="export-heading">Експорт робочої чернетки</h4>
                <p>
                  Сформований файл містить структуровані відповіді та бюджет. Скопіюйте їх під час заповнення офіційної заявки на державному порталі.
                </p>
                <div className="export-buttons-group">
                  <button
                    className="primary export-btn"
                    disabled={busy || dirty || !!pending || conflict}
                    onClick={() => void downloadDraft()}
                  >
                    Завантажити чернетку (.txt) <span>↗</span>
                  </button>
                  <button
                    type="button"
                    className="secondary-btn print-pdf-btn"
                    disabled={busy || dirty || !!pending || conflict}
                    onClick={() => window.print()}
                  >
                    📄 Зберегти як PDF / Друк ↗
                  </button>
                </div>
                {(dirty || pending) && (
                  <p className="error">Перед завантаженням збережіть зміни в описі та бюджеті.</p>
                )}
              </section>

              <section className="delete-section" aria-labelledby="delete-heading">
                <h4 id="delete-heading">Керування чернеткою</h4>
                <button
                  className="link danger"
                  disabled={busy || !!pending}
                  onClick={() => void deleteDraft()}
                >
                  Видалити чернетку
                </button>
              </section>
            </section>
          )}

          {activeStep === "assistant" && (
            <section className="step-panel" aria-labelledby="assistant-tab-heading">
              <Assistant
                key={selected.id}
                caseId={selected.id}
                revision={selected.revision}
                blocked={dirty || !!pending || busy || conflict}
                request={request}
                prefilledPrompt={assistantPrompt}
                onClearPrefilled={() => setAssistantPrompt("")}
                onImportBudgetItems={importSuggestedBudgetItems}
              />
            </section>
          )}

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
