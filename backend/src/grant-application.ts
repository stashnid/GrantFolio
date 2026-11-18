import { z } from "zod";

const applicationText = z.string().trim().min(1).max(3000);
const amount = z.number().int().min(0).max(1_000_000_000_000);
const jobs = z.number().int().min(0).max(1_000_000);

export const grantApplicationAnswersSchema = z.object({
  track: z.enum(["start", "scale"]),
  applicantType: z.enum(["individual", "entrepreneur", "legal_entity"]),
  location: applicationText,
  activity: applicationText,
  requestedGrantKopecks: amount.min(1),
  ownContributionKopecks: amount,
  newJobs: jobs,
  existingJobs: jobs,
  monthsInBusiness: z.number().int().min(0).max(1200),
  marketEvidence: applicationText,
  financialAssumptions: applicationText,
  quoteEvidence: applicationText,
  permits: applicationText,
  staffingPlan: applicationText,
  projectRisks: applicationText,
  expectedImpact: applicationText,
  landArea: z.number().min(0.01).max(1000),
  landTenure: z.enum(["owned", "lease"]),
  landUseYears: z.number().int().min(0).max(100),
  cropType: z.enum(["grape", "other"]),
  cropPlan: applicationText,
  irrigationPlan: applicationText,
  plantingDocument: z.enum(["prepared", "pending"]),
  confirmAccuracy: z.boolean(),
}).partial().strict();

export type GrantApplicationAnswers = z.infer<typeof grantApplicationAnswersSchema>;
type Field = keyof GrantApplicationAnswers;
export type GrantApplicationQuestion = {
  id: Field;
  label: string;
  prompt: string;
  kind: "select" | "text" | "money" | "integer" | "decimal" | "confirmation";
  options?: { value: string; label: string }[];
  value?: string | number | boolean;
  suggestion?: string;
  source?: string;
  required: true;
};
export type GrantApplicationIssue = {
  code: string;
  field?: Field;
  message: string;
  severity: "blocking" | "review";
};
export type GrantApplicationContext = {
  businessName?: string;
  region?: string;
  city?: string;
  legalForm?: string;
  kved?: string;
  budgetTotalKopecks?: number | string | null;
  details?: {
    projectDescription?: string;
    customers?: string;
    salesChannels?: string;
    implementationPlan?: string;
    expectedResults?: string;
  };
};
export type GrantApplicationReview = {
  programId: string;
  version: string;
  title: string;
  officialUrl: string;
  submission: string;
  stage: "collecting" | "review";
  questions: GrantApplicationQuestion[];
  nextQuestion: GrantApplicationQuestion | null;
  issues: GrantApplicationIssue[];
  financials: {
    budgetTotalKopecks: number | null;
    requestedGrantKopecks: number | null;
    ownContributionKopecks: number | null;
    uncoveredKopecks: number | null;
  };
  readyForReview: boolean;
};

const vlasnaSpravaUrl = "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy";
const vlasnaSpravaTerms = "https://madeinukraine.gov.ua/vlasna-sprava";
const vlasnaSpravaOrder = "https://zakon.rada.gov.ua/laws/show/738-2022-%D0%BF#Text";
const vlasnaSpravaAmendment = "https://zakon.rada.gov.ua/laws/show/1214-2026-%D0%BF";
const businessPlanFields = "https://www.kmu.gov.ua/storage/app/uploads/public/692/86a/c04/69286ac041860154859493.pdf";

type Program = {
  version: string;
  title: string;
  officialUrl: string;
  submission: string;
  questions: readonly (GrantApplicationQuestion & { when?: (answers: GrantApplicationAnswers) => boolean })[];
  validate(answers: GrantApplicationAnswers, budgetTotalKopecks: number | null): GrantApplicationIssue[];
};

const vlasnaSprava: Program = {
  version: "vlasna-sprava-2026-11-18.1",
  title: "Власна справа 2.0",
  officialUrl: vlasnaSpravaUrl,
  submission: "Для електронного подання бізнес-плану потрібні XLSX і відповідний PDF. У Дії також заповнюють заяву, обирають банк і підписують подання.",
  questions: [
    { id: "track", label: "Напрям гранту", prompt: "Ви запускаєте нову справу чи масштабуєте чинний бізнес?", kind: "select", options: [{value: "start", label: "Започаткування"}, {value: "scale", label: "Масштабування"}], source: vlasnaSpravaTerms, required: true },
    { id: "applicantType", label: "Тип заявника", prompt: "У якому статусі ви подаєте заявку?", kind: "select", options: [{value: "individual", label: "Фізична особа"}, {value: "entrepreneur", label: "ФОП"}, {value: "legal_entity", label: "Юридична особа"}], source: vlasnaSpravaUrl, required: true },
    { id: "location", label: "Місце діяльності", prompt: "У якому населеному пункті й області працюватиме бізнес?", kind: "text", source: vlasnaSpravaOrder, required: true },
    { id: "activity", label: "Діяльність і КВЕД", prompt: "Який продукт або послугу ви пропонуєте і який КВЕД плануєте застосувати? Якщо КВЕД ще не звірено, зазначте це.", kind: "text", source: vlasnaSpravaOrder, required: true },
    { id: "monthsInBusiness", label: "Тривалість діяльності", prompt: "Скільки повних місяців ви провадите підприємницьку діяльність, яку плануєте масштабувати?", kind: "integer", source: vlasnaSpravaAmendment, required: true },
    { id: "existingJobs", label: "Чинні робочі місця", prompt: "Скільки працівників уже офіційно працюють у бізнесі, який ви масштабуєте?", kind: "integer", required: true },
    { id: "newJobs", label: "Нові робочі місця", prompt: "Скільки нових робочих місць ви плануєте створити у межах проєкту?", kind: "integer", source: vlasnaSpravaOrder, required: true },
    { id: "staffingPlan", label: "Кадровий план", prompt: "Які посади та зарплати заплановані, коли найматимете працівників і з чого сплачуватимете зарплати?", kind: "text", source: businessPlanFields, required: true },
    { id: "marketEvidence", label: "Підтвердження попиту", prompt: "Що підтверджує попит, наприклад замовлення, переговори з клієнтами або результати перевірки попиту? Укажіть, які припущення ще потрібно перевірити.", kind: "text", required: true },
    { id: "financialAssumptions", label: "Припущення фінансового плану", prompt: "На чому ґрунтується прогноз продажів і витрат? Опишіть очікуваний обсяг продажів, ціни та регулярні витрати. Позначте неперевірені цифри як припущення.", kind: "text", required: true },
    { id: "quoteEvidence", label: "Обґрунтування цін", prompt: "Якими пропозиціями постачальників або іншими даними ви обґрунтували ціни в кошторисі? Позначте позиції, для яких ціни ще потрібно підтвердити.", kind: "text", required: true },
    { id: "permits", label: "Дозволи й ліцензії", prompt: "Які дозволи чи ліцензії потрібні для вашої діяльності? Укажіть їхній стан або зазначте, що питання ще потребує перевірки.", kind: "text", source: businessPlanFields, required: true },
    { id: "projectRisks", label: "Ризики та дії", prompt: "Що може затримати запуск або знизити доходи? Опишіть заходи на випадок кожного суттєвого ризику.", kind: "text", source: businessPlanFields, required: true },
    { id: "expectedImpact", label: "Вплив проєкту", prompt: "Який вплив матиме проєкт на працевлаштування, громаду й надходження до бюджету? Якщо є оцінка, поясніть її припущення.", kind: "text", source: businessPlanFields, required: true },
    { id: "requestedGrantKopecks", label: "Очікувана сума гранту", prompt: "Яку суму гранту ви плануєте запросити, у гривнях?", kind: "money", source: vlasnaSpravaTerms, required: true },
    { id: "ownContributionKopecks", label: "Власне фінансування", prompt: "Яку суму витрат ви покриєте власними коштами, у гривнях? Вкажіть 0, якщо власний внесок не заплановано.", kind: "money", required: true },
    { id: "confirmAccuracy", label: "Підтвердження відповідей", prompt: "Підтвердіть, що перевірили відповіді та позначили неперевірені відомості.", kind: "confirmation", required: true },
  ],
  validate(answers) {
    const result: GrantApplicationIssue[] = [];
    if (answers.track === "scale" && answers.newJobs === 0) {
      result.push({ code: "scale_new_job_required", field: "newJobs", severity: "blocking", message: "Для масштабування програмою передбачено щонайменше одне нове робоче місце." });
    }
    if (answers.track === "scale" && answers.monthsInBusiness !== undefined && answers.monthsInBusiness < 6) {
      result.push({ code: "scale_activity_duration", field: "monthsInBusiness", severity: "blocking", message: "Для масштабування перевірте вимогу щонайменше шести місяців фактичної підприємницької діяльності до подання." });
    }
    const maximum = answers.track === "start" ? 50_000_000 : answers.track === "scale" ? 250_000_000 : null;
    if (maximum !== null && answers.requestedGrantKopecks !== undefined && answers.requestedGrantKopecks > maximum) {
      result.push({ code: "grant_exceeds_published_maximum", field: "requestedGrantKopecks", severity: "blocking", message: "Запитувана сума перевищує оприлюднений максимум для вибраного напряму з урахуванням надбавок." });
    }
    const baseMaximum = answers.track === "start" ? 30_000_000 : answers.track === "scale" ? 150_000_000 : null;
    if (baseMaximum !== null && maximum !== null && answers.requestedGrantKopecks !== undefined && answers.requestedGrantKopecks > baseMaximum && answers.requestedGrantKopecks <= maximum) {
      result.push({ code: "verify_grant_bonus", field: "requestedGrantKopecks", severity: "review", message: "Сума перевищує базовий максимум. Звірте підстави для надбавок із правилами програми." });
    }
    return result;
  },
};

const gardenUrl = "https://diia.gov.ua/services/grant-na-sad";
const garden: Program = {
  version: "agro-gardens-2026-11-18.1",
  title: "Грант на сад",
  officialUrl: gardenUrl,
  submission: "До онлайн-заяви додають скан проєкту висадки з підписом його розробника. Перед поданням перевірте статус прийому в Дії.",
  questions: [
    { id: "applicantType", label: "Тип заявника", prompt: "У якому статусі ви плануєте подавати заявку?", kind: "select", options: [{ value: "entrepreneur", label: "ФОП" }, { value: "legal_entity", label: "Юридична особа" }], source: gardenUrl, required: true },
    { id: "location", label: "Місце висадки", prompt: "Де розташована ділянка або суміжні ділянки для висадки?", kind: "text", source: gardenUrl, required: true },
    { id: "landArea", label: "Площа висадки", prompt: "Яка сумарна площа висадки в гектарах?", kind: "decimal", source: gardenUrl, required: true },
    { id: "landTenure", label: "Право на ділянку", prompt: "На якій підставі ви користуєтеся землею?", kind: "select", options: [{ value: "owned", label: "Власність" }, { value: "lease", label: "Оренда чи інше правокористування" }], source: gardenUrl, required: true },
    { id: "landUseYears", label: "Строк користування", prompt: "Скільки повних років чинного права користування залишиться на дату подання?", kind: "integer", source: gardenUrl, required: true, when: a => a.landTenure === "lease" },
    { id: "cropType", label: "Група культури", prompt: "Чи проєкт передбачає висадку лише винограду?", kind: "select", options: [{ value: "grape", label: "Лише виноград" }, { value: "other", label: "Інша культура або змішана висадка" }], source: gardenUrl, required: true },
    { id: "cropPlan", label: "План висадки", prompt: "Які культури, сорти, щільність саджанців і шпалери передбачає проєкт висадки?", kind: "text", source: gardenUrl, required: true },
    { id: "irrigationPlan", label: "Зрошення та водозабір", prompt: "Яке зрошення та джерело водозабору передбачає проєкт?", kind: "text", source: gardenUrl, required: true, when: a => a.cropType === "other" },
    { id: "newJobs", label: "Робочі місця", prompt: "Скільки робочих місць заплановано за нормами для вашої культури та площі?", kind: "integer", source: gardenUrl, required: true },
    { id: "requestedGrantKopecks", label: "Очікувана сума гранту", prompt: "Скільки гривень ви плануєте запросити на висадку?", kind: "money", source: gardenUrl, required: true },
    { id: "ownContributionKopecks", label: "Власне фінансування", prompt: "Яку суму витрат ви покриєте власними коштами, у гривнях?", kind: "money", source: gardenUrl, required: true },
    { id: "plantingDocument", label: "Підписаний проєкт висадки", prompt: "Чи підготував і підписав розробник проєкт висадки з усіма потрібними розділами?", kind: "select", options: [{ value: "prepared", label: "Так" }, { value: "pending", label: "Ще готується" }], source: gardenUrl, required: true },
    { id: "confirmAccuracy", label: "Підтвердження відповідей", prompt: "Підтвердіть, що звірили відповіді та зафіксували дані для перевірки.", kind: "confirmation", required: true },
  ],
  validate(answers, budget) {
    const issues: GrantApplicationIssue[] = [];
    if (answers.applicantType === "individual") issues.push({ code: "garden_applicant", field: "applicantType", severity: "blocking", message: "Дія приймає заяви від ФОП або юридичних осіб." });
    if (answers.landArea !== undefined && (answers.landArea < 1 || answers.landArea > 25)) issues.push({ code: "garden_area", field: "landArea", severity: "blocking", message: "Площа висадки має бути від 1 до 25 гектарів. Для окремих культур діють додаткові обмеження." });
    if (answers.landTenure === "lease" && answers.landUseYears !== undefined && answers.landUseYears < 7) issues.push({ code: "garden_land_term", field: "landUseYears", severity: "blocking", message: "Для користування землею потрібен строк щонайменше сім років на дату подання." });
    if (budget !== null && answers.requestedGrantKopecks !== undefined && BigInt(answers.requestedGrantKopecks) * 10n > BigInt(budget) * 7n) issues.push({ code: "garden_grant_share", field: "requestedGrantKopecks", severity: "blocking", message: "Грант не може перевищувати 70% вартості проєкту висадки." });
    if (answers.plantingDocument === "pending") issues.push({ code: "garden_signed_plan", field: "plantingDocument", severity: "blocking", message: "Потрібен проєкт висадки, підписаний його розробником." });
    return issues;
  },
};

const programs: ReadonlyMap<string, Program> = new Map([["vlasna-sprava", vlasnaSprava], ["agro-gardens", garden]]);
export const grantApplicationVersions = Object.fromEntries(Array.from(programs, ([id, rules]) => [id, rules.version]));
const caseFields = ["projectDescription", "customers", "salesChannels", "implementationPlan", "expectedResults"] as const;

function savedBudgetTotal(context: GrantApplicationContext): number | null {
  const raw = context.budgetTotalKopecks;
  if (raw === null || raw === undefined || (typeof raw === "string" && !/^\d+$/.test(raw))) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function getGrantApplication(
  programId: string | null | undefined,
  answers: GrantApplicationAnswers,
  context: GrantApplicationContext = {},
): GrantApplicationReview | null {
  if (!programId) return null;
  const program = programs.get(programId);
  if (!program) return null;

  const questions = program.questions
    .filter(question => question.when?.(answers) ?? true)
    .filter(({ id }) => (id !== "existingJobs" && id !== "monthsInBusiness") || answers.track === "scale")
    .filter(({ id }) => id !== "staffingPlan" || (answers.newJobs ?? 0) > 0 || answers.track === "scale")
    .map(({ when: _when, ...question }): GrantApplicationQuestion => {
      const locations = [context.city?.trim(), context.region?.trim()].filter(Boolean);
      const applicant = context.legalForm === "fop" ? "entrepreneur" : context.legalForm === "company" || context.legalForm === "ngo" ? "legal_entity" : undefined;
      const suggestion = question.id === "location" ? [...new Set(locations)].join(", ")
        : question.id === "applicantType" ? applicant : question.id === "activity" && context.kved ? `КВЕД: ${context.kved}` : undefined;
      return { ...question, value: answers[question.id], ...(suggestion ? { suggestion } : {}) };
    });
  const nextQuestion = questions.find(({ id, value }) => id === "confirmAccuracy" ? value !== true : value === undefined) ?? null;
  const budgetTotalKopecks = savedBudgetTotal(context);
  const issues = program.validate(answers, budgetTotalKopecks);
  const requestedGrantKopecks = answers.requestedGrantKopecks ?? null;
  const ownContributionKopecks = answers.ownContributionKopecks ?? null;
  const uncoveredKopecks = budgetTotalKopecks !== null && requestedGrantKopecks !== null && ownContributionKopecks !== null
    ? budgetTotalKopecks - requestedGrantKopecks - ownContributionKopecks
    : null;

  if (context.details && caseFields.some((field) => !context.details?.[field]?.trim())) {
    issues.push({ code: "case_details_incomplete", severity: "blocking", message: "Заповніть і збережіть опис, клієнтів, канали продажу, план реалізації та очікувані результати проєкту." });
  }
  if (!budgetTotalKopecks) {
    issues.push({ code: "case_budget_missing", severity: "blocking", message: "Збережіть кошторис проєкту з ненульовою сумою." });
  } else if (uncoveredKopecks !== null && uncoveredKopecks !== 0) {
    issues.push({
      code: "funding_does_not_match_budget",
      field: "ownContributionKopecks",
      severity: "blocking",
      message: uncoveredKopecks > 0
        ? "Запитуваний грант і власний внесок не покривають збережених витрат."
        : "Запитуваний грант і власний внесок разом перевищують збережені витрати.",
    });
  }
  const readyForReview = nextQuestion === null && issues.every(({ severity }) => severity !== "blocking");
  return {
    programId,
    version: program.version,
    title: program.title,
    officialUrl: program.officialUrl,
    submission: program.submission,
    stage: nextQuestion === null ? "review" : "collecting",
    questions,
    nextQuestion,
    issues,
    financials: { budgetTotalKopecks, requestedGrantKopecks, ownContributionKopecks, uncoveredKopecks },
    readyForReview,
  };
}
