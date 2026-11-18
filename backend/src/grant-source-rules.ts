export type GrantSourceRule = {
  programId: string;
  url: string;
  requiredText: string;
  closedPatterns?: string[];
  openPattern?: string;
  deadlinePattern?: string;
  rolling?: boolean;
  schedule?: boolean;
  suspensionUrl?: string;
  suspensionRequiredText?: string;
  suspensionClosedPattern?: string;
  suspensionOpenDeadlinePattern?: string;
};
export const GRANT_SOURCE_RULES: GrantSourceRule[] = [
  {
    programId: "vlasna-sprava",
    url: "https://zakon.rada.gov.ua/laws/show/z1185-26",
    requiredText:
      "Кінцеві строки подання заяв на отримання гранту на започаткування або масштабування власної справи в межах календарного року",
    schedule: true,
    suspensionUrl:
      "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
    suspensionRequiredText: "Започаткування та масштабування власної справи",
    suspensionClosedPattern:
      "Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено",
    suspensionOpenDeadlinePattern:
      "поточний етап прийому заявок триває до (\\d{1,2}\\s+[а-яіїєґ]+\\s+20\\d{2})",
  },
  {
    programId: "uvf-reimbursement",
    url: "https://veteranfund.com.ua/projects/20000-2/",
    requiredText: "Проєкт діятиме до завершення воєнного стану",
    openPattern: "Проєкт діятиме до завершення воєнного стану",
    rolling: true,
    closedPatterns: ["прийом заяв(?:ок)? (?:завершено|призупинено)"],
  },
  {
    programId: "bloom-sme",
    url: "https://poda.gov.ua/news/283514",
    requiredText: "Дедлайн подання заявок продовжено",
    openPattern: "Дедлайн подання заявок продовжено",
    deadlinePattern:
      "Дедлайн подання заявок продовжено до (\\d{1,2}\\s+[а-яіїєґ]+\\s+20\\d{2})",
  },
  {
    programId: "eit-sme-expansion",
    url: "https://www.eiturbanmobility.eu/call-for-proposals/sme-market-expansion-open-call-2027/",
    requiredText: "Call closing",
    openPattern: "Call closing",
    deadlinePattern:
      "Call closing\\s*\\(submission of completed application\\)\\s*:\\s*(\\d{1,2}\\s+[A-Za-z]+\\s+20\\d{2}\\s+at\\s+\\d{1,2}[.:]\\d{2}\\s+CE(?:ST|T))",
  },
  {
    programId: "govtech-pilots",
    url: "https://www.kyivgovtechcentre.org/govtech-lab-open-call-for-startups",
    requiredText: "Accepting applications until",
    openPattern: "Accepting applications until",
    deadlinePattern:
      "Accepting applications until ([A-Za-z]+\\s+\\d{1,2},?\\s+20\\d{2}\\s+at\\s+\\d{1,2}:\\d{2}\\s+Kyiv Time)",
  },
  {
    programId: "processing-business",
    url: "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
    requiredText: "Термін подачі:",
    closedPatterns: ["Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено"],
    openPattern: "поточний етап прийому заявок триває до",
    deadlinePattern:
      "поточний етап прийому заявок триває до (\\d{1,2}\\s+[а-яіїєґ]+\\s+20\\d{2})",
  },
  {
    programId: "agro-gardens",
    url: "https://diia.gov.ua/services/grant-na-sad",
    requiredText: "Грант на сад",
    closedPatterns: ["Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено"],
    openPattern: "Прийом заяв(?:ок)? (?:відкрито|триває)",
    deadlinePattern:
      "Прийом заяв(?:ок)? (?:відкрито|триває)[^.]{0,100}до (\\d{1,2}\\s+[а-яіїєґ]+\\s+20\\d{2})",
  },
  {
  "programId": "women-techeu-2-eic",
  "url": "https://womentecheurope.eu/frequently-asked-questions-wteu2/",
  "requiredText": "What are the Full Proposal submission dates?",
  "openPattern": "Submission deadline 6",
  "deadlinePattern": "Submission deadline 6:\\s*(14\\s+January\\s+2027,?\\s+17:00\\s+CET)",
  "closedPatterns": [
    "Applications are now closed",
    "call has been closed"
  ]
},
  {
  "programId": "eu-women-innovators-2027",
  "url": "https://www.eit.europa.eu/our-activities/opportunities/2027-european-prize-women-innovators-apply-now",
  "requiredText": "2027 European Prize for Women Innovators",
  "openPattern": "Apply now",
  "deadlinePattern": "(01/12/2026\\s+17[.:]00\\s*-\\s*CET)",
  "closedPatterns": [
    "Applications are now closed"
  ]
},
  {
  "programId": "eit-food-poc-2026",
  "url": "https://www.eitfood.eu/open-calls/proof-of-concept-co-financing-instrument-2",
  "requiredText": "EIT Food's Co-Financing Instrument",
  "openPattern": "Cutoff date",
  "deadlinePattern": "(30/11/2026\\s+12:00\\s+CET)",
  "closedPatterns": [
    "Applications are now closed"
  ]
},
];
