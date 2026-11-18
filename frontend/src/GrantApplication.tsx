import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import type {
  GrantApplicationAnswers, GrantApplicationQuestion, GrantApplicationReview,
} from "../../backend/src/grant-application";
import { authenticatedRequest, readableApiError } from "./api";
import { GrantFinancialPlan } from "./GrantFinancialPlan";

type ReviewResponse = {
  application: GrantApplicationReview | null;
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

export function GrantApplication({ user, caseId, caseRevision, disabled }: {
  user: User;
  caseId: string;
  caseRevision: number;
  disabled: boolean;
}) {
  const [response, setResponse] = useState<ReviewResponse | null>(null);
  const [editing, setEditing] = useState<GrantApplicationQuestion["id"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const path = `/api/cases/${caseId}/grant-application`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    authenticatedRequest(user, path, { signal: controller.signal })
      .then(async result => {
        if (!result.ok) throw new Error("application_read_failed");
        const data = await result.json() as ReviewResponse;
        if (controller.signal.aborted) return;
        setResponse(data);
        setEditing(null);
        setStale(data.caseRevision !== caseRevision);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(readableApiError(error, "Не вдалося завантажити анкету."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, path, caseRevision, reload]);

  const application = response?.application;
  if (response && !application && !loading && !error) {
    return <section id="grant-application" className="readiness"><h4>Анкета заявки</h4><p>Для цієї програми доступний загальний план підготовки. Окрему анкету ще не додано.</p></section>;
  }
  const question = application?.questions.find(item => item.id === editing) ?? application?.nextQuestion;
  const explanation = question && questionExplanations[question.id];
  const answerDescription = explanation ? "grant-application-answer-note" : undefined;
  const blocked = disabled || stale || loading || saving || response?.caseRevision !== caseRevision;

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

  return <section id="grant-application" className="readiness" aria-labelledby="grant-application-title">
    <h4 id="grant-application-title">Анкета заявки{application && ` — ${application.title}`}</h4>
    {loading && <p role="status">Завантажуємо анкету…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {stale && <p>За потреби повторно відкрийте проєкт, щоб завантажити його актуальну версію.</p>}
    {(stale || (!response && !!error)) && <button type="button" className="link" onClick={() => setReload(value => value + 1)}>Оновити анкету</button>}
    {application && !loading && <>
      <p>{application.readyForReview ? "Відповіді зібрано для предметної перевірки." : "Заповніть робочу анкету. Вона допоможе зібрати факти й пройти базові перевірки за умовами програми."}</p>
      {disabled && <p>Спочатку збережіть або відновіть правки проєкту.</p>}
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
      {application.financials.uncoveredKopecks !== null && <p>
        Кошторис {money(application.financials.budgetTotalKopecks!)} · Запит на грант {money(application.financials.requestedGrantKopecks!)} · Власні кошти {money(application.financials.ownContributionKopecks!)}
      </p>}
      {application.programId === "vlasna-sprava" && response && response.revision > 0 &&
        <GrantFinancialPlan key={`${user.uid}:${caseId}`} user={user} caseId={caseId} caseRevision={caseRevision}
          applicationRevision={response.revision} disabled={blocked} />}
      <p>{application.submission}</p>
      <p><a href={application.officialUrl} target="_blank" rel="noopener noreferrer">Перевірити прийом та офіційну форму в Дії</a></p>
    </>}
  </section>;
}
