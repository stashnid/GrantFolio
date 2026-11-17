import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import { authenticatedRequest, ApiError, readableApiError } from "./api";
import "./style.css";
import "./workspace.css";
import type { GrantProgram } from "./grants";
import { emptyProfile as empty, normalizeProfile, type Profile } from "./profile";
const Advisor = lazy(() => import("./Advisor").then(module => ({ default: module.Advisor })));
const Cases = lazy(() => import("./Cases").then(module => ({ default: module.Cases })));
const GrantCatalog = lazy(() => import("./GrantCatalog").then(module => ({ default: module.GrantCatalog })));
const BusinessProfile = lazy(() => import("./BusinessProfile").then(module => ({ default: module.BusinessProfile })));
const Feedback = lazy(() => import("./Feedback").then(module => ({ default: module.Feedback })));
type WorkspaceTab = "advisor" | "catalog" | "cases" | "profile" | "feedback";
function rememberedTab(uid: string | undefined): WorkspaceTab {
  if (!uid) return "advisor";
  try { const value=sessionStorage.getItem(`grantfolio:last-tab:${uid}`); return ["advisor","catalog","cases","profile","feedback"].includes(value??"") ? value as WorkspaceTab : "advisor"; } catch { return "advisor"; }
}
function NavIcon({kind}: {kind: WorkspaceTab | "logout"}) {
  const paths = {
    advisor: "M4 5h16v11H8l-4 4V5ZM8 9h8M8 12h5",
    catalog: "M21 21l-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    cases: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3V7Z",
    feedback: "M4 4h16v13H9l-5 4V4ZM8 9h8M8 13h5",
    profile: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    logout: "M9 4H4v16h5M14 8l4 4-4 4M8 12h10",
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
export function App() {
  const emailInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [register, setRegister] = useState(false),
    [mobileMenuOpen, setMobileMenuOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [profile, setProfile] = useState<Profile>(empty),
    [savedProfile, setSavedProfile] = useState<Profile>(empty),
    [casesDirty, setCasesDirty] = useState(false),
    [advisorDirty,setAdvisorDirty] = useState(false),
    [advisorPrompt,setAdvisorPrompt] = useState(""),
    [advisorPromptId,setAdvisorPromptId] = useState(""),
    [preparationSeed,setPreparationSeed] = useState(""),
    [preparationId,setPreparationId] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [profileReady, setProfileReady] = useState(false),
    [profileLoading, setProfileLoading] = useState(false),
    [profileConflict, setProfileConflict] = useState(false),
    [profileRevision, setProfileRevision] = useState(0),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState<"advisor" | "catalog" | "cases" | "profile" | "feedback">("advisor"),
    [selectedProgram, setSelectedProgram] = useState<GrantProgram | null>(null),
    [fundingTarget, setFundingTarget] = useState<{id:string;title:string;revision:number}|null>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setTab(window.location.hash === "#grants" || window.location.hash.startsWith("#grants/") ? "catalog" : rememberedTab(u?.uid));
        setProfileReady(false);
        setProfileConflict(false);
        setProfileRevision(0);
        if (u) setPassword("");
        setLoading(false);
        setProfile(empty);
        setSavedProfile(empty);
        setCasesDirty(false);
        setAdvisorDirty(false);
        setAdvisorPrompt("");
        setAdvisorPromptId("");
        setPreparationSeed("");
        setSelectedProgram(null);
        setFundingTarget(null);
        setMessage("");
        setError("");
      }),
    [],
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    const controller = new AbortController();
    setProfileLoading(true);
    (async () => {
      try {
        const response = await authenticatedRequest(user, "/api/me", { signal: controller.signal });
        if (!response.ok) throw new ApiError("http", response.status);
        const body = await response.json();
        if (!body?.profile || !Number.isSafeInteger(body.revision) || body.revision < 0) throw Error("invalid_profile_response");
        if (active) {
          setProfile(normalizeProfile(body.profile));
          setSavedProfile(normalizeProfile(body.profile));
          setProfileReady(true);
          setProfileRevision(body.revision);
          setProfileConflict(false);
        }
      } catch (error) {
        if (active) setError(readableApiError(error, "Не вдалося завантажити профіль. Спробуйте ще раз."));
      } finally { if (active) setProfileLoading(false); }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [user, retry]);
  useEffect(() => {
    const syncCatalog = () => {
      if (window.location.hash === "#grants" || window.location.hash.startsWith("#grants/")) setTab("catalog");
    };
    window.addEventListener("hashchange", syncCatalog);
    return () => window.removeEventListener("hashchange", syncCatalog);
  }, []);
  const openTab = (next: typeof tab) => {
    if (mobileMenuOpen) requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
    setMobileMenuOpen(false);
    if (next !== "catalog" && window.location.hash.startsWith("#grants")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (next === "catalog" && window.location.hash !== "#grants") window.location.hash = "grants";
    setTab(next);
    if (user) { try { sessionStorage.setItem(`grantfolio:last-tab:${user.uid}`,next); } catch { /* Navigation still works without browser storage. */ } }
  };
  const profileDirty = profileReady && (JSON.stringify(profile) !== JSON.stringify(savedProfile));
  const hasUnsavedChanges = profileDirty || casesDirty || advisorDirty;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  async function logout() {
    if (hasUnsavedChanges && !window.confirm("Є незбережені зміни або ненадіслане запитання. Вийти без збереження?")) return;
    try { await signOut(auth); } catch { setError("Не вдалося вийти. Спробуйте ще раз."); }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const code = (error as { code?: string }).code;
      setError(code === "auth/network-request-failed" ? "Немає зв’язку із сервісом входу. Перевірте з’єднання й спробуйте ще раз." : code === "auth/too-many-requests" ? "Забагато спроб входу. Зачекайте трохи й спробуйте ще раз." :
        register
          ? "Не вдалося створити акаунт. Перевірте email і пароль (не менше 6 символів)."
          : "Не вдалося увійти. Перевірте email і пароль.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function loginWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/popup-blocked") {
        setError("Дозвольте спливні вікна для GrantFolio та спробуйте ще раз.");
      } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError("Не вдалося увійти через Google. Спробуйте ще раз.");
      }
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
    if (!user || !profileReady || busy || profileConflict) return;
    const currentUser = user;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedRequest(user, "/api/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${profileRevision}"`,
        },
        body: JSON.stringify(profile),
      });
      if (response.status === 409) {
        setProfileConflict(true);
        setError("Профіль змінився в іншій вкладці. Ваші зміни залишилися у формі. Перед збереженням завантажте актуальну версію.");
        return;
      }
      if (!response.ok) throw new ApiError("http", response.status);
      const result = await response.json();
      if (!result?.profile || !Number.isSafeInteger(result.revision) || result.revision < 0) throw Error("invalid_profile_response");
      if (auth.currentUser === currentUser) {
        setProfile(normalizeProfile(result.profile));
        setSavedProfile(normalizeProfile(result.profile));
        setProfileRevision(result.revision);
        setProfileConflict(false);
        setMessage("Зміни збережено.");
      }
    } catch (error) {
      if (auth.currentUser === currentUser) setError(readableApiError(error, "Не вдалося підтвердити збереження профілю. Ваші зміни залишились у формі."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Перейти до вмісту</a>
      <header className={user ? "app-sidebar" : undefined} data-mobile-open={mobileMenuOpen} onKeyDown={(event) => { if (event.key === "Escape" && mobileMenuOpen) { setMobileMenuOpen(false); document.querySelector<HTMLButtonElement>(".mobile-nav-toggle")?.focus(); } }}>
        <a className="brand" href="/" aria-label="GrantFolio, головна">
          <span className="brand-symbol" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 19V5h14v5h-9v9H5Z" fill="currentColor"/><path d="M14 14h5v5h-5z" fill="currentColor" opacity=".5"/></svg></span>GrantFolio
        </a>
        <span className="header-note">Гранти та фінансова підтримка бізнесу</span>
        {user && <button type="button" className="mobile-nav-toggle" aria-expanded={mobileMenuOpen} aria-controls="app-navigation" aria-label={mobileMenuOpen ? "Закрити меню" : "Відкрити меню"} onClick={() => setMobileMenuOpen(open => !open)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h16" /></svg>Меню</button>}
        {user && <span className="nav-section-label">РОБОЧИЙ ПРОСТІР</span>}
        {user && (
          <nav id="app-navigation" aria-label="Розділи">
            <button type="button" className="link nav-tab" aria-current={tab === "advisor" ? "page" : undefined} onClick={() => openTab("advisor")}><NavIcon kind="advisor" />Асистент</button>
            <button
              className="link nav-tab"
              aria-current={tab === "cases" ? "page" : undefined}
              onClick={() => openTab("cases")}
            >
              <NavIcon kind="cases" />Мої проєкти
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "catalog" ? "page" : undefined}
              onClick={() => openTab("catalog")}
            >
              <NavIcon kind="catalog" />Каталог грантів
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "feedback" ? "page" : undefined}
              onClick={() => openTab("feedback")}
            >
              <NavIcon kind="feedback" />Відгуки
            </button>
            <button
              className="link nav-tab"
              aria-current={tab === "profile" ? "page" : undefined}
              onClick={() => openTab("profile")}
            >
              <NavIcon kind="profile" />Профіль
            </button>
          </nav>
        )}
        {user && <div id="advisor-history-slot" hidden={tab !== "advisor"} />}
        {user && <div className="sidebar-account"><span className="account-avatar" aria-hidden="true">{(savedProfile.businessName || user.email || "G").slice(0,1).toUpperCase()}</span><div><strong>{savedProfile.businessName || "Мій кабінет"}</strong><span>{user.email}</span></div></div>}
        {user && (
          <button
            className="link account-logout"
            disabled={busy}
            onClick={() => void logout()}
          >
            <NavIcon kind="logout" />Вийти з акаунта
          </button>
        )}
      </header>
      <main id="main-content" tabIndex={-1} className={user ? "workspace" : undefined}>
        {user && <div className="workspace-topbar"><div><span>Робочий простір</span><span aria-hidden="true">/</span><strong>{({advisor:"Асистент",catalog:"Каталог грантів",cases:"Мої проєкти",profile:"Профіль бізнесу",feedback:"Відгуки"})[tab]}</strong></div><span className="workspace-mode">Прототип</span></div>}
        {!user && <section className="intro">
          <div className="eyebrow">
            <span className="small-dot" /> GrantFolio для бізнесу
          </div>
          <h1>Від бізнес-ідеї<br />до грантової заявки<span className="heading-period">.</span></h1>
          <p className="intro-lead">Знайдіть фінансування для своєї справи. Зберіть опис, бюджет і робочу чернетку в одному просторі.</p>
          <ol className="intro-route" aria-label="Як працює GrantFolio">
            <li><span>01</span><div><strong>Знайдіть свою можливість</strong><p>Обговоріть потребу з асистентом або відкрийте каталог.</p></div></li>
            <li><span>02</span><div><strong>Підготуйте проєкт</strong><p>Працюйте над описом і бюджетом у власному темпі.</p></div></li>
            <li><span>03</span><div><strong>Збережіть результат</strong><p>Експортуйте робочу чернетку для подальшої підготовки заявки.</p></div></li>
          </ol>
          <a className="intro-action" href="#account" onClick={(event) => { event.preventDefault(); setRegister(true); setError(""); emailInput.current?.focus(); emailInput.current?.scrollIntoView({ block: "center" }); }}>
            Почати роботу <span aria-hidden="true">→</span>
          </a>
          <p className="intro-prototype">Прототип · Подання заявки відбувається в офіційному сервісі програми.</p>
        </section>}
        <section className="panel" id="account">
          <Suspense fallback={<p className="workspace-loading" role="status">Завантажуємо кабінет…</p>}>
          {loading ? (
            <p>Завантаження…</p>
          ) : !user ? (
            <div className="card auth-card">
              <div className="card-top">
                <span>ВАШ ОСОБИСТИЙ ПРОСТІР</span>
                <span aria-hidden="true">↗</span>
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
                <button type="button" className="secondary" disabled={busy} onClick={() => void loginWithGoogle()}>
                  Продовжити через Google
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
            <div hidden={tab !== "advisor"}>
              <Advisor key={user.uid} user={user} onDirty={setAdvisorDirty} prefilledMessage={advisorPrompt} prefillConversationId={advisorPromptId} onClearPrefilled={() => {setAdvisorPrompt("");setAdvisorPromptId("");}} onView={p => { openTab("catalog"); window.location.hash=`grants/${p.id}`; }} onPrepare={(p,seed) => {setSelectedProgram(p);setPreparationSeed(seed);setPreparationId(crypto.randomUUID());openTab("cases");}} />
            </div>
            <div hidden={tab !== "catalog"} className="catalog-tab-content">
              <GrantCatalog
                active={tab === "catalog"}
                onDiscussQuery={query => {setAdvisorPromptId(crypto.randomUUID());setAdvisorPrompt(query);openTab("advisor");}}
                onApplyProgram={(prog, query = "") => {
                  setSelectedProgram(prog);
                  setPreparationSeed(query);
                  setPreparationId(crypto.randomUUID());
                  openTab("cases");
                }}
              />
            </div>
            <div hidden={tab !== "cases"}>
              {tab === "cases" && profileDirty && <p role="status">Зміни профілю ще не збережено. Асистент використовує збережені дані. <button type="button" className="link" onClick={() => openTab("profile")}>Зберегти профіль</button></p>}
              <Cases
                key={user.uid}
                user={user}
                onUnsavedChange={setCasesDirty}
                onBrowsePrograms={() => openTab("catalog")}
                onFindFunding={(need, project) => {setFundingTarget(project);setAdvisorPromptId(crypto.randomUUID());setAdvisorPrompt(need ? `Допоможи підібрати фінансування для мого проєкту: ${need}`.slice(0,2000) : "Допоможи підібрати фінансування для мого бізнесу");openTab("advisor");}}
                onOpenProfile={() => openTab("profile")}
                businessName={savedProfile.businessName}
                profileRevision={profileRevision}
                preparationSeed={preparationSeed}
                preparationId={preparationId}
                selectedProgram={selectedProgram}
                programTarget={selectedProgram ? fundingTarget : null}
                onClearProgram={() => {setSelectedProgram(null);setFundingTarget(null);setPreparationSeed("");setPreparationId("");}}
              />
            </div>
            <div hidden={tab !== "profile"}>
              <BusinessProfile key={user.uid} loading={profileLoading} conflict={profileConflict} profile={profile} email={user.email ?? ""} ready={profileReady} busy={busy} dirty={profileDirty} error={error} message={message} onChange={(next) => { setProfile(next); setMessage(""); }} onSubmit={save} onRetry={() => { if (profileDirty && !window.confirm("Завантажити збережений профіль? Незбережені зміни у формі буде втрачено.")) return; setError(""); setRetry(retry + 1); }} />
              {profileReady && !profileDirty && savedProfile.businessName && <button type="button" className="link" onClick={() => openTab("catalog")}>Перейти до каталогу грантів →</button>}
            </div>
            <div hidden={tab !== "feedback"}>
              <Feedback key={user.uid} user={user} />
            </div>
            </>
          )}
          </Suspense>
        </section>
      </main>
      <footer className={user ? "app-footer" : undefined}>
        <span>© GrantFolio</span>
        <span>Гранти та фінансова підтримка бізнесу</span>
      </footer>
    </>
  );
}
