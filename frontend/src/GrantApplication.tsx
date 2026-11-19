import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import type {
  GrantApplicationAnswers, GrantApplicationQuestion, GrantApplicationReview,
} from "../../backend/src/grant-application";
import { authenticatedRequest, readableApiError } from "./api";
import { GrantFinancialPlan } from "./GrantFinancialPlan";

type PreparationAccess = { state: "standard" | "pending" | "active" | "terminal"; reference: string | null; paymentUrl: string | null; paymentStatus?: "expired" | "reversed" | null };

type ReviewResponse = {
  application: GrantApplicationReview | null;
  documentCoverage: { mappedAnswers: string[]; remainingAnswers: string[]; missingOfficialInputs: string[] } | null;
  answers: GrantApplicationAnswers;
  revision: number;
  caseRevision: number;
};

const questionExplanations: Partial<Record<GrantApplicationQuestion["id"], string>> = {
  requestedGrantKopecks: "Цю суму звіряємо з лімітом обраного напряму та збереженим кошторисом. Якщо сума передбачає надбавку, перевірте підставу в умовах програми.",
  ownContributionKopecks: "Разом із запитом на грант власні кошти мають покрити збережений кошторис. Мінімальний внесок і винятки звірте з умовами вашого напряму.",
  newJobs: "Кількість нових робочих місць може визначати зобов’язання за грантом. Враховуйте найм, який зможете забезпечити, та звірте вимоги вашого напряму.",
};

function money(value: number) {
  return (value / 100).toLocaleString("uk-UA", { style: "currency", currency: "UAH" });
}

function valueForInput(question: GrantApplicationQuestion) {
  if (typeof question.value === "number" && question.kind === "money") {
    return (question.value / 100).toFixed(2).replace(".", ",");
  }
  return question.value?.toString() ?? question.suggestion ?? "";
}

function parseAnswer(question: GrantApplicationQuestion, input: string) {
  const value = input.trim();
  if (question.kind === "confirmation") return value === "yes" ? true : undefined;
  if (question.kind === "money") {
    const match = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(value.replace(/\s/g, ""));
    if (!match) return undefined;
    const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    return amount <= 1_000_000_000_000 && (question.id !== "requestedGrantKopecks" || amount > 0) ? amount : undefined;
  }
  if (question.kind === "integer") return /^\d{1,7}$/.test(value) ? Number(value) : undefined;
  if (question.kind === "decimal") return /^\d{1,4}(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : undefined;
  return value || undefined;
}

export function GrantApplication({ user, caseId, caseRevision, programId, disabled }: {
  user: User;
  caseId: string;
  caseRevision: number;
  programId: string;
  disabled: boolean;
}) {
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [editing, setEditing] = useState<GrantApplicationQuestion["id"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [access, setAccess] = useState<PreparationAccess | null>(null);
  const [startingPayment, setStartingPayment] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentUnavailable, setPaymentUnavailable] = useState(false);
  const [terminalPayment, setTerminalPayment] = useState<"failure" | "expired" | "reversed" | null>(null);
  const [reload, setReload] = useState(0);
  const path = `/api/cases/${caseId}/grant-application`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAccessError("");
    setAccess(null);
    setTerminalPayment(null);
    Promise.allSettled([
      authenticatedRequest(user, path, { signal: controller.signal }),
      authenticatedRequest(user, `/api/cases/${caseId}/payment`, { signal: controller.signal }),
    ])
      .then(async ([applicationResult, paymentResult]) => {
        if (applicationResult.status === "rejected" || !applicationResult.value.ok) throw new Error("application_read_failed");
        const result = applicationResult.value;
        const data = await result.json() as ReviewResponse;
        if (controller.signal.aborted) return;
        setResponse(data);
        setEditing(null);
        setStale(data.caseRevision !== caseRevision);
        if (paymentResult.status === "fulfilled" && paymentResult.value.ok) {
          try {
            const paymentAccess = await paymentResult.value.json() as PreparationAccess;
            setAccess(paymentAccess);
            if (paymentAccess.state === "terminal") setTerminalPayment(paymentAccess.paymentStatus ?? "expired");
          } catch {
            setAccess(null);
            setAccessError("Не вдалося перевірити оплату. Спробуйте оновити статус.");
          }
        } else {
          setAccess(null);
          setAccessError("Не вдалося перевірити оплату. Спробуйте оновити статус.");
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(readableApiError(error, "Не вдалося завантажити анкету."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, path, caseId, caseRevision, reload]);

  useEffect(() => {
    if (access?.state !== "pending" || terminalPayment) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    const schedule = () => {
      if (!controller.signal.aborted && document.visibilityState === "visible") timer = setTimeout(() => void check(), 4000);
    };
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const result = await authenticatedRequest(user, `/api/cases/${caseId}/payment`, { signal: controller.signal });
        if (!result.ok) throw new Error("payment_status_failed");
        const data = await result.json() as PreparationAccess;
        if (!controller.signal.aborted) {
          setAccess(data);
          setTerminalPayment(data.state === "terminal" ? data.paymentStatus ?? "expired" : null);
          setAccessError("");
          if (data.state === "pending") schedule();
        }
      } catch {
        if (!controller.signal.aborted) {
          setAccessError("Не вдалося перевірити статус оплати. Повторимо перевірку автоматично.");
          schedule();
        }
      } finally {
        checking = false;
      }
    };
    const visibilityChanged = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [user, caseId, access?.state, terminalPayment]);

  async function refreshPayment() {
    setCheckingPayment(true);
    try {
      const result = await authenticatedRequest(user, `/api/cases/${caseId}/payment`, access?.state === "pending" ? { method: "POST" } : undefined);
      if (result.status === 409) {
        const body = await result.json() as { error?: string; paymentStatus?: string };
        if (body.error === "payment_terminal" && (body.paymentStatus === "failure" || body.paymentStatus === "expired" || body.paymentStatus === "reversed")) {
          setTerminalPayment(body.paymentStatus);
          setAccessError("");
          return;
        }
      }
      if (!result.ok) throw new Error("payment_status_failed");
      const data = await result.json() as PreparationAccess;
      setAccess(data);
      setTerminalPayment(data.state === "terminal" ? data.paymentStatus ?? "expired" : null);
      setAccessError("");
      setPaymentUnavailable(false);
    } catch {
      setAccessError("Не вдалося підтвердити статус оплати. Спробуйте пізніше або зверніться до підтримки.");
    } finally {
      setCheckingPayment(false);
    }
  }

  const application = response?.application;
  if (response && !application && !loading && !error && programId !== "vlasna-sprava") {
    return <section id="grant-application" className="readiness"><h4>Анкета заявки</h4><p>Для цієї програми доступний загальний план підготовки. Окрему анкету ще не додано.</p></section>;
  }
  const question = application?.questions.find(item => item.id === editing) ?? application?.nextQuestion;
  const unanswered = application?.questions.filter(item => item.value === undefined && item.id !== "confirmAccuracy") ?? [];
  const answeredCount = (application?.questions.length ?? 0) - unanswered.length - (application?.questions.some(item => item.id === "confirmAccuracy") ? 1 : 0);
  const explanation = question && questionExplanations[question.id];
  const answerDescription = explanation ? "grant-application-answer-note" : undefined;
  const blocked = disabled || stale || loading || saving || response?.caseRevision !== caseRevision;

  async function startPayment() {
    // Open synchronously so the browser does not block the checkout window.
    const checkout = window.open("", "_blank");
    if (checkout) checkout.opener = null;
    setStartingPayment(true);
    setAccessError("");
    setPaymentUnavailable(false);
    try {
      const result = await authenticatedRequest(user, `/api/cases/${caseId}/payment`, { method: "POST" });
      if (result.status === 503) {
        checkout?.close();
        setPaymentUnavailable(true);
        return;
      }
      if (!result.ok) throw new Error("export_payment_start_failed");
      const data = await result.json() as PreparationAccess;
      setAccess(data);
      setTerminalPayment(data.state === "terminal" ? data.paymentStatus ?? "expired" : null);
      if (data.state === "pending" && data.paymentUrl) {
        if (checkout) checkout.location.href = data.paymentUrl;
      } else {
        checkout?.close();
      }
    } catch {
      checkout?.close();
      setAccessError("Не вдалося відкрити оплату. Спробуйте ще раз.");
    } finally {
      setStartingPayment(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!response || !question || blocked) return;
    const data = new FormData(event.currentTarget);
    const value = parseAnswer(question, String(data.get("answer") ?? ""));
    if (value === undefined) {
      setError("Укажіть відповідь у запропонованому форматі.");
      return;
    }
    const answers = { ...response.answers, [question.id]: value };
    if (question.id !== "confirmAccuracy") delete answers.confirmAccuracy;
    setSaving(true);
    setError("");
    try {
      const result = await authenticatedRequest(user, path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, expectedRevision: response.revision, expectedCaseRevision: caseRevision }),
      });
      if (result.status === 409) {
        setStale(true);
        setError("Анкета або проєкт змінилися. Скопіюйте незбережену відповідь, якщо потрібно, та оновіть дані перед наступним збереженням.");
        return;
      }
      if (result.status === 400) {
        setError("Перевірте формат і допустимий розмір відповіді.");
        return;
      }
      if (!result.ok) throw new Error("application_write_failed");
      setResponse(await result.json() as ReviewResponse);
      setEditing(null);
    } catch (error) {
      setError(readableApiError(error, "Не вдалося зберегти відповідь."));
    } finally {
      setSaving(false);
    }
  }

  async function downloadOfficialTemplate() {
    setDownloadingTemplate(true);
    setError("");
    try {
      const result = await authenticatedRequest(user, `${path}/working-example`);
      if (!result.ok) throw new Error("official_template_download_failed");
      const url = URL.createObjectURL(await result.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "biznes-plan-vlasna-sprava-2026-ochyshchenyi-zrazok.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(readableApiError(error, "Не вдалося завантажити чисту форму."));
    } finally {
      setDownloadingTemplate(false);
    }
  }

  return <section id="grant-application" className="readiness" aria-labelledby="grant-application-title">
    <h4 id="grant-application-title">Анкета заявки{application && ` — ${application.title}`}</h4>
    {loading && <p role="status">Завантажуємо анкету…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {stale && <p>За потреби повторно відкрийте проєкт, щоб завантажити його актуальну версію.</p>}
    {(stale || (access === null && (!!accessError || !!error))) && <button type="button" className="link" onClick={() => setReload(value => value + 1)}>Оновити анкету</button>}
    {programId === "vlasna-sprava" && <section id="export-payment" className="export-section" aria-labelledby="export-payment-title" tabIndex={-1}>
      <h5 id="export-payment-title">Документи проєкту</h5>
      {!access && loading && <p role="status">Перевіряємо статус оплати…</p>}
      {!access && !loading && <>
        <p role="alert">{accessError || (error ? "Спочатку оновіть анкету, щоб перевірити оплату." : "Не вдалося перевірити оплату. Файли залишаються захищеними до підтвердження.")}</p>
        <button type="button" className="secondary-btn" onClick={() => setReload(value => value + 1)}>Повторити перевірку</button>
      </>}
      {access?.state === "standard" && <>
        <p>Вартість комплекту PDF і XLSX для цієї заявки — 5 грн. Після підтвердження переказу відкриється завантаження заповнених файлів.</p>
        {accessError && <p role="alert">{accessError}</p>}
        {paymentUnavailable ? <>
          <p role="alert">Не вдалося підтвердити стан оплати. Не повторюйте переказ, доки не перевірите статус або не звернетеся до <a href="mailto:grantfoliomanager@gmail.com">підтримки</a>.</p>
          <button type="button" className="secondary-btn" disabled={checkingPayment} onClick={() => void refreshPayment()}>{checkingPayment ? "Перевіряємо…" : "Перевірити статус"}</button>
        </> : <button type="button" className="primary" disabled={loading || startingPayment} onClick={() => void startPayment()}>
          {startingPayment ? "Готуємо оплату…" : "Оплатити PDF і XLSX"}
        </button>}
      </>}
      {access?.state === "pending" && !terminalPayment && <>
        <p role="status">Очікуємо підтвердження оплати. Статус оновиться автоматично, коли ви повернетеся на цю сторінку.</p>
        {access.paymentUrl ? <p>Завершіть оплату 5 грн на захищеній сторінці monobank. Завантаження відкриється після підтвердження оплати.</p> : <p>Стан оплати уточнюється. Не повторюйте переказ; перевірте статус або зверніться до <a href="mailto:grantfoliomanager@gmail.com">підтримки</a>.</p>}
        {access.paymentUrl && <a className="primary" href={access.paymentUrl} target="_blank" rel="noopener noreferrer">Відкрити оплату monobank ↗</a>}
        {accessError && <p role="alert">{accessError}</p>}
        {" "}
        <button type="button" className="secondary-btn" disabled={checkingPayment} onClick={() => void refreshPayment()}>{checkingPayment ? "Перевіряємо…" : "Оновити статус оплати"}</button>
      </>}
      {terminalPayment && <p role="alert">{terminalPayment === "expired" ? "Термін дії рахунку минув." : terminalPayment === "reversed" ? "Платіж повернуто." : "Платіж не відбувся."} Зверніться до <a href="mailto:grantfoliomanager@gmail.com">підтримки</a>, щоб уточнити подальші дії.</p>}
      {access?.state === "active" && <p role="status">Доступ до проєкту відкрито. PDF і XLSX входять у разову оплату.</p>}
    </section>}
    {application && !loading && <>
      <p>{application.readyForReview ? "Відповіді зібрано для предметної перевірки." : "Заповніть робочу анкету. Вона допоможе зібрати факти й пройти базові перевірки за умовами програми."}</p>
      <p aria-live="polite">Заповнено обов’язкових полів: {answeredCount} із {(application.questions.length ?? 1) - (application.questions.some(item => item.id === "confirmAccuracy") ? 1 : 0)}.</p>
      {disabled && <p>Спочатку збережіть або відновіть правки проєкту.</p>}
      {unanswered.length > 0 && <details className="grant-application-missing-fields" open>
        <summary>Заповнити ще ({unanswered.length})</summary>
        <ul>{unanswered.map(item => <li key={item.id}>
          <span>{item.label}</span>
          <button type="button" className="link" disabled={blocked} onClick={() => setEditing(item.id)}>Відповісти</button>
        </li>)}</ul>
      </details>}
      {question && <form key={`${question.id}:${response?.revision}`} onSubmit={save} className="grant-application-form">
        <label htmlFor="grant-application-answer"><strong>{question.prompt}</strong></label>
        {explanation && <p id="grant-application-answer-note">{explanation}</p>}
        <fieldset disabled={blocked}>
          {question.kind === "select" ? <select id="grant-application-answer" name="answer" required defaultValue={valueForInput(question)}>
            <option value="">Оберіть відповідь</option>
            {question.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select> : question.kind === "text" ? <textarea id="grant-application-answer" name="answer" defaultValue={valueForInput(question)} required maxLength={3000} rows={4} /> :
            question.kind === "confirmation" ? <input id="grant-application-answer" name="answer" type="checkbox" value="yes" required /> :
            <input id="grant-application-answer" name="answer" aria-describedby={answerDescription} defaultValue={valueForInput(question)} inputMode={question.kind === "integer" ? "numeric" : "decimal"} required maxLength={20} />}
          <button type="submit" className="secondary-btn">{saving ? "Зберігаємо…" : "Зберегти відповідь"}</button>
        </fieldset>
        {question.source && <p><a href={question.source} target="_blank" rel="noopener noreferrer">Джерело вимоги</a></p>}
      </form>}
      {application.questions.some(item => item.value !== undefined) && <details>
        <summary>Збережені відповіді</summary>
        <ul>{application.questions.filter(item => item.value !== undefined && item.kind !== "confirmation").map(item => (
          <li key={item.id}><strong>{item.label}</strong>
            <span>{item.kind === "money" && typeof item.value === "number" ? money(item.value) : item.options?.find(option => option.value === item.value)?.label ?? String(item.value)}</span>
            <button type="button" className="link" disabled={blocked} onClick={() => setEditing(item.id)}>Змінити</button>
          </li>
        ))}</ul>
      </details>}
      {application.issues.length > 0 && <ul aria-label="Результат перевірки">{application.issues.map(issue => (
        <li key={issue.code}><strong>{issue.severity === "blocking" ? "Потрібно виправити" : "Потрібно звірити"}</strong> {issue.message}
          {issue.field && <button type="button" className="link" disabled={blocked} onClick={() => setEditing(issue.field ?? null)}>Відкрити поле</button>}
        </li>
      ))}</ul>}
      {application.programId === "vlasna-sprava" && response.documentCoverage && <details>
        <summary>Що ще потрібно для повної форми Дії</summary>
        {response.documentCoverage.remainingAnswers.length > 0 && <>
          <p>Ці збережені відповіді поки не переносяться автоматично у відповідні таблиці офіційного шаблону — перенесіть і перевірте їх вручну:</p>
          <ul>{response.documentCoverage.remainingAnswers.map(field => {
            const item = application.questions.find(question => question.id === field);
            return item ? <li key={field}><strong>{item.label}</strong></li> : null;
          })}</ul>
        </>}
        <ul>{response.documentCoverage.missingOfficialInputs.map(item => <li key={item}>{item}</li>)}</ul>
      </details>}
      {application.financials.uncoveredKopecks !== null && <p>
        Кошторис {money(application.financials.budgetTotalKopecks!)} · Запит на грант {money(application.financials.requestedGrantKopecks!)} · Власні кошти {money(application.financials.ownContributionKopecks!)}
      </p>}
      {application.programId === "vlasna-sprava" && response && response.revision > 0 &&
        <GrantFinancialPlan key={`${user.uid}:${caseId}`} user={user} caseId={caseId} caseRevision={caseRevision}
          applicationRevision={response.revision} disabled={blocked} exportUnlocked={access?.state === "active"} />}
      {application.programId === "vlasna-sprava" && <button type="button" className="secondary-btn"
        disabled={blocked || downloadingTemplate} onClick={() => void downloadOfficialTemplate()}>
        {downloadingTemplate ? "Завантажуємо зразок…" : "Завантажити очищений зразок XLSX 2026"}
      </button>}
      <p>{application.submission}</p>
      <p><a href={application.officialUrl} target="_blank" rel="noopener noreferrer">Перевірити прийом та офіційну форму в Дії</a></p>
    </>}
  </section>;
}
