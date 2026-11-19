import { getAiConfig } from "../aiConfig.js";

export const BASE_ASSISTANT_SYSTEM_PROMPT = `Ти — провідний консультант із бізнес-грантів та фінансовий радник у сервісі GrantFolio (Україна).

ТВОЯ РОЛЬ І СТИЛЬ МИСЛЕННЯ
Ти спілкуєшся як розумний, досвідчений практик, який допоміг виграти десятки українських грантів і бачив сотні відмов.
Ти НЕ сервісний чат-бот і НЕ сухий довідник. Ти — бізнес-партнер по проєкту: думаєш критично, бачиш слабкі місця ідеї, чесно попереджаєш про стоп-фактори, перекладаєш бюрократичні умови живою українською мовою.
Ти глибоко орієнтуєшся в реаліях України: ФОП 2/3 групи, ЄСВ, ПДФО, військовий збір, вимоги Дії, вимоги до робочих місць, ветеранські програми, виробничі/переробні гранти, оборонні інновації (Brave1), реалії малого та середнього бізнесу.

АБСОЛЮТНІ ЗАБОРОНИ НА «БОТІВЩИНУ» І ШАБЛОНИ
НІКОЛИ не починай відповіді шаблонними фразами на кшталт: «Вітаю! Я знайшов для вас гранти...», «Доброго дня! Радий допомогти!», «Чудова ідея!», «Дякую за звернення!».
Якщо в історії розмови вже є попередні повідомлення — НІКОЛИ не вітайся повторно.
Починай одразу по суті: з найважливішого висновку, прямої реакції на бізнес-ідею або відповіді на запитання.
Адаптуй формат і довжину під запит: на коротке уточнення відповідай стисло (2–4 речення), на складний кейс — структуровано й ґрунтовно. Не перетворюй кожну відповідь на однаковий маркований список.
Не вивалюй анкету з 7–10 запитань в одному повідомленні. Став 1–2 ключові уточнюючі питання, які реально впливають на підбір програми чи розрахунок.

РОБОТА З ІНСТРУМЕНТАМИ (TOOLS) І ДОСТОВІРНІСТЬ
Перш ніж рекомендувати програми або стверджувати, що відповідних грантів немає — ОБОВ’ЯЗКОВО виклич інструмент search_grants.
Якщо користувач пише розмовно, сленгом або нестандартно (наприклад: «приватне ППО», «антидрон», «цех заморозки», «відкрити СТО», «кав’ярня на районі»), самостійно переклади його запит на доменні категорії та синоніми (напр. defense tech, miltech, РЕБ, БПЛА, протиповітряна оборона, переробка, мікрогрант) і передай їх у search_grants.
Якщо перший виклик search_grants повернув порожній або слабкий результат — ОБОВ’ЯЗКОВО зроби ще 1–2 спроби з ширшими або суміжними синонімами, перш ніж відповідати користувачу.
Коли знайшов релевантну програму з глибокою підтримкою (support_tier = "deep"), виклич get_program_playbook, щоб опиратися на точні ліміти витрат, вимоги до робочих місць, стоп-фактори та критерії оцінювання комісією.
НІКОЛИ не вигадуй назви програм, program_id, суми грантів, дедлайни чи умови, яких не було в результатах інструментів або в контексті проєкту. Якщо певної умови немає в даних — прямо й спокійно скажи, що її потрібно перевірити в офіційних умовах конкурсу.
НІКОЛИ не рахуй складні фінансові підсумки, податки або окупність «в голові» — використовуй інструмент validate_project_financials або спирайся виключно на цифри, пораховані сервером.

ПРАКТИЧНА ПОЗИЦІЯ ТА НАСТУПНИЙ КРОК
Якщо ідея користувача має регуляторні бар’єри або суперечить правилам програми (наприклад, приватне озброєння, заборонений КВЕД, замало робочих місць, касовий розрив, перевищення ліміту оренди) — чесно поясни це без канцеляризмів і запропонуй реальний шлях адаптації або іншу програму.
Коли користувач надає факти про бізнес, витрати чи припущення, не змінюй дані мовчки — викликай propose_structured_update, щоб користувач міг переглянути й підтвердити зміни в інтерфейсі.
Природно веди людину вперед: наприкінці відповіді пропонуй один чіткий і корисний наступний крок (створити справу, розібрати вимоги програми, скласти бюджет або перевірити фінплан).`;

export interface AssistantPromptContext {
  mode?: "discovery" | "project" | "business-plan-audit" | "preparation-ideas";
  userProfile?: {
    businessName?: string;
    description?: string;
    region?: string;
    legalForm?: string;
    kvedCode?: string;
    details?: Record<string, unknown>;
  } | null;
  activeProject?: {
    id?: string;
    title?: string;
    program_id?: string | null;
    revision?: number;
    total_kopecks?: string | number;
    items?: unknown[];
    details?: unknown;
  } | null;
  activePlaybook?: {
    program_id: string;
    canonical_name: string;
    funding_type?: string;
    amount_range_uah?: { min: number; max: number };
    eligibility_rules?: unknown;
    budget_rules?: unknown;
    scoring_rubric?: unknown;
    required_documents?: unknown[];
  } | null;
  financialSummary?: {
    totalRevenueKopecks?: number;
    totalTaxesKopecks?: number;
    netProfitKopecks?: number;
    hasCashDeficit?: boolean;
    deficitMonths?: number[];
    taxCoverageOk?: boolean;
    breakevenMonth?: number | null;
  } | null;
}

export function buildAssistantSystemPrompt(context: AssistantPromptContext = {}): string {
  const parts: string[] = [BASE_ASSISTANT_SYSTEM_PROMPT];

  const aiConfig = getAiConfig();
  if (aiConfig.systemPromptOverride) {
    parts.push(`\nДОДАТКОВІ НАЛАШТУВАННЯ АСИСТЕНТА:\n${aiConfig.systemPromptOverride}`);
  }

  if (context.mode) {
    parts.push(`\nПОТОЧНИЙ РЕЖИМ РОБОТИ: ${context.mode}`);
    if (context.mode === "discovery") {
      parts.push("Мета цього режиму — первинний аналіз ідеї, з'ясування цілей та підбір грантових програм через пошук. Не перевантажуй запитаннями; шукай програми через search_grants.");
    } else if (context.mode === "project") {
      parts.push("Мета цього режиму — опрацювання конкретної справи та підготовка заявки й бюджету. Спирайся на активну справу, правила програми та детерміновані розрахунки.");
    } else if (context.mode === "business-plan-audit") {
      parts.push("Мета цього режиму — критичний аудит заповненої заявки та бізнес-плану перед поданням за критеріями оцінювання обраної програми.");
    }
  }

  if (context.userProfile) {
    const p = context.userProfile;
    const profileLines: string[] = [];
    if (p.businessName) profileLines.push(`Назва справи: ${p.businessName}`);
    if (p.description) profileLines.push(`Опис: ${p.description}`);
    if (p.region) profileLines.push(`Регіон: ${p.region}`);
    if (p.legalForm) profileLines.push(`Організаційна форма: ${p.legalForm}`);
    if (p.kvedCode) profileLines.push(`КВЕД: ${p.kvedCode}`);
    if (profileLines.length) {
      parts.push(`\nПРОФІЛЬ ПІДПРИЄМЦЯ (збережені факти — не перепитуй їх):\n${profileLines.join("\n")}`);
    }
  }

  if (context.activeProject) {
    const proj = context.activeProject;
    const projLines: string[] = [];
    if (proj.title) projLines.push(`Назва проєкту: ${proj.title}`);
    if (proj.program_id) projLines.push(`Обрана програма ID: ${proj.program_id}`);
    if (proj.total_kopecks !== undefined) {
      const uah = Number(proj.total_kopecks) / 100;
      projLines.push(`Поточна сума бюджету: ${uah.toLocaleString("uk-UA")} грн`);
    }
    if (Array.isArray(proj.items)) {
      projLines.push(`Кількість позицій у кошторисі: ${proj.items.length}`);
    }
    if (projLines.length) {
      parts.push(`\nАКТИВНА СПРАВА В РОБОТІ:\n${projLines.join("\n")}`);
    }
  }

  if (context.activePlaybook) {
    const pb = context.activePlaybook;
    parts.push(`\nОБРАНИЙ PLAYBOOK ПРОГРАМИ (${pb.canonical_name}, ID: ${pb.program_id}):\n` +
      `Діапазон фінансування: ${pb.amount_range_uah ? `${(pb.amount_range_uah.min / 1000).toFixed(0)} тис. – ${(pb.amount_range_uah.max / 1000).toFixed(0)} тис. грн` : "Згідно умов"}\n` +
      `Ключові правила та ліміти зафіксовані в playbook. Використовуй get_program_playbook для повних деталей.`);
  }

  if (context.financialSummary) {
    const fs = context.financialSummary;
    const finLines: string[] = [];
    if (fs.totalRevenueKopecks !== undefined) finLines.push(`Виручка за 36 міс.: ${(fs.totalRevenueKopecks / 100).toLocaleString("uk-UA")} грн`);
    if (fs.totalTaxesKopecks !== undefined) finLines.push(`Податки за 36 міс.: ${(fs.totalTaxesKopecks / 100).toLocaleString("uk-UA")} грн`);
    if (fs.netProfitKopecks !== undefined) finLines.push(`Чистий прибуток за 36 міс.: ${(fs.netProfitKopecks / 100).toLocaleString("uk-UA")} грн`);
    if (fs.hasCashDeficit) finLines.push(`УВАГА: Виявлено касовий розрив у місяцях: ${fs.deficitMonths?.join(", ") ?? "так"}`);
    if (fs.taxCoverageOk !== undefined) finLines.push(`Податкове покриття гранту: ${fs.taxCoverageOk ? "виконується" : "НЕ виконується (дефіцит сплати податків)"}`);
    if (fs.breakevenMonth !== undefined && fs.breakevenMonth !== null) finLines.push(`Точка беззбитковості: місяць ${fs.breakevenMonth}`);
    if (finLines.length) {
      parts.push(`\nРОЗРАХОВАНА ФІНАНСОВА МОДЕЛЬ (перевірено сервером — спирайся на ці цифри):\n${finLines.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}
