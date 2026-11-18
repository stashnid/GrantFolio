import { hasGuidedApplication } from "./grants";
import { assessBudget, readiness as snapshotReadiness } from "../../backend/src/project-details";
import {isGrantAvailable} from "../../backend/src/grant-availability";
import {useGrantPrograms} from "./GrantPrograms";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { Assistant } from "./Assistant";
import { GrantApplication } from "./GrantApplication";
import { useSessionDraft } from "./useSessionDraft";
import "./SessionRecovery.css";
import { authenticatedRequest, readableApiError } from "./api";
import { CustomSelect } from "./CustomSelect";
import { useConfirm } from "./ConfirmDialog";
import { FeedbackPromptBanner } from "./FeedbackPromptBanner";
import type { GrantProgram } from "./grants";
import { friendlyTitle } from "../../backend/src/grant-discovery";

type Item = { name: string; quantity: number; unitPriceKopecks: number };
type Details = {
  projectDescription: string;
  customers: string;
  salesChannels: string;
  implementationPlan: string;
  expectedResults: string;
};
type Readiness = {
  revision: number;
  checks: { id: string; label: string; status: "complete" | "missing" }[];
  disclaimer: string;
};
const emptyDetails: Details = {
  projectDescription: "",
  customers: "",
  salesChannels: "",
  implementationPlan: "",
  expectedResults: "",
};
const businessBasicsFields = [
  {
    key: "projectDescription" as const,
    label: "Опис проєкту / ідеї",
    hint: "Що саме ви створюєте чи розвиваєте? У чому цінність вашого бізнесу?",
    placeholder: "Наприклад: Відкриття затишної кав'ярні формату «to-go» зі свіжою випічкою та якісною спешелті кавою в спальному районі міста...",
  },
  {
    key: "customers" as const,
    label: "Цільова аудиторія (клієнти)",
    hint: "Хто ваші покупці, які їхні потреби та чому вони оберуть саме вас?",
    placeholder: "Наприклад: Мешканці навколишніх будинків, молоді батьки, офісні працівники та студенти, які цінують швидкість та якість...",
  },
  {
    key: "salesChannels" as const,
    label: "Канали продажу та залучення",
    hint: "Як клієнти дізнаються про вас і як ви будете продавати?",
    placeholder: "Наприклад: Офлайн-точка на першій лінії, сторінка в Instagram, локальна реклама, програма лояльності для постійних гостей...",
  },
];

const businessPlanFields = [
  {
    key: "implementationPlan" as const,
    label: "Покроковий план реалізації",
    hint: "Які основні етапи запуску та строки ви передбачаєте?",
    placeholder: "Наприклад: Місяць 1: підписання договору оренди та ремонт. Місяць 2: закупівля обладнання, оформлення ФОП та отримання дозволів. Місяць 3: найм персоналу, тестовий запуск та відкриття...",
  },
  {
    key: "expectedResults" as const,
    label: "Очікувані результати",
    hint: "Поясніть вимірювані результати; робочі місця додавайте, якщо це передбачає ваш план або конкретний напрям.",
    placeholder: "Наприклад: Запуск продажів, кількість клієнтів та обґрунтований прогноз доходу...",
  },
];

const PROGRAM_BUDGET_TEMPLATES: Record<string, { label: string; name: string; price: string }[]> = {
  "vlasna-sprava": [
    { label: "⚙️ Обладнання / техніка", name: "Виробниче або торгове обладнання", price: "80000.00" },
    { label: "🏢 Оренда", name: "Оренда нежитлового приміщення", price: "25000.00" },
    { label: "📦 Сировина", name: "Сировина та витратні матеріали", price: "35000.00" },
    { label: "📢 Маркетинг і реклама", name: "Маркетингові послуги та реклама", price: "15000.00" },
    { label: "💻 ПРРО / Каса / ПЗ", name: "Програмне забезпечення та термінал ПРРО", price: "10000.00" },
  ],
  "veteran-grant": [
    { label: "⚙️ Виробниче обладнання", name: "Технологічне та виробниче обладнання", price: "250000.00" },
    { label: "🏢 Оренда приміщення", name: "Оренда виробничого/торгового приміщення", price: "40000.00" },
    { label: "📦 Сировина та матеріали", name: "Партія сировини та витратних матеріалів", price: "80000.00" },
    { label: "📢 Маркетинг і веб-сайт", name: "Розробка сайту та маркетингова кампанія", price: "30000.00" },
    { label: "🤝 Франшиза / ліцензія", name: "Франшиза або ліцензійні права", price: "100000.00" },
  ],
  "processing-business": [
    { label: "🏭 Виробнича лінія", name: "Автоматизована виробнича лінія", price: "2000000.00" },
    { label: "🚚 Доставка обладнання", name: "Транспортування виробничого устаткування", price: "150000.00" },
    { label: "🔧 Монтаж та запуск", name: "Введення виробничої лінії в експлуатацію", price: "250000.00" },
    { label: "⚙️ Допоміжне обладнання", name: "Верстати обробки та пакування", price: "600000.00" },
  ],
  "agro-gardens": [
    { label: "🌱 Саджанці насаджень", name: "Сертифікований садивний матеріал", price: "300000.00" },
    { label: "💧 Крапельне зрошення", name: "Система крапельного поливу та автоматики", price: "180000.00" },
    { label: "🏗️ Опорні конструкції", name: "Шпалери та опорні стовпи", price: "120000.00" },
    { label: "🧪 Добрива та ЗЗР", name: "Комплекс первинного живлення та захисту", price: "50000.00" },
  ],
};


type Case = {
  id: string;
  title: string;
  programId: string | null;
  revision: number;
  items: Item[];
  details: Details;
  totalKopecks: number;
};
function readCase(value: unknown): Case {
  if (!value || typeof value !== "object") throw Error("invalid_case_response");
  const c = value as Record<string, unknown>;
  const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  if (typeof c.id !== "string" || !c.id || typeof c.title !== "string" || !integer(c.revision) || !integer(c.totalKopecks) ||
      !Array.isArray(c.items) || !c.items.every((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const i = item as Record<string, unknown>;
        return typeof i.name === "string" && integer(i.quantity) && Number(i.quantity) > 0 && integer(i.unitPriceKopecks);
      }) || !c.details || typeof c.details !== "object" || Array.isArray(c.details)) throw Error("invalid_case_response");
  return value as Case;
}
type DraftItem = { clientId: string; name: string; quantity: string; price: string };
const toDraft = (items: Item[]): DraftItem[] =>
  items.map((i) => ({
    clientId: crypto.randomUUID(),
    name: i.name,
    quantity: String(i.quantity),
    price: (i.unitPriceKopecks / 100).toFixed(2),
  }));
const hydrateDraft = (
  rows: readonly { clientId?: unknown; name: string; quantity: string; price: string }[],
): DraftItem[] =>
  rows.map((row) => ({
    clientId:
      typeof row.clientId === "string" && row.clientId
        ? row.clientId
        : crypto.randomUUID(),
    name: row.name,
    quantity: row.quantity,
    price: row.price,
  }));
const serializeBudget = (
  rows: readonly { name: string; quantity: string; price: string }[],
) => rows.map(({ name, quantity, price }) => ({ name, quantity, price }));
const money = (n: number) =>
  `${Math.floor(n / 100).toLocaleString("uk-UA")},${String(n % 100).padStart(2, "0")} грн`;
function printSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
export function Cases({
  user,
  onUnsavedChange,
  selectedProgram,
  programTarget,
  onClearProgram,
  onBrowsePrograms,
  onFindFunding,
  businessName,
  profileRevision = 0,
  preparationSeed = "",
  preparationId = "",
  onOpenFeedback,
}: {
  user: User;
  onUnsavedChange?: (dirty: boolean) => void;
  selectedProgram?: GrantProgram | null;
  programTarget?: { id: string; title: string; revision: number } | null;
  onClearProgram?: () => void;
  onBrowsePrograms?: () => void;
  onFindFunding?: (need: string, project: { id: string; title: string; revision: number }) => void;
  onOpenProfile?: () => void;
  businessName?: string;
  profileRevision?: number;
  preparationSeed?: string;
  preparationId?: string;
  onOpenFeedback?: (context?: { screen?: "export" | "budget" | "cases"; programId?: string | null }) => void;
}) {
  const {programs: GRANT_PROGRAMS} = useGrantPrograms();
  const confirm = useConfirm();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState<Case | null>(null),
    [draft, setDraft] = useState<DraftItem[]>([]),
    [details, setDetails] = useState<Details>(emptyDetails),
    [readiness, setReadiness] = useState<Readiness | null>(null),
    [readinessError, setReadinessError] = useState(false),
    [title, setTitle] = useState(""),
    [initialNeed, setInitialNeed] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [listLoading, setListLoading] = useState(true),
    [listError, setListError] = useState(""),
    [conflict, setConflict] = useState(false),
    [activeStep, setActiveStep] = useState<"basics" | "plan" | "budget" | "review" | "assistant">("assistant"),
    [assistantPrompt, setAssistantPrompt] = useState<string>(""),
    [chatDraft, setChatDraft] = useState(false),
    [showCreate, setShowCreate] = useState(false),
    [contextDrawerOpen, setContextDrawerOpen] = useState(false),
    [showExportFeedback, setShowExportFeedback] = useState(false);
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const contextDrawerRef = useRef<HTMLElement>(null);
  const isAssistantStep = activeStep === "assistant";

  useEffect(() => {
    if (!isAssistantStep || showCreate) {
      setContextDrawerOpen(false);
    }
  }, [isAssistantStep, showCreate, selected?.id]);

  useEffect(() => {
    if (!contextDrawerOpen || !isAssistantStep) return;
    contextDrawerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setContextDrawerOpen(false);
        contextToggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextDrawerOpen, isAssistantStep]);
  const [pending, setPending] = useState<{
    id: string;
    body: string;
    kind: "budget" | "details";
  } | null>(null);
  async function request(path: string, init: RequestInit = {}) {
    const timeoutMs = path.endsWith("/assistant") && init.method === "POST" ? 40000 : 15000;
    return authenticatedRequest(user, path, init, timeoutMs);
  }
  const lastCaseKey = `grantfolio:last-case:${encodeURIComponent(user.uid)}`;
  function rememberCase(id: string) { try { sessionStorage.setItem(lastCaseKey, id); } catch {} }
  function lastCaseId() { try { return sessionStorage.getItem(lastCaseKey); } catch { return null; } }
  const createTitleInput = useRef<HTMLInputElement>(null);
  const createAttempt = useRef<{ body: string; id: string } | null>(null);
  const listRequest = useRef(false);
  async function loadList() {
    if (listRequest.current) return;
    listRequest.current = true;
    setListLoading(true);
    setListError("");
    try {
      const r = await request("/api/cases");
      if (!r.ok) {
        setListError(r.status === 401 || r.status === 403
          ? "Не вдалося підтвердити вхід. Спробуйте ще раз. Якщо помилка повториться, вийдіть з акаунта й увійдіть знову."
          : "Список тимчасово недоступний. Спробуйте ще раз за мить.");
        return;
      }
      const payload = await r.json();
      if (!Array.isArray(payload?.cases)) throw Error("invalid_case_list");
      const loaded: Case[] = payload.cases.map(readCase);
      setCases(loaded);
      setReady(true);
      if (!selected && loaded.length > 0) {
        const remembered = lastCaseId();
        void select(loaded.find(c => c.id === remembered)?.id ?? loaded[0].id);
      }
    } catch (error) {
      setListError(readableApiError(error, "Не вдалося завантажити список проєктів. Спробуйте ще раз."));
    } finally {
      listRequest.current = false;
      setListLoading(false);
    }
  }
  useEffect(() => {
    void loadList();
  }, [user]);
  const budgetDirty =
    selected !== null &&
    JSON.stringify(serializeBudget(draft)) !==
      JSON.stringify(
        selected.items.map((i) => ({
          name: i.name,
          quantity: String(i.quantity),
          price: (i.unitPriceKopecks / 100).toFixed(2),
        })),
      );
  const detailsDirty =
    selected !== null &&
    JSON.stringify(details) !==
      JSON.stringify(selected.details || emptyDetails);
  const dirty = budgetDirty || detailsDirty;
  const sessionDraft = useSessionDraft(user.uid, selected, details, draft, dirty, !!pending);
  useEffect(() => {
    onUnsavedChange?.(dirty || !!pending || chatDraft);
  }, [dirty, pending, chatDraft, onUnsavedChange]);
  const readinessRequest = useRef(0);
  async function loadReadiness(id: string) {
    const sequence = ++readinessRequest.current;
    setReadiness(null);
    setReadinessError(false);
    try {
      const r = await request(`/api/cases/${id}/readiness`);
      if (!r.ok) throw Error();
      const result = await r.json();
      if (sequence === readinessRequest.current) setReadiness(result);
    } catch {
      if (sequence === readinessRequest.current) setReadinessError(true);
    }
  }
  useEffect(() => {
    if (!dirty && !pending && !chatDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending, chatDraft]);
  async function mayLeaveDraft() {
    if (pending) {
      setError("Спочатку повторіть збереження, щоб дізнатися його результат.");
      return false;
    }
    if (!dirty && !chatDraft) return true;
    const confirmed = await confirm({
      title: "Перейти до іншого проєкту?",
      message: "Є незбережені зміни або ненадіслане запитання. Якщо відкрити інший проєкт, їх буде втрачено.",
      confirmLabel: "Перейти без збереження",
      cancelLabel: "Залишитися",
      tone: "warning",
    });
    return confirmed && mountedRef.current;
  }
  async function select(id: string, discard = false) {
    if (!discard && selected?.id === id) return;
    if (!discard && !(await mayLeaveDraft())) return;
    setBusy(true);
    setError("");
    try {
      const r = await request(`/api/cases/${id}`);
      if (!r.ok) throw Error();
      const c = readCase((await r.json()).case);
      rememberCase(c.id);
      setSelected(c);
      setDraft(toDraft(c.items));
      setDetails(c.details || emptyDetails);
      setActiveStep("assistant");
      setAssistantPrompt("");
      void loadReadiness(c.id);
      setConflict(false);
      setPending(null);
      setNotice("");
    } catch (error) {
      setError(readableApiError(error, "Не вдалося завантажити чернетку."));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (selectedProgram && programTarget) { setShowCreate(false); return; }
    if (selectedProgram) {
      setShowCreate(true);
      setTitle((current) => (!preparationId && current) || `${preparationSeed ? preparationSeed.slice(0,80) : businessName || "Мій проєкт"} — ${friendlyTitle(selectedProgram)}`.slice(0, 160));
      requestAnimationFrame(() => createTitleInput.current?.focus());
    }
  }, [selectedProgram, programTarget, businessName, preparationSeed, preparationId]);

  async function create(e?: React.FormEvent, preparation?: { title: string; programId: string; initialDescription: string }) {
    e?.preventDefault();
    if (programTarget || busy || !ready || (!preparation && !(await mayLeaveDraft()))) return;
    const targetId = preparation?.programId ?? selectedProgram?.id ?? null;
    const target = targetId ? GRANT_PROGRAMS.find(p => p.id === targetId) : null;
    if (targetId && (!target || !hasGuidedApplication(target.id))) { setError("Для цієї програми доступний пошук і перегляд умов. Виберіть програму з анкетою або створіть загальну чернетку."); return; }
    const values = preparation ?? { title, programId: target?.id ?? null, initialDescription: initialNeed };
    const body = JSON.stringify(values);
    if (!createAttempt.current || createAttempt.current.body !== body) createAttempt.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, id: createAttempt.current.id }),
      });
      if (!r.ok) throw Error();
      const c = readCase((await r.json()).case);
      createAttempt.current = null;
      rememberCase(c.id);
      setCases([c, ...cases.filter(existing => existing.id !== c.id)]);
      setSelected(c);
      setDraft([]);
      setDetails(c.details || emptyDetails);
      setActiveStep("assistant");
      setAssistantPrompt("");
      void loadReadiness(c.id);
      setTitle("");
      setInitialNeed("");
      setShowCreate(false);
      onClearProgram?.();
      setPending(null);
      setConflict(false);
    } catch (error) {
      setError(`${readableApiError(error, "Не вдалося підтвердити створення.")} Можна повторити створення без дублювання, не змінюючи назву й програму.`);
    } finally {
      setBusy(false);
    }
  }

  const handledPreparation = useRef("");
  useEffect(() => {
    if (programTarget || !preparationId || handledPreparation.current === preparationId || !selectedProgram || !ready || busy) return;
    handledPreparation.current = preparationId;
    const targetProgram = selectedProgram;
    const targetSeed = preparationSeed;
    const targetBusiness = businessName;
    void (async () => {
      if (!(await mayLeaveDraft())) {
        if (mountedRef.current) {
          setShowCreate(false);
          onClearProgram?.();
        }
        return;
      }
      if (!mountedRef.current) return;
      await create(undefined, {
        title: `${targetSeed ? targetSeed.slice(0, 80) : targetBusiness || "Мій проєкт"} — ${friendlyTitle(targetProgram)}`.slice(0, 160),
        programId: targetProgram.id,
        initialDescription: targetSeed,
      });
    })();
  }, [preparationId, selectedProgram, programTarget, ready, busy, preparationSeed, businessName]);

  async function attachProgram() {
    if (!programTarget || !selectedProgram || !selected || selected.id !== programTarget.id || selected.revision !== programTarget.revision || busy || dirty || pending || conflict || sessionDraft.recovery) return;
    const currentProgram = GRANT_PROGRAMS.find(p => p.id === selectedProgram.id);
    if (!currentProgram || !hasGuidedApplication(currentProgram.id)) { setError("Для цієї програми доступний пошук і перегляд умов."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await request(`/api/cases/${programTarget.id}/program`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: selectedProgram.id, expectedRevision: programTarget.revision }),
      });
      if (r.status === 409) {
        setConflict(true);
        setError("Проєкт змінився після вибору фінансування. Завантажте актуальну версію та виберіть програму знову.");
        return;
      }
      if (!r.ok) throw Error();
      const updated = readCase((await r.json()).case);
      setSelected(updated);
      setCases(old => old.map(c => c.id === updated.id ? updated : c));
      void loadReadiness(updated.id);
      onClearProgram?.();
      setNotice(`Програму «${friendlyTitle(selectedProgram)}» обрано для проєкту.`);
    } catch {
      setConflict(true);
      setError("Не вдалося підтвердити вибір програми. Завантажте актуальну версію проєкту та перевірте результат.");
    } finally { setBusy(false); }
  }
  async function save() {
    if (!selected || sessionDraft.recovery) return;
    const retrying = pending?.kind === "budget";
    let command = retrying ? pending : null;
    if (!command) {
      const items: Item[] = [];
      for (const row of draft) {
        const price = row.price.trim().replace(",", ".");
        if (
          !row.name.trim() ||
          !/^\d+$/.test(row.quantity) ||
          !/^\d+(\.\d{1,2})?$/.test(price)
        ) {
          setError(
            "Заповніть назву, цілу кількість і ціну з точністю до копійок.",
          );
          return;
        }
        const [whole, decimal = ""] = price.split(".");
        const kopecks = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
        const quantity = Number(row.quantity);
        if (
          !Number.isSafeInteger(kopecks) ||
          kopecks > 1000000000 ||
          quantity < 1 ||
          quantity > 1000000
        ) {
          setError("Кількість або ціна виходить за дозволені межі.");
          return;
        }
        items.push({ name: row.name, quantity, unitPriceKopecks: kopecks });
      }
      command = {
        id: selected.id,
        kind: "budget",
        body: JSON.stringify({
          expectedRevision: selected.revision,
          idempotencyKey: crypto.randomUUID(),
          items,
        }),
      };
      setPending(command);
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${command.id}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: command.body,
      });
      if (r.status === 409) {
        setConflict(true);
        setPending(null);
        setError(
          "Чернетка змінилася в іншій вкладці. Ваші незбережені зміни залишилися у формі. Скопіюйте їх перед завантаженням актуальної версії.",
        );
        return;
      }
      if (r.status >= 400 && r.status < 500) {
        setPending(null);
        setError(
          "Не вдалося зберегти бюджет. Перевірте введені дані та увійдіть знову за потреби.",
        );
        return;
      }
      if (!r.ok) throw Error();
      let c = readCase((await r.json()).case);
      // A repeated command returns its original snapshot; another tab may have
      // saved a newer revision since then. Keep the pending command until the
      // current version is known, so a failed refresh remains safe to retry.
      if (retrying) {
        const latest = await request(`/api/cases/${command.id}`);
        if (!latest.ok) throw Error();
        const current = readCase((await latest.json()).case);
        if (current.revision !== c.revision && detailsDirty) {
          setPending(null);
          setConflict(true);
          setError("Бюджет збережено, але проєкт пізніше змінився в іншій вкладці. Скопіюйте незбережений опис перед завантаженням актуальної версії.");
          return;
        }
        c = current;
      }
      if (!detailsDirty) sessionDraft.discard();
      setSelected(c);
      setDraft(toDraft(c.items));
      if (!detailsDirty) setDetails(c.details || emptyDetails);
      setCases((old) => old.map((x) => (x.id === c.id ? c : x)));
      setPending(null);
      void loadReadiness(c.id);
      setNotice("Бюджет збережено.");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Повторіть збереження: повторна спроба перевірить результат тієї самої команди. До цього редагування недоступне.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDetails() {
    if (!selected || sessionDraft.recovery) return;
    const retrying = pending?.kind === "details";
    let command = retrying ? pending : null;
    if (!command) {
      command = {
        id: selected.id,
        kind: "details",
        body: JSON.stringify({
          expectedRevision: selected.revision,
          idempotencyKey: crypto.randomUUID(),
          details,
        }),
      };
      setPending(command);
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${command.id}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: command.body,
      });
      if (r.status === 409) {
        setConflict(true);
        setPending(null);
        setError(
          "Чернетка змінилася в іншій вкладці. Ваші незбережені зміни залишилися у формі. Скопіюйте їх перед завантаженням актуальної версії.",
        );
        return;
      }
      if (r.status >= 400 && r.status < 500) {
        setPending(null);
        setError(
          "Не вдалося зберегти опис. Перевірте введені дані та увійдіть знову за потреби.",
        );
        return;
      }
      if (!r.ok) throw Error();
      let c = readCase((await r.json()).case);
      if (retrying) {
        const latest = await request(`/api/cases/${command.id}`);
        if (!latest.ok) throw Error();
        const current = readCase((await latest.json()).case);
        if (current.revision !== c.revision && budgetDirty) {
          setPending(null);
          setConflict(true);
          setError("Опис збережено, але проєкт пізніше змінився в іншій вкладці. Скопіюйте незбережений бюджет перед завантаженням актуальної версії.");
          return;
        }
        c = current;
      }
      if (!budgetDirty) sessionDraft.discard();
      setSelected(c);
      setDetails(c.details || emptyDetails);
      if (!budgetDirty) setDraft(toDraft(c.items));
      setCases((old) => old.map((x) => (x.id === c.id ? c : x)));
      setPending(null);
      void loadReadiness(c.id);
      setNotice("Опис проєкту збережено.");
    } catch {
      setError(
        "Не вдалося отримати відповідь. Повторіть збереження: повторна спроба перевірить результат тієї самої команди. До цього редагування недоступне.",
      );
    } finally {
      setBusy(false);
    }
  }
  const revokeTimer = useRef<number | null>(null);
  const pendingBlobUrl = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (revokeTimer.current !== null) {
        window.clearTimeout(revokeTimer.current);
        revokeTimer.current = null;
      }
      if (pendingBlobUrl.current !== null) {
        URL.revokeObjectURL(pendingBlobUrl.current);
        pendingBlobUrl.current = null;
      }
    };
  }, []);
  async function downloadDraft() {
    if (!selected || dirty || pending) {
      setError("Спочатку збережіть зміни в описі та бюджеті.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request(`/api/cases/${selected.id}/draft-export`);
      if (!response.ok) throw Error();
      if (revokeTimer.current !== null) {
        window.clearTimeout(revokeTimer.current);
        revokeTimer.current = null;
      }
      if (pendingBlobUrl.current !== null) {
        URL.revokeObjectURL(pendingBlobUrl.current);
        pendingBlobUrl.current = null;
      }
      const url = URL.createObjectURL(await response.blob());
      pendingBlobUrl.current = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = "grantfolio-project.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      revokeTimer.current = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        if (pendingBlobUrl.current === url) pendingBlobUrl.current = null;
        revokeTimer.current = null;
      }, 1000);
      setNotice("Чернетку підготовлено до завантаження.");
      setShowExportFeedback(true);
    } catch (error) {
      setError(readableApiError(error, "Не вдалося завантажити чернетку. Спробуйте ще раз."));
    } finally {
      setBusy(false);
    }
  }
  async function deleteDraft() {
    if (!selected || sessionDraft.recovery) return;
    const targetCase = selected;
    const confirmed = await confirm({
      title: "Видалити проєкт?",
      message: `Чернетку «${targetCase.title}» буде видалено. Цю дію неможливо скасувати.`,
      confirmLabel: "Видалити",
      cancelLabel: "Скасувати",
      tone: "danger",
    });
    if (!confirmed || !mountedRef.current || sessionDraft.recovery) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await request(`/api/cases/${targetCase.id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw Error();
      setCases((old) => old.filter((c) => c.id !== targetCase.id));
      setSelected(null);
      setDraft([]);
      setDetails(emptyDetails);
      setReadiness(null);
      setPending(null);
      setConflict(false);
      setChatDraft(false);
      setNotice("Чернетку видалено.");
    } catch (error) {
      setError(`${readableApiError(error, "Не вдалося підтвердити видалення.")} Оновіть сторінку та перевірте список проєктів перед повторною спробою.`);
    } finally {
      setBusy(false);
    }
  }
  function edit(index: number, patch: Partial<Omit<DraftItem, "clientId">>) {
    if (sessionDraft.recovery) return;
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setPending(null);
    setNotice("");
  }
  function addBudgetItem(name = "", price = "0.00", quantity = "1") {
    if (sessionDraft.recovery || draft.length >= 100) return;
    setDraft((prev) => [...prev, { clientId: crypto.randomUUID(), name, quantity, price }]);
    setPending(null);
    setNotice("");
  }
  function askAssistant(promptText: string) {
    setAssistantPrompt(promptText);
    setActiveStep("assistant");
  }
  function importSuggestedBudgetItems(items: { name: string; quantity: string; price: string }[]) {
    if (!selected || busy || pending || conflict || sessionDraft.recovery || draft.length + items.length > 100) return false;
    setDraft((prev) => [
      ...prev,
      ...items.map((item) => ({ ...item, clientId: crypto.randomUUID() })),
    ]);
    setPending(null);
    setNotice(`Успішно імпортовано ${items.length} статей до бюджету. Перейдіть на Крок 3 для збереження.`);
    return true;
  }
  function applySuggestion(suggestion: { field: keyof Details; text: string }, mode: "replace" | "append", expectedCurrent: string) {
    const fields: (keyof Details)[] = ["projectDescription", "customers", "salesChannels", "implementationPlan", "expectedResults"];
    if (!selected || busy || pending || conflict || sessionDraft.recovery || !fields.includes(suggestion.field) || typeof suggestion.text !== "string" || !suggestion.text.trim() || suggestion.text.length > 3000 || details[suggestion.field] !== expectedCurrent || (mode !== "replace" && mode !== "append")) return false;
    const text = suggestion.text.trim();
    const next = mode === "append" && expectedCurrent ? `${expectedCurrent}\n\n${text}` : text;
    if (next.length > 3000) return false;
    setDetails({ ...details, [suggestion.field]: next });
    setNotice("Текст додано до форми. Перевірте й збережіть зміни.");
    return true;
  }
  const liveBudgetKopecks = draft.reduce((sum, row) => {
    const price = row.price.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^\d+$/.test(row.quantity)) return Number.NaN;
    const [whole, decimal = ""] = price.split(".");
    const kopecks = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    const quantity = Number(row.quantity);
    if (!Number.isSafeInteger(kopecks) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 || kopecks > 1000000000) return Number.NaN;
    const total = sum + kopecks * quantity;
    return Number.isSafeInteger(total) ? total : Number.NaN;
  }, 0);

  const activeProgram = GRANT_PROGRAMS.find((p) => p.id === selected?.programId) ?? null;
  const activeTemplates = activeProgram ? (PROGRAM_BUDGET_TEMPLATES[activeProgram.id] ?? []) : [];
  const basicsFields = businessBasicsFields;
  const planFields = businessPlanFields;
  function openField(key: keyof Details) {
    setActiveStep(["implementationPlan", "expectedResults"].includes(key) ? "plan" : "basics");
    requestAnimationFrame(() => document.getElementById(`preparation-${key}`)?.focus());
  }
  function openDocuments() {
    setActiveStep("review");
    requestAnimationFrame(() => {
      const section = document.getElementById("grant-application") ?? document.getElementById("preparation-documents");
      section?.scrollIntoView({ block: "start" });
    });
  }
  const missingField = [...basicsFields, ...planFields].find(field => !details[field.key]?.trim());
  const nextStep = missingField ? { label: `Заповнити: ${missingField.label.toLocaleLowerCase("uk")}`, description: "Перенесіть підтверджені факти в матеріали заявки. Асистент допоможе сформулювати текст; збережіть його після перевірки.", onOpen: () => openField(missingField.key) }
    : !draft.length ? { label: "Скласти кошторис", description: "Додайте потрібні витрати й підтвердьте суми перед переходом до документів.", onOpen: () => setActiveStep("budget") }
    : { label: "Перевірити документи та подання", description: "Звірте офіційну форму, перелік додатків і строки обраного конкурсу.", onOpen: openDocuments };

  const printReadiness = selected ? snapshotReadiness({ revision: selected.revision, details: selected.details, items: selected.items, total_kopecks: selected.totalKopecks }) : null;
  const printBudget = selected ? assessBudget(selected.items, selected.totalKopecks) : null;
  const printBlocked = busy || dirty || !!pending || conflict || !!sessionDraft.recovery;
  const printFields = [...basicsFields, ...planFields].filter(({ key }) => selected?.details[key]?.trim());
  const printMissingChecks = printReadiness?.checks.filter(check => check.status === "missing") ?? [];

  const isStep1Done = Boolean(details.projectDescription.trim() && details.customers.trim());
  const isStep2Done = Boolean(details.implementationPlan.trim());
  const isStep3Done = draft.length > 0;


  const readinessCompleteCount = readiness
    ? readiness.checks.filter((check) => check.status === "complete").length
    : null;
  const readinessTotalCount = readiness ? readiness.checks.length : null;
  const hasUnifiedPicker = cases.length > 0 && !showCreate;

  return (
    <div className={`card cases-card${selected && !showCreate && isAssistantStep ? " cases-card--assistant" : ""}`}>
      {selected && selected.programId !== "vlasna-sprava" && !printBlocked && createPortal(
        <article className="print-document" lang="uk" aria-label="Робоча чернетка проєкту">
          <header className="print-document-header">
            <div className="print-brand">GrantFolio</div>
            <p>РОБОЧА ЧЕРНЕТКА · ЗВІРТЕ З ОФІЦІЙНОЮ ФОРМОЮ</p>
          </header>
          <h1>{selected.title}</h1>
          <p className="print-document-lead">Опис проєкту та кошторис зі збережених даних заявника.</p>
          <table className="print-metadata" aria-label="Відомості про проєкт"><tbody>
            <tr><th scope="row">Цільова програма</th><td>{activeProgram ? `${activeProgram.title} · ${activeProgram.provider}` : "Не обрано"}</td></tr>
            <tr><th scope="row">Збережена версія</th><td>{selected.revision}</td></tr>
            <tr><th scope="row">Дата формування</th><td>{new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv" })}</td></tr>
          </tbody></table>
          <h2>Опис і план проєкту</h2>
          {printReadiness && <p className="print-document-note">{printMissingChecks.length ? `Потребує доопрацювання: ${printMissingChecks.map(check => check.label).join(", ")}.` : "Базову перевірку заповнення пройдено. Перевірте факти та узгодженість."}</p>}
          {printFields.map((field) => (
            <section key={field.key}>
              <h3>{field.label}</h3>
              <p className="print-paragraph">{selected.details[field.key]}</p>
            </section>
          ))}
          <h2>Бюджет</h2>
          {printBudget?.validItems && selected.items.length > 0 ? <table className="print-budget" aria-label="Кошторис проєкту">
            <thead><tr><th scope="col">Стаття витрат</th><th scope="col">Кількість</th><th scope="col">Ціна за одиницю</th><th scope="col">Сума</th></tr></thead>
            <tbody>{selected.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.unitPriceKopecks)}</td><td>{money(item.quantity * item.unitPriceKopecks)}</td></tr>)}</tbody>
          </table> : <p className="print-document-note">{printBudget?.validItems ? "Витрати ще не додано." : "Позиції бюджету пошкоджені. Перевірте та збережіть кошторис повторно."}</p>}
          {printBudget?.totalMatches
            ? <p className="print-total">Загальна сума бюджету <strong>{money(selected.totalKopecks)}</strong></p>
            : <p className="print-document-note">Підсумок потребує перевірки. Збережена сума має збігатися із сумою позицій.</p>}
          {activeProgram && <><h2>Документи та наступні кроки</h2>
          <ul>{activeProgram.details.documents.map(document => <li key={document}>{document}</li>)}</ul>
          <ol>{activeProgram.details.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <h2>Офіційні джерела</h2>
          {activeProgram.details.sources.map(source => {
            const url = printSourceUrl(source.url);
            return <p className="print-source" key={source.url}>
              <strong>{source.title}</strong>{" "}
              <small>· Перевірено {source.checkedAt}</small>
              {url && <><br /><a href={url}>{url}</a></>}
            </p>;
          })}</>}
          <footer className="print-document-footer">
            <strong>Перевірка перед поданням</strong>
            <p>Звірте умови участі, актуальний прийом, перелік документів і дозволені витрати на сайті організатора. Перенесіть перевірені матеріали до актуальної форми заявки.</p>
          </footer>
        </article>, document.body
      )}
      <div className="cases-unified-bar">
        {hasUnifiedPicker ? (
          <div className="cases-unified-picker">
            <h2 className="sr-only">Мої проєкти</h2>
            <label htmlFor="case-switcher-select" className="cases-unified-label">
              Проєкт
            </label>
            <div className="cases-unified-select">
              <CustomSelect
                id="case-switcher-select"
                className="case-switcher-select"
                ariaLabel="Обраний проєкт"
                placeholder="Оберіть проєкт"
                value={selected?.id ?? ""}
                disabled={busy}
                options={cases.map((item) => ({ value: item.id, label: item.title }))}
                onChange={(val) => void select(val)}
              />
            </div>
          </div>
        ) : (
          <div className="cases-unified-heading">
            <h2>Мої проєкти</h2>
          </div>
        )}
        <div className="cases-unified-actions">
          {selected && !showCreate && isAssistantStep && (
            <button
              ref={contextToggleRef}
              type="button"
              className={`cases-context-toggle${contextDrawerOpen ? " is-active" : ""}`}
              onClick={() => setContextDrawerOpen((open) => !open)}
              aria-expanded={contextDrawerOpen}
              aria-controls="case-context-drawer"
              aria-label="Дані проєкту"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span className="cases-context-toggle-label">Дані проєкту</span>
              <span className="cases-context-toggle-short" aria-hidden="true">Дані</span>
              {readinessCompleteCount !== null && readinessTotalCount !== null && (
                <span className="cases-context-badge" aria-hidden="true">
                  {readinessCompleteCount}/{readinessTotalCount}
                </span>
              )}
              {(dirty || pending) && <span className="cases-dirty-dot" title="Є незбережені зміни" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className="secondary-btn cases-new-btn"
            disabled={!ready || !!programTarget}
            onClick={() => {
              setShowCreate((open) => !open);
              if (showCreate) onClearProgram?.();
              else requestAnimationFrame(() => createTitleInput.current?.focus());
            }}
            aria-expanded={showCreate}
            aria-controls="create-case-panel"
            aria-label={showCreate ? "Закрити створення проєкту" : "Новий проєкт"}
          >
            {showCreate ? (
              "Закрити"
            ) : (
              <>
                <span className="cases-new-btn-full">+ Новий проєкт</span>
                <span className="cases-new-btn-short" aria-hidden="true">+ Новий</span>
              </>
            )}
          </button>
        </div>
      </div>
      {selectedProgram && programTarget && <section className="create-case-disclosure" aria-label="Вибір програми для проєкту">
        <h3>Обрати «{friendlyTitle(selectedProgram)}» для «{programTarget.title}»</h3>
        <p>Програма буде додана до цього проєкту, а його матеріали залишаться на місці.</p>
        {selected?.id !== programTarget.id && <p>Спочатку відкрийте потрібний проєкт. <button type="button" disabled={busy} onClick={() => void select(programTarget.id)}>Відкрити проєкт</button></p>}
        {selected?.id === programTarget.id && (dirty || pending || sessionDraft.recovery) && <p>Спочатку збережіть зміни та вирішіть питання відновлення копії.</p>}
        {selected?.id === programTarget.id && selected.revision !== programTarget.revision && <p>Версія проєкту змінилася. Виберіть фінансування знову для актуальної версії.</p>}
        <button type="button" className="primary" disabled={busy || !selected || selected.id !== programTarget.id || selected.revision !== programTarget.revision || dirty || !!pending || conflict || !!sessionDraft.recovery} onClick={() => void attachProgram()}>Обрати для цього проєкту</button>
        <button type="button" className="secondary-btn" disabled={busy} onClick={() => { onClearProgram?.(); setError(""); }}>Скасувати</button>
      </section>}
      {(listLoading || listError) && (
        <div className={`case-load-region${ready || showCreate ? " case-load-region--compact" : ""}`}>
          <section className="case-load-state" aria-labelledby="case-load-title" aria-busy={listLoading}>
            <div className={`case-load-icon${listLoading ? " case-load-icon--loading" : ""}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {listLoading ? <path d="M20 12a8 8 0 1 1-5.5-7.6" /> : <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-6l-2-2H9Z" /><path d="M12 10v4m0 3h.01" /></>}
              </svg>
            </div>
            <div role={listLoading ? "status" : "alert"}>
              <h3 id="case-load-title">{listLoading ? "Завантажуємо ваші проєкти" : "Не вдалося завантажити проєкти"}</h3>
              <p>{listLoading ? "Ще мить — і можна продовжувати роботу з асистентом." : listError}</p>
            </div>
            {!listLoading && <>
              <div className="case-load-actions">
                <button type="button" className="primary" onClick={() => void loadList()}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-.8L20 9M4 15l2.3 2.8A7 7 0 0 0 17.9 17" /></svg>
                  Спробувати ще раз
                </button>
                <button type="button" className="secondary-btn" onClick={onBrowsePrograms}>Переглянути каталог</button>
              </div>
              <p className="case-load-hint">Поки відновлюється доступ, можна переглянути умови грантів.</p>
            </>}
          </section>
        </div>
      )}
      {ready && !listLoading && !listError && cases.length === 0 && !showCreate && (
        <div className="case-load-region">
          <section className="case-load-state case-empty-state" aria-labelledby="case-empty-title">
            <div className="case-load-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-6l-2-2H9Z" /><path d="M12 10v6m-3-3h6" /></svg>
            </div>
            <h3 id="case-empty-title">У вас ще немає проєктів</h3>
            <p>Тут з’являться ваші чернетки. Почніть з розмови в розділі «Асистент» або створіть проєкт самостійно.</p>
            <div className="case-load-actions">
              <button type="button" className="primary" onClick={() => { setShowCreate(true); requestAnimationFrame(() => createTitleInput.current?.focus()); }}>Створити проєкт</button>
            </div>
          </section>
        </div>
      )}
      <div id="create-case-panel" hidden={!showCreate} className="create-case-disclosure">
        <h3>Новий проєкт</h3>
        <p>{selectedProgram ? `Готуємо новий проєкт для програми «${selectedProgram.title}». Перевірте назву й почніть роботу з асистентом.` : "Назвіть проєкт і, за бажанням, опишіть потребу. Фінансування можна підібрати пізніше."}</p>
      <form onSubmit={create} className="create-case-form">
        <label>
          Назва чернетки
          <input
            ref={createTitleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={160}
            placeholder="Наприклад, обладнання для майстерні"
          />
        </label>
        <label>Потреба або ідея (необов’язково)
          <textarea value={initialNeed} onChange={e => setInitialNeed(e.target.value)} maxLength={2000} placeholder="Наприклад, обладнання для майстерні" />
        </label>
        {selectedProgram && <p>Обрана програма: {friendlyTitle(selectedProgram)}</p>}
        <button type="submit" className="primary" disabled={busy || !ready}>
          Створити чернетку <span>↗</span>
        </button>
      </form>
      </div>
      {selected && (
        <div className={`case-workspace${isAssistantStep ? " case-workspace--assistant" : ""}`} hidden={showCreate}>
          {isAssistantStep && contextDrawerOpen && (
            <button
              type="button"
              className="case-context-scrim"
              aria-label="Закрити панель даних проєкту"
              onClick={() => {
                setContextDrawerOpen(false);
                contextToggleRef.current?.focus();
              }}
            />
          )}
          <aside
            id="case-context-drawer"
            ref={contextDrawerRef}
            tabIndex={isAssistantStep ? -1 : undefined}
            className={`case-context${isAssistantStep ? " case-context--drawer" : ""}${isAssistantStep && contextDrawerOpen ? " is-open" : ""}`}
            aria-label="Дані проєкту"
            aria-hidden={isAssistantStep && !contextDrawerOpen ? true : undefined}
            inert={isAssistantStep && !contextDrawerOpen ? true : undefined}
          >
            <div className="case-context-head">
              <h3>Проєкт</h3>
              {isAssistantStep && (
                <button
                  type="button"
                  className="case-context-close"
                  aria-label="Закрити дані проєкту"
                  onClick={() => {
                    setContextDrawerOpen(false);
                    contextToggleRef.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>
            <strong>{selected.title}</strong>
            <span className="case-revision">Збережена версія {selected.revision}</span>
            <div className="context-item"><span>Програма</span><strong>{activeProgram ? friendlyTitle(activeProgram) : "Фінансування підберемо далі"}</strong></div>
            {onFindFunding && <button type="button" onClick={() => { setContextDrawerOpen(false); onFindFunding(details.projectDescription, { id: selected.id, title: selected.title, revision: selected.revision }); }}>Підібрати фінансування</button>}
            <div className="context-item"><span>Збережений бюджет</span><strong>{money(selected.totalKopecks)}</strong></div>
            <div className="context-item"><span>Готовність</span><strong>{readiness ? `${readinessCompleteCount} з ${readinessTotalCount} перевірок` : readinessError ? "Не вдалося завантажити" : "Завантаження…"}</strong></div>
            {(dirty || pending) && <p className="context-unsaved">Є незбережені зміни</p>}
            <div className="context-actions">
              <button type="button" onClick={() => { setContextDrawerOpen(false); setActiveStep("basics"); }}>{"Редагувати опис"}</button>
              <button type="button" onClick={() => { setContextDrawerOpen(false); setActiveStep("budget"); }}>Редагувати бюджет</button>
              <button type="button" onClick={() => { setContextDrawerOpen(false); setActiveStep("review"); }}>Перевірка та експорт</button>
            </div>
          </aside>
          <div className="case-main">
          {sessionDraft.recovery && (
            <section className="session-recovery" role="region" aria-label="Відновлення незбережених змін">
              <h3>Знайдено незбережені зміни в цій вкладці</h3>
              <p>Копія від {new Date(sessionDraft.recovery.timestamp).toLocaleString("uk-UA")}.</p>
              <p>Щоб редагувати або зберігати проєкт, спочатку відновіть або видаліть цю копію.</p>
              {sessionDraft.recovery.pendingUnknown && <p>Результат попереднього збереження невідомий. Перевірте актуальну версію; повторне збереження не запускається автоматично.</p>}
              {sessionDraft.recovery.baseRevision === selected.revision && !sessionDraft.recovery.pendingUnknown ? (
                <button type="button" disabled={busy || !!pending || conflict} onClick={async () => {
                  const recovery = sessionDraft.recovery;
                  if (!recovery) return;
                  if (dirty) {
                    const confirmed = await confirm({
                      title: "Відновити знайдену копію?",
                      message: "Поточні незбережені зміни у формі буде замінено знайденою копією.",
                      confirmLabel: "Відновити",
                      cancelLabel: "Скасувати",
                      tone: "warning",
                    });
                    if (!confirmed || !mountedRef.current) return;
                  }
                  setDetails(recovery.details);
                  setDraft(hydrateDraft(recovery.budget));
                  sessionDraft.resolved();
                  setNotice("Зміни відновлено у формі. Перевірте й збережіть їх.");
                }}>Відновити зміни</button>
              ) : <p>Версія проєкту могла змінитися. Порівняйте актуальні дані з копією та перенесіть потрібний текст вручну.</p>}
              <details><summary>Переглянути та скопіювати копію</summary>
                {[...businessBasicsFields, ...businessPlanFields].map(field => <label key={field.key}>{field.label}<textarea readOnly value={sessionDraft.recovery!.details[field.key]} /></label>)}
                <label>Бюджет<textarea readOnly value={sessionDraft.recovery.budget.map(row => `${row.name} | ${row.quantity} | ${row.price}`).join("\n")} /></label>
              </details>
              <button type="button" onClick={sessionDraft.discard}>Видалити копію</button>
            </section>
          )}
          {sessionDraft.storageFailed && <p className="session-recovery-warning" role="status">Не вдалося зберегти резервну копію в цій вкладці. Щоб не втратити зміни, збережіть проєкт або скопіюйте текст.</p>}
          {activeProgram?.currency && activeProgram.currency!=="UAH" && <p className="currency-note" role="note">Фінансування програми зазначене в {activeProgram.currency}. Робочий кошторис нижче ведеться у гривнях; автоматичної конвертації немає. Узгодьте валюту та формат офіційної заявки з організатором.</p>}
          {activeProgram?.fundingType==="reimbursement" && <p className="currency-note" role="note">Ця програма відшкодовує вже понесені витрати. Підготуйте документи про фактичні покупки; план майбутніх витрат не є заявою на компенсацію.</p>}
          <div className="case-steps-nav" role="group" aria-label="Розділи проєкту">
            <button
              type="button"
              className={activeStep === "assistant" ? "step-tab active assistant-tab" : "step-tab assistant-tab"}
              onClick={() => setActiveStep("assistant")}
              aria-pressed={activeStep === "assistant"}
              aria-current={activeStep === "assistant" ? "step" : undefined}
            >

              <span>Асистент</span>
            </button>
            <button
              type="button"
              className={activeStep === "basics" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("basics")}
              aria-pressed={activeStep === "basics"}
              aria-current={activeStep === "basics" ? "step" : undefined}
            >
              <span className="step-num">{isStep1Done ? "✓" : "1"}</span>
              <span>{"Ідея та клієнти"}</span>
            </button>
            <button
              type="button"
              className={activeStep === "plan" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("plan")}
              aria-pressed={activeStep === "plan"}
              aria-current={activeStep === "plan" ? "step" : undefined}
            >
              <span className="step-num">{isStep2Done ? "✓" : "2"}</span>
              <span>{"План запуску"}</span>
            </button>
            <button
              type="button"
              className={activeStep === "budget" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("budget")}
              aria-pressed={activeStep === "budget"}
              aria-current={activeStep === "budget" ? "step" : undefined}
            >
              <span className="step-num">{isStep3Done ? "✓" : "3"}</span>
              <span>{"Бюджет проєкту"}</span>
            </button>
            <button
              type="button"
              className={activeStep === "review" ? "step-tab active" : "step-tab"}
              onClick={() => setActiveStep("review")}
              aria-pressed={activeStep === "review"}
              aria-current={activeStep === "review" ? "step" : undefined}
            >
              <span className="step-num">4</span>
              <span>Готовність та експорт</span>
            </button>
          </div>

          {activeStep === "basics" && (
            <section className="step-panel" aria-labelledby="step1-heading">
              <div className="step-panel-header">
                <h4 id="step1-heading">{"Крок 1: Ідея бізнесу та цільові клієнти"}</h4>
                <p>
                  {"Опишіть вашу ідею, клієнтів та як ви будете продавати. Це допоможе пояснити цінність проєкту та підготувати заявку."}
                </p>
              </div>
              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>💡 Потрібна порада ШІ для формулювання?</strong>
                  <span>{"Асистент допоможе чітко розписати цільову аудиторію та переваги вашого продукту."}</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Допоможи сформулювати мету заявки та підтверджені факти. Врахуй обрану програму й постав доречні уточнення, не вигадуючи досвід чи досягнення.")}
                >
                  Запитати ШІ-асистента ↗
                </button>
              </div>
              {basicsFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <span className="field-hint">{field.hint}</span>
                  <textarea
                    id={`preparation-${field.key}`}
                    rows={4}
                    maxLength={3000}
                    placeholder={field.placeholder}
                    value={details[field.key]}
                    disabled={busy || !!pending || !!sessionDraft.recovery}
                    onChange={(e) => {
                      setDetails({ ...details, [field.key]: e.target.value });
                      setNotice("");
                    }}
                  />
                </label>
              ))}
              <div className="step-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || conflict || !!sessionDraft.recovery || (!!pending && pending.kind !== "details")}
                  onClick={() => void saveDetails()}
                >
                  {busy && pending?.kind === "details"
                    ? "Зберігаємо…"
                    : pending?.kind === "details"
                      ? "Повторити збереження опису"
                      : "Зберегти крок 1"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("plan")}
                >
                  {"Далі: План запуску ➡️"}
                </button>
              </div>
            </section>
          )}

          {activeStep === "plan" && (
            <section className="step-panel" aria-labelledby="step2-heading">
              <div className="step-panel-header">
                <h4 id="step2-heading">{"Крок 2: План реалізації та очікувані результати"}</h4>
                <p>
                  {"Зазначте основні кроки запуску (графік) та ключові результати: плановий дохід та робочі місця, якщо вони передбачені вашим планом і умовами програми."}
                </p>
              </div>
              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>{"💡 Скласти графік запуску разом із ШІ?"}</strong>
                  <span>{"Асистент допоможе скласти етапи реалізації та перевірити вимоги обраного напряму."}</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Допоможи скласти план підготовки та очікувані результати за обраною програмою. Робочі місця враховуй лише якщо їх вимагає конкретний напрям.")}
                >
                  Запитати ШІ-асистента ↗
                </button>
              </div>
              {planFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <span className="field-hint">{field.hint}</span>
                  <textarea
                    id={`preparation-${field.key}`}
                    rows={4}
                    maxLength={3000}
                    placeholder={field.placeholder}
                    value={details[field.key]}
                    disabled={busy || !!pending || !!sessionDraft.recovery}
                    onChange={(e) => {
                      setDetails({ ...details, [field.key]: e.target.value });
                      setNotice("");
                    }}
                  />
                </label>
              ))}
              <div className="step-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("basics")}
                >
                  ← Назад: Ідея
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || conflict || !!sessionDraft.recovery || (!!pending && pending.kind !== "details")}
                  onClick={() => void saveDetails()}
                >
                  {busy && pending?.kind === "details"
                    ? "Зберігаємо…"
                    : pending?.kind === "details"
                      ? "Повторити збереження плану"
                      : "Зберегти крок 2"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("budget")}
                >
                  {"Далі: Бюджет проєкту ➡️"}
                </button>
              </div>
            </section>
          )}

          {activeStep === "budget" && (
            <section className="step-panel" aria-labelledby="step3-heading">
              <div className="step-panel-header">
                <h4 id="step3-heading">{"Крок 3: Бюджет грантової заявки"}</h4>
                <p>
                  {"Вкажіть витрати, для яких потрібне фінансування. Дозволені статті й порядок оплати визначають умови конкретної програми."}
                </p>
              </div>

              <div className="budget-rules-card">
                <div className="budget-rules-title">Підготовка кошторису</div>
                <ul className="budget-rules-list">
                  <li>Для кожної витрати вкажіть назву, кількість та ціну за одиницю.</li>
                  <li>Приклади нижче — початкові шаблони. Замініть ціни на пропозиції постачальників.</li>
                  <li>Дозволені витрати, максимальна сума та співфінансування залежать від програми. Перевірте їх в офіційних умовах.</li>
                </ul>
              </div>

              <div className="step-ai-banner">
                <div className="step-ai-banner-text">
                  <strong>💡 Не знаєте, що включити до кошторису?</strong>
                  <span>ШІ підбере типові статті витрат та орієнтовні суми під ваш профіль бізнесу.</span>
                </div>
                <button
                  type="button"
                  className="link ai-call-btn"
                  onClick={() => askAssistant("Допоможи скласти перелік витрат для мого бізнесу. Відділи орієнтовні приклади від підтверджених цін; запитай про невідомі суми й умови програми.")}
                >
                  Підібрати витрати з ШІ ↗
                </button>
              </div>

              <div className="budget-templates-section">
                <span className="templates-label">{activeProgram ? `Приклади витрат для планування «${activeProgram.title}»:` : "Додайте витрати для свого проєкту:"}</span>
                <div className="templates-list">
                  {activeTemplates.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="template-chip"
                      disabled={busy || !!pending || !!sessionDraft.recovery || draft.length >= 100}
                      onClick={() => addBudgetItem(tmpl.name, tmpl.price, "1")}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                  <button
                    key="custom"
                    type="button"
                    className="template-chip custom"
                    disabled={busy || !!pending || !!sessionDraft.recovery || draft.length >= 100}
                    onClick={() => addBudgetItem("", "0.00", "1")}
                  >
                    + Додати свою витрату
                  </button>
                </div>
              </div>

              <div className="budget-summary-banner">
                <div className="summary-col">
                  <span className="summary-label">Загальна сума у формі:</span>
                  <span className="summary-value">{Number.isFinite(liveBudgetKopecks) ? money(liveBudgetKopecks) : "Перевірте кількість і ціну"}</span>
                </div>
                <div className="summary-col">
                  <span className="summary-label">Збережено в базі:</span>
                  <span className="summary-value secondary">{money(selected.totalKopecks)}</span>
                </div>
              </div>

              {draft.length === 0 && (
                <div className="empty-budget-notice">
                  Поки не додано жодної статті витрат. Скористайтеся кнопками швидкого додавання вище або додайте статтю вручну.
                </div>
              )}

              {draft.map((row, index) => (
                <div
                  className="budget-row"
                  key={row.clientId}
                  role="group"
                  aria-label={`Витрата ${index + 1}`}
                >
                  <label>
                    Назва витрати
                    <input
                      maxLength={160}
                      value={row.name}
                      placeholder="Наприклад: Професійна кавомашина"
                      disabled={busy || !!pending || !!sessionDraft.recovery}
                      onChange={(e) => edit(index, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Кількість
                    <input
                      inputMode="numeric"
                      maxLength={32}
                      value={row.quantity}
                      disabled={busy || !!pending || !!sessionDraft.recovery}
                      onChange={(e) => edit(index, { quantity: e.target.value })}
                    />
                  </label>
                  <label>
                    Ціна за од., грн
                    <input
                      inputMode="decimal"
                      maxLength={32}
                      value={row.price}
                      disabled={busy || !!pending || !!sessionDraft.recovery}
                      onChange={(e) => edit(index, { price: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="link remove-item"
                    aria-label={`Видалити витрату ${row.name || index + 1}`}
                    disabled={busy || !!pending || !!sessionDraft.recovery}
                    onClick={() => {
                      setDraft((prev) => prev.filter((item) => item.clientId !== row.clientId));
                      setPending(null);
                      setNotice("");
                    }}
                  >
                    Видалити
                  </button>
                </div>
              ))}

              <div className="step-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("plan")}
                >
                  {"← Назад: План запуску"}
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || conflict || !!sessionDraft.recovery || (!!pending && pending.kind !== "budget")}
                  onClick={() => void save()}
                >
                  {busy && pending?.kind === "budget"
                    ? "Зберігаємо…"
                    : pending?.kind === "budget"
                      ? "Повторити збереження бюджету"
                      : "Зберегти бюджет"}{" "}
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setActiveStep("review")}
                >
                  Далі: Перевірка та експорт ➡️
                </button>
              </div>
            </section>
          )}

          {activeStep === "review" && (
            <section className="step-panel" aria-labelledby="step4-heading">
              <div className="step-panel-header">
                <h4 id="step4-heading">Крок 4: Перевірка готовності та експорт чернетки</h4>
                <p>
                  Доповніть позначені блоки, перевірте факти та узгодженість і збережіть зміни. Потім завантажте чернетку та звірте її з актуальною офіційною формою.
                </p>
              </div>

              {selected.programId === "vlasna-sprava" && <section className="payment-entry" aria-labelledby="payment-entry-title">
                <div>
                  <h5 id="payment-entry-title">Оплата за готові PDF і таблицю Excel</h5>
                  <p>Комплект заповнених файлів коштує 5 грн. Після підтвердження переказу відкриється завантаження.</p>
                </div>
                <a className="primary payment-entry-link" href="#export-payment" onClick={event => {
                  event.preventDefault();
                  document.getElementById("export-payment")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Перейти до оплати</a>
              </section>}

              {selected.programId && <GrantApplication key={selected.id} user={user} caseId={selected.id}
                caseRevision={selected.revision} programId={selected.programId}
                disabled={dirty || !!pending || conflict || !!sessionDraft.recovery} />}

              <section className="readiness" aria-labelledby="readiness-heading">
                <h4 id="readiness-heading">Заповненість чернетки проєкту</h4>
                {readiness && (
                  <>
                    <p>Збережена версія у списку: {readiness.revision}</p>
                    <ul>
                      {readiness.checks.map((check) => (
                        <li key={check.id}>
                          <button type="button" className="link" onClick={() => check.id === "budget" ? setActiveStep("budget") : openField(check.id as keyof Details)}>{check.label}</button>
                          <strong className={check.status === "complete" ? "check-complete" : "check-missing"}>
                            {check.status === "complete" ? "✓ Базову перевірку пройдено" : "Потрібно доповнити або перевірити"}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <p className="readiness-disclaimer">{readiness.disclaimer}</p>
                  </>
                )}
                {!readiness && !readinessError && (
                  <p role="status">Завантаження списку…</p>
                )}
                {readinessError && (
                  <p>
                    Не вдалося завантажити список.{" "}
                    <button
                      type="button"
                      className="link"
                      onClick={() => void loadReadiness(selected.id)}
                    >
                      Повторити
                    </button>
                  </p>
                )}
                {dirty && <p className="readiness-dirty">Незбережені зміни ще не враховані у списку.</p>}
              </section>

              <section className="preparation-documents" id="preparation-documents" aria-labelledby="preparation-documents-title">
                <h4 id="preparation-documents-title">Документи та офіційне подання</h4>
                <p>{"Підготовлені тут текст і кошторис допоможуть оформити заявку. Остаточний перелік і формат документів визначає обраний конкурс."}</p>
                {activeProgram ? <ol className="preparation-route">
                  <li><strong>Звірте конкурс та вимоги</strong><p>{isGrantAvailable(activeProgram) ? activeProgram.keyCondition : "Поточний прийом не підтверджено. Перевірте статус у надавача перед поданням."}</p><button type="button" className="link" onClick={() => { window.location.hash = `grants/${activeProgram.id}`; }}>Відкрити умови в GrantFolio</button></li>
                  <li><strong>Зберіть потрібні матеріали</strong><ul>{activeProgram.details.documents.map(document => <li key={document}>{document}</li>)}</ul><button type="button" className="link" onClick={() => askAssistant("Допоможи перевірити, які матеріали ще потрібні до офіційної форми. Не оголошуй їх готовими без перевірки й допоможи підготувати наступний розділ.")}>Допоможи підготувати документи</button></li>
                  <li><strong>Зіставте чернетку з офіційною формою</strong><p>Завантажте збережені матеріали нижче та перенесіть їх у форму організатора. Перевірте зміст, мову, формат файлів і потрібний підпис.</p></li>
                  <li><strong>Подайте за правилами організатора</strong><ol>{activeProgram.details.steps.map(step => <li key={step}>{step}</li>)}</ol><a href={activeProgram.officialUrl} target="_blank" rel="noopener noreferrer">{"Відкрити офіційне подання ↗"}</a><p>Статус «подано» підтверджує організатор; GrantFolio не надсилає заявку від вашого імені.</p></li>
                </ol> : <p>Фінансування підберемо далі. Перелік документів і правила подання залежать від обраної програми.</p>}
              </section>

              <section className="export-section" aria-labelledby="export-heading">
                <h4 id="export-heading">Експорт робочої чернетки</h4>
                <p>
                  Сформований файл містить структуровані відповіді та бюджет. Перенесіть перевірений текст у форму обраного організатора.
                </p>
                {selected.programId === "vlasna-sprava"
                  ? <p><a href="#export-payment" onClick={event => { event.preventDefault(); document.getElementById("export-payment")?.scrollIntoView({ behavior: "smooth" }); }}>Перейти до оплати й завантаження PDF та XLSX</a></p>
                  : <p>Для PDF зі збереженим описом і кошторисом виберіть «Зберегти як PDF» у вікні друку.</p>}
                <div className="export-buttons-group">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setActiveStep("budget")}
                  >
                    {"← Назад: Бюджет"}
                  </button>
                  <button
                    type="button"
                    className="primary export-btn"
                    disabled={busy || dirty || !!pending || conflict}
                    onClick={() => void downloadDraft()}
                  >
                    Завантажити чернетку (.txt) <span>↗</span>
                  </button>
                  {selected.programId !== "vlasna-sprava" && <button
                    type="button"
                    className="secondary-btn print-pdf-btn"
                    disabled={printBlocked}
                    onClick={() => window.print()}
                  >
                    Відкрити друк / PDF
                  </button>}
                </div>
                {(dirty || pending) && (
                  <p className="error">Перед завантаженням збережіть зміни в описі та бюджеті.</p>
                )}
                {showExportFeedback && onOpenFeedback && (
                  <FeedbackPromptBanner
                    milestoneKey="cases-export"
                    title="Чернетку сформовано. Чи все спрацювало чітко?"
                    description="Оцініть зручність підготовки та поділіться порадами щодо покращення експорту."
                    actionLabel="Оцінити результат"
                    onOpenFeedback={() => onOpenFeedback({ screen: "export", programId: selected.programId })}
                  />
                )}
              </section>

              <section className="delete-section" aria-labelledby="delete-heading">
                <h4 id="delete-heading">Керування чернеткою</h4>
                <button
                  type="button"
                  className="link danger"
                  disabled={busy || !!pending || !!sessionDraft.recovery}
                  onClick={() => void deleteDraft()}
                >
                  Видалити чернетку
                </button>
              </section>
            </section>
          )}

          <section className="step-panel" hidden={activeStep !== "assistant"} aria-label="Асистент">
              <Assistant
                key={selected.id}
                caseId={selected.id}
                profileRevision={profileRevision}
                revision={selected.revision}
                blocked={dirty || !!pending || busy || conflict}
                blockedReason={conflict ? "Проєкт змінився в іншій вкладці. Завантажте актуальну версію, щоб продовжити." : pending ? "Потрібно повторити попереднє збереження й підтвердити його результат." : busy ? "Зачекайте завершення поточної дії." : undefined}
                onRevisionConflict={() => setConflict(true)}
                request={request}
                prefilledPrompt={assistantPrompt}
                onClearPrefilled={() => setAssistantPrompt("")}
                onDraftChange={setChatDraft}
                onImportBudgetItems={importSuggestedBudgetItems}
                projectDetails={details}
                canApplySuggestions={!busy && !pending && !conflict && !sessionDraft.recovery}
                onApplySuggestion={applySuggestion}
                programTitle={activeProgram ? friendlyTitle(activeProgram) : "Фінансування підберемо далі"}
                programSelected={!!activeProgram}
                goalText={selected.details.projectDescription}
                nextStep={nextStep}
                onReviewDocuments={openDocuments}
                embedded
              />
          </section>

          {conflict && (
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={async () => {
                const targetId = selected.id;
                const confirmed = await confirm({
                  title: "Завантажити актуальну версію?",
                  message: "Поточні незбережені зміни буде втрачено, а форму оновлено з сервера.",
                  confirmLabel: "Завантажити",
                  cancelLabel: "Скасувати",
                  tone: "warning",
                });
                if (confirmed && mountedRef.current) {
                  void select(targetId, true);
                }
              }}
            >
              Завантажити актуальну версію
            </button>
          )}
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
