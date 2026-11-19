import { programPlaybookSchema, type ProgramPlaybook } from "./schema.js";

const observedOn = "2026-11-19";
const cabinet616 = {
  id: "cabinet-616",
  title: "Постанова КМУ № 616",
  url: "https://zakon.rada.gov.ua/laws/show/616-2026-%D0%BF",
  observedOn,
  issuedOn: "2026-05-15",
  effectiveOn: "2026-09-01",
  version: "Постанова від 15.05.2026, дата застосування нового порядку",
  kind: "law",
} as const;

const cabinet1214 = {
  id: "cabinet-1214",
  title: "Постанова КМУ № 1214",
  url: "https://zakon.rada.gov.ua/laws/show/1214-2026-%D0%BF",
  observedOn,
  issuedOn: "2026-09-30",
  effectiveOn: "2026-10-06",
  version: "Постанова від 30.09.2026",
  kind: "law",
} as const;

const vlasna: ProgramPlaybook = {
  programId: "vlasna-sprava",
  rulesVersion: "vlasna-sprava-2026-10-06",
  observedOn,
  supportTier: "deep",
  lifecycle: "current",
  capabilities: {
    guidedPreparation: true,
    draftXlsx: true,
    draftPdf: true,
    officialPackageVerified: false,
  },
  sources: [
    cabinet616,
    cabinet1214,
    {
      id: "diia-vlasna",
      title: "Дія: Започаткування та масштабування власної справи",
      url: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
      observedOn,
      version: "Публічна сторінка, перевірена 19.11.2026",
      kind: "service",
    },
    {
      id: "dcz-vlasna",
      title: "Львівський ОЦЗ: Власна справа 2.0, питання та відповіді",
      url: "https://lviv.dcz.gov.ua/novyna/vlasna-sprava-20-pytannya-vidpovidi",
      observedOn,
      publishedOn: "2026-09-23",
      version: "Публікація від 23.09.2026",
      kind: "guidance",
    },
  ],
  intake: {
    status: "unconfirmed",
    observedOn,
    evidence: {
      sourceId: "diia-vlasna",
      provision:
        "Термін подачі: сторінка вказувала попередній етап до 27.10.2026",
    },
  },
  searchTags: [
    "започаткування бізнесу",
    "масштабування",
    "обладнання",
    "підприємництво ветеранів",
  ],
  searchSynonyms: ["Власна справа 2.0", "єРобота", "Vlasna sprava"],
  useCaseExamples: [
    "Відкрити кав’ярню та придбати обладнання",
    "Розширити діюче виробництво і створити робоче місце",
  ],
  tracks: [
    {
      id: "start",
      label: "Започаткування",
      periodsMonths: [24, 36, 60],
      minimumJobs: 0,
      minimumGrantKopecks: 10_000_000,
      baseMaximumGrantKopecks: 30_000_000,
      maximumGrantKopecks: 50_000_000,
      evidence: {
        sourceId: "cabinet-616",
        provision:
          "Новий порядок, пп. 6, 10. Гранична сума залежить від надбавок",
      },
    },
    {
      id: "scale",
      label: "Масштабування",
      periodsMonths: [24, 36, 60],
      minimumJobs: 1,
      minimumGrantKopecks: 50_000_000,
      baseMaximumGrantKopecks: 150_000_000,
      maximumGrantKopecks: 250_000_000,
      evidence: {
        sourceId: "cabinet-616",
        provision:
          "Новий порядок, пп. 6, 10. Гранична сума залежить від надбавок",
      },
    },
  ],
  budgetRules: [
    {
      category: "premises-land-rent",
      label: "Комерційна оренда приміщення або землі",
      limitBps: 2500,
      denominator: "grant",
      evidence: {
        sourceId: "cabinet-616",
        provision: "Новий порядок, п. 7, пп. 2",
      },
    },
    {
      category: "equipment-rent",
      label: "Оренда обладнання",
      limitBps: 1000,
      denominator: "grant",
      evidence: {
        sourceId: "cabinet-616",
        provision: "Новий порядок, п. 7, пп. 2",
      },
    },
    {
      category: "materials",
      label:
        "Сировина, матеріали, товари, послуги та інші закупівлі однієї групи",
      limitBps: 5000,
      denominator: "grant",
      evidence: {
        sourceId: "cabinet-616",
        provision: "Новий порядок, п. 7, пп. 1, сукупне обмеження",
      },
    },
    {
      category: "marketing-advertising",
      label: "Послуги маркетингу та реклами",
      limitBps: 1000,
      denominator: "grant",
      evidence: {
        sourceId: "cabinet-616",
        provision: "Новий порядок, п. 7, пп. 4",
      },
    },
    {
      category: "branding-content",
      label: "Дизайн, пакування і зазначені в порядку творчі послуги",
      limitBps: 5000,
      denominator: "grant",
      evidence: {
        sourceId: "cabinet-616",
        provision: "Новий порядок, п. 7, пп. 4, окрема категорія від реклами",
      },
    },
  ],
  rules: [
    {
      id: "tax-coverage",
      status: "verified",
      summary:
        "Оцінюються фактично сплачені застосовні податки, збори та ЄСВ за обраний строк реалізації. ПДВ не зараховується. Прогноз дає оцінку, а виконання підтверджується після фактичної сплати.",
      evidence: {
        sourceId: "dcz-vlasna",
        provision: "Які саме податки враховуються в закриття гранту",
      },
    },
    {
      id: "electronic-business-plan",
      status: "verified",
      summary:
        "Нормативна вимога до електронного бізнес-плану передбачає XLSX і PDF, сформований із цієї книги з однаковим змістом, структурою та розрахунками.",
      evidence: {
        sourceId: "cabinet-1214",
        provision: "Зміни, п. 2, доповнення до п. 3 Положення № 1527",
      },
    },
    {
      id: "portal-template-acceptance",
      status: "unknown",
      reason:
        "Сторінка Дії посилається на приклад і описує PDF; поведінку авторизованого порталу та приймання комплекту не перевірено.",
    },
  ],
  gaps: [
    "Потрібно звірити поточний раунд у Дії.",
    "Експорт є робочою чернеткою, перевірка приймання офіційного комплекту відсутня.",
    "Не всі ліміти, надбавки та винятки автоматизовані.",
  ],
};

const veteran: ProgramPlaybook = {
  programId: "veteran-grant",
  rulesVersion: "veteran-legacy-2026-10-06",
  observedOn,
  supportTier: "catalog_only",
  lifecycle: "legacy",
  successorProgramId: "vlasna-sprava",
  capabilities: {
    guidedPreparation: false,
    draftXlsx: false,
    draftPdf: false,
    officialPackageVerified: false,
  },
  sources: [
    cabinet616,
    cabinet1214,
    {
      id: "dcz-veteran",
      title: "Центр зайнятості: перехід до єдиної програми",
      url: "https://kr-rada.gov.ua/zagalna-informatsiya/kirovogradskiy-miskrayonniy-tsentr-zaynyatosti/vlacn-zhitl-prym",
      observedOn,
      version: "Публічна сторінка, перевірена 19.11.2026",
      kind: "guidance",
    },
  ],
  intake: {
    status: "closed",
    observedOn,
    evidence: {
      sourceId: "cabinet-616",
      provision:
        "Пункт 2: приймання заяв за попередніми порядками до 01.08.2026",
    },
  },
  searchTags: ["ветеранське підприємництво", "архівна програма"],
  searchSynonyms: [
    "Грант для ветеранів та членів їхніх сімей",
    "ветеранський грант єРобота",
  ],
  useCaseExamples: ["З’ясувати, що замінило окремий ветеранський грант"],
  tracks: [],
  budgetRules: [],
  rules: [
    {
      id: "legacy-contracts",
      status: "verified",
      summary:
        "Нові заявки за окремим порядком не приймаються. Щодо виданих грантів перевірте умови свого договору та застосовну редакцію правил. Для нового проєкту перегляньте Власну справу 2.0.",
      evidence: {
        sourceId: "dcz-veteran",
        provision:
          "Перехід від старих мікрогрантів та ветеранських грантів до Власної справи",
      },
    },
  ],
  gaps: [
    "Історичні пороги, робочі місця та співфінансування не застосовуються до нових заявок.",
  ],
};

const garden: ProgramPlaybook = {
  programId: "agro-gardens",
  rulesVersion: "garden-diia-2026-11-19",
  observedOn,
  supportTier: "deep",
  lifecycle: "current",
  capabilities: {
    guidedPreparation: true,
    draftXlsx: false,
    draftPdf: true,
    officialPackageVerified: false,
  },
  sources: [
    {
      id: "diia-garden",
      title: "Дія: Грант на сад",
      url: "https://diia.gov.ua/services/grant-na-sad",
      observedOn,
      version: "Публічна сторінка, перевірена 19.11.2026",
      kind: "service",
    },
  ],
  intake: {
    status: "paused",
    observedOn,
    evidence: {
      sourceId: "diia-garden",
      provision: "Попередження про призупинення прийому заяв",
    },
  },
  searchTags: ["садівництво", "ягідництво", "виноградарство", "проєкт висадки"],
  searchSynonyms: ["Свій сад", "грант на ягідник", "грант на виноградник"],
  useCaseExamples: [
    "Закласти новий яблуневий сад",
    "Підготувати проєкт висадки ягідника",
  ],
  tracks: [
    {
      id: "orchard",
      label: "Проєкт висадки насаджень",
      evidence: {
        sourceId: "diia-garden",
        provision: "Вимоги до проєкту висадки",
      },
    },
  ],
  budgetRules: [
    {
      category: "project-grant-share",
      label: "Частка гранту у вартості проєкту висадки",
      limitBps: 7000,
      denominator: "project",
      evidence: { sourceId: "diia-garden", provision: "Який розмір гранту" },
    },
  ],
  rules: [
    {
      id: "land",
      status: "verified",
      summary:
        "Загальна площа 1–25 га на одній або суміжних ділянках; право власності або користування на строк щонайменше 7 років на дату заяви.",
      evidence: {
        sourceId: "diia-garden",
        provision: "Площа, ділянки та оренда",
      },
    },
    {
      id: "funding-per-hectare",
      status: "verified",
      summary:
        "Офіційна сторінка наводить діапазон ₴140–400 тис. за гектар. Розрахунок залежить від культури та загальної вартості.",
      evidence: { sourceId: "diia-garden", provision: "Який розмір гранту" },
    },
    {
      id: "signed-project",
      status: "verified",
      summary:
        "До заявки потрібна копія проєкту висадки з підписом розробника. Зрошення з джерелом водозабору передбачено для культур, крім винограду.",
      evidence: {
        sourceId: "diia-garden",
        provision: "Як отримати послугу, крок 3",
      },
    },
    {
      id: "crop-employment",
      status: "unknown",
      reason:
        "Норма робочих місць залежить від культури та чинного додатка до порядку. Універсального мінімуму в playbook немає.",
    },
  ],
  gaps: [
    "Розробник готує та підписує проєкт висадки поза GrantFolio.",
    "Робочий PDF не замінює підписаний проєкт.",
  ],
};

const brave: ProgramPlaybook = {
  programId: "ua-brave1-core",
  rulesVersion: "brave1-directory-2026-11-19",
  observedOn,
  supportTier: "catalog_only",
  lifecycle: "directory",
  capabilities: {
    guidedPreparation: false,
    draftXlsx: false,
    draftPdf: false,
    officialPackageVerified: false,
  },
  sources: [
    {
      id: "brave-directory",
      title: "База можливостей Brave1",
      url: "https://ecosystem.brave1.tech/",
      observedOn,
      version: "Публічна довідка, перевірена 19.11.2026",
      kind: "organizer",
    },
  ],
  intake: {
    status: "unconfirmed",
    observedOn,
    evidence: {
      sourceId: "brave-directory",
      provision:
        "Наявність загальної довідки не підтверджує прийом заяв конкретного конкурсу",
    },
  },
  searchTags: ["Brave1", "оборонні інновації"],
  searchSynonyms: ["Брейв1", "Brave 1"],
  useCaseExamples: ["Знайти офіційну сторінку організатора Brave1"],
  tracks: [],
  budgetRules: [],
  rules: [
    {
      id: "directory-identity",
      status: "verified",
      summary:
        "Довідкова сторінка організатора Brave1 містить огляд програм і можливостей.",
      evidence: {
        sourceId: "brave-directory",
        provision: "Програма та можливості",
      },
    },
  ],
  gaps: [
    "Поточний прийом конкретного конкурсу не підтверджено.",
    "Доступна нейтральна інформація про програму та організатора.",
  ],
};

export const PLAYBOOKS: readonly ProgramPlaybook[] = Object.freeze(
  [vlasna, veteran, garden, brave].map((entry) =>
    programPlaybookSchema.parse(entry),
  ),
);
