import { Feedback } from "./Feedback";
import { Donations } from "./Donations";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import "./style.css";
import { Cases } from "./Cases";
import { PilotProgram } from "./PilotProgram";
import { GrantCatalog, GRANT_PROGRAMS, type GrantProgram } from "./GrantCatalog";
type Profile = { businessName: string; region: string; description: string };
const empty: Profile = { businessName: "", region: "", description: "" };
function App() {
  const emailInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [profile, setProfile] = useState<Profile>(empty),
    [savedProfile, setSavedProfile] = useState<Profile>(empty),
    [casesDirty, setCasesDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [profileReady, setProfileReady] = useState(false),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState<"catalog" | "cases" | "profile" | "donations" | "feedback">("cases"),
    [selectedProgram, setSelectedProgram] = useState<GrantProgram | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setTab("cases");
        setProfileReady(false);
        setLoading(false);
        setProfile(empty);
        setSavedProfile(empty);
        setCasesDirty(false);
        setSelectedProgram(null);
        setMessage("");
        setError("");
      }),
    [],
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        if (!response.ok) throw Error();
        const body = await response.json();
        if (active) {
          setProfile(body.profile);
          setSavedProfile(body.profile);
          setProfileReady(true);
        }
      } catch {
        if (active)
          setError(
            "Не вдалося завантажити профіль. Спробуйте оновити сторінку.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [user, retry]);
  const profileDirty = profileReady && (profile.businessName !== savedProfile.businessName || profile.region !== savedProfile.region || profile.description !== savedProfile.description);
  const hasUnsavedChanges = profileDirty || casesDirty;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  async function logout() {
    if (hasUnsavedChanges && !window.confirm("Є незбережені зміни. Вийти без збереження?")) return;
    try { await signOut(auth); } catch { setError("Не вдалося вийти. Спробуйте ще раз."); }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError(
        register
          ? "Не вдалося створити акаунт. Перевірте email і пароль (не менше 6 символів)."
          : "Не вдалося увійти. Перевірте email і пароль.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (busy) return;
    if (!email.trim() || !emailInput.current?.reportValidity()) {
      setError("Вкажіть електронну пошту акаунта.");
      emailInput.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Якщо акаунт із цією поштою існує, ви отримаєте лист для зміни пароля.");
    } catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") {
        setMessage("Якщо акаунт із цією поштою існує, ви отримаєте лист для зміни пароля.");
      } else setError("Не вдалося надіслати лист. Перевірте адресу та спробуйте ще раз.");
    } finally { setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profileReady) return;
    const currentUser = user;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (auth.currentUser === currentUser) {
        setProfile(result.profile);
        setSavedProfile(result.profile);
        setMessage("Зміни збережено.");
      }
    } catch {
      setError("Не вдалося зберегти профіль. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="/" aria-label="GrantFolio, головна">
          <span className="mark">✳</span> grantfolio
          <span className="dot">.</span>
        </a>
        <span className="header-note">Гранти та фінансова підтримка бізнесу</span>
        {user && (
          <nav aria-label="Розділи">
            <button
              className="link nav-tab"
              aria-current={tab === "cases" ? "page" : undefined}
              onClick={() => setTab("cases")}
            >
              Мої плани
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "catalog" ? "page" : undefined}
              onClick={() => setTab("catalog")}
            >
              Каталог грантів <span className="nav-badge">{GRANT_PROGRAMS.length}</span>
            </button>
            <button
              className="link nav-tab donation-nav-btn"
              aria-current={tab === "donations" ? "page" : undefined}
              onClick={() => setTab("donations")}
            >
              💙💛 Донат / ЗСУ
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "feedback" ? "page" : undefined}
              onClick={() => setTab("feedback")}
            >
              Відгуки
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "profile" ? "page" : undefined}
              onClick={() => setTab("profile")}
            >
              Профіль
            </button>
          </nav>
        )}
        {user && (
          <button
            className="link"
            disabled={busy}
            onClick={() => void logout()}
          >
            Вийти <span>↗</span>
          </button>
        )}
      </header>
      <main className={user ? "workspace" : undefined}>
        {!user && <section className="intro">
          <div className="eyebrow">
            <span className="small-dot" /> GRANTFOLIO ДЛЯ БІЗНЕСУ
          </div>
          <h1>Знайдіть фінансування для свого бізнесу</h1>
          <p className="intro-lead">ШІ-асистент для підбору грантів і підготовки заявок.</p>
          <div className="prototype-status">
            <strong>Зараз доступний прототип</strong>
            <p>Створіть профіль бізнесу, чернетку проєкту та бюджет. Підбір грантів і підготовка заявок за допомогою ШІ — у планах.</p>
          </div>
          <a className="intro-action" href="#account" onClick={(event) => { event.preventDefault(); setRegister(true); setError(""); emailInput.current?.focus(); emailInput.current?.scrollIntoView({ block: "center" }); }}>
            Створити акаунт <span aria-hidden="true">↗</span>
          </a>
        </section>}
        <section className="panel" id="account">
          {loading ? (
            <p>Завантаження…</p>
          ) : !user ? (
            <div className="card">
              <div className="card-top">
                <span>ОБЛІКОВИЙ ЗАПИС</span>
                <span>✳</span>
              </div>
              <h2>{register ? "Створіть акаунт" : "Вхід до кабінету"}</h2>
              <p>
                {register
                  ? "Створіть акаунт, щоб зберігати профіль бізнесу та плани."
                  : "Увійдіть, щоб працювати з профілем бізнесу та планами."}
              </p>
              <form onSubmit={login}>
                <label>
                  Електронна пошта
                  <input
                    ref={emailInput}
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Пароль
                  <input
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Не менше 6 символів"
                  />
                </label>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {message && <p className="success" role="status">{message}</p>}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Зачекайте…"
                    : register
                      ? "Створити акаунт"
                      : "Увійти"}{" "}
                  <span>↗</span>
                </button>
                {!register && <button type="button" className="link" disabled={busy} onClick={() => void resetPassword()}>Забули пароль?</button>}
              </form>
              <div className="switch">
                {register ? "Вже маєте акаунт?" : "Немає акаунта?"}{" "}
                <button
                  className="link"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                    setMessage("");
                  }}
                >
                  {register ? "Увійти" : "Зареєструватися"}
                </button>
              </div>
            </div>
          ) : (
            <>
            <div hidden={tab !== "catalog"} className="catalog-tab-content">
              <GrantCatalog
                onApplyProgram={(prog) => {
                  setSelectedProgram(prog);
                  setTab("cases");
                }}
              />
            </div>
            <div hidden={tab !== "cases"}>
              <Cases
                key={user.uid}
                user={user}
                onUnsavedChange={setCasesDirty}
                selectedProgram={selectedProgram}
                onClearProgram={() => setSelectedProgram(null)}
              />
            </div>
            <div className="card" hidden={tab !== "profile"}>
              <div className="card-top">
                <span>01 / ВАШ ПРОФІЛЬ</span>
                <span>✳</span>
              </div>
              <h2>Профіль бізнесу</h2>
              <p>
                Ці дані збережуться у вашому особистому профілі. Їх можна
                змінити будь-коли.
              </p>
              {!profileReady && (
                <button
                  className="link"
                  onClick={() => {
                    setError("");
                    setRetry(retry + 1);
                  }}
                >
                  Оновити профіль
                </button>
              )}
              <form onSubmit={save}>
                <fieldset disabled={!profileReady || busy}>
                  <label>
                    Назва бізнесу або ідеї
                    <input
                      maxLength={160}
                      value={profile.businessName}
                      onChange={(e) =>
                        { setProfile({ ...profile, businessName: e.target.value }); setMessage(""); }
                      }
                      placeholder="Наприклад, майстерня кераміки"
                    />
                  </label>
                  <label>
                    Область або місто
                    <input
                      maxLength={120}
                      value={profile.region}
                      onChange={(e) =>
                        { setProfile({ ...profile, region: e.target.value }); setMessage(""); }
                      }
                      placeholder="Наприклад, Львів"
                    />
                  </label>
                  <label>
                    Опис бізнесу або проєкту
                    <textarea
                      maxLength={2000}
                      rows={4}
                      value={profile.description}
                      onChange={(e) =>
                        { setProfile({ ...profile, description: e.target.value }); setMessage(""); }
                      }
                      placeholder="Чим ви займаєтесь або плануєте займатись?"
                    />
                  </label>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  {message && (
                    <p className="success" role="status">
                      {message}
                    </p>
                  )}
                  <button className="primary" disabled={busy || !profileReady}>
                    {busy ? "Зберігаємо…" : "Зберегти профіль"} <span>↗</span>
                  </button>
                </fieldset>
              </form>
              <div className="switch">Ви увійшли як {user.email}</div>
            </div>
            <div hidden={tab !== "donations"}>
              <Donations user={user} />
            </div>
            <div hidden={tab !== "feedback"}>
              <Feedback user={user} />
            </div>
            </>
          )}
        </section>
      </main>
      <footer>
        <span>© GrantFolio</span>
        <span>Гранти та фінансова підтримка бізнесу</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
