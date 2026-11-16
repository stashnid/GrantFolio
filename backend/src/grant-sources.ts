import { isGrantAvailable } from "./grant-availability.js";
import { GRANT_CATALOG } from "./grant-catalog-data.js";

/** Curated observations, not verified eligibility rules or an official form. */
export function getGrantSourceContext(
  programId = "vlasna-sprava",
  now = new Date(),
) {
  const program =
    GRANT_CATALOG.find((item) => item.id === programId) ?? GRANT_CATALOG[0];
  return {
    program: program.title,
    checkedAt: program.checkedAt,
    currentRoundOpen: isGrantAvailable(program, now),
    intakeVerification: program.availability ?? null,
    eligibilityRulesReviewed: false,
    officialFormReviewed: false,
    sources: program.details.sources.map((item) => ({
      ...item,
      observations: [
        program.amount,
        `${isGrantAvailable(program, now) ? "Поточний" : "Останній відомий"} дедлайн: ${program.availability?.deadlineAt ?? (program.availability?.rolling ? "постійний прийом" : "невідомий")}`,
        ...program.details.documents,
        ...program.details.costs,
        ...program.details.unresolved,
      ],
    })),
  };
}
export const grantSourceContext = getGrantSourceContext();

export type ProgramDetails = {
  id: string;
  title: string;
  provider: string;
  documents: string[];
  steps: string[];
  /** Display/planning reference only; zero means no verified numerical reference. Never an eligibility cap. */
  maxAmountKopecks: number;
  amountLabel: string;
  jobRequirement: string;
  coFinancing: string;
  allowedCosts: string[];
  officialUrl: string;
  notes: string[];
};

/** Kept for chat compatibility; derived from the same catalog displayed to users. */
export const SUPPORTED_PROGRAMS: Record<string, ProgramDetails> =
  Object.fromEntries(
    GRANT_CATALOG.map((program) => [
      program.id,
      {
        id: program.id,
        title: program.title,
        provider: program.provider,
        documents: program.details.documents,
        steps: program.details.steps,
        maxAmountKopecks: program.planningLimitKopecks ?? 0,
        amountLabel: program.amount,
        jobRequirement: program.details.obligations.join(" "),
        coFinancing: program.details.funding.join(" "),
        allowedCosts: program.details.costs,
        officialUrl: program.officialUrl,
        notes: [
          `Статус прийому: ${program.intakeStatus}; перевірено ${program.checkedAt}. ${program.deadline}`,
          ...program.details.eligibility,
          ...program.details.exclusions,
          ...program.details.documents,
          ...program.details.steps,
          ...program.details.timing,
          ...program.details.pitfalls,
          ...program.details.unresolved,
          "Суми є довідковими, а не автоматичним рішенням про право на грант.",
        ],
      },
    ]),
  );

export function getProgramDetails(programId: string): ProgramDetails {
  const p = GRANT_CATALOG.find((p) => p.id === programId) ?? GRANT_CATALOG[0];
  return {
    ...SUPPORTED_PROGRAMS[p.id],
    id: p.id,
    title: p.title,
    provider: p.provider,
    documents: p.details.documents,
    steps: p.details.steps,
    maxAmountKopecks: p.planningLimitKopecks ?? 0,
    amountLabel: p.amount,
    jobRequirement: p.details.obligations.join(" "),
    coFinancing: p.details.funding.join(" "),
    allowedCosts: p.details.costs,
    officialUrl: p.officialUrl,
    notes: [
      ...p.details.eligibility,
      ...p.details.exclusions,
      ...p.details.timing,
      ...p.details.pitfalls,
      ...p.details.unresolved,
      `Прийом зараз: ${isGrantAvailable(p) ? "відкрито за перевіреним джерелом" : "не підтверджено як відкритий"}. Дедлайн: ${p.availability?.deadlineAt ?? (p.availability?.rolling ? "постійний прийом" : "невідомий")}.`,
      `Сума програми: ${p.amount}. Робочий кошторис у GrantFolio — у гривнях; автоматичної конвертації валют немає.`,
    ],
  };
}
