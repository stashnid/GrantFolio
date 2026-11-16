import React, { useState } from "react";
import "./BusinessProfile.css";
import { regions, industries, cities } from "./profile-options";
import { KvedPicker } from "./KvedPicker";

import { type Profile, type DetailKey } from "./profile";
export { emptyProfile, normalizeProfile, type Profile } from "./profile";
type FieldKey = DetailKey | "businessName" | "region" | "description";
type Field = { key: FieldKey; label: string; max: number; multiline?: boolean; hint?: string; inputMode?: "numeric" | "decimal" | "tel" | "url" };
const sections: { title: string; intro: string; fields: Field[] }[] = [
  { title: "Контакти", intro: "Контактні дані для роботи з профілем.", fields: [
    { key: "contactName", label: "Контактна особа", max: 160 }, { key: "phone", label: "Телефон", max: 40, inputMode: "tel", hint: "+380 50 123 45 67 або 050 123 45 67" }, { key: "website", label: "Сайт", max: 300, inputMode: "url", hint: "Посилання має починатися з https:// або http://" },
  ] },
  { title: "Бізнес", intro: "Основна інформація про ваш бізнес або ідею.", fields: [
    { key: "businessName", label: "Назва бізнесу або ідеї", max: 160 }, { key: "legalForm", label: "Організаційна форма", max: 20 }, { key: "registrationYear", label: "Рік реєстрації", max: 4, inputMode: "numeric", hint: "Чотири цифри" }, { key: "industry", label: "Сфера діяльності", max: 160 }, { key: "kved", label: "КВЕД", max: 120 }, { key: "region", label: "Область або регіон", max: 120 }, { key: "city", label: "Місто або населений пункт", max: 120 }, { key: "description", label: "Опис бізнесу", max: 2000, multiline: true },
  ] },
  { title: "Команда", intro: "Розкажіть про людей, які працюють над бізнесом.", fields: [ { key: "teamSize", label: "Кількість людей у команді", max: 7, inputMode: "numeric" }, { key: "teamExperience", label: "Досвід команди", max: 1500, multiline: true } ] },
  { title: "Грантовий досвід", intro: "Попередній досвід участі у грантових програмах.", fields: [ { key: "grantExperience", label: "Досвід отримання грантів", max: 1500, multiline: true } ] },
  { title: "Фінансування", intro: "Орієнтовна потреба у фінансуванні.", fields: [ { key: "fundingPurpose", label: "Мета фінансування", max: 2000, multiline: true }, { key: "requestedAmount", label: "Бажана сума, грн", max: 20, inputMode: "decimal" }, { key: "ownContribution", label: "Власний внесок, грн", max: 20, inputMode: "decimal" } ] },
];
function normalizedAmount(value: string) { return value.replace(/[ \u00a0\u202f]/g, "").replace(",", "."); }
function normalizedPhone(value: string) {
  if (!/^[+\d \u00a0\u202f().-]+$/.test(value)) return value;
  const compact = value.replace(/[ \u00a0\u202f().-]/g, "");
  return /^0\d{9}$/.test(compact) ? `+38${compact}` : compact;
}
function fieldError(key: FieldKey, value: string): string {
  value = value.trim();
  if (!value) return "";
  if (key === "phone" && !/^\+[1-9]\d{6,14}$/.test(normalizedPhone(value))) return "Вкажіть номер у форматі 0XXXXXXXXX або міжнародному форматі (+ та 7–15 цифр).";
  if (key === "kved" && !/^\d{2}\.\d{2}(?:\s*[,;]\s*\d{2}\.\d{2})*$/.test(value)) return "Вкажіть коди у форматі 47.91, розділяючи кілька кодів комою або крапкою з комою.";
  if (key === "website") { try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol)) throw Error(); } catch { return "Вкажіть повне посилання з http:// або https://."; } }
  if (key === "registrationYear" && (!/^\d{4}$/.test(value) || Number(value) < 1900 || Number(value) > new Date().getFullYear())) return `Вкажіть рік від 1900 до ${new Date().getFullYear()}.`;
  if (key === "teamSize" && (!/^\d+$/.test(value) || Number(value) > 1000000)) return "Вкажіть ціле число від 0 до 1 000 000.";
  if ((key === "requestedAmount" || key === "ownContribution") && (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/.test(value) || Number(normalizedAmount(value)) > 1000000000 || normalizedAmount(value).length > 20)) return "Вкажіть суму до 1 000 000 000 грн, до двох знаків після коми або крапки.";
  return "";
}
export function BusinessProfile({ profile, email, ready, busy, dirty, error, message, loading = false, conflict = false, onChange, onSubmit, onRetry }: { profile: Profile; email: string; ready: boolean; busy: boolean; loading?: boolean; conflict?: boolean; dirty: boolean; error: string; message: string; onChange: (profile: Profile) => void; onSubmit: (e: React.FormEvent) => void; onRetry: () => void }) {
  const [section, setSection] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const valueFor = (key: FieldKey) => key === "businessName" || key === "region" || key === "description" ? profile[key] : profile.details[key];
  const fields = sections.flatMap(s => s.fields);
  const completed = fields.filter(f => valueFor(f.key).trim()).length;
  const errors = fields.map(f => ({ ...f, error: fieldError(f.key, valueFor(f.key)) })).filter(f => f.error);
  const change = (key: FieldKey, value: string) => onChange(key === "businessName" || key === "region" || key === "description" ? { ...profile, [key]: value } : { ...profile, details: { ...profile.details, [key]: value } });
  function submit(e: React.FormEvent) { if (errors.length) { e.preventDefault(); setAttempted(true); setSection(sections.findIndex(s => s.fields.some(f => f.key === errors[0].key))); requestAnimationFrame(() => document.getElementById(`profile-${errors[0].key}`)?.focus()); return; } onSubmit(e); }
  return <div className="business-profile">
    <div className="bp-header"><div><h2>Профіль бізнесу</h2><p>Інформація вашого бізнес-акаунта</p></div><span className={dirty ? "bp-status changed" : "bp-status"}>{!ready ? (error ? "Не завантажено" : "Завантаження…") : dirty ? "Є незбережені зміни" : "Збережено"}</span></div>
    <div className="bp-layout"><div className="bp-main">
      <nav className="bp-nav" aria-label="Розділи профілю">{sections.map((s, i) => <button key={s.title} type="button" aria-pressed={section === i} onClick={() => setSection(i)}>{s.title}</button>)}</nav>
      <form onSubmit={submit} noValidate><div className="bp-section"><h3>{sections[section].title}</h3><p>{sections[section].intro} Усі поля необов’язкові — заповніть ті, що стосуються вас.</p>
        {(!ready || conflict) && <button type="button" className="bp-retry" disabled={loading || busy} onClick={onRetry}>{loading ? "Завантажуємо…" : conflict ? "Завантажити актуальний профіль" : "Повторити завантаження"}</button>}
        {sections[section].fields.map(f => {
          const value = valueFor(f.key); const issue = attempted || touched[f.key] ? fieldError(f.key, value) : ""; const id = `profile-${f.key}`;
          const hint = f.key === "industry" ? "Оберіть підказку або введіть власну сферу." : f.key === "kved" ? "Знайдіть і оберіть види діяльності або відредагуйте коди вручну." : f.key === "city" ? "Оберіть підказку або введіть власний населений пункт." : f.key === "requestedAmount" || f.key === "ownContribution" ? "Грн; можна використовувати кому або крапку, наприклад 250 000,50." : f.hint;
          const list = f.key === "industry" ? industries : f.key === "city" ? cities : undefined;
          const shared = { id, value, disabled: !ready || busy || loading, maxLength: f.max, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => change(f.key, e.target.value), onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setTouched(t => ({ ...t, [f.key]: true })); const raw = e.target.value; if (!fieldError(f.key, raw)) { if (f.key === "phone" && raw.trim()) change(f.key, normalizedPhone(raw.trim())); if ((f.key === "requestedAmount" || f.key === "ownContribution") && raw.trim()) change(f.key, normalizedAmount(raw.trim())); } }, "aria-invalid": !!issue, "aria-describedby": [hint ? `${id}-hint` : "", issue ? `${id}-error` : "", f.multiline ? `${id}-count` : ""].filter(Boolean).join(" ") || undefined };
          return <div className="bp-field" key={f.key}><label htmlFor={id}>{f.label}</label><div>{f.key === "legalForm" ? <select {...shared}><option value="">Оберіть форму</option><option value="idea">Ідея</option><option value="fop">ФОП</option><option value="company">Компанія</option><option value="ngo">Громадська організація</option></select> : f.key === "region" ? <select {...shared}><option value="">Оберіть регіон</option>{value && !regions.includes(value) && <option value={value}>{value} (збережене значення)</option>}{regions.map(r => <option key={r} value={r}>{r}</option>)}</select> : f.key === "kved" ? <KvedPicker id={id} value={value} onChange={v => change(f.key, v)} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))} disabled={!ready || busy || loading} error={!!issue} describedBy={[hint ? `${id}-hint` : "", issue ? `${id}-error` : ""].filter(Boolean).join(" ")} /> : f.multiline ? <textarea {...shared} rows={4} placeholder={f.key === "description" ? "Наприклад, чим займається ваш бізнес і для кого" : f.key === "fundingPurpose" ? "Наприклад, обладнання для виробництва" : "Опишіть коротко"} /> : <><input {...shared} placeholder={f.key === "website" ? "https://example.com" : f.key === "industry" ? "Почніть вводити сферу діяльності" : f.key === "city" ? "Назва населеного пункту" : f.key === "registrationYear" ? "2024" : f.key === "teamSize" ? "3" : f.key === "requestedAmount" || f.key === "ownContribution" ? "250 000,50" : undefined} type={f.key === "phone" ? "tel" : f.key === "website" ? "url" : "text"} autoComplete={f.key === "contactName" ? "name" : f.key === "phone" ? "tel" : f.key === "website" ? "url" : undefined} inputMode={f.inputMode} list={list ? `${id}-list` : undefined} />{list && <datalist id={`${id}-list`}>{list.map(option => <option key={option} value={option} />)}</datalist>}</>}{hint && <small id={`${id}-hint`}>{hint}{f.key === "kved" && <> <a href="https://kved.ukrstat.gov.ua/KVED2010/kv10_i.html" target="_blank" rel="noreferrer">Офіційний класифікатор</a></>}</small>}{f.multiline && <small id={`${id}-count`}>{value.length} / {f.max}</small>}{issue && <small className="bp-error" id={`${id}-error`}>{issue}</small>}</div></div>;
        })}
        {attempted && errors.length > 0 && <p className="bp-error" role="alert">Перевірте поле «{errors[0].label}»: {errors[0].error}</p>}
        {error && <p className="bp-error" role="alert">{error}</p>}{message && <p className="bp-success" role="status">{message}</p>}
        <div className="bp-actions"><button className="bp-save" disabled={busy || loading || !ready || !dirty || conflict}>{busy ? "Зберігаємо…" : "Зберегти зміни"}</button></div>
      </div></form></div>
      <aside className="bp-summary"><h3>Ваш акаунт</h3><span>Електронна пошта</span><strong>{email || "Не вказано"}</strong><div className="bp-summary-divider" /><span>Заповнено полів</span><strong>{completed} з {fields.length}</strong><div className="bp-progress" aria-hidden="true"><i style={{ width: `${completed / fields.length * 100}%` }} /></div><p>Заповнюйте профіль поступово. Дані можна змінити будь-коли.</p></aside>
    </div>
  </div>;
}
