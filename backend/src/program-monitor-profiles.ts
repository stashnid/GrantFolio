export type MonitorSourceType = "html" | "json_api" | "rss" | "law_calendar";

export type ProgramMonitorProfile = {
  programId: string;
  sourceUrl: string;
  sourceType: MonitorSourceType;
  language: "uk" | "en" | "uk-en";
  cadenceHours: number;
  suspensionUrl?: string;
  suspensionPattern?: string;
  focusAnchor?: string;
  extractionHints: string[];
  currency?: "UAH" | "EUR" | "USD";
  autoPromoteAvailability: boolean;
};

export const PROGRAM_MONITOR_PROFILES: readonly ProgramMonitorProfile[] = [
  {
    programId: "vlasna-sprava",
    sourceUrl: "https://zakon.rada.gov.ua/laws/show/z1185-26",
    sourceType: "law_calendar",
    language: "uk",
    cadenceHours: 12,
    suspensionUrl:
      "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy",
    suspensionPattern:
      "Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено",
    focusAnchor: "Кінцеві строки подання заяв",
    extractionHints: [
      "Look for the annual calendar table titled 'Кінцеві строки подання заяв на отримання гранту на започаткування або масштабування власної справи в межах календарного року' with month-by-month start and end day columns.",
      "Distinguish base vs maximum grant caps for startup ('започаткування') and scaling ('масштабування'), plus youth (18-25 years, +5%), veteran (+20%), and frontline oblast limits.",
      "Check application format requirements (Diia portal submission, official PDF business plan, electronic signature/КЕП) and job creation rules.",
    ],
    currency: "UAH",
    // The hourly grant sync compares the legal schedule with the service deadline.
    autoPromoteAvailability: false,
  },
  {
    programId: "processing-business",
    sourceUrl:
      "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
    sourceType: "html",
    language: "uk",
    cadenceHours: 12,
    suspensionUrl:
      "https://diia.gov.ua/services/grant-na-pererobne-pidpriyemstvo",
    suspensionPattern:
      "Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено",
    extractionHints: [
      "Check the 'Термін подачі:' block and phrases like 'поточний етап прийому заявок триває до ...' or temporary suspension banners.",
      "Extract maximum grant ceiling (up to 8M UAH or updated cap), co-financing split (standard vs deoccupied/frontline oblasts), and required processing KVED classes.",
      "Look for required documents in Diia (business plan, equipment invoices/specs, tax/credit history checks, job creation commitments).",
    ],
    currency: "UAH",
    autoPromoteAvailability: true,
  },
  {
    programId: "agro-gardens",
    sourceUrl: "https://diia.gov.ua/services/grant-na-sad",
    sourceType: "html",
    language: "uk",
    cadenceHours: 12,
    suspensionUrl: "https://diia.gov.ua/services/grant-na-sad",
    suspensionPattern:
      "Прийом заяв(?:ок)?\\s+(?:тимчасово\\s+)?призупинено",
    extractionHints: [
      "Look for intake open/paused banners ('Прийом заявок відкрито/триває до ...' or 'призупинено') on the Diia service page.",
      "Extract per-hectare grant ceilings, minimum/maximum orchard area (hectares), co-financing percentage, and land ownership/lease duration rules.",
      "Extract required project design documents (проєкт висадки насаджень, land title/lease proof, Diia online form).",
    ],
    currency: "UAH",
    autoPromoteAvailability: true,
  },
  {
    programId: "uvf-reimbursement",
    sourceUrl: "https://veteranfund.com.ua/projects/20000-2/",
    sourceType: "html",
    language: "uk",
    cadenceHours: 24,
    extractionHints: [
      "Check whether the rolling intake phrase 'Проєкт діятиме до завершення воєнного стану' is present or replaced by a closed/paused notice.",
      "Extract the fixed reimbursement ceiling (e.g. 20,000 UAH), eligible veteran/family categories (УБД, FOP/self-employed), and qualifying expense receipts.",
      "Look for required proofs: veteran status document, FOP registration extract, payment receipts/invoices, and online application form details.",
    ],
    currency: "UAH",
    autoPromoteAvailability: true,
  },
  {
    programId: "bloom-sme",
    sourceUrl: "https://poda.gov.ua/news/283514",
    sourceType: "html",
    language: "uk",
    cadenceHours: 24,
    extractionHints: [
      "Look for explicit deadline statements or extensions ('Дедлайн подання заявок продовжено до ...') in the regional announcement body.",
      "Extract eligible oblasts/hromadas, grant amount range, micro/SME eligibility criteria, and donor/implementing partner names.",
      "Note application portal link, registration form requirements, and business plan attachments.",
    ],
    currency: "USD",
    autoPromoteAvailability: true,
  },
  {
    programId: "eit-sme-expansion",
    sourceUrl:
      "https://www.eiturbanmobility.eu/call-for-proposals/sme-market-expansion-open-call-2027/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Look for 'Call closing (submission of completed application):' with exact date, time, and CET/CEST timezone.",
      "Extract funding ceiling per SME, co-funding rate, Horizon Europe associated-country eligibility (including Ukraine), and required TRL/commercial readiness.",
      "Extract submission portal instructions (EIT Urban Mobility NetSuite/PLAZA portal) and mandatory call manual documents.",
    ],
    currency: "EUR",
    autoPromoteAvailability: true,
  },
  {
    programId: "govtech-pilots",
    sourceUrl:
      "https://www.kyivgovtechcentre.org/govtech-lab-open-call-for-startups",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Look for 'Accepting applications until' with exact Kyiv Time deadline or closed-cohort notices.",
      "Extract pilot funding/grant support terms, startup stage/TRL criteria, Ukrainian/international GovTech eligibility, and public-sector challenge tracks.",
      "Check application format (online pitch form, deck, solution architecture) and required pilot readiness deliverables.",
    ],
    currency: "USD",
    autoPromoteAvailability: true,
  },
  {
    programId: "women-techeu-2-eic",
    sourceUrl:
      "https://womentecheurope.eu/frequently-asked-questions-wteu2/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    focusAnchor: "Submission deadline",
    extractionHints: [
      "Locate 'What are the Full Proposal submission dates?' and the numbered submission cut-off deadlines with CET/CEST timestamps.",
      "Verify EUR 75,000 non-dilutive grant size, women-led deep-tech eligibility criteria (founder/C-level equity share), and Horizon Europe associated country eligibility for Ukraine.",
      "Extract required proposal files (pitch deck, application form, cap table/founding role declarations).",
    ],
    currency: "EUR",
    autoPromoteAvailability: true,
  },
  {
    programId: "eu-women-innovators-2027",
    sourceUrl:
      "https://www.eit.europa.eu/our-activities/opportunities/2027-european-prize-women-innovators-apply-now",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Locate the 'Apply now' section and exact CET submission deadline date and time (e.g. DD/MM/YYYY 17:00 CET).",
      "Extract prize categories (Women Innovators, Rising Innovators, EIT Women Leadership) and exact EUR prize amounts.",
      "Confirm Horizon Europe Associated Country eligibility (including Ukraine) and EU Funding & Tenders Portal submission requirements.",
    ],
    currency: "EUR",
    autoPromoteAvailability: true,
  },
  {
    programId: "eit-food-poc-2026",
    sourceUrl:
      "https://www.eitfood.eu/open-calls/proof-of-concept-co-financing-instrument-2",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Look for 'Cutoff date' timestamps (CET/CEST) and whether the call lists remaining cut-offs or an 'Applications are now closed' banner.",
      "Extract co-financing grant caps, minimum TRL, agrifood sector focus, and EIT RIS / Horizon Europe Ukraine eligibility.",
      "Identify required submission templates, budget tables, and partner consortium requirements.",
    ],
    currency: "EUR",
    autoPromoteAvailability: true,
  },
  {
    programId: "seeds-of-bravery-uaseeds",
    sourceUrl: "https://seedsofbravery.eu/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Check status across all sub-programmes (Innovative Entrepreneurship, Deep Tech Incubators, Rebuild Ukraine, Deep Tech Scale-Up, Business & Innovation Services) and note if individual calls are open or closed.",
      "Extract per-track EUR grant ceilings (e.g. EUR 10k-50k), Ukrainian registration/relocated-founder eligibility rules, and dual-use/civilian exclusions.",
      "Extract FundingBox or portal application steps, pitch deck, and legal entity verification documents.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
  {
    programId: "google-for-startups-ukraine-fund",
    sourceUrl: "https://startup.google.com/programs/ukraine-support-fund/",
    sourceType: "html",
    language: "uk-en",
    cadenceHours: 24,
    extractionHints: [
      "Check whether applications for the current cohort of the Ukraine Support Fund are open, rolling, or closed until the next wave.",
      "Extract equity-free cash award ceiling (e.g. up to $100,000), Google Cloud credits, and eligibility rules (Ukraine-founded, MVP/traction, active operations).",
      "Identify online application form details, pitch deck requirements, and selection timeline.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "eureka-eurostars-ukraine",
    sourceUrl: "https://www.eurekanetwork.org/programmes/eurostars/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Look for the next Eurostars bi-annual cut-off date and CET submission time.",
      "Extract R&D consortium requirements (minimum two Eurostars countries, SME-led project) and note any Ukraine national funding body participation or co-funding rules.",
      "Extract central Eureka application platform format, national eligibility annexes, and project duration/TRL limits.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
  {
    programId: "euipo-sme-fund-ukraine",
    sourceUrl: "https://www.euipo.europa.eu/en/sme-corner/sme-fund",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Check annual opening/closing dates and whether specific IP voucher funds (Vouchers 1-4: IP Scan, trademarks/designs, patents, plant varieties) are currently open or exhausted.",
      "Verify Ukrainian SME eligibility under the EUIPO SME Fund and exact reimbursement percentages and EUR caps per voucher.",
      "Extract required documents (VAT/tax certificate, bank statement, SME declaration) and EUIPO portal application flow.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
  {
    programId: "usf-core-grants-ukraine",
    sourceUrl: "https://usf.com.ua/en/",
    sourceType: "html",
    language: "uk-en",
    cadenceHours: 24,
    extractionHints: [
      "Check active call banners for Ukrainian Startup Fund grant tracks (Pre-seed, Seed, Dual-use/BRAVE1-linked, or partner grant waves) and whether intake is open or paused.",
      "Extract USD/EUR grant ceilings per stage, TRL expectations, Ukrainian legal entity/tax residency requirements, and excluded sectors.",
      "Extract USF portal registration requirements, pitch deck, financial model, and Pitch Day evaluation format.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "mercy-corps-uasp-agro",
    sourceUrl: "https://uasp.prosperglobal.org/",
    sourceType: "html",
    language: "uk-en",
    cadenceHours: 24,
    extractionHints: [
      "Check whether Ukraine Agriculture Support Program (UASP) grant windows for small/medium farms or agribusinesses are open, rolling, or closed.",
      "Extract eligible Ukrainian oblasts, USD grant caps by farm/enterprise tier, co-financing requirements, and war-affected eligibility criteria.",
      "Extract online registration steps, business plan templates, and required land/registration documents.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "iom-ukraine-msme-grants",
    sourceUrl: "https://ukraine.iom.int/",
    sourceType: "html",
    language: "uk",
    cadenceHours: 24,
    extractionHints: [
      "Check active intake dates, rolling windows, or regional pause/closure notices for IOM micro and small enterprise grants.",
      "Extract EUR grant ceilings for micro vs small enterprises, eligible target oblasts, business age requirements, and mandatory job creation counts.",
      "Extract online application form instructions, required registration/tax certificates, and equipment procurement rules.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
  {
    programId: "drc-ukraine-business-grants",
    sourceUrl: "https://drc.ngo/en/locations/ukraine/",
    sourceType: "html",
    language: "uk-en",
    cadenceHours: 24,
    extractionHints: [
      "Check the DRC Livelihoods Application Portal for open MSME/micro-business grant rounds, cutoff dates, or closed-round banners.",
      "Extract eligible oblasts/hromadas, grant amount caps (USD/UAH), IDP/war-affected/veteran priority rules, and legal registration requirements.",
      "Extract portal registration flow, business plan form, and supporting identity/business documents.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "y-combinator-accelerator",
    sourceUrl: "https://www.ycombinator.com/apply",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Locate the current/upcoming batch name (Winter/Spring/Summer/Fall), standard application deadline (with PT timezone), and late-application policy.",
      "Extract standard deal investment terms (e.g. $500k SAFE structure), equity stake, and international/Ukraine founder eligibility (including US/approved incorporation requirements).",
      "Extract application format (online founder questionnaire, 1-minute founder video, product demo) and interview process.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "techstars-accelerator",
    sourceUrl: "https://www.techstars.com/accelerators",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Check open accelerator cohorts, upcoming application deadlines, and whether international/Ukrainian startups can apply remotely or must relocate.",
      "Extract current standard Techstars investment terms (equity percentage, convertible note/cash amount, program duration).",
      "Extract online application portal format and required pitch/team materials.",
    ],
    currency: "USD",
    autoPromoteAvailability: false,
  },
  {
    programId: "startup-wise-guys",
    sourceUrl: "https://startupwiseguys.com/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Identify currently open B2B SaaS, Cybersecurity, AI, Sustainability, or CEE/Ukraine-accessible accelerator batches and their closing dates.",
      "Extract standard EUR investment ticket and equity range, program length, and eligibility (MVP/early revenue B2B focus, CEE/Ukrainian founders).",
      "Extract F6S/online application format, pitch deck requirements, and selection bootcamps.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
  {
    programId: "ukraine-investment-framework-uif",
    sourceUrl: "https://ua.uif.eu/",
    sourceType: "html",
    language: "en",
    cadenceHours: 24,
    extractionHints: [
      "Check for newly published Ukraine Investment Framework (UIF) calls for proposals, Pillar II financing windows, and active partner IFI programmes (EBRD, EIB, IFC, KfW).",
      "Extract total envelope or SME guarantee/blended-finance ticket ranges and clarify that direct SME access runs through partner banks/IFIs rather than direct EC applications.",
      "Note official call dates, priority sectors (energy, recovery, SMEs, municipal/industrial), and official partner submission channels.",
    ],
    currency: "EUR",
    autoPromoteAvailability: false,
  },
] as const;

const PROFILES_BY_ID = new Map<string, ProgramMonitorProfile>(
  PROGRAM_MONITOR_PROFILES.map((profile) => [profile.programId, profile]),
);

export function getMonitorProfile(
  programId: string,
): ProgramMonitorProfile | undefined {
  return PROFILES_BY_ID.get(programId);
}
