import { useEffect, useRef, useState } from "react";
import { GRANT_PROGRAMS, type GrantProgram } from "./grants";
import "./GrantCatalog.css";
import { useGrantPrograms } from "./GrantPrograms";
import { isGrantAvailable } from "../../backend/src/grant-availability";
import { searchGrants, friendlyTitle } from "../../backend/src/grant-discovery";

export { GRANT_PROGRAMS, type GrantProgram } from "./grants";

type Props = {
  active: boolean;
  onApplyProgram?: (program: GrantProgram, query?: string) => void;
  onDiscussQuery?: (query: string) => void;
};
const catalogId = () => {
  if (!window.location.hash.startsWith("#grants/")) return null;
  try {
    return decodeURIComponent(window.location.hash.slice(8));
  } catch {
    return window.location.hash.slice(8);
  }
};
const formatDate = (value: string) =>
  value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2.$1");
const deadlineText = (p: GrantProgram) =>
  p.availability?.rolling
    ? "Постійний прийом"
    : p.availability?.deadlineAt
      ? `Подати до ${new Date(p.availability.deadlineAt).toLocaleString("uk-UA", { dateStyle: "medium", ...(p.availability?.deadlinePrecision === "minute" ? { timeStyle: "short" as const } : {}), timeZone: "Europe/Kyiv" })} (Київ)`
      : "Строк прийому уточнюється";
const intakeLabel = (p: GrantProgram) =>
  p.availability?.basis === "calendar"
    ? "Період подання за календарем"
    : "Прийом відкрито";
const checkTime = (p: GrantProgram) =>
  p.availability?.checkedAt
    ? new Date(p.availability.checkedAt).toLocaleString("uk-UA", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Kyiv",
      })
    : p.checkedAt;
const urgent = (p: GrantProgram) =>
  !!p.availability?.deadlineAt &&
  Date.parse(p.availability.deadlineAt) - Date.now() <= 7 * 86400000;

export function GrantCatalog({
  active,
  onApplyProgram,
  onDiscussQuery,
}: Props) {
  const { programs, availablePrograms, loading, error, reload, sources } =
    useGrantPrograms();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(catalogId);
  const lastCard = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!active) return;
    const sync = () => setSelectedId(catalogId());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [active]);
  useEffect(() => {
    if (!active || selectedId !== catalogId()) return;
    if (selectedId) heading.current?.focus();
    else if (lastCard.current) {
      document.getElementById(`grant-${lastCard.current}`)?.focus();
      lastCard.current = null;
    }
  }, [active, selectedId]);
  const open = (id: string) => {
    lastCard.current = id;
    if (window.location.hash !== "#grants")
      window.history.replaceState(null, "", "#grants");
    window.location.hash = `grants/${encodeURIComponent(id)}`;
  };
  const back = () => {
    window.location.hash = "grants";
  };
  const selected = programs.find((p) => p.id === selectedId);
  const result = searchGrants(search, availablePrograms);
  const candidates = search.trim()
    ? result.matches.map((match) => ({
        program: availablePrograms.find((p) => p.id === match.programId)!,
        match,
      }))
    : availablePrograms.map((program) => ({ program, match: undefined }));
  const filtered = candidates.filter(({program}) => !!program);
  const list = (items: readonly string[]) => (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
  if (selectedId) {
    if (!selected)
      return (
        <div className="grant-catalog">
          <button type="button" className="catalog-back" onClick={back}>
            ← Каталог грантів
          </button>
          <h2 ref={heading} tabIndex={-1}>
            Програму не знайдено
          </h2>
          <p>Поверніться до каталогу та виберіть програму.</p>
        </div>
      );
    const d = selected.details;
    const available = isGrantAvailable(selected);
    const sectionId = (section: string) =>
      `grant-section-${selected.id}-${section}`;
    const jumpTo = (section: string) => {
      const target = document.getElementById(sectionId(section));
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    };
    return (
      <div className="grant-catalog grant-page">
        <nav aria-label="Навігація каталогом">
          <button type="button" className="catalog-back" onClick={back}>
            ← Каталог грантів
          </button>
          <span aria-hidden="true"> / </span>
          <span>Деталі програми</span>
        </nav>
        <header className="grant-page-header">
          <p className="grant-category">
            {selected.categoryLabel} · {selected.provider}
          </p>
          <h2 ref={heading} tabIndex={-1}>
            {friendlyTitle(selected)}
          </h2>
          <p className="grant-official-name">
            Офіційна програма: {selected.title}
          </p>
          <p className="grant-page-amount">{selected.amount}</p>
          <p className="grant-official-name">
            Умови й суми опрацьовано {formatDate(selected.checkedAt)}.
            Автоматично перевіряємо статус прийому та дедлайн.
          </p>
          <p className="grant-status">
            <strong>
              {available
                ? intakeLabel(selected)
                : "Прийом зараз не підтверджено або завершено"}
            </strong>{" "}
            · Статус перевірено {checkTime(selected)}
          </p>
          <p>{available ? deadlineText(selected) : selected.deadline}</p>
          {available ? (
            <>
              <button
                type="button"
                className="primary grant-prepare"
                onClick={() => {
                  if (isGrantAvailable(selected))
                    onApplyProgram?.(selected, search.trim());
                }}
              >
                Підготувати проєкт
              </button>
              <p className="grant-action-note">
                Перед поданням перевірте умови в офіційному джерелі.
              </p>
            </>
          ) : (
            <p className="grant-action-note">
              Підготовка нової заявки недоступна, доки актуальний прийом не
              підтверджено.
            </p>
          )}
        </header>
        <nav className="grant-section-index" aria-label="Розділи програми">
          {[
            ["eligibility", "Умови участі"],
            ["funding", "Фінансування"],
            ["costs", "Витрати"],
            ["documents", "Документи"],
            ["steps", "Порядок подання"],
          ].map(([id, label]) => (
            <button type="button" key={id} onClick={() => jumpTo(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="grant-content">
          <section>
            <h3>Про програму</h3>
            <p>{d.overview}</p>
          </section>
          <section>
            <h3 id={sectionId("eligibility")} tabIndex={-1}>
              Хто може подати заявку
            </h3>
            {list(d.eligibility)}
            {d.exclusions.length > 0 && (
              <>
                <h4>Обмеження</h4>
                {list(d.exclusions)}
              </>
            )}
          </section>
          <section>
            <h3 id={sectionId("funding")} tabIndex={-1}>
              Фінансування та власний внесок
            </h3>
            {list(d.funding)}
          </section>
          <section>
            <h3 id={sectionId("costs")} tabIndex={-1}>
              На що можна витратити кошти
            </h3>
            {list(d.costs)}
          </section>
          <section>
            <h3>Зобов’язання</h3>
            {list(d.obligations)}
          </section>
          <section>
            <h3 id={sectionId("documents")} tabIndex={-1}>
              Документи
            </h3>
            {list(d.documents)}
          </section>
          <section>
            <h3 id={sectionId("steps")} tabIndex={-1}>
              Кроки підготовки та подання
            </h3>
            {list(d.steps)}
          </section>
          <section>
            <h3>Строки та прийом</h3>
            {list(d.timing)}
          </section>
          <section>
            <h3>На що звернути увагу</h3>
            {list(d.pitfalls)}
          </section>
          <section>
            <h3>Що потрібно уточнити</h3>
            {list(d.unresolved)}
          </section>
          <section>
            <h3>Офіційні джерела</h3>
            <ul>
              {d.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title} ↗
                  </a>{" "}
                  <span>· перевірено {formatDate(source.checkedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {available && (
          <div className="grant-bottom-action">
            <h3>Готові почати?</h3>
            <p>Підготуйте матеріали для цієї програми.</p>
            <button
              type="button"
              className="primary grant-prepare"
              onClick={() => {
                if (isGrantAvailable(selected))
                  onApplyProgram?.(selected, search.trim());
              }}
            >
              Підготувати проєкт
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="grant-catalog">
      <header className="grant-list-header">
        <p className="catalog-eyebrow">Каталог грантів</p>
        <h2>Знайдіть фінансування<br />для своєї ідеї</h2>
        <p>
          Опишіть потребу своїми словами. Назву програми знати не потрібно.
        </p>
        <form className="catalog-search-form" role="search" onSubmit={(event) => { event.preventDefault(); resultsHeading.current?.focus(); }}>
          <label className="grant-search-label" htmlFor="grant-search">Що ви хочете профінансувати?</label>
          <div className="catalog-search-controls">
            <input id="grant-search" maxLength={500} type="search" placeholder="Наприклад: обладнання для кав’ярні" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button type="button" className="catalog-clear" onClick={() => setSearch("")}>Очистити</button>}
            <button type="submit" className="catalog-search-submit">Знайти</button>
          </div>
          <p>Результати оновлюються під час введення.</p>
        </form>
      </header>
      {loading && <p role="status">Оновлюємо програми…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" className="catalog-back" onClick={reload}>
            Повторити
          </button>
        </p>
      )}
      {sources.some(
        (s) => s.error && availablePrograms.some((p) => p.id === s.programId),
      ) && (
        <p role="status" className="grant-query-explanation">
          Повторна перевірка деяких джерел тимчасово недоступна. Час останнього
          успішного підтвердження показано біля програми; прострочені
          підтвердження не потрапляють до каталогу.
        </p>
      )}
      {!search.trim() && <div className="grant-search-help">
        {[
          "Авто для роботи",
          "Бізнес для молоді",
          "Кав’ярня",
          "Виробництво",
        ].map((q) => (
          <button
            type="button"
            key={q}
            onClick={() => {
              setSearch(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>}
      {search.trim() && filtered.length === 0 && (
        <p className="grant-query-explanation">{result.explanation}</p>
      )}
      {search.trim() && (
        <button
          type="button"
          className="catalog-discuss"
          onClick={() => onDiscussQuery?.(search)}
        >
          Обговорити потребу з асистентом
        </button>
      )}
      <div className="grant-results-heading"><div><p className="catalog-eyebrow">Доступні програми</p><h3>Можливості для вас</h3></div><p ref={resultsHeading} tabIndex={-1} role="status" className="grant-count">Можливих напрямів: {filtered.length}</p></div>
      {filtered.length === 0 && (
        <p>
          Зараз немає підтверджених відкритих програм за цим запитом. Це не означає, що фінансування взагалі не існує.{" "}
          <button
            type="button"
            className="catalog-back"
            onClick={() => {
              setSearch("");
            }}
          >
            Показати весь каталог
          </button>
        </p>
      )}
      <div className="grant-list">
        {filtered.map(({ program: p, match }) => (
          <article className="grant-list-item" key={p.id}>
            <div>
              <p className="grant-category">
                {p.categoryLabel} · {p.provider}
              </p>
              <h3>{friendlyTitle(p)}</h3>
              <p>{p.summary}</p>
              <p>
                <strong>Для кого:</strong> {p.targetAudience}
              </p>
              <p>
                <strong>На що:</strong> {p.eligibleCosts.join(", ")}
              </p>
              {search.trim() && match && (
                <div className="grant-match-reason">
                  <strong>Чому це може підійти</strong>
                  <p>{match.reason}</p>
                  <small>{match.caution}</small>
                  <a
                    href={match.evidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Підстава у джерелі ↗
                  </a>
                </div>
              )}
              <p className="grant-status">
                <strong>{intakeLabel(p)}</strong> · Статус перевірено{" "}
                {checkTime(p)} ·{" "}
                <a
                  href={p.availability?.sourceUrl ?? p.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Джерело ↗
                </a>
              </p>
            </div>
            <div className="grant-list-action">
              <strong>{p.amount}</strong>
              <p
                className={
                  urgent(p)
                    ? "grant-deadline grant-deadline-urgent"
                    : "grant-deadline"
                }
              >
                {deadlineText(p)}
              </p>
              <button
                id={`grant-${p.id}`}
                type="button"
                onClick={() => open(p.id)}
              >
                Деталі програми <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
