import React, { useState } from "react";
import "./PublicLanding.css";

export interface PublicLandingProps {
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  register: boolean;
  setRegister: (val: boolean) => void;
  busy: boolean;
  error: string;
  message: string;
  inAppBrowser: boolean;
  emailInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onResetPassword: () => void;
  onClearFeedback: () => void;
}

interface GrantFeatureHighlight {
  id: string;
  badge: string;
  title: string;
  shortTitle: string;
  amount: string;
  conditions: string;
  status: string;
}

const GRANT_PROGRAMS_SHOWCASE: GrantFeatureHighlight[] = [
  {
    id: "vlasna-sprava",
    badge: "🔥 Найпопулярніший",
    title: "«Власна справа» (єРобота)",
    shortTitle: "Власна справа",
    amount: "до 250 000 ₴",
    conditions: "0% повернення · За умови створення 1–2 робочих місць",
    status: "Прийом триває",
  },
  {
    id: "veteran",
    badge: "🎖️ Для захисників",
    title: "Грант для ветеранів та подружжя",
    shortTitle: "Ветеранам",
    amount: "до 1 000 000 ₴",
    conditions: "Співфінансування від 70/30 · До 4 робочих місць",
    status: "Активна хвиля",
  },
  {
    id: "pererobka",
    badge: "🏭 Виробництво",
    title: "Грант на переробне підприємство",
    shortTitle: "Переробка",
    amount: "до 8 000 000 ₴",
    conditions: "Обладнання, модернізація та нові робочі місця",
    status: "Діє прийом",
  },
];

export function PublicLanding({
  email,
  setEmail,
  password,
  setPassword,
  register,
  setRegister,
  busy,
  error,
  message,
  inAppBrowser,
  emailInputRef,
  onSubmit,
  onGoogleLogin,
  onResetPassword,
  onClearFeedback,
}: PublicLandingProps) {
  const [activeGrantIndex, setActiveGrantIndex] = useState(0);

  const activeGrant = GRANT_PROGRAMS_SHOWCASE[activeGrantIndex];

  const handleModeChange = (newMode: boolean) => {
    setRegister(newMode);
    onClearFeedback();
  };

  const focusAuth = (registerMode = true) => {
    handleModeChange(registerMode);
    requestAnimationFrame(() => {
      emailInputRef.current?.focus();
      emailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <>
      {/* LEFT COLUMN: HERO MARKETING HOOK & MONEY PROOFS */}
      <section className="landing-hero" aria-labelledby="hero-title">
        {/* Floating animated money badges */}
        <div className="landing-floating-tags" aria-hidden="true">
          <div className="money-badge money-badge--primary animate-float-1">
            <span className="money-badge-emoji">💰</span>
            <span className="money-badge-text"><strong>Безповоротні кошти</strong> · 0% кредитів</span>
          </div>
          <div className="money-badge money-badge--accent animate-float-2">
            <span className="money-badge-emoji">💵</span>
            <span className="money-badge-text"><strong>до 1 000 000 ₴</strong> фінансування</span>
          </div>
          <div className="money-badge money-badge--gold animate-float-3">
            <span className="money-badge-emoji">⚡</span>
            <span className="money-badge-text"><strong>15 хв</strong> на повну заявку з ШІ</span>
          </div>
        </div>

        {/* Eyebrow badge */}
        <div className="landing-eyebrow">
          <span className="landing-pulse-dot" aria-hidden="true" />
          <span className="landing-eyebrow-text">🇺🇦 ДЕРЖАВНІ ТА МІЖНАРОДНІ ГРАНТИ ДЛЯ БІЗНЕСУ</span>
        </div>

        {/* Powerful Hook Headline */}
        <h1 id="hero-title" className="landing-title">
          Отримайте від <span className="text-highlight">250 000 ₴</span> до <span className="text-highlight">1 000 000 ₴</span> на власну справу<span className="title-dot">.</span>
        </h1>

        {/* Subhead Hook */}
        <p className="landing-lead">
          Розумний ШІ-асистент перетворить вашу бізнес-ідею на офіційну грантову заявку та помісячний бізнес-план за стандартами <strong>«Дія. Власна справа»</strong>. Без ризиків, без банківських відсотків, з гарантією розрахунків.
        </p>

        {/* High-Impact Numbers Grid */}
        <div className="landing-stats-grid" role="region" aria-label="Ключові цифри грантових програм">
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-emoji" aria-hidden="true">💰</span>
              <span className="stat-label">Мікрогрант</span>
            </div>
            <div className="stat-value">до 250 000 ₴</div>
            <div className="stat-desc">Безповоротна допомога від держави на обладнання та оренду</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-emoji" aria-hidden="true">🎖️</span>
              <span className="stat-label">Ветеранам та сім’ям</span>
            </div>
            <div className="stat-value">до 1 000 000 ₴</div>
            <div className="stat-desc">Спеціальна програма розвитку власного бізнесу для ветеранів</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-emoji" aria-hidden="true">📈</span>
              <span className="stat-label">Відсотки за грантом</span>
            </div>
            <div className="stat-value">0% повернення</div>
            <div className="stat-desc">Кошти повертаються державі сплаченими податками та ЄСВ</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-emoji" aria-hidden="true">⚡</span>
              <span className="stat-label">Швидкість ШІ</span>
            </div>
            <div className="stat-value">~15 хвилин</div>
            <div className="stat-desc">Від опису ідеї до завантаження готових офіційних таблиць Дії</div>
          </div>
        </div>

        {/* Interactive Active Grant Waves Showcase */}
        <div className="landing-programs-preview" role="region" aria-label="Актуальні програми підтримки">
          <div className="programs-preview-header">
            <div className="programs-preview-title">
              <span className="live-indicator" aria-hidden="true" />
              <span>Актуальні можливості прямо зараз:</span>
            </div>
            <div
              className="programs-nav-chips"
              role="tablist"
              aria-label="Вибір грантової програми"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setActiveGrantIndex((prev) => (prev + 1) % GRANT_PROGRAMS_SHOWCASE.length);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setActiveGrantIndex((prev) => (prev - 1 + GRANT_PROGRAMS_SHOWCASE.length) % GRANT_PROGRAMS_SHOWCASE.length);
                }
              }}
            >
              {GRANT_PROGRAMS_SHOWCASE.map((prog, idx) => (
                <button
                  key={prog.id}
                  id={`grant-tab-${prog.id}`}
                  type="button"
                  role="tab"
                  tabIndex={idx === activeGrantIndex ? 0 : -1}
                  aria-selected={idx === activeGrantIndex}
                  aria-controls="active-grant-panel"
                  className={`prog-chip ${idx === activeGrantIndex ? "prog-chip--active" : ""}`}
                  onClick={() => setActiveGrantIndex(idx)}
                >
                  {prog.shortTitle}
                </button>
              ))}
            </div>
          </div>

          <div
            id="active-grant-panel"
            className="active-grant-box"
            role="tabpanel"
            aria-labelledby={`grant-tab-${activeGrant.id}`}
          >
            <div className="active-grant-top">
              <span className="active-grant-badge">{activeGrant.badge}</span>
              <span className="active-grant-status">
                <span className="status-ping" aria-hidden="true" />
                {activeGrant.status}
              </span>
            </div>
            <div className="active-grant-name">{activeGrant.title}</div>
            <div className="active-grant-meta">
              <div className="active-grant-sum">
                <span className="sum-label">Фінансування:</span>
                <span className="sum-val">{activeGrant.amount}</span>
              </div>
              <div className="active-grant-cond">{activeGrant.conditions}</div>
            </div>
          </div>
        </div>

        {/* 3 Step Journey */}
        <div className="landing-steps" aria-label="Як це працює">
          <h2 className="landing-steps-title">Простий шлях до вашого гранту:</h2>
          <ol className="landing-steps-list">
            <li>
              <span className="step-num" aria-hidden="true">1</span>
              <div className="step-content">
                <strong>Розкажіть про свою ідею 💬</strong>
                <p>ШІ-асистент адаптує опис під офіційні пріоритети та вимоги грантодавця.</p>
              </div>
            </li>
            <li>
              <span className="step-num" aria-hidden="true">2</span>
              <div className="step-content">
                <strong>Отримайте фінансову модель 📊</strong>
                <p>Автоматичний розрахунок витрат, зарплат, податків та створення робочих місць.</p>
              </div>
            </li>
            <li>
              <span className="step-num" aria-hidden="true">3</span>
              <div className="step-content">
                <strong>Завантажте готові файли в Дію 🚀</strong>
                <p>Експорт перевірених таблиць у форматах XLSX та PDF без математичних помилок.</p>
              </div>
            </li>
          </ol>
        </div>

        {/* Primary Hero CTA button */}
        <div className="landing-cta-row">
          <button
            type="button"
            className="landing-hero-cta"
            onClick={() => focusAuth(true)}
          >
            <span>Почати підготовку безкоштовно</span>
            <span className="cta-sparkle" aria-hidden="true">✨</span>
            <span className="cta-arrow" aria-hidden="true">→</span>
          </button>
          <span className="landing-cta-subtext">Без обов’язкової прив’язки банківської картки</span>
        </div>
      </section>

      {/* RIGHT COLUMN: HIGH-CONVERTING AUTH PORTAL */}
      <section className="landing-auth-panel" id="account" aria-label="Авторизація">
        <div className="auth-card-modern">
          {/* Header with VIP Badge */}
          <div className="auth-card-header">
            <div className="auth-vip-tag">
              <span className="auth-vip-icon" aria-hidden="true">🚀</span>
              <span>ОСОБИСТИЙ КАБІНЕТ ГРАНТООДЕРЖУВАЧА</span>
            </div>

            {/* Segmented control tabs */}
            <div className="auth-tabs-segmented" role="tablist" aria-label="Режим входу">
              <button
                type="button"
                role="tab"
                id="tab-login"
                aria-selected={!register}
                aria-controls="auth-form-panel"
                className={`auth-tab-btn ${!register ? "auth-tab-btn--active" : ""}`}
                onClick={() => handleModeChange(false)}
              >
                Вхід
              </button>
              <button
                type="button"
                role="tab"
                id="tab-register"
                aria-selected={register}
                aria-controls="auth-form-panel"
                className={`auth-tab-btn ${register ? "auth-tab-btn--active" : ""}`}
                onClick={() => handleModeChange(true)}
              >
                Створити акаунт
              </button>
            </div>

            <h2 className="auth-form-title">
              {register ? "Реєстрація у GrantFolio 💼" : "З поверненням до кабінету 👋"}
            </h2>
            <p className="auth-form-subtitle">
              {register
                ? "Зберігайте профілі бізнесу, розрахунки та сформовані заявки."
                : "Продовжуйте роботу над своїми грантовими проєктами."}
            </p>
          </div>

          <div id="auth-form-panel" role="tabpanel" aria-labelledby={register ? "tab-register" : "tab-login"}>
            {/* GOOGLE 1-CLICK AUTH BUTTON - PROMINENT & HIGH-CONVERTING */}
            <div className="auth-fast-pass">
              <button
                type="button"
                className="google-btn-modern"
                disabled={busy}
                onClick={onGoogleLogin}
              >
                <svg className="google-icon-svg" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.5 9.5 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15.3Z" />
                  <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.3A20 20 0 0 0 24 44Z" />
                  <path fill="#FBBC05" d="M12.8 27.7a12 12 0 0 1 0-7.4V15H5.9a20 20 0 0 0 0 18l6.9-5.3Z" />
                  <path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.9 15l6.9 5.3c1.6-4.7 6-8.2 11.2-8.2Z" />
                </svg>
                <div className="google-btn-text">
                  <span className="google-btn-main">Продовжити через Google</span>
                  <span className="google-btn-hint">Миттєво · Без паролів</span>
                </div>
              </button>
            </div>

            {/* In-app browser warning if opened inside Telegram/Instagram */}
            {inAppBrowser && (
              <div className="inapp-warning-box" role="note">
                <span className="inapp-warning-icon" aria-hidden="true">💡</span>
                <p>
                  <strong>Ви у вбудованому браузері (Telegram/Instagram).</strong> Для входу через Google натисніть <strong>⋯</strong> та виберіть <strong>«Відкрити в Safari / Chrome»</strong> або скористайтесь поштою нижче.
                </p>
              </div>
            )}

            {/* Divider */}
            <div className="auth-divider" aria-hidden="true">
              <span>або за електронною поштою</span>
            </div>

            {/* Email + Password Form */}
            <form onSubmit={onSubmit} className="auth-inputs-form" noValidate={false}>
              <div className="auth-field">
                <label htmlFor="auth-email-input" className="auth-field-label">
                  Електронна пошта
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="auth-email-input"
                    ref={emailInputRef}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.ua"
                    className="auth-text-input"
                    aria-invalid={!!error}
                    aria-describedby={error ? "auth-feedback-error" : undefined}
                  />
                  <span className="input-adornment" aria-hidden="true">✉️</span>
                </div>
              </div>

              <div className="auth-field">
                <div className="field-label-row">
                  <label htmlFor="auth-password-input" className="auth-field-label">
                    Пароль
                  </label>
                  {!register && (
                    <button
                      type="button"
                      className="btn-forgot-pass"
                      disabled={busy}
                      onClick={onResetPassword}
                    >
                      Забули пароль?
                    </button>
                  )}
                </div>
                <div className="auth-input-wrapper">
                  <input
                    id="auth-password-input"
                    type="password"
                    autoComplete={register ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={register ? "Мінімум 6 символів" : "Введіть пароль"}
                    className="auth-text-input"
                    aria-invalid={!!error}
                    aria-describedby={error ? "auth-feedback-error" : undefined}
                  />
                  <span className="input-adornment" aria-hidden="true">🔑</span>
                </div>
              </div>

              {/* Feedback banners */}
              {error && (
                <div id="auth-feedback-error" className="auth-alert auth-alert--error" role="alert">
                  <span className="alert-icon" aria-hidden="true">⚠️</span>
                  <div className="alert-text">{error}</div>
                </div>
              )}
              {message && (
                <div className="auth-alert auth-alert--success" role="status">
                  <span className="alert-icon" aria-hidden="true">✅</span>
                  <div className="alert-text">{message}</div>
                </div>
              )}

              {/* Submit CTA */}
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={busy}
              >
                <span>
                  {busy
                    ? "Перевірка даних…"
                    : register
                      ? "Створити акаунт та почати"
                      : "Увійти до кабінету"}
                </span>
                <span className="submit-arrow" aria-hidden="true">→</span>
              </button>
            </form>

            {/* Mode switch link */}
            <div className="auth-switch-row">
              <span>{register ? "Вже зареєстровані?" : "Вперше у GrantFolio?"}</span>
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => handleModeChange(!register)}
              >
                {register ? "Увійти в акаунт" : "Зареєструватися безкоштовно"}
              </button>
            </div>

            {/* Trust and privacy badges */}
            <div className="auth-trust-footer">
              <div className="trust-item">
                <span className="trust-icon" aria-hidden="true">🔒</span>
                <span>Наскрізне шифрування та безпека даних</span>
              </div>
              <div className="trust-item">
                <span className="trust-icon" aria-hidden="true">🇺🇦</span>
                <span>Сертифіковано для програм підтримки бізнесу</span>
              </div>
              <p className="auth-support-text">
                Потрібна допомога?{" "}
                <a
                  href="mailto:grantfoliomanager@gmail.com?subject=GrantFolio%20%D0%9F%D0%BE%D0%BC%D0%B8%D0%BB%D0%BA%D0%B0%20%D0%B2%D1%85%D0%BE%D0%B4%D1%83"
                  className="auth-support-link"
                >
                  Підтримка команди ↗
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
