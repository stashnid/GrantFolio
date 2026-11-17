import { useEffect, useRef, useState } from "react";
import { GRANT_PROGRAMS, type GrantProgram } from "./grants";
import "./GrantCatalog.css";
import { useGrantPrograms } from "./GrantPrograms";
import { isGrantAvailable } from "../../backend/src/grant-availability";
import {
  searchGrants,
  friendlyTitle,
  normalize,
} from "../../backend/src/grant-discovery";

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
const fundingLabels: Record<
  NonNullable<GrantProgram["fundingType"]> | "unknown",
  string
> = {
  unknown: "Тип фінансування уточнюється",
  grant: "Грант",
  reimbursement: "Компенсація витрат",
  cofinancing: "Співфінансування",
  loan: "Кредит",
  equity: "Інвестиція в капітал",
  guarantee: "Гарантія",
  prize: "Грошова премія",
  voucher: "Ваучер",
  "in-kind": "Послуги та ресурси",
  "recoverable-grant": "Поворотний грант",
  blended: "Змішане фінансування",
  leasing: "Лізинг",
  factoring: "Факторинг",
  insurance: "Страхування",
};
const categoryLabels: Record<GrantProgram["category"], string> = {
  erobota: "Державні програми",
  veteran: "Ветеранський бізнес",
  production: "Виробництво",
  agro: "Агробізнес",
  international: "Міжнародні програми",
  startup: "Стартапи та інновації",
  women: "Жіноче підприємництво",
  social: "Соціальний бізнес",
  green: "Енергія та довкілля",
  export: "Експорт",
  finance: "Кредити та інші фінанси",
  creative: "Креативні індустрії",
  digital: "Цифровізація",
  regional: "Регіональна підтримка",
  displaced: "ВПО та релокація",
};
const fundingLabel = (p: GrantProgram) =>
  fundingLabels[p.fundingType ?? "unknown"] ?? "Тип уточнюється";
const canPrepare = (p: GrantProgram) =>
  p.reviewStatus !== "needs-review" &&
  p.programKind !== "program" &&
  isGrantAvailable(p);
const currentAvailability = (p: GrantProgram) => {
  const a = p.availability;
  return a &&
    Number.isFinite(Date.parse(a.checkedAt)) &&
    Date.parse(a.validUntil) > Date.now()
    ? a
    : undefined;
};
const pausedIntake = (p: GrantProgram) =>
  p.intakeStatus === "paused" ||
  /призупин|suspend|paused/iu.test(currentAvailability(p)?.evidence ?? "");
const availabilityDate = (value: string, precision?: "day" | "minute") =>
  new Date(value).toLocaleString("uk-UA", {
    dateStyle: "medium",
    ...(precision === "minute" ? { timeStyle: "short" as const } : {}),
    timeZone: "Europe/Kyiv",
  });
const nextIntake = (p: GrantProgram) => {
  const a = currentAvailability(p);
  return a?.basis === "calendar" &&
    a.startsAt &&
    Date.parse(a.startsAt) > Date.now()
    ? a
    : undefined;
};
const deadlineText = (p: GrantProgram) => {
  const a = currentAvailability(p);
  const next = nextIntake(p);
  if (next && !pausedIntake(p)) {
    const start = availabilityDate(next.startsAt!);
    const end = next.deadlineAt
      ? ` — ${availabilityDate(next.deadlineAt)}`
      : "";
    return `Наступний прийом за календарем: ${start}${end}`;
  }
  if (a?.deadlineAt && Number.isFinite(Date.parse(a.deadlineAt))) {
    const label = canPrepare(p)
      ? "Подати до"
      : "Строк за останньою перевіркою:";
    const precision =
      a.deadlinePrecision === "minute"
        ? " (Київ)"
        : " · час уточніть у джерелі";
    return `${label} ${availabilityDate(a.deadlineAt, a.deadlinePrecision)}${precision}`;
  }
  if (canPrepare(p) && a?.rolling) return "Постійний прийом";
  if (a && pausedIntake(p))
    return "Нову дату відновлення прийому уточнюйте в офіційному джерелі.";
  if (a?.basis === "calendar")
    return "Новий період у перевіреному календарі не визначено.";
  return p.deadline;
};
const intakeLabel = (p: GrantProgram) => {
  if (p.reviewStatus === "needs-review")
    return "Нова знахідка · потребує перевірки";
  if (p.programKind === "program")
    return "Програма · окремий набір уточнюється";
  if (canPrepare(p))
    return p.availability?.basis === "calendar"
      ? "Період подання за календарем"
      : "Прийом відкрито";
  if (pausedIntake(p)) return "Прийом призупинено";
  const next = nextIntake(p);
  if (next) return `Наступний прийом з ${availabilityDate(next.startsAt!)}`;
  if (
    p.intakeStatus === "archived" ||
    p.availability?.state === "closed" ||
    (p.availability?.deadlineAt &&
      Date.parse(p.availability.deadlineAt) <= Date.now())
  )
    return "Прийом завершено";
  return "Відкритий прийом не підтверджено";
};
const checkTime = (p: GrantProgram) =>
  p.availability?.checkedAt
    ? `Статус перевірено ${new Date(p.availability.checkedAt).toLocaleString(
        "uk-UA",
        {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Europe/Kyiv",
        },
      )}`
    : `Дані опрацьовано ${formatDate(p.checkedAt)}`;
const urgent = (p: GrantProgram) =>
  canPrepare(p) &&
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
  const [category, setCategory] = useState("all");
  const [funding, setFunding] = useState("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
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
  // The recommendation engine deliberately excludes closed/unverified records.
  // Catalogue browsing also searches the full sourced directory.
  const result = searchGrants(search, availablePrograms.filter(canPrepare));
  const matches = new Map(
    result.matches.map((match) => [match.programId, match]),
  );
  const queryWords = normalize(search)
    .split(" ")
    .filter(
      (word) =>
        word.length > 1 && !["для", "на", "та", "і", "у", "в"].includes(word),
    );
  const categories = [...new Set(programs.map((p) => p.category))];
  const fundingTypes = [
    ...new Set(programs.map((p) => p.fundingType ?? "unknown")),
  ];
  const confirmedIds = new Set(
    availablePrograms.filter(canPrepare).map((p) => p.id),
  );
  const filtered = programs
    .filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (funding !== "all" && (p.fundingType ?? "unknown") !== funding)
        return false;
      if (onlyOpen && !confirmedIds.has(p.id)) return false;
      if (!search.trim()) return true;
      if (matches.has(p.id)) return true;
      const text = normalize(
        [
          p.title,
          friendlyTitle(p),
          p.provider,
          p.summary,
          p.targetAudience,
          p.categoryLabel,
          categoryLabels[p.category],
          fundingLabel(p),
          p.keyCondition,
          p.eligibilityUkraine ?? "",
          p.repayment ?? "",
          p.details.overview,
          ...p.eligibleCosts,
          ...p.details.eligibility,
          ...p.details.funding,
          ...(p.tags ?? []),
          ...(p.searchTerms ?? []),
        ].join(" "),
      );
      return (
        queryWords.length > 0 && queryWords.every((word) => text.includes(word))
      );
    })
    .map((program) => ({ program, match: matches.get(program.id) }));
  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setFunding("all");
    setOnlyOpen(false);
  };
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
    const available = confirmedIds.has(selected.id);
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
          <div className="grant-badges">
            <span>{fundingLabel(selected)}</span>
            <span>
              {selected.programKind === "program"
                ? "Програма підтримки"
                : "Конкурс / набір"}
            </span>
          </div>
          <p className="grant-page-amount">{selected.amount}</p>
          <p className="grant-official-name">
            Умови й суми опрацьовано {formatDate(selected.checkedAt)}.
            Доступність залежить від поточного набору та правил надавача.
          </p>
          <p className="grant-status">
            <strong>{intakeLabel(selected)}</strong> · {checkTime(selected)}
          </p>
          <p>{deadlineText(selected)}</p>
          <a
            className="grant-source-link"
            href={selected.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Перейти до надавача ↗
          </a>
          {available ? (
            <>
              <button
                type="button"
                className="primary grant-prepare"
                onClick={() => {
                  if (confirmedIds.has(selected.id) && canPrepare(selected))
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
              {selected.reviewStatus === "needs-review"
                ? "Нову можливість знайдено автоматично. Умови та право українського бізнесу на участь ще потребують перевірки."
                : selected.programKind === "program"
                  ? "Це програма підтримки. Перевірте в надавача доступні конкурси та інструменти."
                  : "Підготовка нової заявки недоступна, доки актуальний прийом не підтверджено."}
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
            {selected.eligibilityUkraine && (
              <p className="grant-ukraine-eligibility">
                <strong>Участь українського бізнесу:</strong>{" "}
                {selected.eligibilityUkraine}
              </p>
            )}
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
            <p className="grant-finance-note">
              <strong>{fundingLabel(selected)}.</strong>{" "}
              {selected.repayment ??
                "Вимоги до власного внеску, цільового використання, звітності та повернення коштів уточнюйте в правилах і договорі програми."}
            </p>
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
                if (confirmedIds.has(selected.id) && canPrepare(selected))
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
        <h2>
          Знайдіть фінансування
          <br />
          для своєї ідеї
        </h2>
        <p>
          Гранти, премії, кредити й інші інструменти для українського бізнесу.
          Оберіть напрям і перевірте умови участі.
        </p>
        <form
          className="catalog-search-form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            resultsHeading.current?.focus();
          }}
        >
          <label className="grant-search-label" htmlFor="grant-search">
            Що ви хочете профінансувати?
          </label>
          <div className="catalog-search-controls">
            <input
              id="grant-search"
              maxLength={500}
              type="search"
              aria-describedby="grant-search-help"
              placeholder="Назва, надавач або потреба: обладнання"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="catalog-clear"
                onClick={() => setSearch("")}
              >
                Очистити
              </button>
            )}
            <button type="submit" className="catalog-search-submit">
              Знайти
            </button>
          </div>
          <p id="grant-search-help">
            Шукаємо в назвах, описах, умовах і ключових словах усього каталогу.
            Результати оновлюються під час введення.
          </p>
        </form>
        <div
          className="catalog-filters"
          role="group"
          aria-label="Фільтри фінансування"
        >
          <label htmlFor="grant-category-filter">
            Напрям
            <select
              id="grant-category-filter"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">Усі напрями</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabels[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="grant-funding-filter">
            Тип фінансування
            <select
              id="grant-funding-filter"
              value={funding}
              onChange={(event) => setFunding(event.target.value)}
            >
              <option value="all">Усі типи</option>
              {fundingTypes.map((value) => (
                <option key={value} value={value}>
                  {fundingLabels[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          <label className="catalog-open-filter" htmlFor="grant-open-filter">
            <input
              id="grant-open-filter"
              type="checkbox"
              checked={onlyOpen}
              onChange={(event) => setOnlyOpen(event.target.checked)}
            />
            Лише підтверджений відкритий прийом
          </label>
        </div>
        <p className="catalog-scope-note">
          {onlyOpen
            ? "Показуємо лише набори з актуальним підтвердженням прийому. Це не гарантує відповідності вашого бізнесу умовам."
            : "Усі можливості: відкриті й завершені конкурси, програми підтримки та нові знахідки. Статус зазначено в кожній картці."}
        </p>
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
      {sources.some((s) => s.error) && (
        <p role="status" className="grant-query-explanation">
          Повторна перевірка деяких джерел тимчасово недоступна. Час останнього
          успішного підтвердження показано біля програми. Без актуального
          підтвердження можливість не вважається відкритою для підготовки
          заявки.
        </p>
      )}
      {!search.trim() && (
        <div className="grant-search-help">
          {["Обладнання", "Жінки", "Стартап", "Виробництво"].map((q) => (
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
        </div>
      )}
      {search.trim() && filtered.length === 0 && (
        <p className="grant-query-explanation">
          За цими словами та фільтрами збігів немає. Спробуйте коротшу назву,
          надавача або інший напрям.
        </p>
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
      <div className="grant-results-heading">
        <div>
          <p className="catalog-eyebrow">
            {onlyOpen ? "Підтверджений прийом" : "Каталог фінансування"}
          </p>
          <h3>Можливості для бізнесу</h3>
        </div>
        <p
          ref={resultsHeading}
          tabIndex={-1}
          role="status"
          className="grant-count"
        >
          Можливих напрямів: {filtered.length}
        </p>
      </div>
      {filtered.length === 0 && (
        <p>
          {onlyOpen
            ? "Підтверджених відкритих наборів за цими фільтрами немає."
            : "Можливостей за цими фільтрами не знайдено."}{" "}
          <button type="button" className="catalog-back" onClick={resetFilters}>
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
              <div className="grant-badges">
                <span>{fundingLabel(p)}</span>
                <span>
                  {p.programKind === "program"
                    ? "Програма підтримки"
                    : "Конкурс / набір"}
                </span>
                {p.reviewStatus === "needs-review" && (
                  <span>Потребує перевірки</span>
                )}
              </div>
              <h3>{friendlyTitle(p)}</h3>
              <p>{p.summary}</p>
              <p>
                <strong>Для кого:</strong> {p.targetAudience}
              </p>
              <p>
                <strong>На що:</strong> {p.eligibleCosts.join(", ")}
              </p>
              {p.repayment && (
                <p>
                  <strong>Умови коштів:</strong> {p.repayment}
                </p>
              )}
              {p.eligibilityUkraine && (
                <p>
                  <strong>Участь з України:</strong> {p.eligibilityUkraine}
                </p>
              )}
              {search.trim() && match && confirmedIds.has(p.id) && (
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
                <strong>{intakeLabel(p)}</strong> · {checkTime(p)} ·{" "}
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
