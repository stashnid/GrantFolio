import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import { financialBusinessPlanRowFields } from "../../backend/src/grant-financial-plan";
import type { FinancialBusinessPlanRows, FinancialMonth, FinancialPlan, calculateFinancialPlan } from "../../backend/src/grant-financial-plan";
import { authenticatedRequest, readableApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";

type View = {
  plan: FinancialPlan | null;
  forecast: ReturnType<typeof calculateFinancialPlan> | null;
  grant: number | null;
  own: number | null;
  reconciled: boolean;
  officialRowsReady: boolean;
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
const incomingFields = fields.slice(0, 3);
type DraftBusinessPlanRows = Record<keyof FinancialBusinessPlanRows, string>;
function emptyBusinessPlanRows(): DraftBusinessPlanRows {
  return Object.fromEntries(financialBusinessPlanRowFields.map(([field]) => [field, ""])) as DraftBusinessPlanRows;
}

type DraftMonth = Record<keyof FinancialMonth, string>;
type Draft = { opening: string; months: DraftMonth[]; businessPlanRows: DraftBusinessPlanRows[] };
type LocalDraft = { caseRevision: number; applicationRevision: number; planRevision: number; draft: Draft };
const validInput = (value: unknown) => typeof value === "string" && value.length <= 14;

function readLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 40_000) return null;
    const local = JSON.parse(raw) as LocalDraft;
    if (!local.draft || !validInput(local.draft.opening) ||
        !Array.isArray(local.draft.months) || ![24, 36, 60].includes(local.draft.months.length) ||
        !local.draft.months.every(month => month && incomingFields.every(([field]) => validInput(month[field]))) ||
        !Array.isArray(local.draft.businessPlanRows) || local.draft.businessPlanRows.length !== local.draft.months.length ||
        !local.draft.businessPlanRows.every(rows => rows && financialBusinessPlanRowFields.every(([field]) => validInput(rows[field])))) return null;
    return local;
  } catch { return null; }
}

function emptyMonth(): DraftMonth {
  return {
    salesKopecks: "", grantKopecks: "", ownKopecks: "", operatingCostsKopecks: "",
    payrollKopecks: "", taxesKopecks: "", capitalCostsKopecks: "",
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
    businessPlanRows: plan.businessPlanRows?.map(rows => Object.fromEntries(financialBusinessPlanRowFields.map(([field]) => [field, inputMoney(rows[field])])) as DraftBusinessPlanRows) ?? Array.from({ length: plan.months.length }, emptyBusinessPlanRows),
  } : { opening: "", months: Array.from({ length: 24 }, emptyMonth), businessPlanRows: Array.from({ length: 24 }, emptyBusinessPlanRows) };
}

function kopecks(text: string) {
  const amount = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!amount) throw new Error("Уведіть невід’ємну суму з точністю до копійок.");
  const value = Number(amount[1]) * 100 + Number((amount[2] ?? "").padEnd(2, "0"));
  if (value > 1_000_000_000_000) throw new Error("Значення перевищує допустиму суму для одного поля.");
  return value;
}

function validatedDraft(draft: Draft): FinancialPlan {
  const businessPlanRows: FinancialBusinessPlanRows[] = draft.businessPlanRows.map((rows, index) => {
    try { return Object.fromEntries(financialBusinessPlanRowFields.map(([field]) => [field, kopecks(rows[field])])) as FinancialBusinessPlanRows; }
    catch (error) { throw new Error(`Місяць ${index + 1}, розподіл за формою: ${(error as Error).message}`); }
  });
  return {
    openingBalanceKopecks: kopecks(draft.opening),
    months: draft.months.map((month, index) => {
      try {
        const official = businessPlanRows[index];
        const operatingCostsKopecks = [official.propertyPurchaseKopecks, official.premisesRentKopecks, official.equipmentRentalKopecks, official.otherBusinessCostsKopecks, official.utilitiesKopecks, official.insuranceKopecks, official.marketingKopecks, official.communicationsKopecks, official.repairsKopecks, official.transportKopecks, official.professionalServicesKopecks].reduce((sum, value) => sum + value, 0);
        const payrollKopecks = official.applicantSalaryKopecks + official.existingStaffSalaryKopecks + official.newStaffSalaryKopecks;
        const taxesKopecks = [official.simplifiedTaxKopecks, official.simplifiedMilitaryLevyKopecks, official.fopIncomeTaxKopecks, official.fopMilitaryLevyKopecks, official.fopEsvKopecks, official.ecologicalTaxKopecks, official.rentPaymentKopecks].reduce((sum, value) => sum + value, 0);
        return {
          salesKopecks: kopecks(month.salesKopecks),
          grantKopecks: kopecks(month.grantKopecks),
          ownKopecks: kopecks(month.ownKopecks),
          operatingCostsKopecks,
          payrollKopecks,
          taxesKopecks,
          capitalCostsKopecks: official.equipmentKopecks,
        };
      } catch (error) {
        throw new Error(`Місяць ${index + 1}. ${(error as Error).message}`);
      }
    }),
    businessPlanRows,
  };
}

const displayMoney = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" });

export function GrantFinancialPlan({ user, caseId, caseRevision, applicationRevision, disabled, exportUnlocked }: {
  user: User; caseId: string; caseRevision: number; applicationRevision: number; disabled: boolean; exportUnlocked: boolean;
}) {
  const confirm = useConfirm();
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState(() => readDraft(null));
  const [month, setMonth] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportingDiia, setExportingDiia] = useState(false);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const hasDraftChanges = useRef(false);
  const discardChanges = useRef(false);
  const activeCaseIdRef = useRef(caseId);
  activeCaseIdRef.current = caseId;
  const baseVersion = useRef<Pick<View, "caseRevision" | "applicationRevision" | "planRevision"> | null>(null);
  const path = `/api/cases/${caseId}/grant-financial-plan`;
  const storageKey = `grantfolio:finance:v1:${encodeURIComponent(user.uid)}:${caseId}`;
  const [recovery, setRecovery] = useState<LocalDraft | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);

  function forgetLocalDraft() {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage unavailable. */ }
    setRecovery(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    authenticatedRequest(user, path, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("financial_plan_read_failed");
        const next = await response.json() as View;
        if (controller.signal.aborted) return;
        const base = baseVersion.current;
        if (hasDraftChanges.current && !discardChanges.current && base &&
            (next.planRevision !== base.planRevision || next.caseRevision !== base.caseRevision ||
             next.applicationRevision !== base.applicationRevision)) {
          setStale(true);
          setError("Збережені дані змінилися в іншій вкладці. Скопіюйте незбережені суми перед завантаженням актуального плану.");
          return;
        }
        baseVersion.current = next;
        setView(next);
        if (!hasDraftChanges.current || discardChanges.current) {
          const local = discardChanges.current ? null : readLocalDraft(storageKey);
          const sameVersion = local && local.caseRevision === next.caseRevision &&
            local.applicationRevision === next.applicationRevision && local.planRevision === next.planRevision;
          setDraft(sameVersion ? local.draft : readDraft(next.plan));
          setRecovery(local && !sameVersion ? local : null);
          setMonth(0);
          setDirty(Boolean(sameVersion));
          hasDraftChanges.current = Boolean(sameVersion);
          discardChanges.current = false;
        }
        setStale(next.caseRevision !== caseRevision || next.applicationRevision !== applicationRevision);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(readableApiError(error, "Не вдалося завантажити фінансовий план."));
      });
    return () => controller.abort();
  }, [user, path, storageKey, caseRevision, applicationRevision, reload]);

  const blocked = !view || !!recovery || busy || stale || disabled || view.caseRevision !== caseRevision || view.applicationRevision !== applicationRevision;

  function updateDraft(next: Draft) {
    if (view) {
      try {
        const { caseRevision, applicationRevision, planRevision } = view;
        sessionStorage.setItem(storageKey, JSON.stringify({ caseRevision, applicationRevision, planRevision, draft: next }));
        setStorageFailed(false);
      } catch { setStorageFailed(true); }
    }
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
        forgetLocalDraft();
        setView(next);
        baseVersion.current = next;
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

  async function exportOfficialBusinessPlan() {
    if (!view || blocked || dirty || !view.reconciled || !view.officialRowsReady || !exportUnlocked) return;
    setExportingDiia(true);
    setError("");
    try {
      const response = await authenticatedRequest(user, `/api/cases/${caseId}/grant-application/diia-draft/export`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: applicationRevision, expectedCaseRevision: caseRevision }),
      }, 55000);
      if (response.status === 409) { setStale(true); throw new Error("Анкета змінилася. Оновіть сторінку та повторно звірте план."); }
      if (response.status === 422) throw new Error("Перевірте анкету, джерела кожної витрати, податкові рядки та підтвердження відповідей.");
      if (!response.ok) throw new Error("Не вдалося сформувати бізнес-план.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "grantfolio-vlasna-sprava-business-plan.zip";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(readableApiError(error, "Не вдалося створити повний XLSX і PDF бізнес-плану."));
    } finally { setExportingDiia(false); }
  }

  return <section className="readiness" aria-labelledby="grant-financial-title">
    <h4 id="grant-financial-title">Помісячний фінансовий план</h4>
    <p>Заповніть надходження та розподіліть витрати, зарплати й податки по рядках офіційної таблиці за кожен місяць. Порожнє поле означає невідому суму; введіть 0, якщо операції справді не буде. Перевірте податкові суми з бухгалтером. Грант зараховується одноразово в першому місяці.</p>
    {view?.plan && !view.plan.businessPlanRows && <p role="status">Збережений план містить лише загальні суми. Розподіліть їх по рядках нижче, щоб отримати заповнений бізнес-план.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {stale && <button type="button" className="link" onClick={async () => {
      const currentCaseId = caseId;
      if (dirty) {
        const confirmed = await confirm({
          title: "Завантажити збережений план?",
          message: "Незбережені зміни у фінансовому плані буде відкинуто.",
          confirmLabel: "Завантажити",
          cancelLabel: "Скасувати",
          tone: "warning",
        });
        if (!confirmed || activeCaseIdRef.current !== currentCaseId) return;
      }
      forgetLocalDraft();
      discardChanges.current = true;
      setReload(value => value + 1);
    }}>Завантажити збережений план</button>}
    {!view && !error && <p role="status">Завантажуємо план…</p>}
    {!view && error && <button type="button" className="link" onClick={() => setReload(value => value + 1)}>Повторити</button>}
    {storageFailed && <p role="alert">Локальну копію створити не вдалося. Збережіть план до переходу на інший екран.</p>}
    {recovery && <details>
      <summary>Переглянути незбережені суми попередньої версії</summary>
      <p>Звірте суми з поточною версією перед повторним введенням.</p>
      <textarea readOnly aria-label="Незбережені суми попередньої версії" value={[
        `Початковий залишок: ${recovery.draft.opening}`,
        ...recovery.draft.months.map((item, i) => `Місяць ${i + 1}: ${fields.map(([key, label]) => `${label}: ${item[key] || "не вказано"}`).join(", ")}`),
      ].join("\n")} />
      <button type="button" className="link" onClick={forgetLocalDraft}>Закрити локальну копію і редагувати поточну версію</button>
    </details>}
    {view && <>
      {view.stale && <p>Анкета або проєкт змінилися. Звірте суми й повторно збережіть план для нової версії.</p>}
      <form onSubmit={submit}>
        <fieldset disabled={blocked}>
          <label>Період
            <select value={draft.months.length} onChange={async event => {
              const count = Number(event.target.value);
              const currentCaseId = caseId;
              if (draft.months.slice(count).some(item => Object.values(item).some(amount => amount !== "" && !/^0(?:[.,]00)?$/.test(amount))) || draft.businessPlanRows.slice(count).some(rows => Object.values(rows).some(amount => amount !== "" && !/^0(?:[.,]00)?$/.test(amount)))) {
                const confirmed = await confirm({
                  title: "Скоротити період плану?",
                  message: "Скорочення періоду видалить введені дані останніх місяців.",
                  confirmLabel: "Скоротити",
                  cancelLabel: "Скасувати",
                  tone: "danger",
                });
                if (!confirmed || activeCaseIdRef.current !== currentCaseId) return;
              }
              updateDraft({ ...draft, months: Array.from({ length: count }, (_, i) => draft.months[i] ?? emptyMonth()), businessPlanRows: Array.from({ length: count }, (_, i) => draft.businessPlanRows[i] ?? emptyBusinessPlanRows()) });
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
          {incomingFields.map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.months[month][field]}
              onChange={event => {
                const months = [...draft.months];
                months[month] = { ...months[month], [field]: event.target.value };
                updateDraft({ ...draft, months });
              }} />
          </label>)}
          <h5>Додаткові надходження</h5>
          {financialBusinessPlanRowFields.slice(0, 3).map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.businessPlanRows[month][field]}
              onChange={event => { const rows = [...draft.businessPlanRows]; rows[month] = { ...rows[month], [field]: event.target.value }; updateDraft({ ...draft, businessPlanRows: rows }); }} />
          </label>)}
          <h5>Витрати проєкту</h5>
          {financialBusinessPlanRowFields.slice(3, 15).map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.businessPlanRows[month][field]}
              onChange={event => { const rows = [...draft.businessPlanRows]; rows[month] = { ...rows[month], [field]: event.target.value }; updateDraft({ ...draft, businessPlanRows: rows }); }} />
          </label>)}
          <h5>Заробітна плата</h5>
          {financialBusinessPlanRowFields.slice(15, 18).map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.businessPlanRows[month][field]}
              onChange={event => { const rows = [...draft.businessPlanRows]; rows[month] = { ...rows[month], [field]: event.target.value }; updateDraft({ ...draft, businessPlanRows: rows }); }} />
          </label>)}
          <h5>Податки та обов’язкові платежі</h5>
          {financialBusinessPlanRowFields.slice(18).map(([field, label]) => <label key={field}>{label}, грн
            <input inputMode="decimal" maxLength={14} value={draft.businessPlanRows[month][field]}
              onChange={event => { const rows = [...draft.businessPlanRows]; rows[month] = { ...rows[month], [field]: event.target.value }; updateDraft({ ...draft, businessPlanRows: rows }); }} />
          </label>)}
          <button type="button" className="link" onClick={async () => {
            const currentCaseId = caseId;
            const confirmed = await confirm({
              title: "Заповнити порожні поля нулями?",
              message: "У всі порожні поля буде записано 0. Підтвердіть, лише якщо в них справді немає запланованих операцій.",
              confirmLabel: "Заповнити нулями",
              cancelLabel: "Скасувати",
              tone: "default",
            });
            if (!confirmed || activeCaseIdRef.current !== currentCaseId) return;
            updateDraft({
              opening: draft.opening || "0",
              months: draft.months.map(item => Object.fromEntries(fields.map(([key]) => [key, item[key] || "0"])) as DraftMonth),
              businessPlanRows: draft.businessPlanRows.map(rows => Object.fromEntries(financialBusinessPlanRowFields.map(([key]) => [key, rows[key] || "0"])) as DraftBusinessPlanRows),
            });
          }}>Заповнити решту нулями</button>
          <button type="submit" className="secondary-btn">{busy ? "Зачекайте…" : "Зберегти фінансовий план"}</button>
        </fieldset>
      </form>
      {view.forecast && <>
        <p>Збережена версія {view.planRevision}. Надходження {displayMoney.format(view.forecast.totals.incomeKopecks / 100)}, витрати {displayMoney.format(view.forecast.totals.expensesKopecks / 100)}, кінцевий залишок {displayMoney.format(view.forecast.totals.closingBalanceKopecks / 100)}.</p>
        {view.forecast.deficitMonths.length > 0 && <p>Дефіцит коштів у місяцях {view.forecast.deficitMonths.join(", ")}.</p>}
        {!view.reconciled && <p>Для експорту суми гранту й власного внеску у плані мають збігатися з анкетою.</p>}
        {!view.officialRowsReady && <p>Для повного бізнес-плану розподіліть усі місячні суми по рядках форми; підсумки мають збігатися з фінансовим прогнозом.</p>}
        <button type="button" className="secondary-btn" disabled={blocked || dirty || view.stale || !view.reconciled || !view.officialRowsReady || !exportUnlocked}
          onClick={() => void execute(view)}>Завантажити робочі XLSX і PDF</button>
        <button type="button" className="primary" disabled={blocked || dirty || view.stale || !view.reconciled || !view.officialRowsReady || !exportUnlocked || exportingDiia}
          onClick={() => void exportOfficialBusinessPlan()}>{exportingDiia ? "Формуємо повний бізнес-план…" : "Завантажити заповнений бізнес-план Дії XLSX і PDF"}</button>
      </>}
    </>}
  </section>;
}
