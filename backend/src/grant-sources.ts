/** Curated official-page observations, not a grant eligibility rules engine. */
export const grantSourceContext = {
  program: "Власна справа",
  checkedAt: "2026-11-15",
  currentRoundOpen: null,
  eligibilityRulesReviewed: false,
  officialFormReviewed: false,
  sources: [
    {
      url: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy/",
      title: "Започаткування та масштабування власної справи — Дія",
      observations: [
        "На офіційній сторінці наведено до 500 тис. грн для старту та до 2,5 млн грн для масштабування. Це опис напрямів, а не підтвердження права конкретного заявника.",
        "На перевіреній сторінці зазначено завершення етапу 27.10.2026. Чинний відкритий прийом не підтверджено.",
        "Онлайн-подання передбачає вхід до кабінету Дії, заповнення заявки, додавання бізнес-плану за формою у PDF і підписання електронним підписом.",
        "Офіційна сторінка містить посилання на приклад бізнес-плану. Вміст форми ще не звірено; TXT-чернетка GrantFolio не замінює цю форму.",
        "Серед напрямів витрат на сторінці наведено обладнання, оренду приміщень, цифровізацію, маркетинг та облаштування робочих місць. Дозволеність конкретної витрати потребує перевірки повних чинних правил.",
      ],
    },
  ],
} as const;

export type ProgramDetails = {
  id: string;
  title: string;
  provider: string;
  maxAmountKopecks: number;
  amountLabel: string;
  jobRequirement: string;
  coFinancing: string;
  allowedCosts: string[];
  officialUrl: string;
  notes: string[];
};

export const SUPPORTED_PROGRAMS: Record<string, ProgramDetails> = {
  "vlasna-sprava": {
    id: "vlasna-sprava",
    title: "Власна справа",
    provider: "Дія / Державний центр зайнятості",
    maxAmountKopecks: 25000000, // 250 000 грн (до 500 тис. грн у спецзонах)
    amountLabel: "до 250 000 грн (до 500 000 грн для прифронтових територій)",
    jobRequirement: "1 робоче місце для суми до 150 000 грн, 2 робочих місця для суми до 250 000 грн",
    coFinancing: "100% грант (без обов'язкового власного співфінансування)",
    allowedCosts: [
      "Придбання обладнання та техніки для бізнесу",
      "Оренда приміщення (не більше 25% від суми гранту)",
      "Закупівля сировини та матеріалів (не більше 50% від суми гранту)",
      "Маркетинг та реклама (не більше 10% від суми гранту)",
      "Лізинг обладнання, послуги зв'язку та ПРРО",
    ],
    officialUrl: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
    notes: [
      "Потрібно створити робочі місця протягом 6 місяців з дня отримання коштів.",
      "Повернення коштів відбувається через сплату податків та ЄСВ протягом 3 років.",
    ],
  },
  "veteran-grant": {
    id: "veteran-grant",
    title: "Грант для ветеранів та членів їхніх сімей",
    provider: "е-Ветеран / Дія / Державний центр зайнятості",
    maxAmountKopecks: 100000000, // 1 000 000 грн
    amountLabel: "до 250 000 грн, 500 000 грн або 1 000 000 грн",
    jobRequirement: "1 місце (до 250 тис.), 2 місця (до 500 тис.), 4 місця (до 1 млн грн)",
    coFinancing: "До 250 тис. — 100% грант; від 500 тис. до 1 млн — 70% грант / 30% власні кошти",
    allowedCosts: [
      "Придбання виробничого та технологічного обладнання",
      "Оренда приміщень та земельних ділянок (до 25%)",
      "Придбання сировини, матеріалів, комплектуючих",
      "Маркетинг, реклама та створення веб-сайту (до 10%)",
      "Придбання ліцензійного програмного забезпечення",
      "Франшиза",
    ],
    officialUrl: "https://eveteran.gov.ua/benefits/yerobota-grant-dlya-veteraniv-ta-chleniv-yihnih-simej-dlya-stvorennya-abo-rozvitku-veteranskogo-biznesu",
    notes: [
      "Учасники бойових дій або особи з інвалідністю внаслідок війни, а також їхні дружини/чоловіки.",
      "Для гранту на 1 млн грн необхідна реєстрація ФОП не менше 36 місяців до моменту подачі.",
    ],
  },
  "processing-business": {
    id: "processing-business",
    title: "Грант на переробне підприємство",
    provider: "Дія / Міністерство економіки України",
    maxAmountKopecks: 800000000, // 8 000 000 грн
    amountLabel: "до 8 000 000 грн (до 16 млн грн для відновлення)",
    jobRequirement: "Створення щонайменше 5-25 робочих місць залежно від суми",
    coFinancing: "50% грант / 50% власні кошти (або 70/30 для деокупованих територій)",
    allowedCosts: [
      "Придбання основних виробничих засобів (верстати, лінії, конвеєри)",
      "Доставка та введення в експлуатацію виробничого обладнання",
    ],
    officialUrl: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
    notes: [
      "Лише переробне виробництво (КВЕД секції С: харчова, деревообробна, меблева, металообробка тощо).",
      "Суворе цільове використання коштів тільки на виробничі активи.",
    ],
  },
  "agro-gardens": {
    id: "agro-gardens",
    title: "Грант на сад, ягідник або виноградник",
    provider: "Дія / Мінагрополітики",
    maxAmountKopecks: 1000000000, // 10 000 000 грн
    amountLabel: "до 400 000 грн за 1 гектар (до 10 млн грн сумарно)",
    jobRequirement: "Постійні працівники (від 5-10 осіб) та сезонні робітники",
    coFinancing: "70% грант / 30% власні кошти",
    allowedCosts: [
      "Придбання саджанців та посадкового матеріалу",
      "Встановлення систем крапельного зрошення та поливу",
      "Встановлення шпалер та опорних конструкцій",
    ],
    officialUrl: "https://diia.gov.ua/services/grant-na-sad",
    notes: [
      "Обов'язкова наявність затвердженого проєкту висадки насаджень від сертифікованого розробника.",
      "Наявність права власності або користування землею щонайменше на 7 років.",
    ],
  },
};

export function getProgramDetails(programId: string): ProgramDetails {
  return SUPPORTED_PROGRAMS[programId] ?? SUPPORTED_PROGRAMS["vlasna-sprava"];
}
