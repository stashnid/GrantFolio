import { regions, industries, cities } from "./profile-options-data.js";

export type ExtractedProfileData = {
  businessName?: string;
  region?: string;
  city?: string;
  legalForm?: "idea" | "fop" | "company" | "ngo";
  industry?: string;
  requestedAmount?: string;
  fundingPurpose?: string;
  teamSize?: string;
  grantExperience?: string;
  description?: string;
};

export type ExtractedFact = {
  field: keyof ExtractedProfileData;
  label: string;
  value: string;
  source: string;
};

// City to region mapping for Ukraine with inflection patterns
const CITY_SPECS: Array<{ city: string; region: string; pattern: RegExp }> = [
  { city: "Київ", region: "м. Київ", pattern: /(?:^|[^а-яіїєґ])(ки[єєї][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Львів", region: "Львівська область", pattern: /(?:^|[^а-яіїєґ])(льв[іо][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Харків", region: "Харківська область", pattern: /(?:^|[^а-яіїєґ])(харк[іо][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Одеса", region: "Одеська область", pattern: /(?:^|[^а-яіїєґ])(одес[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Дніпро", region: "Дніпропетровська область", pattern: /(?:^|[^а-яіїєґ])(дніпр[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Вінниця", region: "Вінницька область", pattern: /(?:^|[^а-яіїєґ])(вінниц[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Чернівці", region: "Чернівецька область", pattern: /(?:^|[^а-яіїєґ])(чернівц[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Івано-Франківськ", region: "Івано-Франківська область", pattern: /(?:^|[^а-яіїєґ])(івано[- ]франківськ[а-яіїєґ]*|франківськ[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Луцьк", region: "Волинська область", pattern: /(?:^|[^а-яіїєґ])(луцьк[а-яіїєґ]*|луцьк)(?:$|[^а-яіїєґ])/i },
  { city: "Рівне", region: "Рівненська область", pattern: /(?:^|[^а-яіїєґ])(рівн[еяоі][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Полтава", region: "Полтавська область", pattern: /(?:^|[^а-яіїєґ])(полтав[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Ужгород", region: "Закарпатська область", pattern: /(?:^|[^а-яіїєґ])(ужгород[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Житомир", region: "Житомирська область", pattern: /(?:^|[^а-яіїєґ])(житомир[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Суми", region: "Сумська область", pattern: /(?:^|[^а-яіїєґ])(сум[а-яіїєґ]+)(?:$|[^а-яіїєґ])/i },
  { city: "Чернігів", region: "Чернігівська область", pattern: /(?:^|[^а-яіїєґ])(черніг[іо][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Тернопіль", region: "Тернопільська область", pattern: /(?:^|[^а-яіїєґ])(терноп[іо]л[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Черкаси", region: "Черкаська область", pattern: /(?:^|[^а-яіїєґ])(черкас[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Хмельницький", region: "Хмельницька область", pattern: /(?:^|[^а-яіїєґ])(хмельницьк[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Запоріжжя", region: "Запорізька область", pattern: /(?:^|[^а-яіїєґ])(запоріжж?[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Миколаїв", region: "Миколаївська область", pattern: /(?:^|[^а-яіїєґ])(микола[єеї][а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Херсон", region: "Херсонська область", pattern: /(?:^|[^а-яіїєґ])(херсон[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
  { city: "Кропивницький", region: "Кіровоградська область", pattern: /(?:^|[^а-яіїєґ])(кропивницьк[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i },
];

export function extractProfileFromText(text: string): { data: ExtractedProfileData; facts: ExtractedFact[] } {
  const data: ExtractedProfileData = {};
  const facts: ExtractedFact[] = [];
  const normalized = text.toLowerCase();

  // 1. Legal Form
  if (/(?:^|[^а-яіїєґ])(?:працюю|зареєстрован(?:ий|а)|оформлен(?:ий|а)|маю|як|є)?\s*фоп(?:$|[^а-яіїєґ])/i.test(text) &&
      !/(?:не|ще не)\s+(?:є\s+|маю\s+)?фоп/i.test(text)) {
    data.legalForm = "fop";
    facts.push({ field: "legalForm", label: "Форма бізнесу", value: "ФОП", source: "згадка ФОП" });
  } else if (/(?:^|[^а-яіїєґ])(тов|товариство|компані(?:я|ї|ю)|підприємств(?:о|а))(?:$|[^а-яіїєґ])/i.test(text)) {
    data.legalForm = "company";
    facts.push({ field: "legalForm", label: "Форма бізнесу", value: "Компанія (ТОВ)", source: "згадка юридичної особи" });
  } else if (/(?:^|[^а-яіїєґ])(го|громадськ[а-яіїєґ]* організаці[а-яіїєґ]*|благодійн[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i.test(text)) {
    data.legalForm = "ngo";
    facts.push({ field: "legalForm", label: "Форма бізнесу", value: "Громадська організація", source: "згадка ГО" });
  } else if (/(?:лише|тільки|ще)\s+ідея|планую відкрити|немає (?:ще )?бізнесу|бізнесу ще немає|почати з нуля/i.test(text)) {
    data.legalForm = "idea";
    facts.push({ field: "legalForm", label: "Форма бізнесу", value: "Ідея / старт", source: "планування відкриття" });
  }

  // 2. City & Region
  for (const spec of CITY_SPECS) {
    const match = text.match(spec.pattern);
    if (match) {
      data.city = spec.city;
      data.region = spec.region;
      facts.push({ field: "city", label: "Місто", value: spec.city, source: match[1] });
      facts.push({ field: "region", label: "Регіон", value: spec.region, source: `область для ${spec.city}` });
      break;
    }
  }

  // If region not set from city, check direct region mention
  if (!data.region) {
    for (const r of regions) {
      const stem = r.replace(/ область|м\. /g, "").slice(0, 5).toLowerCase();
      if (stem && normalized.includes(stem)) {
        data.region = r;
        facts.push({ field: "region", label: "Регіон", value: r, source: `згадка ${r}` });
        break;
      }
    }
  }

  // 3. Industry & Business Name
  if (/(кав'?ярн|кафе|пекарн|ресторан|піцері|їдал|кондитерськ|громадськ[а-яіїєґ]* харчуван)/i.test(text)) {
    data.industry = "Громадське харчування";
    facts.push({ field: "industry", label: "Галузь", value: "Громадське харчування", source: "заклад харчування" });
    if (/кав'?ярн/i.test(text)) data.businessName = "Кав'ярня";
    else if (/пекарн/i.test(text)) data.businessName = "Пекарня";
    else if (/ресторан/i.test(text)) data.businessName = "Ресторан";
  } else if (/(швейн|пошитт|одяг)/i.test(text) && /(виробництв|цех|майстерн)/i.test(text)) {
    data.industry = "Виробництво";
    data.businessName = "Швейне виробництво";
    facts.push({ field: "industry", label: "Галузь", value: "Виробництво", source: "швейне виробництво" });
    facts.push({ field: "businessName", label: "Назва справи", value: "Швейне виробництво", source: "виробництво одягу" });
  } else if (/(мебл)/i.test(text) && /(виробництв|цех|майстерн)/i.test(text)) {
    data.industry = "Виробництво";
    data.businessName = "Виробництво меблів";
    facts.push({ field: "industry", label: "Галузь", value: "Виробництво", source: "меблеве виробництво" });
  } else if (/(виробництв|цех|крафт|переробк|деревооброб)/i.test(text)) {
    data.industry = "Виробництво";
    data.businessName = "Виробниче підприємство";
    facts.push({ field: "industry", label: "Галузь", value: "Виробництво", source: "виробнича діяльність" });
  } else if (/(дитяч[а-яіїєґ]* (?:розвиваючий )?центр|дитячий садок|дитяча кімната)/i.test(text)) {
    data.industry = "Освіта";
    data.businessName = "Дитячий розвиваючий центр";
    facts.push({ field: "industry", label: "Галузь", value: "Освіта", source: "дитячий центр" });
    facts.push({ field: "businessName", label: "Назва справи", value: "Дитячий розвиваючий центр", source: "дитячий розвиваючий центр" });
  } else if (/(іт|it|програмн|розробк|веб|стартап|сервіс)/i.test(text)) {
    data.industry = "Інформаційні технології";
    data.businessName = "IT-проєкт";
    facts.push({ field: "industry", label: "Галузь", value: "Інформаційні технології", source: "IT-проєкт" });
  } else if (/(ферм|агро|сільськ[а-яіїєґ]* господар|пасік|мед|сад|ягід|теплич)/i.test(text)) {
    data.industry = "Сільське господарство";
    data.businessName = "Агропідприємство";
    facts.push({ field: "industry", label: "Галузь", value: "Сільське господарство", source: "аграрний сектор" });
  } else if (/(стоматолог|клінік|медич|реабілітац)/i.test(text)) {
    data.industry = "Охорона здоров’я";
    data.businessName = "Медичний заклад";
    facts.push({ field: "industry", label: "Галузь", value: "Охорона здоров’я", source: "медичний напрям" });
  } else if (/(салон краси|перукарн|барбершоп|манікюр)/i.test(text)) {
    data.industry = "Краса та догляд";
    data.businessName = "Салон краси";
    facts.push({ field: "industry", label: "Галузь", value: "Краса та догляд", source: "індустрія краси" });
  } else if (/(магазин|торгівл|продаж|ритейл)/i.test(text)) {
    data.industry = "Торгівля";
    data.businessName = "Магазин / торгівля";
    facts.push({ field: "industry", label: "Галузь", value: "Торгівля", source: "торгівля" });
  } else if (/(доставк|перевезен|автосервіс|сто\b|вантаж)/i.test(text)) {
    data.industry = "Транспорт і логістика";
    data.businessName = "Транспорт і логістика";
    facts.push({ field: "industry", label: "Галузь", value: "Транспорт і логістика", source: "транспорт" });
  } else if (/(навчан|курс|освіт)/i.test(text)) {
    data.industry = "Освіта";
    data.businessName = "Освітній центр";
    facts.push({ field: "industry", label: "Галузь", value: "Освіта", source: "освіта" });
  }

  if (data.businessName && !facts.some(f => f.field === "businessName")) {
    facts.push({ field: "businessName", label: "Назва справи", value: data.businessName, source: "вид діяльності" });
  }

  // 4. Requested Amount
  const amountMatch = text.match(/(?:^|[^а-яіїєґ])(\d+(?:[.,]\d+)?)\s*(тис(?:\.|яч[а-я]*)?|млн|мільйон[а-я]*)\s*(?:грн|гривень)?(?:$|[^а-яіїєґ])/i);
  if (amountMatch) {
    const num = parseFloat(amountMatch[1].replace(",", "."));
    const unit = amountMatch[2].toLowerCase();
    let total = num;
    if (unit.startsWith("тис")) total = num * 1000;
    else if (unit.startsWith("млн") || unit.startsWith("мільйон")) total = num * 1000000;
    data.requestedAmount = String(Math.round(total));
    facts.push({ field: "requestedAmount", label: "Бажана сума", value: `${total.toLocaleString("uk-UA")} грн`, source: amountMatch[0].trim() });
  } else {
    const rawNumberMatch = text.match(/(?:^|[^а-яіїєґ])([1-9]\d{1,2}(?:[\s\u00a0\u202f]\d{3})+|[1-9]\d{4,8})\s*(?:грн|гривень)?(?:$|[^а-яіїєґ])/i);
    if (rawNumberMatch) {
      const cleanNum = rawNumberMatch[1].replace(/[\s\u00a0\u202f]/g, "");
      data.requestedAmount = cleanNum;
      facts.push({ field: "requestedAmount", label: "Бажана сума", value: `${Number(cleanNum).toLocaleString("uk-UA")} грн`, source: rawNumberMatch[0].trim() });
    }
  }

  // 5. Funding Purpose
  const purposeParts: string[] = [];
  if (/обладнанн|верстат|кавомашин|апарат|технік|печ[іей]|прилад|тканин/i.test(text)) purposeParts.push("придбання обладнання та техніки");
  if (/оренд[а-яіїєґ]*/i.test(text)) purposeParts.push("оплата оренди приміщення");
  if (/сировин|матеріал|інгредієнт/i.test(text)) purposeParts.push("закупівля сировини та витратних матеріалів");
  if (/маркетинг|реклам|просуван/i.test(text)) purposeParts.push("маркетинг та реклама");
  if (/працівник|персонал|команд|зарплат|робоч[іих] місц/i.test(text)) purposeParts.push("створення нових робочих місць");
  if (/авто|транспорт|бус|машин[а-яіїєґ]* для доставк/i.test(text)) purposeParts.push("комерційний транспорт для перевезень");
  if (purposeParts.length > 0) {
    data.fundingPurpose = purposeParts.join(", ");
    facts.push({ field: "fundingPurpose", label: "Мета фінансування", value: data.fundingPurpose, source: "зазначені витрати" });
  }

  // 6. Team Size
  const teamMatch = text.match(/(?:команд[а-яіїєґ]*|працівник[а-яіїєґ]*|людей|осіб|працює)\s*(?:з\s*)?([1-9]\d?)\s*(?:людей|осіб|працівник[а-яіїєґ]*)?/i) ||
                    text.match(/(?:^|[^а-яіїєґ])([1-9]\d?)\s*(?:людей|осіб|працівник[а-яіїєґ]*|співробітник[а-яіїєґ]*)(?:$|[^а-яіїєґ])/i);
  if (teamMatch) {
    data.teamSize = teamMatch[1];
    facts.push({ field: "teamSize", label: "Розмір команди", value: `${teamMatch[1]} осіб`, source: teamMatch[0].trim() });
  } else if (/працю[а-яіїєґ]*\s+сам(?:а|остійно)?|один/i.test(text)) {
    data.teamSize = "1";
    facts.push({ field: "teamSize", label: "Розмір команди", value: "1 особа (самостійно)", source: "працюю сам" });
  }

  // 7. Grant Experience
  if (/немає досвіду|вперше|перший раз|досвіду не маю|досвіду немає|раніше не отримував/i.test(text)) {
    data.grantExperience = "Попередній досвід участі у грантових програмах відсутній (подання заявки вперше).";
    facts.push({ field: "grantExperience", label: "Грантовий досвід", value: "Подання вперше", source: "відсутність досвіду" });
  } else if (/отримував|маю досвід|брав участь|перемагав/i.test(text)) {
    data.grantExperience = "Є попередній успішний досвід участі у грантових або партнерських програмах.";
    facts.push({ field: "grantExperience", label: "Грантовий досвід", value: "Є досвід", source: "наявність досвіду" });
  }

  // 8. Description
  if (data.businessName || data.industry) {
    const loc = data.city ? ` у м. ${data.city}` : data.region ? ` у ${data.region}` : "";
    const purp = data.fundingPurpose ? `, мета: ${data.fundingPurpose}` : "";
    data.description = `${data.businessName || data.industry}${loc}${purp}.`;
  }

  return { data, facts };
}

export function extractProfileFromHistory(
  messages: Array<{ question?: string; reply?: string }>,
  existingProfile?: {
    businessName?: string;
    region?: string;
    description?: string;
    details?: Record<string, string>;
  }
): { data: ExtractedProfileData; facts: ExtractedFact[] } {
  const mergedData: ExtractedProfileData = {};
  const allFactsMap = new Map<string, ExtractedFact>();

  // Process user messages from oldest to newest so newer facts override older ones if changed
  for (const msg of messages) {
    const textToScan = msg.question?.trim();
    if (!textToScan) continue;
    const { data, facts } = extractProfileFromText(textToScan);
    Object.assign(mergedData, data);
    for (const fact of facts) {
      allFactsMap.set(fact.field, fact);
    }
  }

  // If existing profile has values, we don't overwrite user's manual fields unless empty
  if (existingProfile) {
    if (existingProfile.businessName) delete mergedData.businessName;
    if (existingProfile.region) delete mergedData.region;
    if (existingProfile.description) delete mergedData.description;
    if (existingProfile.details) {
      for (const [k, v] of Object.entries(existingProfile.details)) {
        if (v && v.trim()) {
          delete (mergedData as Record<string, unknown>)[k];
        }
      }
    }
  }

  return {
    data: mergedData,
    facts: Array.from(allFactsMap.values()),
  };
}
