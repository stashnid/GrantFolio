import {isGrantAvailable} from "./grant-availability.js";
import { GRANT_CATALOG, type GrantCatalogEntry } from "./grant-catalog-data.js";

export const friendlyTitles: Record<string, string> = {
  "vlasna-sprava": "Гроші на відкриття або розвиток бізнесу",
  "veteran-grant": "Підтримка ветеранського бізнесу — попередня програма",
  "uvf-reimbursement":"Повернення до 20 тисяч за покупки ветеранського бізнесу",
  "bloom-sme":"Обладнання для бізнесу з соціальним впливом",
  "eit-sme-expansion":"Нові ринки для технологій міської мобільності",
  "govtech-pilots":"Цифрові пілоти для держави",
  "processing-business": "Обладнання для виробництва та переробки",
  "agro-gardens": "Фінансування саду, ягідника або виноградника",
};
export const friendlyTitle = (p: GrantCatalogEntry) =>
  friendlyTitles[p.id] ?? p.title;
export const normalize = (s: string) =>
  s
    .toLocaleLowerCase("uk")
    .normalize("NFKC")
    .replace(/[’ʼ'`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const groups: Record<string, string[]> = {
  transport: [
    "автомоб", "грузов", "достав", "перевоз", "доставка",
    "машин",
    "фургон",
    "мікроавтобус",
    "транспорт",
    "доставк",
    "логіст",
    "vehicle",
    "truck",
    "van",
    "car",
  ],
  study: [
    "навчан",
    "навчат",
    "університет",
    "освіт",
    "стипенд",
    "вчит",
    "магістр",
    "бакалавр", "стипенди", "обучен", "учеб", "учиться",
    "ерasmus",
    "erasmus",
    "study",
    "scholarship",
    "university",
  ],
  applicant: ["студент", "молод", "молодь", "молодеж", "молодёж", "student", "youth"],
  business: [
    "стартап",
    "startup",
    "інновац",
    "бізнес",
    "справ",
    "відкрит",
    "відкриття",
    "кавяр",
    "кафе",
    "кав",
    "салон",
    "перукар",
    "манікюр",
    "магазин",
    "пекар",
    "майстерн",
    "фоп",
    "підприєм",
    "business",
    "entrepreneur", "предприним", "открыть", "бизнес", "кофейн", "пекарн", "питани", "франшиз", "собствен", "кафетер", "ресторан", "харчув", "столов", "ательє", "ателье", "sewing", "restaurant", "bakery", "coffee", "cafe",
  ],
  production: [
    "виробниц",
    "перероб",
    "фабрик",
    "цех",
    "завод",
    "верстат",
    "швей",
    "пошит", "швейн", "производств", "переработ", "manufactur", "sewing",
  ],
  garden: ["сад", "ягід", "виноград", "саджан", "насаджен"],
  equipment: [
    "обладнан",
    "інструмент",
    "устаткуван",
    "кавомаш",
    "холодильн",
    "технік",
    "ремонт",
    "компютер",
    "станок", "оборудован", "оборудов", "equipment", "machinery",
  ],
  veteran: ["ветеран", "військов", "убд", "ветеран", "военн", "veteran"],
};
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    row = next;
  }
  return row[b.length];
}
function match(word: string, term: string) {
  return (
    word === term ||
    (term.length >= 3 && word.startsWith(term)) ||
    (word.length >= 4 &&
      term.length >= 4 &&
      Math.abs(word.length - term.length) <= 1 &&
      distance(word, term) <= 1)
  );
}
function identityScore(query: string, p: GrantCatalogEntry): number {
  const cleaned = normalize(query);
  const words = cleaned.split(" ");
    const shortTitle = p.title.split(/[:—–(]/u)[0].trim();
    let score = 0;
    for (const name of [p.id, p.title, ...(shortTitle.length >= 5 ? [shortTitle] : []), ...(p.aliases ?? [])]) {
      const phrase = normalize(name);
      if (phrase.length < 4 && !(p.aliases?.includes(name) && phrase.length >= 3)) continue;
      if (` ${cleaned} `.includes(` ${phrase} `)) return 1100;
      // One typo in a long identity is safe enough for a candidate, never eligibility.
      const tokens = phrase.split(" ");
      if (phrase.length < 7) continue;
      if (words.some((_, i) => {
        const span = words.slice(i, i + tokens.length).join(" ");
        return Math.abs(span.length - phrase.length) <= 1 && distance(span, phrase) <= 1;
      })) score = 1000;
    }
    return score;
}
/** Identity lookup precedes intake filtering. Generic category/search terms are not aliases. */
export function findNamedPrograms(query: string, programs: readonly GrantCatalogEntry[] = GRANT_CATALOG): GrantCatalogEntry[] {
  return programs.map(p => ({program: p, score: identityScore(query, p)}))
    .filter(p => p.score > 0).sort((a, b) => b.score - a.score).map(p => p.program);
}

export function grantIntake(program: GrantCatalogEntry, now = new Date()): {intake: NonNullable<GrantMatch["intake"]>; intakeLabel: string} {
  if (program.intakeStatus === "paused") return {intake: "paused", intakeLabel: "У каталозі прийом позначено призупиненим; поточний стан перевірте в організатора."};
  if (isGrantAvailable(program, now)) return {intake: "open", intakeLabel: "Прийом підтверджений збереженим джерелом; перевірте його перед поданням."};
  const a = program.availability;
  const fresh = a && Number.isFinite(now.getTime()) && Date.parse(a.checkedAt) <= now.getTime() && Date.parse(a.validUntil) > now.getTime();
  if (fresh && a.startsAt && Date.parse(a.startsAt) > now.getTime()) return {intake: "upcoming", intakeLabel: "За збереженим джерелом прийом ще не почався."};
  if (fresh && (a.state === "closed" || (a.deadlineAt && Date.parse(a.deadlineAt) <= now.getTime()))) return {intake: "closed", intakeLabel: "За збереженим джерелом прийом закритий; перевірте наступний конкурс."};
  return {intake: "unconfirmed", intakeLabel: "Поточний прийом не підтверджений. Наявність програми в каталозі не означає відкритого конкурсу."};
}

export function grantSupport(programId: string): {supportDepth: NonNullable<GrantMatch["supportDepth"]>; supportLabel: string} {
  return ["vlasna-sprava", "agro-gardens"].includes(programId)
    ? {supportDepth: "guided-draft", supportLabel: "Доступні анкета та робочі матеріали. Повний офіційний комплект не перевірений."}
    : {supportDepth: "catalog-only", supportLabel: "Доступні довідка й консультація за каталогом. Підготовку офіційного комплекту не реалізовано."};
}
export type GrantMatch = {
  programId: string;
  title: string;
  reason: string;
  caution: string;
  score: number;
  evidenceUrl: string;
  matchKind?: "direct" | "thematic";
  intake?: "open" | "closed" | "paused" | "upcoming" | "unconfirmed";
  intakeLabel?: string;
  supportDepth?: "guided-draft" | "catalog-only";
  supportLabel?: string;
};
export type SearchResult = {
  query: string;
  intents: string[];
  matches: GrantMatch[];
  questions: string[];
  explanation: string;
};
export function searchGrants(query: string, programs: readonly GrantCatalogEntry[] = GRANT_CATALOG, now = new Date(), options: {includeUnavailable?: boolean} = {}): SearchResult {
  const cleaned = normalize(query).slice(-1500);
  const namedIds = new Set(findNamedPrograms(query, programs).map(p => p.id));
  const words = cleaned.split(" ").filter(Boolean);
  const from = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
  const to =   "йцукенгшщзхїфівапролджєячсмитьбю";
  const layout = (value: string) => [...value].map(ch => {const i=from.indexOf(ch);return i<0?ch:to[i];}).join("");
  // Limit negation to its clause so another need in the request remains searchable.
  const clauses = query
    .slice(-1500)
    .split(/[,.!?;\n]|\s+(?:а|але|but)\s+/iu)
    .map(normalize);
  const positiveWords = clauses.flatMap((clause) => {
    const tokens = clause.split(" ").filter(Boolean);
    return tokens.filter((w, i) => {
      const needWord =
        Object.values(groups).some((terms) => terms.some((t) => match(w, t))) ||
        ["авто", "автмо", "бус"].includes(w);
      if (!needWord) return true;
      const before = tokens.slice(Math.max(0, i - 3), i).join(" ");
      const after = tokens.slice(i + 1, i + 5).join(" ");
      const negated =
        /(?:^| )(?:не|без|not|no|without)(?: (?:для|на|хочу|потрібне|потрібна|потрібні|need|want)){0,2}$/.test(
          before,
        ) || /^(?:гроші |кошти |фінансування )?не (?:потрібн|хочу)/.test(after);
      return !negated;
    });
  });
  const searchableWords = [...positiveWords, ...positiveWords.filter(w => /^[a-z]{4,}$/i.test(w)).map(layout)];
  const intents = Object.entries(groups)
    .filter(([, terms]) =>
      searchableWords.some((w) => terms.some((t) => match(w, t))),
    )
    .map(([key]) => key);
  // «авто» is a complete word, not a prefix for автоклав, автоматизація or автосервіс.
  if (positiveWords.some((w) => ["авто", "автмо", "бус"].includes(w)))
    intents.push("transport");
  if (
    positiveWords.some(
      (w) => w.startsWith("автосервіс") || w.startsWith("автомайстерн"),
    )
  )
    intents.push("business", "equipment");
  const personal =
    /(особист|для себе|власного користування|личн|для себя|personal|for myself)/.test(cleaned) &&
    intents.includes("transport");
  const meaningfulBusiness = intents.some(i => ["business", "production", "garden", "equipment", "veteran"].includes(i));
  // Mere registration or veteran status does not make personal transport a business expense.
  const separateBusinessNeed = positiveWords.some(w =>
    ["business", "production", "garden", "equipment"].some(group =>
      groups[group].filter(t => !["фоп", "підприєм", "business", "бізнес", "бизнес", "справ"].includes(t)).some(t => match(w, t))));
  const personalOnly = personal && !separateBusinessNeed;
  const studyOnly = intents.includes("study") && !meaningfulBusiness && !intents.includes("transport");
  const stop = /^(?:грант|гранти|потріб|хочу|мені|для|який|кошти|допом|програма|фінанс|бізнес|справ|відкрит|підприєм|студент|молод|україн|україна|україні|що|how|grant|funding|need|business|бизнес)/;
  const useful = searchableWords.filter(w=>w.length>=4&&!stop.test(w));
  // Reimbursement concerns purchases already made. Future-only requests must
  // not rank it as funding for a planned purchase.
  const futurePurchase = /майбутн|плану(?:ю|ємо|є).*?(?:куп|закуп|придб)|(?:куп|закуп|придб).*?(?:плану|майбутн)|збира(?:юся|ємось).*?(?:куп|закуп|придб)/.test(cleaned);
  const negatedPurchasePattern = /(?:ще )?не (?:вже )?(?:купив|купила|купили|придбав|придбала|придбали|закупив|закупила|сплатив|сплатила)/g;
  const explicitlyNotPurchased = negatedPurchasePattern.test(cleaned);
  const pastStatements = cleaned.replace(negatedPurchasePattern, "");
  const pastPurchase = /(?:купив|купила|купили|придбав|придбала|придбали|закупив|закупила|сплатив|сплатила|оплатив|оплатила|оплатили|поніс витрати|понесла витрати)/.test(pastStatements);
  const matches: GrantMatch[] = [];
  for (const p of programs) {
    const direct = namedIds.has(p.id);
    if (!direct && ((!options.includeUnavailable && !isGrantAvailable(p, now)) || personalOnly || studyOnly)) continue;
    let score = 0,
      reason = "";
    const add = (n: number, text: string) => {
      score += n;
      if (!reason) reason = text;
    };
    if (p.id === "vlasna-sprava") {
      if (intents.includes("transport") && !personal)
        add(
          100,
          "У перевіреному джерелі передбачений комерційний і виробничий транспорт. Потрібно пояснити, як авто працюватиме у вашому бізнесі.",
        );
      if (intents.some((i) => ["business", "equipment", "veteran"].includes(i)))
        add(
          60,
          intents.includes("applicant")
            ? "Можливий напрям для започаткування або розвитку бізнесу. Уточніть бізнес-ідею та стадію її розвитку; вік може впливати на окремі умови."
            : "Може допомогти зі стартом або розвитком бізнесу, обладнанням і дозволеними витратами.",
        );
      if (
        intents.includes("applicant") &&
        !intents.includes("study") &&
        !intents.some((i) =>
          [
            "business",
            "equipment",
            "veteran",
            "transport",
            "production",
            "garden",
          ].includes(i),
        )
      )
        add(
          60,
          "Можливий напрям для започаткування бізнесу. Уточніть бізнес-ідею та стадію її розвитку; вік може впливати на окремі умови.",
        );
    }
    if (p.id === "processing-business" && intents.includes("production"))
      add(
        100,
        "Програма стосується обладнання та розвитку переробного виробництва.",
      );
    if (p.id === "agro-gardens" && intents.includes("garden"))
      add(
        100,
        "Програма для закладання багаторічних насаджень; потрібні земельна ділянка та проєкт висадки.",
      );
    if (p.id === "vlasna-sprava" && intents.includes("production")) add(60,"Може покрити дозволені витрати малого виробничого бізнесу; перевірте обраний напрям і кошторис.");
    if (p.id === "uvf-reimbursement" && intents.includes("veteran")) add(110,"Ветеранський фонд відшкодовує підтверджені минулі покупки для справи. Це не аванс на майбутні витрати.");
    if (p.id === "bloom-sme" && intents.some(i => ["production","equipment","business"].includes(i))) add(55,"Підтримка зареєстрованих МСП із соціальним впливом та зайнятістю; перевірте географію й критерії BLOOM.");
    if (p.id === "govtech-pilots" && /стартап|startup|govtech|державн.*(?:цифр|технолог)|цифр.*державн/.test(cleaned)) add(75,"Конкурс для технологічного пілоту на визначену державну потребу; звичайні сервісні бізнеси не є цільовими заявниками.");
    if (p.id === "eit-sme-expansion" && /mobility|міськ.*(?:транспорт|мобіль)|urban|eit/.test(cleaned)) add(90,"Підтримка зрілої технології міської мобільності для нового ринку. Потрібні TRL7+, 3 FTE і клієнт; є фінансові зобов’язання.");
    // Rank words in sourced fields; exclusions are deliberately not positive matches.
    const candidateWords = (value: string) => normalize(value).split(" ").filter(t => t.length >= 4);
    const overlap = (value: string) => { const tokens=candidateWords(value); return useful.filter(w=>tokens.some(t=>match(w,t)||match(t,w))).length; };
    const named=overlap([p.title, friendlyTitle(p), p.provider, ...(p.searchTerms??[])].join(" "));
    const costs=overlap([...p.eligibleCosts,...p.details.costs].join(" "));
    const applicants=overlap([p.targetAudience,...p.details.eligibility].join(" "));
    const context=overlap([p.summary,p.categoryLabel,p.details.overview,...p.details.funding,...p.details.obligations,...p.details.documents,...p.details.steps].join(" "));
    const excluded=overlap(p.details.exclusions.join(" "));
    // Full names and IDs are specific; a shared word such as «пекарня» or
    // «бізнесу» is not evidence that the user named the provider.
    const includesPhrase = (value: string) => {
      const phrase = normalize(value);
      return phrase.length > 0 && (` ${cleaned} `).includes(` ${phrase} `);
    };
    const explicitProvider = includesPhrase(p.title) || includesPhrase(p.provider) ||
      includesPhrase(p.id) || (p.id === "uvf-reimbursement" && /(?:^| )(?:uvf|увф)(?: |$)/.test(cleaned));
    const explicitWomenTech = p.id === "women-techeu-2-eic" && /(?:^| )(?:women ?techeu|women techeu 2 eic)(?: |$)/.test(cleaned);
    const deepTechNeed = /deep[ -]?tech|діп[ -]?тех|глибок(?:і|их|ими) технолог|trl[ -]?[4-6]/.test(cleaned);
    if (!direct && cleaned && p.id === "women-techeu-2-eic" && !explicitProvider && !explicitWomenTech && !deepTechNeed) continue;
    if (!direct && p.fundingType === "reimbursement" && (futurePurchase || explicitlyNotPurchased) && !pastPurchase) continue;
    if (p.fundingType === "reimbursement" && !intents.includes("veteran") && !explicitProvider) { score=0; reason=""; }
    else if(named||costs||applicants||context) {
      const lexical=Math.min(45,named*16+costs*12+applicants*8+context*5);
      if(lexical>=5) add(lexical, excluded ? "Слова запиту є в описі програми та її обмеженнях. Уважно звірте, чи підходить ваш випадок." : named ? "Назва, організатор або напрям програми відповідає словам запиту; перевірте умови участі." : costs ? "Опис витрат програми згадує ваш запит; перевірте допустимість конкретної витрати." : applicants ? "Опис заявників програми відповідає словам запиту; право на участь потрібно підтвердити." : "Умови або документи програми згадують слова вашого запиту; перевірте контекст у джерелі.");
    }
    if (p.id === "women-techeu-2-eic" && score > 0) {
      reason = "Програма для комерційних deep-tech стартапів; перевірте стадію технології, вік компанії та вимоги до засновниці в джерелі.";
    }
    if (p.id === "bloom-sme" && score > 0 && /(?:ще )?не (?:є |маю )?фоп|(?:немає|не маю) (?:зареєстрованого )?фоп|бізнес (?:ще )?не зареєстрован/.test(cleaned)) {
      if (!explicitProvider && !includesPhrase("bloom")) continue;
      reason = "Програма для зареєстрованих ФОП або юридичних осіб із соціальним чи екологічним впливом. Ви зазначили, що ще не маєте ФОП; перевірте вимоги до заявника перед підготовкою.";
    }
    if (p.fundingType === "reimbursement" && score > 0 && !pastPurchase) {
      score = Math.min(score, 20);
      reason = "Уточніть, чи ви вже придбали та оплатили товари для справи: програма відшкодовує минулі покупки, а не фінансує майбутні.";
    }
    if (!words.length)
      add(1, "Перегляньте, що фінансує програма та кому вона доступна.");

    if (direct) {
      score = identityScore(query, p);
      reason = `Знайдено за назвою або ідентифікатором. За описом каталогу: ${p.targetAudience} Це інформація про програму, а не підтвердження відповідності чи відкритого прийому.`;
    }

    if (score > 0)
      matches.push({
        programId: p.id,
        title: friendlyTitle(p),
        reason,
        score,
        caution:
          grantIntake(p, now).intake !== "open"
            ? `${grantIntake(p, now).intakeLabel} Вашу відповідність потрібно перевірити окремо.`
            : p.id === "vlasna-sprava" && intents.includes("applicant")
              ? "Вік і відповідність умовам програми потрібно уточнити; студентський статус сам по собі не підтверджує право на грант."
              : "Актуальний прийом і вашу відповідність потрібно підтвердити; це можливий напрям, не схвалення заявки.",
        evidenceUrl:
          p.id === "vlasna-sprava" && intents.includes("transport")
            ? "https://diia.gov.ua/news/vlasna-sprava-zbilshyly-hranty-na-start-i-masshtabuvannia-biznesu"
            : p.officialUrl,
        matchKind: direct ? "direct" : "thematic",
        ...grantIntake(p, now),
        ...grantSupport(p.id),
      });
  }
  const questions = intents.includes("veteran") && !pastPurchase && !futurePurchase
    ? ["Ви вже придбали й оплатили товари для справи чи лише плануєте покупку?"]
    : personal
    ? ["Йдеться про особисте авто чи транспорт для роботи?"]
    : intents.includes("transport")
      ? [
          "Для чого саме потрібне авто та чи є у вас бізнес?",
          "У якому регіоні працюватимете та яка орієнтовна сума потрібна?",
        ]
      : intents.includes("applicant")
        ? [
            "Яку бізнес-ідею маєте та на що потрібні кошти?",
            "Ви плануєте почати справу чи вже працюєте?",
          ]
        : [
            "На що саме потрібні кошти та яка орієнтовна сума?",
            "Ви плануєте почати справу чи вже працюєте? У якому регіоні?",
          ];
  return {
    query: query.slice(0, 500),
    intents: [...new Set(intents)],
    matches: matches.sort((a, b) => b.score - a.score),
    questions,
    explanation: personal
      ? "Не знайшов підтвердженої програми на особисте авто. Інші результати стосуються інших потреб у вашому запиті; підтримка комерційного транспорту має інше призначення."
      : intents.includes("study") && !matches.length
        ? "GrantFolio допомагає з грантами для бізнесу; особисте навчання та стипендії не входять до каталогу."
        : matches.length
          ? "Це можливі напрями за змістом запиту. Нижче пояснено підстави й обмеження."
          : "Не знайшов тематичного збігу в перевірених описах каталогу. Це не доводить відсутність програми: потрібен точніший опис потреби або назва організатора.",
  };
}
