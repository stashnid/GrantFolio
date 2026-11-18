import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import type { FinancialMonth, FinancialPlan, calculateFinancialPlan } from "../../backend/src/grant-financial-plan";
import { authenticatedRequest, readableApiError } from "./api";

type View = {
  plan: FinancialPlan | null;
  forecast: ReturnType<typeof calculateFinancialPlan> | null;
  grant: number | null;
  own: number | null;
  reconciled: boolean;
  stale: boolean;
  caseRevision: number;
  applicationRevision: number;
  planRevision: number;
};

const fields = [
  ["salesKopecks", "Надходження від продажів"],
  ["grantKopecks", "Надходження гранту"],
  ["ownKopecks", "Власний внесок"],
  ["operatingCostsKopecks", "Операційні витрати без зарплат і податків"],
  ["payrollKopecks", "Виплати працівникам"],
  ["taxesKopecks", "Податки та збори"],
  ["capitalCostsKopecks", "Капітальні витрати"],
] as const satisfies readonly [keyof FinancialMonth, string][];

type DraftMonth = Record<keyof FinancialMonth, string>;
type Draft = { opening: string; months: DraftMonth[] };

function emptyMonth(): DraftMonth {
  return {
    salesKopecks: "0", grantKopecks: "0", ownKopecks: "0", operatingCostsKopecks: "0",
    payrollKopecks: "0", taxesKopecks: "0", capitalCostsKopecks: "0",
  };
}

function inputMoney(kopecks: number) {
  return (kopecks / 100).toFixed(2).replace(".", ",");
}

function readDraft(plan: FinancialPlan | null): Draft {
  return plan ? {
    opening: inputMoney(plan.openingBalanceKopecks),
    months: plan.months.map(month => {
      const result = emptyMonth();
      for (const [field] of fields) result[field] = inputMoney(month[field]);
      return result;
    }),
  } : { opening: "0", months: Array.from({ length: 24 }, emptyMonth) };
}

function kopecks(text: string) {
  const amount = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!amount) throw new Error("Уведіть невід’ємну суму з точністю до копійок.");
  const value = Number(amount[1]) * 100 + Number((amount[2] ?? "").padEnd(2, "0"));
  if (value > 1_000_000_000_000) throw new Error("Значення перевищує допустиму суму для одного поля.");
  return value;
}

function validatedDraft(draft: Draft): FinancialPlan {
  return {
    openingBalanceKopecks: kopecks(draft.opening),
    months: draft.months.map((month, index) => {
      try {
        return {
          salesKopecks: kopecks(month.salesKopecks),
          grantKopecks: kopecks(month.grantKopecks),
          ownKopecks: kopecks(month.ownKopecks),
          operatingCostsKopecks: kopecks(month.operatingCostsKopecks),
          payrollKopecks: kopecks(month.payrollKopecks),
          taxesKopecks: kopecks(month.taxesKopecks),
          capitalCostsKopecks: kopecks(month.capitalCostsKopecks),
        };
      } catch (error) {
        throw new Error(`Місяць ${index + 1}. ${(error as Error).message}`);
      }
    }),
  };
}

const displayMoney = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" });

export function GrantFinancialPlan({ user, caseId, caseRevision, applicationRevision, disabled }: {
  user: User; caseId: string; caseRevision: number; applicationRevision: number; disabled: boolean;
}) {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState(() => readDraft(null));
  const [month, setMonth] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const hasDraftChanges = useRef(false);
  const discardChanges = useRef(false);
  const lastPlanRevision = useRef(0);
  const path = `/api/cases/${caseId}/grant-financial-plan`;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    authenticatedRequest(user, path, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("financial_plan_read_failed");
        const next = await response.json() as View;
        if (controller.signal.aborted) return;
        if (hasDraftChanges.current && !discardChanges.current && next.planRevision !== lastPlanRevision.current) {
          setStale(true);
          setError("Збережені дані змінилися в іншій вкладці. Скопіюйте незбережені суми перед завантаженням актуального плану.");
          return;
        }
        lastPlanRevision.current = next.planRevision;
        setView(next);
        if (!hasDraftChanges.current || discardChanges.current) {
          setDraft(readDraft(next.plan));
          setMonth(0);
          setDirty(false);
          hasDraftChanges.current = false;
          discardChanges.current = false;
        }
        setStale(next.caseRevision !== caseRevision || next.applicationRevision !== applicationRevision);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(readableApiError(error, "Не вдалося завантажити фінансовий план."));
      });
    return () => controller.abort();
  }, [user, path, caseRevision, applicationRevision, reload]);

  const blocked = !view || busy || stale || disabled || view.caseRevision !== caseRevision || view.applicationRevision !== applicationRevision;

  function updateDraft(next: Draft) {
    setDraft(next);
    setDirty(true);
    hasDraftChanges.current = true;
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || !view) return;
    let plan: FinancialPlan;
    try { plan = validatedDraft(draft); }
    catch (error) { setError((error as Error).message); return; }
    await execute(view, plan);
  }

  async function execute(expected: View, plan?: FinancialPlan) {
    if (blocked) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedRequest(user, plan ? path : `${path}/export`, {
        method: plan ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedCaseRevision: caseRevision,
          expectedApplicationRevision: applicationRevision,
          expectedPlanRevision: expected.planRevision,
          ...(plan ? { plan } : {}),
        }),
      }, plan ? 15000 : 55000);
      if (response.status === 409) {
        setStale(true);
        setError("Проєкт або план оновився. Завантажте поточну версію перед повторною спробою.");
        return;
      }
      if (response.status === 429 || response.status === 503) {
        setError("Формування файлів тимчасово недоступне. Спробуйте трохи пізніше.");
        return;
      }
      if (!response.ok) throw new Error("financial_plan_request_failed");
      if (plan) {
        const next = await response.json() as View;
        setView(next);
        lastPlanRevision.current = next.planRevision;
        setDirty(false);
        hasDraftChanges.current = false;
        setNotice("Фінансовий план збережено.");
      } else {
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "grantfolio-financial-draft.zip";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setError(readableApiError(error, plan ? "Не вдалося зберегти план." : "Не вдалося завантажити файли."));
    } finally { setBusy(false); }
  }

  return <section className="readiness" aria-labelledby="grant-financial-title">
    <h4 id="grant-financial-title">Помісячний фінансовий план</h4>
    <p>Вкажіть надходження й витрати за місяцями в гривнях. Нуль означає відсутність відповідної операції. Внесіть податки за власними перевіреними розрахунками.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {stale && <button type="button" className="link" onClick={() => {
      if (!dirty || window.confirm("Завантажити збережений план і відкинути незбережені зміни?")) {
        discardChanges.current = true;
        setReload(value => value + 1);
      }
    }}>Завантажити збережений план</button>}
    {!view && !error && <p role="status">Завантажуємо план…</p>}
    {!view && error && <button type="button" className="link" onClick={() => setReload(value => value + 1)}>Повторити</button>}
    {view && <>
      {view.stale && <p>Анкета або проєкт змінилися. Звірте суми й повторно збережіть план для нової версії.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={blocked}>
          <label>Період
            <select value={draft.months.length} onChange={event => {
              const count = Number(event.target.value);
              if (draft.months.slice(count).some(item => Object.values(item).some(amount => !/^0(?:[.,]00)?$/.test(amount))) &&
                !window.confirm("Скорочення періоду видалить введені дані останніх місяців. Продовжити?")) return;
              updateDraft({ ...draft, months: Array.from({ length: count }, (_, i) => draft.months[i] ?? emptyMonth()) });
              setMonth(Math.min(month, count - 1));
            }}>
              {[24, 36, 60].map(count => <option key={count} value={count}>{count} місяців</option>)}
            </select>
          </label>
          <label>Початковий залишок, грн
            <input inputMode="decimal" maxLength={14} value={draft.opening}
              onChange={event => updateDraft({ ...draft, opening: event.target.value })} />
          </label>
          <label>Місяць
            <select value={month} onChange={event => setMonth(Number(event.target.value))}>
              {draft.months.map((_, index) => <option key={index} value={index}>Місяць {index + 1}</option>)}
            </select>
          </label>
          {fields.map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.months[month][field]}
              onChange={event => {
                const months = [...draft.months];
                months[month] = { ...months[month], [field]: event.target.value };
                updateDraft({ ...draft, months });
              }} />
          </label>)}
          <button type="submit" className="secondary-btn">{busy ? "Зачекайте…" : "Зберегти фінансовий план"}</button>
        </fieldset>
      </form>
      {view.forecast && <>
        <p>Збережена версія {view.planRevision}. Надходження {displayMoney.format(view.forecast.totals.incomeKopecks / 100)}, витрати {displayMoney.format(view.forecast.totals.expensesKopecks / 100)}, кінцевий залишок {displayMoney.format(view.forecast.totals.closingBalanceKopecks / 100)}.</p>
        {view.forecast.deficitMonths.length > 0 && <p>Дефіцит коштів у місяцях {view.forecast.deficitMonths.join(", ")}.</p>}
        {!view.reconciled && <p>Для експорту суми гранту й власного внеску у плані мають збігатися з анкетою.</p>}
        <button type="button" className="secondary-btn" disabled={blocked || dirty || view.stale || !view.reconciled}
          onClick={() => void execute(view)}>Завантажити робочі XLSX і PDF</button>
      </>}
    </>}
  </section>;
}
