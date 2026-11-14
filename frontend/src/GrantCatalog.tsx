import { useState } from "react";

export type GrantProgram = {
  id: string; title: string; provider: string; amount: string; deadline: string;
  category: "erobota" | "veteran" | "production" | "agro";
  categoryLabel: string; targetAudience: string; keyCondition: string;
  summary: string; eligibleCosts: string[]; officialUrl: string;
  checkedAt: string; intakeStatus: "unconfirmed" | "paused";
};

// Reviewed official-page summaries. These are references, not eligibility decisions.
export const GRANT_PROGRAMS: GrantProgram[] = [
  {
    id: "vlasna-sprava", title: "Власна справа", provider: "Дія / Державний центр зайнятості",
    amount: "Старт — до 500 тис. грн; масштабування — до 2,5 млн грн",
    deadline: "На сторінці зазначено завершення етапу 27.10.2026; новий прийом не підтверджено",
    category: "erobota", categoryLabel: "єРобота", targetAudience: "Повнолітні громадяни України, ФОП та юридичні особи — за умовами відповідного напряму",
    keyCondition: "Бізнес-план, перевірка заявника та виконання зобов’язань за договором",
    summary: "Державна підтримка започаткування та масштабування бізнесу. Вибір напряму впливає на суму й умови. Відкритий прийом потрібно перевірити перед поданням.",
    eligibleCosts: ["Напрями витрат і повні обмеження — на офіційній сторінці"],
    officialUrl: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
    checkedAt: "15.11.2026", intakeStatus: "unconfirmed",
  },
  {
    id: "veteran-grant", title: "Грант для ветеранів та членів їхніх сімей", provider: "е-Ветеран / Державний центр зайнятості",
    amount: "Залежить від категорії заявника та умов програми", deadline: "Чинний етап прийому не підтверджено",
    category: "veteran", categoryLabel: "Ветеранський бізнес", targetAudience: "Ветерани та члени сімей, які відповідають чинному Порядку",
    keyCondition: "Бізнес-план обов’язковий; право участі визначається умовами програми",
    summary: "Підтримка створення або розвитку ветеранського бізнесу. Офіційний портал описує категорії заявників, документи та порядок звернення; це не підтвердження відкритого конкурсу.",
    eligibleCosts: ["Перевірте чинний Порядок на офіційному порталі"],
    officialUrl: "https://eveteran.gov.ua/benefits/yerobota-grant-dlya-veteraniv-ta-chleniv-yihnih-simej-dlya-stvorennya-abo-rozvitku-veteranskogo-biznesu",
    checkedAt: "15.11.2026", intakeStatus: "unconfirmed",
  },
  {
    id: "processing-business", title: "Грант на переробне виробництво", provider: "Дія / Міністерство економіки",
    amount: "До 8 млн грн; для відновлення пошкодженого виробництва — до 16 млн грн",
    deadline: "Дія повідомляє про призупинення прийому", category: "production", categoryLabel: "Виробництво",
    targetAudience: "Заявники у сфері переробного виробництва, які відповідають умовам програми",
    keyCondition: "Для напряму до 8 млн грн сторінка вказує щонайменше 5 робочих місць; інші вимоги залежать від напряму",
    summary: "Підтримка створення, розвитку й відновлення виробництва. На перевіреній сторінці прийом заяв призупинено. Можна підготувати проєкт і перевіряти офіційні оновлення.",
    eligibleCosts: ["Придбання виробничих основних засобів — за умовами обраного напряму"],
    officialUrl: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
    checkedAt: "15.11.2026", intakeStatus: "paused",
  },
  {
    id: "agro-gardens", title: "Грант на сад, ягідник або виноградник", provider: "Дія",
    amount: "До 400 тис. грн за гектар — залежно від умов", deadline: "Дія повідомляє про призупинення прийому",
    category: "agro", categoryLabel: "Садівництво", targetAudience: "ФОП та юридичні особи у сфері сільського господарства",
    keyCondition: "Потрібен проєкт висадки насаджень та виконання вимог до ділянки й культури",
    summary: "Програма для садівництва, ягідництва та виноградарства. На перевіреній сторінці прийом призупинено. Теплиці є окремою програмою й не включені в цю картку.",
    eligibleCosts: ["Витрати за проєктом висадки й чинними умовами програми"],
    officialUrl: "https://diia.gov.ua/services/grant-na-sad", checkedAt: "15.11.2026", intakeStatus: "paused",
  },
];

type Props = {
  onApplyProgram?: (program: GrantProgram) => void;
};

export function GrantCatalog({ onApplyProgram }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const filtered = GRANT_PROGRAMS.filter((p) => {
    const matchesFilter = filter === "all" || p.category === filter;
    const matchesSearch =
      !search.trim() ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.summary.toLowerCase().includes(search.toLowerCase()) ||
      p.targetAudience.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="grant-catalog-container">
      <div className="catalog-header">
        <div className="catalog-eyebrow">ПРОГРАМИ ФІНАНСУВАННЯ</div>
        <h2>Каталог грантів для бізнесу</h2>
        <p className="catalog-lead">
          Порівняйте напрями підтримки та перевірте прийом заяв на офіційній сторінці. Каталог допомагає зорієнтуватися; відповідність вашого бізнесу умовам ще не оцінюється.
        </p>

        <div className="catalog-controls">
          <input
            type="search"
            className="catalog-search"
            aria-label="Пошук грантових програм"
            placeholder="Пошук за назвою чи сферою (кав'ярня, виробництво, ветерани, агро)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="catalog-filters">
            {[
              { id: "all", label: "Всі програми" },
              { id: "erobota", label: "Власна справа" },
              { id: "veteran", label: "Для ветеранів" },
              { id: "production", label: "Виробництво" },
              { id: "agro", label: "Агро & Сади" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                className={filter === f.id ? "filter-chip active" : "filter-chip"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p role="status">Знайдено програм: {filtered.length}</p>
      {filtered.length === 0 && <p>За цим запитом програм немає. Змініть пошук або категорію.</p>}
      <div className="catalog-grid">
        {filtered.map((item) => (
          <article className="grant-card" key={item.id}>
            <div className="grant-card-top">
              <span className="grant-badge">{item.categoryLabel}</span>
              <span className="grant-amount">{item.amount}</span>
            </div>

            <h3 className="grant-card-title">{item.title}</h3>
            <div className="grant-provider">{item.provider}</div>
            <p className="grant-intake-status"><strong>{item.intakeStatus === "paused" ? "Прийом призупинено" : "Прийом не підтверджено"}</strong> · Перевірено {item.checkedAt}</p>

            <p className="grant-card-desc">{item.summary}</p>

            <div className="grant-details-box">
              <div className="grant-detail-row">
                <strong>Ключова умова:</strong>
                <span>{item.keyCondition}</span>
              </div>
              <div className="grant-detail-row">
                <strong>Для кого:</strong>
                <span>{item.targetAudience}</span>
              </div>
              <div className="grant-detail-row">
                <strong>Дедлайн:</strong>
                <span>{item.deadline}</span>
              </div>
            </div>

            <div className="grant-card-footer">
              <button
                type="button"
                className="primary apply-grant-btn"
                onClick={() => onApplyProgram?.(item)}
              >
                Використати як орієнтир <span>↗</span>
              </button>
              <a
                href={item.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link official-link"
              >
                Офіційні умови ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
