import { useState } from "react";

export type GrantProgram = {
  id: string;
  title: string;
  provider: string;
  amount: string;
  deadline: string;
  category: "erobota" | "veteran" | "production" | "agro" | "international";
  categoryLabel: string;
  targetAudience: string;
  keyCondition: string;
  summary: string;
  eligibleCosts: string[];
  officialUrl: string;
};

export const GRANT_PROGRAMS: GrantProgram[] = [
  {
    id: "vlasna-sprava",
    title: "Власна справа: мікрогрант для старту та розвитку бізнесу",
    provider: "єРобота / Міністерство економіки України",
    amount: "до 250 000 грн",
    deadline: "Постійно (хвилями кожні 2 тижні)",
    category: "erobota",
    categoryLabel: "єРобота",
    targetAudience: "Діючі ФОП, юридичні особи або громадяни без підприємницького досвіду",
    keyCondition: "Створення 1 робочого місця (до 150 тис. грн) або 2 робочих місць (до 250 тис. грн)",
    summary:
      "Найпопулярніша державна програма безповоротних мікрогрантів. Кошти повертаються державі виключно сплаченими податками та зборами за працевлаштованих працівників протягом 3 років.",
    eligibleCosts: [
      "Придбання меблів, обладнання та техніки",
      "Оренда приміщення (до 25% від суми гранту)",
      "Закупівля сировини та матеріалів (до 50%)",
      "Послуги маркетингу та реклами",
      "Ліцензійне програмне забезпечення / каса / ПРРО",
    ],
    officialUrl: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
  },
  {
    id: "veteran-grant",
    title: "Грант для ветеранів, ветеранок та другого з подружжя",
    provider: "єРобота / Міністерство у справах ветеранів",
    amount: "до 1 000 000 грн",
    deadline: "Постійно (хвилями кожні 2 тижні)",
    category: "veteran",
    categoryLabel: "Ветерани",
    targetAudience: "Учасники бойових дій, особи з інвалідністю внаслідок війни та їхні дружини/чоловіки",
    keyCondition: "Створення від 1 до 4 робочих місць залежно від розміру гранту",
    summary:
      "Державна підтримка ветеранського бізнесу. До 250 тис. грн — для ветеранів (1 місце), до 500 тис. грн — для подружжя (2 місця), до 1 млн грн — для ветеранів ФОП понад 3 роки (4 місця за умови 30% співфінансування).",
    eligibleCosts: [
      "Придбання устаткування та обладнання",
      "Оренда приміщення та землі",
      "Маркетинг, реклама, франшиза",
      "Сировина та витратні матеріали",
    ],
    officialUrl: "https://diia.gov.ua/services/grant-dlya-veteraniv-ta-chleniv-yihnih-simej",
  },
  {
    id: "processing-business",
    title: "Грант на створення або розвиток переробного підприємства",
    provider: "єРобота / Мінекономіки",
    amount: "до 8 000 000 грн",
    deadline: "Періодичні хвилі прийому",
    category: "production",
    categoryLabel: "Виробництво",
    targetAudience: "Підприємства у сфері переробної промисловості (харчова, меблева, деревообробка, металообробка тощо)",
    keyCondition: "Створення від 25 робочих місць; співфінансування 50/50 (для деокупованих територій 80/20)",
    summary:
      "Масштабний державний грант на модернізацію виробництв, закупівлю сучасних технологічних ліній, верстатів та промислового устаткування.",
    eligibleCosts: [
      "Придбання основних засобів виробництва (верстати, лінії)",
      "Доставка та введення в експлуатацію обладнання",
    ],
    officialUrl: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
  },
  {
    id: "agro-gardens",
    title: "Грант на висадку саду, ягідника або будівництво теплиці",
    provider: "єРобота / Мінагрополітики",
    amount: "до 10 000 000 грн",
    deadline: "Сезонні хвилі",
    category: "agro",
    categoryLabel: "Агро",
    targetAudience: "ФОП та юридичні особи, що ведуть діяльність у сфері сільськогосподарського виробництва",
    keyCondition: "Створення робочих місць, наявність земельної ділянки у власності чи оренді від 7 років",
    summary:
      "Державна підтримка агровиробників для закладки яблуневих, горіхових, ягідних садів (до 400 тис. грн/га) або зведення модульних теплиць площею від 0,4 га до 2,4 га.",
    eligibleCosts: [
      "Оплата рахунків за саджанці, системи поливу",
      "Будівництво теплиць, монтажні роботи",
    ],
    officialUrl: "https://diia.gov.ua/services/grant-na-sad",
  },
  {
    id: "usaid-competitive",
    title: "Програма USAID «Конкурентоспроможна економіка України»",
    provider: "USAID (Агентство США з міжнародного розвитку)",
    amount: "від $50 000 до $150 000",
    deadline: "Згідно з окремими грантовими конкурсами",
    category: "international",
    categoryLabel: "Міжнародні",
    targetAudience: "Малий та середній бізнес, що масштабується, виходить на експорт або впроваджує інновації",
    keyCondition: "Співфінансування та підтверджений потенціал зростання продажів/експорту",
    summary:
      "Гранти для підтримки українських виробників, автоматизації, виходу на ринки ЄС та США, а також підтримки жіночого та ветеранського підприємництва.",
    eligibleCosts: [
      "Міжнародна сертифікація та патентування",
      "Участь у закордонних торгових виставках",
      "Придбання високоефективного обладнання",
      "Цифровізація бізнес-процесів",
    ],
    officialUrl: "https://chemonics.submittable.com/submit",
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
        <div className="catalog-eyebrow">АКТУАЛЬНІ ГРАНТОВІ МОЖЛИВОСТІ</div>
        <h2>Каталог грантів для бізнесу</h2>
        <p className="catalog-lead">
          Оберіть програму фінансування для вашого бізнесу. Наш ШІ-консультант допоможе адаптувати проєкт та розрахувати бюджет під обрану програму.
        </p>

        <div className="catalog-controls">
          <input
            type="search"
            className="catalog-search"
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
              { id: "international", label: "Міжнародні (USAID)" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={filter === f.id ? "filter-chip active" : "filter-chip"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="catalog-grid">
        {filtered.map((item) => (
          <article className="grant-card" key={item.id}>
            <div className="grant-card-top">
              <span className="grant-badge">{item.categoryLabel}</span>
              <span className="grant-amount">{item.amount}</span>
            </div>

            <h3 className="grant-card-title">{item.title}</h3>
            <div className="grant-provider">🏛 {item.provider}</div>

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
                Приміряти мій проєкт <span>↗</span>
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
