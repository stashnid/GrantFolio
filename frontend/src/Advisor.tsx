import {isGrantAvailable} from "../../backend/src/grant-availability";
import {useGrantPrograms} from "./GrantPrograms";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { authenticatedRequest, ApiError, readableApiError } from "./api";
import type { GrantProgram } from "./grants";
import type { SearchResult } from "../../backend/src/grant-discovery";
import { FormattedReply } from "./Assistant";
import { ReplyReveal } from "./ReplyReveal";
import "./Advisor.css";
import { advisorSessionKey, createAdvisorSession, parseAdvisorSession } from "./advisor-session";
type Message = {
  id: string;
  question: string;
  reply: string;
  mode: string;
  search: SearchResult;
  seed: string;
};
type Conversation = { id: string; title: string };
export function Advisor({
  user,
  savedLegalForm,
  onPrepare,
  onView,
  onDirty,
  prefilledMessage,
  prefillConversationId,
  onClearPrefilled,
}: {
  user: User;
  savedLegalForm?: string;
  onPrepare: (p: GrantProgram, seed: string) => void;
  onView: (p: GrantProgram) => void;
  onDirty: (dirty: boolean) => void;
  prefilledMessage?: string;
  prefillConversationId?: string;
  onClearPrefilled: () => void;
}) {
  const {programs: GRANT_PROGRAMS} = useGrantPrograms();
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const scrollArea = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const followReply = () => { if (nearBottom.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight; };
  const [historySlot, setHistorySlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHistorySlot(document.getElementById("advisor-history-slot")); }, []);
  const [historySearch, setHistorySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyPanel = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = () => { setHistoryOpen(false); historyButton.current?.focus(); };
  useEffect(() => { if (historyOpen) historyPanel.current?.focus(); }, [historyOpen]);
  const input = useRef<HTMLTextAreaElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    attempts = useRef<Record<string, { id: string; text: string }>>({}),
    sending = useRef(false);
  const drafts = useRef<Record<string, string>>({});
  const textRef = useRef(text);
  textRef.current = text;
  const [storageError, setStorageError] = useState(false);
  const [restored, setRestored] = useState(false);
  const storageReady = useRef(false);
  const timerRef = useRef<number | null>(null);
  const persist = () => {
    if (!storageReady.current || !current.current) return;
    try {
      const all = { ...drafts.current, [current.current]: textRef.current };
      const snapshot = createAdvisorSession(current.current, all, attempts.current);
      if (snapshot && Object.keys(snapshot.drafts).length) sessionStorage.setItem(advisorSessionKey(user.uid), JSON.stringify(snapshot));
      else sessionStorage.removeItem(advisorSessionKey(user.uid));
      setStorageError(false);
    } catch { setStorageError(true); }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const current = useRef(conversation);
  current.current = conversation;
  async function loadConversations() {
    const r = await authenticatedRequest(user, "/api/advisor/conversations");
    if (!r.ok) throw new ApiError("http", r.status);
    const data = await r.json();
    if (!Array.isArray(data.conversations)) throw Error();
    setConversations(data.conversations);
    return data.conversations as Conversation[];
  }
  useEffect(() => {
    let active = true;
    drafts.current = {}; attempts.current = {}; textRef.current = ""; current.current = "";
    setText(""); setConversation(""); setRestored(false); setStorageError(false);
    let preferred = "";
    try {
      const saved = parseAdvisorSession(sessionStorage.getItem(advisorSessionKey(user.uid)));
      if (saved) {
        drafts.current = { ...saved.drafts }; attempts.current = { ...saved.attempts };
        if (saved.drafts[saved.selected]?.trim()) {
          preferred = saved.selected; current.current = preferred;
          textRef.current = saved.drafts[preferred]; delete drafts.current[preferred];
          setConversation(preferred); setText(textRef.current); setRestored(true);
        }
      }
    } catch { setStorageError(true); }
    storageReady.current = true;
    loadConversations().then(rows => {
      if (active && !current.current) { const id = rows[0]?.id ?? crypto.randomUUID(); current.current = id; setConversation(id); }
    }).catch(e => {
      if (active) {
        setError(readableApiError(e, "Не вдалося відкрити розмови. Можна почати нову."));
        if (!current.current) { const id = crypto.randomUUID(); current.current = id; setConversation(id); }
      }
    });
    const flush = () => persistRef.current();
    window.addEventListener("beforeunload", flush);
    return () => { active = false; window.removeEventListener("beforeunload", flush); if (timerRef.current !== null) window.clearTimeout(timerRef.current); flush(); storageReady.current = false; };
  }, [user.uid]);
  useEffect(() => {
    if (!storageReady.current || !conversation) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => persistRef.current(), 250);
    return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); };
  }, [text, conversation]);
  async function history(
    id: string,
    before: string | null = null,
    signal?: AbortSignal,
  ) {
    setLoading(true);
    try {
      const r = await authenticatedRequest(
        user,
        `/api/advisor?conversationId=${id}${before ? `&before=${before}` : ""}`,
        { signal },
      );
      if (!r.ok) throw new ApiError("http", r.status);
      const data = await r.json();
      if (!Array.isArray(data.messages)) throw Error();
      if (current.current !== id || signal?.aborted) return;
      setMessages((previous) =>
        before
          ? [
              ...data.messages,
              ...previous.filter(
                (m) => !data.messages.some((n: Message) => n.id === m.id),
              ),
            ]
          : data.messages,
      );
      setHasMore(data.hasMore);
      setCursor(data.nextBefore);
    } catch (e) {
      if (!signal?.aborted && current.current === id)
        setError(
          readableApiError(
            e,
            "Не вдалося завантажити розмову. Спробуйте ще раз.",
          ),
        );
    } finally {
      if (!signal?.aborted && current.current === id) setLoading(false);
    }
  }
  useEffect(() => {
    if (!conversation) return;
    const controller = new AbortController();
    setMessages([]);
    setRevealingId(null);
    nearBottom.current = true;
    setError("");
    void history(conversation, null, controller.signal);
    return () => controller.abort();
  }, [conversation]);
  useEffect(() => {
    onDirty(
      !!text.trim() ||
        busy ||
        Object.values(drafts.current).some((d) => !!d.trim()),
    );
  }, [text, busy, conversation, onDirty]);
  useEffect(() => {
    if (!prefilledMessage || busy || !conversation || current.current !== conversation) return;
    if (prefillConversationId && prefillConversationId !== conversation) changeConversation(prefillConversationId);
    fill(prefilledMessage);
    onClearPrefilled();
  }, [prefilledMessage, prefillConversationId, busy, conversation, onClearPrefilled]);
  useEffect(() => {
    followReply();
  }, [messages, busy]);
  function updateText(value: string) {
    textRef.current = value;
    setText(value);
    const attempt = attempts.current[current.current];
    if (attempt && attempt.text !== value.trim()) delete attempts.current[current.current];
  }
  function fill(value: string) {
    const previous = textRef.current;
    updateText((!previous.trim() ? value : previous === value ? previous : `${previous}\n${value}`).slice(0, 2000));
    input.current?.focus();
  }
  function changeConversation(id: string) {
    if (busy || id === current.current) return;
    if (!conversations.some(c => c.id === id) && !drafts.current[id]) setHistorySearch("");
    if (current.current) drafts.current[current.current] = textRef.current;
    const draft = drafts.current[id] ?? "";
    delete drafts.current[id];
    current.current = id;
    updateText(draft);
    setConversation(id);
    setRestored(!!draft.trim());
  }
  async function send() {
    if (sending.current || !text.trim() || !conversation) return;
    sending.current = true;
    const question = text.trim(),
      id = conversation;
    setPendingQuestion(question);
    nearBottom.current = true;
    setBusy(true);
    setError("");
    if (!attempts.current[id] || attempts.current[id].text !== question)
      attempts.current[id] = { id: crypto.randomUUID(), text: question };
    persistRef.current();
    try {
      const r = await authenticatedRequest(
        user,
        "/api/advisor",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: attempts.current[id].id,
            conversationId: id,
            message: question,
          }),
        },
        40000,
      );
      if (!r.ok) throw new ApiError("http", r.status);
      const data = await r.json();
      const m = data.message;
      if (
        !m ||
        typeof m.reply !== "string" ||
        !Array.isArray(m.search?.matches)
      )
        throw Error();
      if (current.current !== id) return;
      setRevealingId(messages.some(item => item.id === m.id) ? null : m.id);
      setMessages((previous) => [...previous.filter((x) => x.id !== m.id), m]);
      updateText("");
      delete drafts.current[id];
      delete attempts.current[id];
      setRestored(false);
      persistRef.current();
      void loadConversations().catch(() => {});
    } catch (e) {
      setError(
        readableApiError(
          e,
          "Не вдалося підтвердити відповідь. Запитання залишилося; можна повторити без дублювання.",
        ),
      );
    } finally {
      setBusy(false);
      setPendingQuestion("");
      sending.current = false;
    }
  }
  const draftTitle = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, 64) || "Нова розмова";
  const localIds = Object.keys(drafts.current).filter(id => !!drafts.current[id].trim() && !conversations.some(c => c.id === id));
  const entries = [...(!conversations.some(c => c.id === conversation) && conversation ? [{ id: conversation, title: draftTitle(text) }] : []), ...localIds.filter(id => id !== conversation).map(id => ({ id, title: draftTitle(drafts.current[id]) })), ...conversations];
  const visibleEntries = entries.filter(entry => entry.title.toLocaleLowerCase("uk").includes(historySearch.trim().toLocaleLowerCase("uk")));
  const historyContents = <>
        <div className="advisor-history-heading"><h2>Розмови</h2><button type="button" className="advisor-history-close" aria-label="Закрити історію" onClick={closeHistory}>×</button></div>
        <button type="button" className="advisor-new-chat" disabled={busy} onClick={() => { changeConversation(crypto.randomUUID()); if (historyOpen) closeHistory(); }}>＋ Нова розмова</button>
        <label className="advisor-history-search"><span>Пошук розмов</span><input type="search" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Назва розмови" /></label>
        <nav aria-label="Список розмов" className="advisor-history-list">
          {visibleEntries.map(entry => <button key={entry.id} type="button" className={entry.id === conversation ? "advisor-history-item is-active" : "advisor-history-item"} aria-current={entry.id === conversation ? "page" : undefined} disabled={busy} onClick={() => { changeConversation(entry.id); if (historyOpen) closeHistory(); }}><span>{entry.title}</span>{(entry.id === conversation ? !!text.trim() : !!drafts.current[entry.id]?.trim()) && <small>Чернетка</small>}</button>)}
          {visibleEntries.length === 0 && <p>Розмов не знайдено.</p>}
        </nav>
  </>;
  const desktopHistory = <aside className="advisor-history advisor-history-desktop" aria-label="Історія розмов">{historyContents}</aside>;
  return (
    <div className="advisor-layout">
      {historySlot ? createPortal(desktopHistory, historySlot) : desktopHistory}
      {historyOpen && <button type="button" className="advisor-history-scrim" aria-label="Закрити історію" onClick={closeHistory} tabIndex={-1} />}
      <aside ref={historyPanel} tabIndex={-1} className={`advisor-history advisor-history-mobile ${historyOpen ? "is-open" : ""}`} aria-label="Історія розмов" role={historyOpen ? "dialog" : undefined} aria-modal={historyOpen ? true : undefined} onKeyDown={event => {
        if (!historyOpen) return;
        if (event.key === "Escape") { event.preventDefault(); closeHistory(); }
        if (event.key === "Tab") {
          const controls = Array.from(historyPanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
          if (!controls.length) { event.preventDefault(); return; }
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === historyPanel.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        {historyContents}
      </aside>
      <div className="advisor-page">
      <div className="advisor-toolbar">
        <button ref={historyButton} type="button" className="advisor-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(true)}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h11" /></svg><span>Розмови</span></button>
        <div><h2>Асистент</h2><p>Від бізнес-ідеї до підготовленої заявки</p></div>
      </div>
      <section
        className="live-chat-container"
        aria-label="Підбір фінансування з асистентом"
      >
        <div ref={scrollArea} className="chat-scroll-area" role="log" aria-live="polite" onScroll={e => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
          {loading && <p role="status">Завантажуємо розмову…</p>}
          {!loading && !busy && messages.length === 0 && (
            <div className="chat-welcome-card">
              <div className="welcome-content">
                <span className="welcome-eyebrow">ВАША ІДЕЯ · НАСТУПНИЙ КРОК</span>
                <h1>На що вам потрібні кошти?</h1>
                <p>
                  Опишіть бізнес-ідею або потребу вашої справи своїми словами.
                  Допоможу знайти можливості, розібратися в умовах і крок за
                  кроком підготувати матеріали. Знати назву гранту чи мати
                  готовий проєкт не потрібно.
                </p>
                <p className="welcome-suggestions-label">Або почніть із прикладу</p>
                <div className="welcome-quick-actions">
                  {[
                    "Хочу відкрити кав’ярню",
                    "Потрібне авто для доставки",
                    "Я студент і хочу відкрити бізнес",
                    "Потрібне обладнання для виробництва",
                  ].map((q) => (
                    <button
                      type="button"
                      key={q}
                      className="welcome-action-chip"
                      onClick={() => fill(q)}
                    >
                      {q}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              className="link"
              disabled={loading}
              onClick={() => void history(conversation, cursor)}
            >
              Попередні повідомлення
            </button>
          )}
          {messages.map((m) => (
            <div className="chat-turn" key={m.id}>
              <div className="chat-bubble user-bubble">
                <span className="message-label">Ви</span>
                <div className="bubble-text">{m.question}</div>
              </div>
              <div className="assistant-bubble">
                <div className="assistant-bubble-author">
                  <strong>Асистент</strong>
                  <small>
                    {m.mode === "guided"
                      ? "Підбір за умовами каталогу"
                      : "З урахуванням вашої розмови"}
                  </small>
                </div>
                <div className="assistant-text">
                  <ReplyReveal text={m.reply} animate={revealingId === m.id} onComplete={() => setRevealingId(id => id === m.id ? null : id)} onProgress={followReply}>{visible => <FormattedReply text={visible} />}</ReplyReveal>
                </div>
                {revealingId !== m.id && m.search.matches.length > 0 && (
                  <div
                    className="advisor-recommendations"
                    aria-label="Можливі програми"
                  >
                    {m.search.matches.slice(0, 3).map((match) => {
                      const p = GRANT_PROGRAMS.find(
                        (p) => p.id === match.programId,
                      );
                      if (!p || !isGrantAvailable(p)) return null;
                      return (
                        <article key={p.id} className="advisor-grant">
                          <h3>{match.title}</h3>
                          <p>{match.reason}</p>
                          <small>{match.caution}</small>
                          <div>
                            <button
                              type="button"
                              className="link"
                              onClick={() => onView(p)}
                            >
                              Умови програми
                            </button>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => onPrepare(p, m.seed)}
                            >
                              Готувати матеріали
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {revealingId !== m.id && <div className="advisor-followups">
                  {(m.search.intents.includes("transport")
                    ? /фоп/i.test(m.seed)
                      ? [
                          "Які документи підготувати?",
                          "Що перевірити перед купівлею авто?",
                        ]
                      : [
                          "Авто для доставки товарів",
                          "Авто для особистих потреб",
                          ...(savedLegalForm ? [] : ["Уже працюю як ФОП"]),
                        ]
                    : [
                        ...(savedLegalForm ? [] : ["Бізнесу ще немає", "Уже працюю як ФОП"]),
                        "Що потрібно для заявки?",
                      ]
                  ).map((q) => (
                    <button
                      type="button"
                      className="link"
                      key={q}
                      onClick={() => fill(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>}
              </div>
            </div>
          ))}
          {busy && (
            <div className="chat-turn"><div className="chat-bubble user-bubble"><span className="message-label">Ви</span><div className="bubble-text">{pendingQuestion}</div></div><div className="chat-pending" role="status"><strong>Асистент</strong><span>Шукаю можливі програми й готую відповідь…</span></div></div>
          )}
          <div ref={bottom} />
        </div>
        <div className="chat-composer-area">
          {restored && <p role="status">Ненадіслане запитання відновлено в цій вкладці.</p>}
          {storageError && <p role="alert">Не вдалося зберегти запитання в цій вкладці. Скопіюйте його перед перезавантаженням.</p>}
          {error && (
            <div className="chat-error-banner" role="alert">
              {error}
              <button
                type="button"
                className="link"
                disabled={busy || loading}
                onClick={() => void history(conversation)}
              >
                Оновити розмову
              </button>
            </div>
          )}
          <form
            className="chat-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={input}
              aria-label="Опишіть вашу потребу"
              placeholder="Наприклад: хочу купити авто для доставки, працюю як ФОП у Львові…"
              value={text}
              rows={2}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => updateText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="chat-input-footer">
              <span>Enter — надіслати · Shift + Enter — новий рядок</span>
              <button
                type="submit"
                className="chat-send-btn" aria-label="Надіслати запитання" title="Надіслати запитання"
                disabled={busy || loading || !text.trim()}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
            </div>
          </form>
          <p className="chat-disclaimer">
            Можливі програми потребують перевірки умов. Рішення про фінансування
            ухвалює організатор.
          </p>
        </div>
      </section>
      </div>
    </div>
  );
}
