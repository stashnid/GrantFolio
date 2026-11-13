import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";
import "./style.css";
import { Cases } from "./Cases";
type Profile = { businessName: string; region: string; description: string };
const empty: Profile = { businessName: "", region: "", description: "" };
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [profile, setProfile] = useState<Profile>(empty),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [profileReady, setProfileReady] = useState(false),
    [retry, setRetry] = useState(0),
    [tab, setTab] = useState<"profile" | "cases">("profile");
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setTab("profile");
        setProfileReady(false);
        setLoading(false);
        setProfile(empty);
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
        <span className="header-note">Простір для ваших ідей</span>
        {user && (
          <nav aria-label="Розділи">
            <button
              className="link"
              aria-current={tab === "profile" ? "page" : undefined}
              onClick={() => setTab("profile")}
            >
              Профіль
            </button>
            <button
              className="link"
              aria-current={tab === "cases" ? "page" : undefined}
              onClick={() => setTab("cases")}
            >
              Мої плани
            </button>
          </nav>
        )}
        {user && (
          <button
            className="link"
            disabled={busy}
            onClick={() => void signOut(auth)}
          >
            Вийти <span>↗</span>
          </button>
        )}
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span className="small-dot" /> ВАША ІДЕЯ МАЄ ЗНАЧЕННЯ
          </div>
          <h1>
            Від задуму
            <br />
            до <em>можливості.</em>
          </h1>
          <p>
            Місце, де ваша ідея отримує простір для розвитку. Почніть із
            короткої розповіді про себе та свій бізнес.
          </p>
          <div className="intro-bottom">
            <div className="orbit">✳</div>
            <span>
              КРОК ЗА КРОКОМ
              <br />
              <b>ДО БІЛЬШОГО</b>
            </span>
          </div>
        </section>
        <section className="panel">
          {loading ? (
            <p>Завантаження…</p>
          ) : !user ? (
            <div className="card">
              <div className="card-top">
                <span>01 / ПОЧАТОК</span>
                <span>✳</span>
              </div>
              <h2>{register ? "Створіть акаунт" : "Раді вас бачити"}</h2>
              <p>
                {register
                  ? "Зробіть перший крок до свого простору."
                  : "Увійдіть, щоб повернутися до свого профілю."}
              </p>
              <form onSubmit={login}>
                <label>
                  Електронна пошта
                  <input
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
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Зачекайте…"
                    : register
                      ? "Створити акаунт"
                      : "Увійти"}{" "}
                  <span>↗</span>
                </button>
              </form>
              <div className="switch">
                {register ? "Вже маєте акаунт?" : "Ще не з нами?"}{" "}
                <button
                  className="link"
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                  }}
                >
                  {register ? "Увійти" : "Зареєструватися"}
                </button>
              </div>
            </div>
          ) : tab === "cases" ? (
            <Cases key={user.uid} user={user} />
          ) : (
            <div className="card">
              <div className="card-top">
                <span>01 / ВАШ ПРОФІЛЬ</span>
                <span>✳</span>
              </div>
              <h2>Розкажіть про себе</h2>
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
                        setProfile({ ...profile, businessName: e.target.value })
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
                        setProfile({ ...profile, region: e.target.value })
                      }
                      placeholder="Наприклад, Львів"
                    />
                  </label>
                  <label>
                    Коротко про вашу ідею
                    <textarea
                      maxLength={2000}
                      rows={4}
                      value={profile.description}
                      onChange={(e) =>
                        setProfile({ ...profile, description: e.target.value })
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
          )}
        </section>
      </main>
      <footer>
        <span>© GrantFolio</span>
        <span>ІДЕЇ ВАРТІ РОЗВИТКУ ✳</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
