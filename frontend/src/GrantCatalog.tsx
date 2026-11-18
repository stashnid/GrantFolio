import { hasGuidedApplication } from "./grants";
import { useEffect, useMemo, useRef, useState } from "react";
import { GRANT_PROGRAMS, type GrantProgram } from "./grants";
import "./GrantCatalog.css";
import { CustomSelect, type SelectOption } from "./CustomSelect";
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
const categoryOrder = Object.keys(
  categoryLabels,
) as GrantProgram["category"][];

type CategoryIconKey = "all" | GrantProgram["category"];

function CategoryIcon({ category }: { category: CategoryIconKey }) {
  const svgProps = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (category) {
    case "all":
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "erobota":
      return (
        <svg {...svgProps}>
          <path d="M3 10h18" />
          <path d="M5 10v8" />
          <path d="M10 10v8" />
          <path d="M14 10v8" />
          <path d="M19 10v8" />
          <path d="M3 20h18" />
          <path d="M4 10 12 4l8 6" />
        </svg>
      );
    case "veteran":
      return (
        <svg {...svgProps}>
          <path d="M12 3 5 6v5c0 4.6 3 8.3 7 10 4-1.7 7-5.4 7-10V6l-7-3Z" />
          <path d="m9.2 12 2 2 3.8-4" />
        </svg>
      );
    case "production":
      return (
        <svg {...svgProps}>
          <path d="M3 20h18" />
          <path d="M4 20V10l5 3v-3l5 3V7h6v13" />
          <path d="M17 11h.01" />
          <path d="M17 15h.01" />
        </svg>
      );
    case "agro":
      return (
        <svg {...svgProps}>
          <path d="M12 21v-9" />
          <path d="M12 12C12 8.2 9.4 5.5 5 5.5c0 4.2 2.6 6.5 7 6.5Z" />
          <path d="M12 14c0-3.5 2.4-6 7-6 0 4-2.4 6-7 6Z" />
        </svg>
      );
    case "international":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8" />
          <path d="M3.6 15h16.8" />
          <path d="M12 3a13.5 13.5 0 0 1 0 18" />
          <path d="M12 3a13.5 13.5 0 0 0 0 18" />
        </svg>
      );
    case "startup":
      return (
        <svg {...svgProps}>
          <path d="M4.5 16.5c-1.5 1.3-2 4.5-2 4.5s3.2-.5 4.5-2a2.5 2.5 0 0 0-2.5-2.5Z" />
          <path d="M12 15 9 12a21 21 0 0 1 2-3.8A13 13 0 0 1 21 3a13 13 0 0 1-5.2 10 21 21 0 0 1-3.8 2Z" />
          <path d="M9 12H4.5L7 9.5" />
          <path d="M12 15v4.5L14.5 17" />
        </svg>
      );
    case "women":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="8.5" r="4.5" />
          <path d="M12 13v8" />
          <path d="M9 17.5h6" />
        </svg>
      );
    case "social":
      return (
        <svg {...svgProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c0-2.8 2.5-4.8 5.5-4.8s5.5 2 5.5 4.8" />
          <circle cx="16.5" cy="9.5" r="2.3" />
          <path d="M16.5 14.5c2.2 0 4 1.6 4 4" />
        </svg>
      );
    case "green":
      return (
        <svg {...svgProps}>
          <path d="M19.5 4.5C12 4.5 6.5 9.5 6.5 17c0 .8.2 1.6.5 2.2.6.3 1.4.5 2.2.5 7.5 0 11.3-5.2 11.3-13.2 0-.8-.3-2-1-2Z" />
          <path d="M5 19.5 13.5 11" />
        </svg>
      );
    case "export":
      return (
        <svg {...svgProps}>
          <path d="M21 3 10 14" />
          <path d="m21 3-6.5 18-3.8-7.7L3 9.5 21 3Z" />
        </svg>
      );
    case "finance":
      return (
        <svg {...svgProps}>
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="M3 10h18" />
          <path d="M7 14.5h3.5" />
        </svg>
      );
    case "creative":
      return (
        <svg {...svgProps}>
          <path d="m12 19 7-7 2.5 2.5-7 7L12 19Z" />
          <path d="m18 13-1.5-7.5L3 3l2.5 13.5L13 18l5-5Z" />
          <path d="m3 3 7 7" />
          <circle cx="11" cy="11" r="1.5" />
        </svg>
      );
    case "digital":
      return (
        <svg {...svgProps}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
          <path d="M9 3v3" />
          <path d="M15 3v3" />
          <path d="M9 18v3" />
          <path d="M15 18v3" />
          <path d="M3 9h3" />
          <path d="M3 15h3" />
          <path d="M18 9h3" />
          <path d="M18 15h3" />
        </svg>
      );
    case "regional":
      return (
        <svg {...svgProps}>
          <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2.2" />
        </svg>
      );
    case "displaced":
      return (
        <svg {...svgProps}>
          <path d="m3 11 9-7 9 7" />
          <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
          <path d="M9.5 20v-5.5h5V20" />
        </svg>
      );
  }
}
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
  const [showAllCategories, setShowAllCategories] = useState(false);
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
  useEffect(() => {
    if (!active || !selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
  const selected = useMemo(
    () => programs.find((p) => p.id === selectedId),
    [programs, selectedId],
  );
  // The recommendation engine deliberately excludes closed/unverified records.
  // Catalogue browsing also searches the full sourced directory.
  const confirmedPrograms = useMemo(
    () => availablePrograms.filter(canPrepare),
    [availablePrograms],
  );
  const confirmedIds = useMemo(
    () => new Set(confirmedPrograms.map((p) => p.id)),
    [confirmedPrograms],
  );
  const categories = useMemo(() => {
    const present = new Set(programs.map((p) => p.category));
    return categoryOrder.filter((cat) => present.has(cat));
  }, [programs]);
  const fundingTypes = useMemo(
    () => [...new Set(programs.map((p) => p.fundingType ?? "unknown"))],
    [programs],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const p of programs) {
      if (onlyOpen && !confirmedIds.has(p.id)) continue;
      if (funding !== "all" && (p.fundingType ?? "unknown") !== funding)
        continue;
      counts.all += 1;
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [programs, onlyOpen, confirmedIds, funding]);
  const fundingCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const p of programs) {
      if (onlyOpen && !confirmedIds.has(p.id)) continue;
      if (category !== "all" && p.category !== category) continue;
      const key = p.fundingType ?? "unknown";
      counts.all += 1;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [programs, onlyOpen, confirmedIds, category]);
  const openAvailableCount = useMemo(() => {
    let count = 0;
    for (const p of programs) {
      if (!confirmedIds.has(p.id)) continue;
      if (category !== "all" && p.category !== category) continue;
      if (funding !== "all" && (p.fundingType ?? "unknown") !== funding)
        continue;
      count += 1;
    }
    return count;
  }, [programs, confirmedIds, category, funding]);
  const fundingOptions = useMemo<SelectOption[]>(
    () => [
      { value: "all", label: "Усі типи", count: fundingCounts.all ?? 0 },
      ...fundingTypes.map((value) => ({
        value,
        label: fundingLabels[value] ?? value,
        count: fundingCounts[value] ?? 0,
      })),
    ],
    [fundingTypes, fundingCounts],
  );
  const visibleCategories = useMemo(() => {
    if (showAllCategories || categories.length <= 6) return categories;
    const base = categories.slice(0, 6);
    if (
      category !== "all" &&
      !base.includes(category as GrantProgram["category"]) &&
      categories.includes(category as GrantProgram["category"])
    ) {
      return [...base, category as GrantProgram["category"]];
    }
    return base;
  }, [categories, showAllCategories, category]);
  const hiddenCategoryCount = Math.max(
    0,
    categories.length - visibleCategories.length,
  );
  const hasActiveFilters =
    category !== "all" ||
    funding !== "all" ||
    onlyOpen ||
    search.trim().length > 0;
  const searchIndex = useMemo(
    () =>
      new Map(
        programs.map((p) => [
          p.id,
          normalize(
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
          ),
        ]),
      ),
    [programs],
  );
  const result = useMemo(
    () => searchGrants(search, confirmedPrograms),
    [search, confirmedPrograms],
  );
  const filtered = useMemo(() => {
    const matches = new Map(
      result.matches.map((match) => [match.programId, match]),
    );
    const trimmedSearch = search.trim();
    const queryWords = trimmedSearch
      ? normalize(search)
          .split(" ")
          .filter(
            (word) =>
              word.length > 1 &&
              !["для", "на", "та", "і", "у", "в"].includes(word),
          )
      : [];
    return programs
      .filter((p) => {
        if (category !== "all" && p.category !== category) return false;
        if (funding !== "all" && (p.fundingType ?? "unknown") !== funding)
          return false;
        if (onlyOpen && !confirmedIds.has(p.id)) return false;
        if (!trimmedSearch) return true;
        if (matches.has(p.id)) return true;
        const text = searchIndex.get(p.id) ?? "";
        return (
          queryWords.length > 0 &&
          queryWords.every((word) => text.includes(word))
        );
      })
      .map((program) => ({ program, match: matches.get(program.id) }));
  }, [
    programs,
    category,
    funding,
    onlyOpen,
    confirmedIds,
    search,
    result,
    searchIndex,
  ]);
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
    const guided = hasGuidedApplication(selected.id);
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
            <span aria-hidden="true">←</span> Каталог грантів
          </button>
          <span className="catalog-breadcrumb-sep" aria-hidden="true">
            /
          </span>
          <span className="catalog-breadcrumb-current">Деталі програми</span>
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
          {guided ? (
            <>
              <button
                type="button"
                className="primary grant-prepare"
                onClick={() => {
                  onApplyProgram?.(selected, search.trim());
                }}
              >
                Підготувати робочу чернетку
              </button>
              <p className="grant-action-note">
                {available ? "Доступні анкета, перевірки та робочий експорт. Звірте вимоги перед поданням." : "Можна почати підготовку заздалегідь. Перевірте, чи відновлено прийом, перш ніж подавати документи."}
              </p>
            </>
          ) : (
            <p className="grant-action-note">
              {selected.reviewStatus === "needs-review"
                ? "Нову можливість знайдено автоматично. Умови та право українського бізнесу на участь ще потребують перевірки."
                : selected.programKind === "program"
                  ? "Це програма підтримки. Перевірте в надавача доступні конкурси та інструменти."
                  : "GrantFolio показує умови та джерела цієї можливості. Для підготовки матеріалів скористайтеся інструкціями надавача."}
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
        {guided && (
          <div className="grant-bottom-action">
            <h3>Готові почати?</h3>
            <p>Підготуйте матеріали для цієї програми.</p>
            <button
              type="button"
              className="primary grant-prepare"
              onClick={() => {
                onApplyProgram?.(selected, search.trim());
              }}
            >
              Підготувати робочу чернетку
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
        <h2>Знайдіть фінансування для своєї ідеї</h2>
        <p className="catalog-subtitle">
          Гранти, премії, кредити й інші інструменти для українського бізнесу.
          Оберіть напрям і перевірте умови участі.
        </p>
        <div className="catalog-toolbar-panel">
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
          <div className="catalog-category-bar">
            <div className="catalog-category-header">
              <span className="catalog-category-label">Напрям</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="catalog-reset-btn"
                  onClick={resetFilters}
                >
                  Скинути фільтри <span aria-hidden="true">×</span>
                </button>
              )}
            </div>
            <div
              className="catalog-category-pills"
              role="group"
              aria-label="Фільтр за напрямом"
            >
              <button
                type="button"
                className="catalog-category-pill"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
              >
                <span className="catalog-pill-icon">
                  <CategoryIcon category="all" />
                </span>
                <span className="catalog-pill-label">Усі напрями</span>
                <span className="catalog-pill-count">
                  {categoryCounts.all ?? 0}
                </span>
              </button>
              {visibleCategories.map((value) => {
                const count = categoryCounts[value] ?? 0;
                const isSelected = category === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className="catalog-category-pill"
                    aria-pressed={isSelected}
                    data-empty={count === 0 && !isSelected ? "true" : undefined}
                    onClick={() => setCategory(value)}
                  >
                    <span className="catalog-pill-icon">
                      <CategoryIcon category={value} />
                    </span>
                    <span className="catalog-pill-label">
                      {categoryLabels[value] ?? value}
                    </span>
                    <span className="catalog-pill-count">{count}</span>
                  </button>
                );
              })}
              {categories.length > 6 && (
                <button
                  type="button"
                  className="catalog-category-toggle"
                  aria-expanded={showAllCategories}
                  onClick={() => setShowAllCategories((prev) => !prev)}
                >
                  {showAllCategories
                    ? "Згорнути"
                    : `+ Ще ${hiddenCategoryCount}`}
                </button>
              )}
            </div>
          </div>
          <div
            className="catalog-filters"
            role="group"
            aria-label="Фільтри фінансування"
          >
            <div className="catalog-filter-field">
              <label
                className="catalog-filter-label"
                htmlFor="grant-funding-filter"
              >
                Тип фінансування
              </label>
              <CustomSelect
                id="grant-funding-filter"
                value={funding}
                options={fundingOptions}
                onChange={setFunding}
                placeholder="Усі типи"
              />
            </div>
            <button
              type="button"
              role="switch"
              id="grant-open-filter"
              aria-checked={onlyOpen}
              className="catalog-switch-btn"
              onClick={() => setOnlyOpen((v) => !v)}
            >
              <span className="catalog-switch-track" aria-hidden="true">
                <span className="catalog-switch-thumb" />
              </span>
              <span className="catalog-switch-label">
                Лише підтверджений відкритий прийом
              </span>
              <span className="catalog-switch-count">{openAvailableCount}</span>
            </button>
          </div>
          <p className="catalog-scope-note">
            {onlyOpen
              ? "Показуємо лише набори з актуальним підтвердженням прийому. Це не гарантує відповідності вашого бізнесу умовам."
              : "Усі можливості: відкриті й завершені конкурси, програми підтримки та нові знахідки. Статус зазначено в кожній картці."}
          </p>
        </div>
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
                aria-label={`Деталі програми «${friendlyTitle(p)}»`}
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
