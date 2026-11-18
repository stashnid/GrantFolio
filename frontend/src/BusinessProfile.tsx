import React, { useEffect, useRef, useState } from "react";
import "./BusinessProfile.css";
import { regions, industries, cities } from "./profile-options";
import { KvedPicker } from "./KvedPicker";
import { CustomSelect } from "./CustomSelect";
import { auth } from "./firebase";
import { authenticatedRequest } from "./api";

import { type Profile, type DetailKey, normalizeProfile } from "./profile";
export { emptyProfile, normalizeProfile, type Profile } from "./profile";
const legalFormLabels: Record<string, string> = {
  idea: "Ідея",
  fop: "ФОП",
  company: "Компанія",
  ngo: "ГО",
};
function userInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const prefix = email.split("@")[0]?.replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9]/g, "") ?? "";
  return prefix ? prefix.slice(0, 2).toUpperCase() : "GF";
}
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
  { title: "Розсилка грантів", intro: "Персональний підбір та сповіщення про актуальні гранти під ваш бізнес-профіль на електронну пошту.", fields: [
    { key: "grantNewsletter", label: "Згода на розсилку", max: 20 },
  ] },
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
  if (key === "newsletterEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Вкажіть дійсну адресу електронної пошти.";
  return "";
}
export function BusinessProfile({
  profile,
  email,
  displayName = "",
  photoURL = "",
  ready,
  busy,
  dirty,
  error,
  message,
  loading = false,
  conflict = false,
  onChange,
  onSubmit,
  onRetry,
}: {
  profile: Profile;
  email: string;
  displayName?: string;
  photoURL?: string;
  ready: boolean;
  busy: boolean;
  loading?: boolean;
  conflict?: boolean;
  dirty: boolean;
  error: string;
  message: string;
  onChange: (profile: Profile) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
}) {
  const [section, setSection] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [photoFailed, setPhotoFailed] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<{
    suggestions: Partial<Record<FieldKey, string>>;
    facts: Array<{ field: string; label: string; value: string; source: string }>;
    unappliedCount: number;
  } | null>(null);
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "info" | "error"; message: string } | null>(null);
  const isNewsletterOn = profile.details.grantNewsletter === "yes";
  const copyTimer = useRef<number | null>(null);
  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current); }, []);
  useEffect(() => { setPhotoFailed(false); }, [photoURL]);

  useEffect(() => {
    if (!auth.currentUser || !ready) return;
    let active = true;
    (async () => {
      try {
        const res = await authenticatedRequest(auth.currentUser!, "/api/me/profile-suggestions");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data && typeof data.unappliedCount === "number") {
          setAiSuggestions(data);
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [ready, profile]);

  function handleAiSync() {
    if (!aiSuggestions?.facts.length || !ready || busy || conflict) return;
    const next = { ...profile, details: { ...profile.details } };
    for (const key of ["businessName", "region", "description"] as const) {
      const value = aiSuggestions.suggestions[key];
      if (!next[key] && value) next[key] = value;
    }
    for (const key of ["city", "legalForm", "industry", "requestedAmount", "fundingPurpose", "teamSize", "grantExperience"] as const) {
      const value = aiSuggestions.suggestions[key];
      if (!next.details[key] && value) next.details[key] = value;
    }
    onChange(next);
    setAiFeedback({ type: "info", message: "Пропозиції перенесено у форму. Перевірте їх і збережіть профіль." });
    setAiSuggestions(null);
  }
  async function handleSendTestEmail() {
    if (!auth.currentUser) return;
    const targetEmail = (profile.details.newsletterEmail || email || "").trim();
    if (!targetEmail) {
      setTestResult({ success: false, message: "Вкажіть адресу електронної пошти." });
      return;
    }
    if (fieldError("newsletterEmail", targetEmail)) {
      setTestResult({ success: false, message: "Вкажіть дійсну адресу електронної пошти." });
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await authenticatedRequest(auth.currentUser, "/api/me/newsletter/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          recipientName: resolvedName || undefined,
          businessName: profile.businessName.trim() || undefined,
          industry: profile.details.industry.trim() || undefined,
          region: profile.region.trim() || undefined,
          city: profile.details.city.trim() || undefined,
          legalForm: profile.details.legalForm || undefined,
          requestedAmount: profile.details.requestedAmount.trim() || undefined,
          fundingPurpose: profile.details.fundingPurpose.trim().slice(0, 500) || undefined,
        }),
      });
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      setTestResult(
        data.delivered
          ? { success: true, message: `Тестовий лист надіслано на ${targetEmail}` }
          : { success: false, message: "Не вдалося надіслати лист. Спробуйте пізніше." },
      );
    } catch {
      setTestResult({
        success: false,
        message: "Не вдалося надіслати тестовий лист. Перевірте з’єднання.",
      });
    } finally {
      setTestSending(false);
    }
  }
  const valueFor = (key: FieldKey) => key === "businessName" || key === "region" || key === "description" ? profile[key] : profile.details[key];
  const fields = sections.flatMap(s => s.fields);
  const completed = fields.filter(f => valueFor(f.key).trim()).length;
  const percent = Math.round((completed / fields.length) * 100);
  const resolvedName = profile.details.contactName.trim() || displayName.trim();
  const initials = userInitials(resolvedName, email);
  const businessMeta = [
    legalFormLabels[profile.details.legalForm] ?? "",
    profile.details.city.trim() || profile.region.trim(),
  ].filter(Boolean).join(" · ");
  const businessLabel = profile.businessName.trim() || businessMeta;
  const showPhoto = !!photoURL && !photoFailed;
  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setEmailCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setEmailCopied(false), 1800);
    } catch {}
  }
  function focusContactName() {
    setSection(0);
    requestAnimationFrame(() => document.getElementById("profile-contactName")?.focus());
  }
  const errors = fields.map(f => ({ ...f, error: fieldError(f.key, valueFor(f.key)) })).filter(f => f.error);
  const change = (key: FieldKey, value: string) => onChange(key === "businessName" || key === "region" || key === "description" ? { ...profile, [key]: value } : { ...profile, details: { ...profile.details, [key]: value } });
  function submit(e: React.FormEvent) { if (errors.length) { e.preventDefault(); setAttempted(true); setSection(sections.findIndex(s => s.fields.some(f => f.key === errors[0].key))); requestAnimationFrame(() => document.getElementById(`profile-${errors[0].key}`)?.focus()); return; } onSubmit(e); }
  return <div className="business-profile">
    <div className="bp-header">
      <div>
        <p className="bp-eyebrow">Ваш простір</p>
        <h2>Профіль бізнесу</h2>
        <p>Інформація вашого бізнес-акаунта</p>
      </div>
      <div className="bp-header-actions">
        <button
          type="button"
          className="bp-ai-sync-btn"
          disabled={!aiSuggestions?.facts.length || !ready || busy || conflict}
          onClick={handleAiSync}
          title="Оновити профіль на основі фактів, озвучених у розмовах із ШІ-асистентом"
        >
          <span className="bp-ai-icon" aria-hidden="true">✨</span>
          <span>{"Заповнити з діалогу ШІ"}</span>
        </button>
        <span className={dirty ? "bp-status changed" : "bp-status"}>
          {!ready ? (error ? "Не завантажено" : "Завантаження…") : dirty ? "Є незбережені зміни" : "Збережено"}
        </span>
      </div>
    </div>
    <div className="bp-layout"><div className="bp-main">
      <nav className="bp-nav" aria-label="Розділи профілю">{sections.map((s, i) => <button key={s.title} type="button" aria-pressed={section === i} onClick={() => setSection(i)}>{s.title}</button>)}</nav>

      {aiFeedback && (
        <div className={`bp-ai-feedback ${aiFeedback.type}`} role="status">
          <span>{aiFeedback.message}</span>
          <button type="button" className="bp-ai-feedback-close" onClick={() => setAiFeedback(null)} aria-label="Закрити сповіщення">×</button>
        </div>
      )}

      {aiSuggestions && aiSuggestions.unappliedCount > 0 && (
        <div className="bp-ai-banner" role="status">
          <div className="bp-ai-banner-content">
            <span className="bp-ai-banner-icon" aria-hidden="true">✨</span>
            <div>
              <h4>Знайдено {aiSuggestions.unappliedCount} пропозицій із розмов з асистентом</h4>
              <p>Перенесіть пропозиції в порожні поля, перевірте значення й збережіть профіль.</p>
              <div className="bp-ai-banner-chips">
                {aiSuggestions.facts.slice(0, 5).map((f) => (
                  <span key={f.field} className="bp-ai-chip">
                    <strong>{f.label}:</strong> {f.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="bp-ai-banner-actions">
            <button
              type="button"
              className="bp-ai-apply-btn"
              disabled={busy || conflict}
              onClick={handleAiSync}
            >
              Перенести у форму
            </button>
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate><div className="bp-section"><p className="bp-section-number">Розділ {section + 1} з {sections.length}</p><h3>{sections[section].title}</h3><p>{sections[section].intro} Усі поля необов’язкові — заповніть ті, що стосуються вас.</p>
        {(!ready || conflict) && <button type="button" className="bp-retry" disabled={loading || busy} onClick={onRetry}>{loading ? "Завантажуємо…" : conflict ? "Завантажити актуальний профіль" : "Повторити завантаження"}</button>}
        {section === 5 ? (
          <div className="bp-newsletter-section">
            <div className="bp-consent-card">
              <div className="bp-consent-icon-box" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="bp-consent-info">
                <h4>Згода на персональну розсилку актуальних грантів</h4>
                <p>
                  Даю згоду на отримання підібраних грантових програм та нагадувань про строки подання на електронну пошту. Програми фільтруються за даними цього бізнес-профілю.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isNewsletterOn}
                className={`bp-consent-switch ${isNewsletterOn ? "is-active" : ""}`}
                onClick={() => change("grantNewsletter", isNewsletterOn ? "" : "yes")}
                aria-label={isNewsletterOn ? "Відкликати згоду на розсилку" : "Надати згоду на розсилку"}
              >
                <span className="bp-consent-switch-thumb" />
              </button>
            </div>

            {isNewsletterOn ? (
              <div className="bp-newsletter-settings-grid">
                <div className="bp-nl-config-box">
                  <h4 className="bp-nl-box-title">1. Параметри доставки</h4>
                  <div className="bp-nl-field-group">
                    <label htmlFor="nl-email">Електронна пошта для розсилки</label>
                    <input
                      id="nl-email"
                      type="email"
                      value={profile.details.newsletterEmail}
                      placeholder={email || "you@example.com"}
                      onChange={e => change("newsletterEmail", e.target.value)}
                      className="bp-nl-input"
                    />
                    <small>За замовчуванням лист надходить на пошту акаунта ({email || "не вказано"}).</small>
                  </div>

                  <div className="bp-nl-field-group">
                    <label>Частота сповіщень</label>
                    <div className="bp-freq-pill-group">
                      {[
                        { id: "weekly", label: "Щотижня", desc: "Щопонеділка вранці (рекомендовано)" },
                        { id: "instant", label: "Миттєво", desc: "При відкритті нових програм" },
                        { id: "monthly", label: "Щомісяця", desc: "Зведений огляд місяця" },
                      ].map(freq => (
                        <button
                          key={freq.id}
                          type="button"
                          className={`bp-freq-choice ${(profile.details.newsletterFrequency || "weekly") === freq.id ? "is-selected" : ""}`}
                          onClick={() => change("newsletterFrequency", freq.id)}
                        >
                          <strong>{freq.label}</strong>
                          <span>{freq.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bp-nl-criteria-box">
                  <h4 className="bp-nl-box-title">2. Як формується підбір під ваш профіль</h4>
                  <p className="bp-criteria-lead">
                    Алгоритм GrantFolio зіставляє офіційні умови програм із заповненими полями цього профілю:
                  </p>
                  <div className="bp-criteria-tags">
                    <div className="bp-criteria-tag">
                      <span className="bp-criteria-label">Сфера діяльності:</span>
                      <strong>{profile.details.industry || "Усі сфери діяльності"}</strong>
                    </div>
                    <div className="bp-criteria-tag">
                      <span className="bp-criteria-label">Регіон / Локація:</span>
                      <strong>{profile.region || profile.details.city || "Вся територія України"}</strong>
                    </div>
                    <div className="bp-criteria-tag">
                      <span className="bp-criteria-label">Організаційна форма:</span>
                      <strong>{legalFormLabels[profile.details.legalForm] || "Усі форми (ФОП/ТОВ/ГО/Ідея)"}</strong>
                    </div>
                    <div className="bp-criteria-tag">
                      <span className="bp-criteria-label">Бажане фінансування:</span>
                      <strong>{profile.details.requestedAmount ? `${profile.details.requestedAmount} грн` : "Будь-який розмір гранту"}</strong>
                    </div>
                  </div>
                  <small className="bp-criteria-note">
                    Щоб зробити підбір точнішим, перевірте заповненість розділів «Бізнес» та «Фінансування».
                  </small>
                </div>

                <div className="bp-email-preview-card">
                  <div className="bp-preview-topbar">
                    <span className="bp-preview-dot bp-dot-red" />
                    <span className="bp-preview-dot bp-dot-yellow" />
                    <span className="bp-preview-dot bp-dot-green" />
                    <span className="bp-preview-subject">
                      Актуальні гранти для «{profile.businessName.trim() || resolvedName || "Вашого бізнесу"}» — GrantFolio
                    </span>
                  </div>

                  <div className="bp-mock-email">
                    <div className="bp-mock-accent-bar" aria-hidden="true" />
                    <div className="bp-mock-header">
                      <div className="bp-mock-brand">GrantFolio</div>
                      <span className="bp-mock-tag">Персональний дайджест</span>
                    </div>

                    <div className="bp-mock-body">
                      <p className="bp-mock-greeting">
                        Вітаємо, <strong>{resolvedName || "підприємцю"}</strong>!
                      </p>
                      <p className="bp-mock-lead">
                        Ми підібрали <strong>2 актуальні програми</strong> фінансування з відкритим прийомом, які відповідають параметрам вашого бізнес-профілю.
                      </p>

                      {(profile.details.industry || profile.region || profile.details.city || profile.details.legalForm) && (
                        <div className="bp-mock-criteria-strip">
                          <strong>Критерії профілю:</strong>{" "}
                          {[
                            profile.details.industry && `Сфера: ${profile.details.industry}`,
                            (profile.details.city || profile.region) && `Локація: ${profile.details.city || profile.region}`,
                            profile.details.legalForm && legalFormLabels[profile.details.legalForm] && `Форма: ${legalFormLabels[profile.details.legalForm]}`,
                          ].filter(Boolean).join(" · ")}
                        </div>
                      )}

                      <div className="bp-mock-grant">
                        <div className="bp-mock-grant-head">
                          <span className="bp-match-badge">
                            <span className="bp-match-dot" aria-hidden="true" />
                            Рекомендовано за профілем
                          </span>
                          <span className="bp-mock-deadline">До 27 листопада 2026</span>
                        </div>
                        <p className="bp-mock-provider">ДІЯ / ДЕРЖАВНИЙ ЦЕНТР ЗАЙНЯТОСТІ</p>
                        <h5 className="bp-mock-grant-title">Власна справа: започаткування та масштабування</h5>
                        <p className="bp-mock-grant-meta">
                          <strong>Старт — до 500 тис. грн; масштабування — до 2,5 млн грн</strong>
                          <span className="bp-mock-sep"> · </span>
                          <span>Безповоротний грант</span>
                        </p>
                        <div className="bp-mock-grant-reason">
                          <strong>Чому підходить:</strong> Фінансування запуску та розвитку справи у вашому регіоні ({profile.region || "Україна"}), покриває обладнання, оренду та маркетинг.
                        </div>
                        <div className="bp-mock-cta">
                          <span className="bp-mock-btn">Підготувати заявку в GrantFolio →</span>
                        </div>
                      </div>

                      <div className="bp-mock-grant">
                        <div className="bp-mock-grant-head">
                          <span className="bp-match-badge is-secondary">
                            <span className="bp-match-dot is-secondary" aria-hidden="true" />
                            Відкритий прийом
                          </span>
                          <span className="bp-mock-deadline">До 30 листопада 2026</span>
                        </div>
                        <p className="bp-mock-provider">PROSPER GLOBAL — BLOOM</p>
                        <h5 className="bp-mock-grant-title">Обладнання для соціально відповідального малого бізнесу</h5>
                        <p className="bp-mock-grant-meta">
                          <strong>17 000–30 000 USD у гривневому еквіваленті</strong>
                          <span className="bp-mock-sep"> · </span>
                          <span>Безповоротний грант</span>
                        </p>
                        <div className="bp-mock-grant-reason">
                          <strong>Чому підходить:</strong> Підтримка зареєстрованих МСП із соціальним або екологічним впливом та створенням нових робочих місць.
                        </div>
                        <p className="bp-mock-secondary-link">Переглянути умови програми →</p>
                      </div>
                    </div>

                    <div className="bp-mock-footer">
                      <p>Ви отримали цей лист, тому що увімкнули персональну розсилку актуальних грантів у профілі бізнесу на grantfolio.pp.ua.</p>
                      <div className="bp-mock-footer-links">
                        <span>Налаштувати профіль</span> · <span>Каталог грантів</span> · <span>Керувати підпискою</span>
                      </div>
                    </div>
                  </div>

                  <div className="bp-test-send-row">
                    <button
                      type="button"
                      className="bp-test-send-btn"
                      disabled={testSending}
                      onClick={() => void handleSendTestEmail()}
                    >
                      {testSending ? "Надсилаємо зразок…" : "Надіслати тестовий приклад на пошту"}
                    </button>
                    {testResult && (
                      <span className={`bp-test-result ${testResult.success ? "is-ok" : "is-err"}`}>
                        {testResult.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bp-newsletter-off-state">
                <p>
                  Розсилка наразі вимкнена. Увімкніть перемикач угорі, щоб надати згоду та налаштувати персональні сповіщення про нові грантові конкурси.
                </p>
              </div>
            )}
          </div>
        ) : sections[section].fields.map(f => {
          const value = valueFor(f.key); const issue = attempted || touched[f.key] ? fieldError(f.key, value) : ""; const id = `profile-${f.key}`;
          const hint = f.key === "industry" ? "Оберіть підказку або введіть власну сферу." : f.key === "kved" ? "Знайдіть і оберіть види діяльності або відредагуйте коди вручну." : f.key === "city" ? "Оберіть підказку або введіть власний населений пункт." : f.key === "requestedAmount" || f.key === "ownContribution" ? "Грн; можна використовувати кому або крапку, наприклад 250 000,50." : f.hint;
          const list = f.key === "industry" ? industries : f.key === "city" ? cities : undefined;
          const describedBy = [hint ? `${id}-hint` : "", issue ? `${id}-error` : "", f.multiline ? `${id}-count` : ""].filter(Boolean).join(" ") || undefined;
          const shared = { id, value, disabled: !ready || busy || loading, maxLength: f.max, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(f.key, e.target.value), onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { setTouched(t => ({ ...t, [f.key]: true })); const raw = e.target.value; if (!fieldError(f.key, raw)) { if (f.key === "phone" && raw.trim()) change(f.key, normalizedPhone(raw.trim())); if ((f.key === "requestedAmount" || f.key === "ownContribution") && raw.trim()) change(f.key, normalizedAmount(raw.trim())); } }, "aria-invalid": !!issue, "aria-describedby": describedBy };
          return <div className="bp-field" key={f.key}><label htmlFor={id}>{f.label}</label><div>{f.key === "legalForm" ? <CustomSelect id={id} value={value} options={[{ value: "", label: "Оберіть форму" }, { value: "idea", label: "Ідея" }, { value: "fop", label: "ФОП" }, { value: "company", label: "Компанія" }, { value: "ngo", label: "Громадська організація" }]} onChange={(v) => change(f.key, v)} onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))} disabled={!ready || busy || loading} ariaInvalid={!!issue} ariaDescribedBy={describedBy} /> : f.key === "region" ? <CustomSelect id={id} value={value} options={[{ value: "", label: "Оберіть регіон" }, ...(value && !regions.includes(value) ? [{ value, label: `${value} (збережене значення)` }] : []), ...regions.map((r) => ({ value: r, label: r }))]} onChange={(v) => change(f.key, v)} onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))} disabled={!ready || busy || loading} ariaInvalid={!!issue} ariaDescribedBy={describedBy} searchable searchPlaceholder="Пошук області..." /> : f.key === "kved" ? <KvedPicker id={id} value={value} onChange={v => change(f.key, v)} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))} disabled={!ready || busy || loading} error={!!issue} describedBy={[hint ? `${id}-hint` : "", issue ? `${id}-error` : ""].filter(Boolean).join(" ")} /> : f.multiline ? <textarea {...shared} rows={4} placeholder={f.key === "description" ? "Наприклад, чим займається ваш бізнес і для кого" : f.key === "fundingPurpose" ? "Наприклад, обладнання для виробництва" : "Опишіть коротко"} /> : <><input {...shared} placeholder={f.key === "website" ? "https://example.com" : f.key === "industry" ? "Почніть вводити сферу діяльності" : f.key === "city" ? "Назва населеного пункту" : f.key === "registrationYear" ? "2024" : f.key === "teamSize" ? "3" : f.key === "requestedAmount" || f.key === "ownContribution" ? "250 000,50" : undefined} type={f.key === "phone" ? "tel" : f.key === "website" ? "url" : "text"} autoComplete={f.key === "contactName" ? "name" : f.key === "phone" ? "tel" : f.key === "website" ? "url" : undefined} inputMode={f.inputMode} list={list ? `${id}-list` : undefined} />{list && <datalist id={`${id}-list`}>{list.map(option => <option key={option} value={option} />)}</datalist>}</>}{hint && <small id={`${id}-hint`}>{hint}{f.key === "kved" && <> <a href="https://kved.ukrstat.gov.ua/KVED2010/kv10_i.html" target="_blank" rel="noopener noreferrer">Офіційний класифікатор</a></>}</small>}{f.multiline && <small id={`${id}-count`}>{value.length} / {f.max}</small>}{issue && <small className="bp-error" id={`${id}-error`}>{issue}</small>}</div></div>;
        })}
        {attempted && errors.length > 0 && <p className="bp-error" role="alert">Перевірте поле «{errors[0].label}»: {errors[0].error}</p>}
        {error && <p className="bp-error" role="alert">{error}</p>}{message && <p className="bp-success" role="status">{message}</p>}
        <div className="bp-actions"><button type="submit" className="bp-save" disabled={busy || loading || !ready || !dirty || conflict}>{busy ? "Зберігаємо…" : "Зберегти зміни"}</button></div>
      </div></form></div>
      <aside className="bp-summary" aria-label="Ваш акаунт">
        <div className="bp-account-top">
          <div className="bp-avatar" aria-hidden="true">
            {showPhoto ? (
              <img
                src={photoURL}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="bp-account-identity">
            <p className="bp-account-eyebrow">Ваш акаунт</p>
            {resolvedName ? (
              <h3 className="bp-account-name" title={resolvedName}>{resolvedName}</h3>
            ) : (
              <button
                type="button"
                className="bp-account-add-name"
                onClick={focusContactName}
              >
                Додати ім’я та прізвище →
              </button>
            )}
            {businessLabel && (
              <p className="bp-account-business" title={businessLabel}>
                {profile.businessName.trim() ? profile.businessName.trim() : businessMeta}
                {profile.businessName.trim() && businessMeta ? ` · ${businessMeta}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="bp-account-email-box">
          <span className="bp-account-meta-label">Електронна пошта</span>
          <div className="bp-account-email-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <strong className="bp-account-email" title={email || "Не вказано"}>
              {email || "Не вказано"}
            </strong>
            {email && (
              <button
                type="button"
                className={`bp-email-copy ${emailCopied ? "is-copied" : ""}`}
                onClick={() => void copyEmail()}
                aria-label={emailCopied ? "Електронну пошту скопійовано" : "Копіювати електронну пошту"}
                title={emailCopied ? "Скопійовано" : "Копіювати"}
              >
                {emailCopied ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {emailCopied ? "Електронну пошту скопійовано" : ""}
          </span>
        </div>

        <div className="bp-summary-divider" />

        <div className="bp-completion-head">
          <div>
            <span className="bp-account-meta-label">Заповнення профілю</span>
            <strong className="bp-completion-count">{completed} з {fields.length} полів</strong>
          </div>
          <span className="bp-completion-pct">{percent}%</span>
        </div>
        <div className="bp-progress" aria-hidden="true">
          <i style={{ width: `${percent}%` }} />
        </div>

        <ul className="bp-section-checklist" aria-label="Стан розділів профілю">
          {sections.map((s, idx) => {
            const doneCount = s.fields.filter(f => valueFor(f.key).trim()).length;
            const totalCount = s.fields.length;
            const allDone = doneCount === totalCount;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  className={`bp-checklist-item ${section === idx ? "is-current" : ""} ${allDone ? "is-complete" : ""}`}
                  onClick={() => setSection(idx)}
                >
                  <span className="bp-checklist-dot" aria-hidden="true">
                    {allDone && (
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="bp-checklist-title">{s.title}</span>
                  <span className="bp-checklist-count">{doneCount}/{totalCount}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="bp-summary-divider" />

        <div className="bp-newsletter">
          <div className="bp-newsletter-header">
            <div className="bp-newsletter-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div className="bp-newsletter-title">
              <span className="bp-account-meta-label">Розсилка грантів</span>
              <strong>{isNewsletterOn ? "Увімкнено" : "Вимкнено"}</strong>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isNewsletterOn}
              className={`bp-newsletter-toggle ${isNewsletterOn ? "is-on" : ""}`}
              onClick={() => change("grantNewsletter", isNewsletterOn ? "" : "yes")}
              aria-label={isNewsletterOn ? "Вимкнути розсилку грантів" : "Увімкнути розсилку грантів"}
            >
              <span className="bp-newsletter-toggle-thumb" />
            </button>
          </div>
          <div className="bp-newsletter-body">
            <p className="bp-newsletter-desc">
              {isNewsletterOn ? (
                <>
                  Надсилається на <strong>{profile.details.newsletterEmail || email || "вашу пошту"}</strong> ({profile.details.newsletterFrequency === "instant" ? "миттєво" : profile.details.newsletterFrequency === "monthly" ? "щомісяця" : "щотижня"}).
                </>
              ) : (
                <>Отримуйте нові гранти та строки подання, автоматично підібрані під ваш бізнес-профіль.</>
              )}
            </p>
            <button
              type="button"
              className="bp-nl-open-section-btn"
              onClick={() => setSection(5)}
            >
              <span>{isNewsletterOn ? "Налаштувати формат та зразок" : "Переглянути параметри та згоду"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <p className="bp-summary-note">
          Заповнюйте профіль поступово — асистент використовує збережені дані для точнішого підбору програм.
        </p>
      </aside>
    </div>
  </div>;
}
