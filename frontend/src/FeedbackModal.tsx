import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { ApiError, authenticatedRequest, readableApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { CustomSelect, type SelectOption } from "./CustomSelect";
import "./FeedbackModal.css";

export type FeedbackTask =
  | "profile"
  | "project"
  | "budget"
  | "assistant"
  | "catalog"
  | "export";

export interface FeedbackModalProps {
  open: boolean;
  user: User;
  defaultTask?: FeedbackTask;
  context?: {
    screen?: "advisor" | "cases" | "catalog" | "budget" | "profile" | "export";
    programId?: string | null;
  };
  onClose: () => void;
  onSubmitted?: () => void;
}

type TaskOutcome = "completed" | "partial" | "failed";
type WillingnessToPay =
  | "pay_per_application"
  | "monthly_subscription"
  | "donation_ready"
  | "free_only";

const RATINGS = [
  { value: 1, label: "1 — Потрібно значно доопрацювати" },
  { value: 2, label: "2 — Складно розібратися" },
  { value: 3, label: "3 — Нормально, є що покращити" },
  { value: 4, label: "4 — Добре, майже все зрозуміло" },
  { value: 5, label: "5 — Відмінно, дуже допомогло" },
] as const;

const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

const TASK_OPTIONS: ReadonlyArray<{ value: FeedbackTask; label: string }> = [
  { value: "project", label: "Весь сайт загалом" },
  { value: "catalog", label: "Пошук грантів" },
  { value: "assistant", label: "Поради помічника" },
  { value: "budget", label: "Розрахунок витрат" },
  { value: "profile", label: "Дані про бізнес" },
  { value: "export", label: "Завантаження документів" },
];

const TASK_GUIDING_PROMPTS: Record<FeedbackTask, string> = {
  project:
    "Чи зручно було користуватися сайтом загалом? Що здалося заплутаним, а що сподобалося?",
  catalog:
    "Чи вдалося знайти грант для вашої справи? Якої інформації або умов вам бракувало?",
  assistant:
    "Чи зрозуміло відповідав електронний помічник? Чи допомогли його підказки?",
  budget:
    "Чи легко було порахувати витрати на проєкт? Де виникли труднощі чи сумніви?",
  profile:
    "Чи зрозуміло, які дані про бізнес потрібно вказати? Що варто спростити?",
  export:
    "Чи зрозумілі готові документи для заявки? Чого в них не вистачає?",
};

const LOW_RATING_TAGS = [
  "Виникла помилка на сайті",
  "Складно розібратися",
  "Важко рахувати суми",
  "Бракує потрібної можливості",
  "Незручно з телефона",
  "Сайт повільно відкривається",
] as const;

const HIGH_RATING_TAGS = [
  "Все просто й зрозуміло",
  "Працює надійно, без збоїв",
  "Швидко знайшов грант",
  "Зрозумілі підказки та тексти",
  "Маю ідею для покращення",
  "Корисний перелік грантів",
] as const;

const CRITERIA_ITEMS: ReadonlyArray<{
  key: "ux" | "usefulness" | "ai";
  title: string;
  hint: string;
}> = [
  {
    key: "ux",
    title: "Простота та зручність сайту",
    hint: "Чи легко було розібратися з кнопками і сторінками, без збоїв?",
  },
  {
    key: "usefulness",
    title: "Користь для вашої справи",
    hint: "Чи допоміг сервіс розібратися з грантом і заощадити ваш час?",
  },
  {
    key: "ai",
    title: "Зрозумілість відповідей і порад",
    hint: "Чи простою людською мовою пояснював електронний помічник?",
  },
];

const OUTCOME_OPTIONS: ReadonlyArray<{ value: TaskOutcome; label: string }> = [
  { value: "completed", label: "Так, усе вийшло" },
  { value: "partial", label: "Вийшло частково" },
  { value: "failed", label: "Ні, виникли труднощі" },
];

const WTP_OPTIONS: ReadonlyArray<{ value: WillingnessToPay; label: string }> = [
  { value: "pay_per_application", label: "Оплата за готову заявку" },
  { value: "monthly_subscription", label: "Невелика щомісячна оплата" },
  { value: "donation_ready", label: "Добровільний внесок (донат)" },
  { value: "free_only", label: "Користуватимуся тільки безкоштовно" },
];

const WTP_SUPPORTS_PRICE = new Set<WillingnessToPay>([
  "pay_per_application",
  "monthly_subscription",
  "donation_ready",
]);

const ROLE_OPTIONS: SelectOption[] = [
  { value: "", label: "Не вказувати" },
  { value: "entrepreneur", label: "Підприємець / власник справи" },
  { value: "fop", label: "ФОП (працюю на себе)" },
  { value: "startup_founder", label: "Планую розпочати власну справу" },
  { value: "accountant", label: "Бухгалтер або юрист" },
  { value: "student_business", label: "Студент або початківець" },
  { value: "volunteer", label: "Волонтер або громадська діяльність" },
  { value: "other", label: "Інше" },
];

const MAX_TAGS = 5;
const MAX_COMMENT_LENGTH = 3000;
const MAX_PRICE_UAH = 500_000;
const LAST_SUBMITTED_KEY = "grantfolio:feedback:last-submitted-at";
const FEEDBACK_SUBMITTED_EVENT = "grantfolio:feedback-submitted";

function getRatingAdaptivePrompt(rating: number): string | null {
  if (rating === 1 || rating === 2) {
    return "Розкажіть, будь ласка, що саме не вдалося зробити або де виникла помилка. Ми все виправимо.";
  }
  if (rating === 3) {
    return "Що на сайті було зручним, а що викликало труднощі чи виглядало незрозуміло?";
  }
  if (rating === 4 || rating === 5) {
    return "Що вам найбільше сподобалося на сайті? Які поради ви б дали нам для покращення?";
  }
  return null;
}

function mapScreenToTask(
  screen?: "advisor" | "cases" | "catalog" | "budget" | "profile" | "export",
): FeedbackTask {
  switch (screen) {
    case "advisor":
      return "assistant";
    case "cases":
      return "project";
    case "catalog":
      return "catalog";
    case "budget":
      return "budget";
    case "profile":
      return "profile";
    case "export":
      return "export";
    default:
      return "project";
  }
}

function getViewportClass(): "mobile" | "tablet" | "desktop" {
  if (window.innerWidth <= 768) return "mobile";
  if (window.innerWidth <= 1024) return "tablet";
  return "desktop";
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function recordFeedbackSubmitted(): void {
  try {
    window.localStorage.setItem(LAST_SUBMITTED_KEY, String(Date.now()));
  } catch {
    // Ignore storage restriction
  }
  window.dispatchEvent(new CustomEvent(FEEDBACK_SUBMITTED_EVENT));
}

export function FeedbackModal({
  open,
  user,
  defaultTask,
  context,
  onClose,
  onSubmitted,
}: FeedbackModalProps) {
  const confirm = useConfirm();
  const titleId = useId();
  const commentId = useId();
  const roleSelectId = useId();
  const priceInputId = useId();
  const contactInputId = useId();

  const [step, setStep] = useState<1 | 2>(1);
  const [feedbackId, setFeedbackId] = useState<string>(() => crypto.randomUUID());
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [lastAttemptKey, setLastAttemptKey] = useState<string>("");

  // Step 1 state
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [task, setTask] = useState<FeedbackTask>(
    () => defaultTask ?? mapScreenToTask(context?.screen),
  );
  const [categoryTags, setCategoryTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>("");
  const [step1Busy, setStep1Busy] = useState<boolean>(false);
  const [step1Error, setStep1Error] = useState<string>("");

  // Step 2 state
  const [ratingUx, setRatingUx] = useState<number | null>(null);
  const [ratingUsefulness, setRatingUsefulness] = useState<number | null>(null);
  const [ratingAi, setRatingAi] = useState<number | null>(null);
  const [taskOutcome, setTaskOutcome] = useState<TaskOutcome | "">("");
  const [willingnessToPay, setWillingnessToPay] = useState<WillingnessToPay | "">("");
  const [suggestedPriceRaw, setSuggestedPriceRaw] = useState<string>("");
  const [testerRole, setTesterRole] = useState<string>("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [contactConsent, setContactConsent] = useState<boolean>(false);
  const [contactInfo, setContactInfo] = useState<string>(() => user.email ?? "");
  const [step2Busy, setStep2Busy] = useState<boolean>(false);
  const [step2Error, setStep2Error] = useState<string>("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropMouseDownRef = useRef<boolean>(false);
  const confirmingRef = useRef<boolean>(false);
  const wasOpenRef = useRef<boolean>(false);

  // Reset form strictly when modal transitions from closed to open
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      setStep(1);
      setFeedbackId(crypto.randomUUID());
      setSubmittedId(null);
      setLastAttemptKey("");
      setRating(0);
      setHoveredRating(0);
      setTask(defaultTask ?? mapScreenToTask(context?.screen));
      setCategoryTags([]);
      setComment("");
      setStep1Busy(false);
      setStep1Error("");

      setRatingUx(null);
      setRatingUsefulness(null);
      setRatingAi(null);
      setTaskOutcome("");
      setWillingnessToPay("");
      setSuggestedPriceRaw("");
      setTesterRole("");
      setWouldRecommend(null);
      setContactConsent(false);
      setContactInfo(user.email ?? "");
      setStep2Busy(false);
      setStep2Error("");
    }
    wasOpenRef.current = open;
  }, [open, defaultTask, context?.screen, user.email]);

  // Restore focus when modal closes or unmounts
  useEffect(() => {
    if (!open) {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    }
    return () => {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open]);

  const requestClose = useCallback(async () => {
    if (confirmingRef.current || step1Busy || step2Busy) return;
    const hasUnsavedComment = step === 1 && !submittedId && comment.trim().length > 10;
    if (hasUnsavedComment) {
      confirmingRef.current = true;
      try {
        const shouldClose = await confirm({
          title: "Закрити форму відгуку?",
          message:
            "Введений коментар ще не надіслано. Якщо закрити вікно зараз, текст буде втрачено.",
          confirmLabel: "Закрити без збереження",
          cancelLabel: "Продовжити",
          tone: "warning",
        });
        if (shouldClose) {
          onClose();
        }
      } finally {
        confirmingRef.current = false;
      }
      return;
    }
    onClose();
  }, [step, submittedId, comment, step1Busy, step2Busy, confirm, onClose]);

  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  // Lock body scroll and set initial focus strictly ONCE when modal opens
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      (starRefs.current[0] ?? closeBtnRef.current ?? dialogRef.current)?.focus();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Trap Tab and handle Escape safely using requestCloseRef (never re-registers on typing)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (confirmingRef.current || document.querySelector('[role="alertdialog"]')) {
        return;
      }

      if (event.key === "Escape") {
        if (dialogRef.current?.querySelector(".gf-select.is-open")) {
          return;
        }
        event.preventDefault();
        void requestCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (
          !activeEl ||
          activeEl === first ||
          activeEl === container ||
          !container.contains(activeEl)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else if (
        !activeEl ||
        activeEl === last ||
        activeEl === container ||
        !container.contains(activeEl)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Move focus cleanly when transitioning to Step 2
  useEffect(() => {
    if (open && step === 2) {
      window.requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    }
  }, [open, step]);

  if (!open) {
    return null;
  }

  function resetIdIfModified(
    nextRating: number,
    nextTask: FeedbackTask,
    nextComment: string,
    nextTags: string[],
  ) {
    const key = `${nextRating}|${nextTask}|${nextComment}|${nextTags.join(",")}`;
    if (lastAttemptKey && key !== lastAttemptKey) {
      setFeedbackId(crypto.randomUUID());
      setLastAttemptKey("");
    }
  }

  function selectRating(nextRating: number) {
    const allowedTags: ReadonlyArray<string> =
      nextRating <= 3 ? LOW_RATING_TAGS : HIGH_RATING_TAGS;
    const filteredTags = categoryTags.filter((t) => allowedTags.includes(t));
    resetIdIfModified(nextRating, task, comment, filteredTags);
    setRating(nextRating);
    setCategoryTags(filteredTags);
    setStep1Error("");
  }

  function handleStarKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    value: number,
  ) {
    let nextValue: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextValue = value < 5 ? value + 1 : 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextValue = value > 1 ? value - 1 : 5;
    } else if (event.key === "Home") {
      nextValue = 1;
    } else if (event.key === "End") {
      nextValue = 5;
    }

    if (nextValue !== null) {
      event.preventDefault();
      selectRating(nextValue);
      starRefs.current[nextValue - 1]?.focus();
    }
  }

  function toggleTag(tag: string) {
    const exists = categoryTags.includes(tag);
    let nextTags: string[];
    if (exists) {
      nextTags = categoryTags.filter((item) => item !== tag);
    } else {
      if (categoryTags.length >= MAX_TAGS) return;
      nextTags = [...categoryTags, tag];
    }
    resetIdIfModified(rating, task, comment, nextTags);
    setCategoryTags(nextTags);
    setStep1Error("");
  }

  function getCriterionValue(key: "ux" | "usefulness" | "ai"): number | null {
    if (key === "ux") return ratingUx;
    if (key === "usefulness") return ratingUsefulness;
    return ratingAi;
  }

  function toggleCriterionValue(key: "ux" | "usefulness" | "ai", value: number) {
    if (key === "ux") {
      setRatingUx((prev) => (prev === value ? null : value));
    } else if (key === "usefulness") {
      setRatingUsefulness((prev) => (prev === value ? null : value));
    } else {
      setRatingAi((prev) => (prev === value ? null : value));
    }
    setStep2Error("");
  }

  async function handleStep1Submit(event: FormEvent) {
    event.preventDefault();
    const trimmedComment = comment.trim();
    if (rating < 1 || !trimmedComment) {
      setStep1Error("Оберіть оцінку від 1 до 5 та додайте короткий коментар.");
      return;
    }

    setStep1Busy(true);
    setStep1Error("");
    const attemptKey = `${rating}|${task}|${trimmedComment}|${categoryTags.join(",")}`;
    setLastAttemptKey(attemptKey);

    const contextSnapshot: {
      screen?: "advisor" | "cases" | "catalog" | "budget" | "profile" | "export";
      programId?: string;
      viewportClass: "mobile" | "tablet" | "desktop";
      appVersion: string;
    } = {
      viewportClass: getViewportClass(),
      appVersion: "web-2026.11",
    };
    if (context?.screen) {
      contextSnapshot.screen = context.screen;
    }
    if (context?.programId) {
      contextSnapshot.programId = context.programId;
    }

    try {
      const response = await authenticatedRequest(user, "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: feedbackId,
          rating,
          task,
          comment: trimmedComment,
          categoryTags,
          contextSnapshot,
        }),
      });

      if (!response.ok) {
        throw new ApiError("http", response.status);
      }

      const payload = (await response.json().catch(() => null)) as {
        feedback?: { id?: string };
      } | null;
      const savedId = payload?.feedback?.id ?? feedbackId;

      setSubmittedId(savedId);
      recordFeedbackSubmitted();
      onSubmitted?.();
      setStep(2);
    } catch (error) {
      setStep1Error(
        readableApiError(
          error,
          "Не вдалося надіслати відгук. Перевірте дані й спробуйте ще раз.",
        ),
      );
    } finally {
      setStep1Busy(false);
    }
  }

  const showPriceField =
    willingnessToPay !== "" && WTP_SUPPORTS_PRICE.has(willingnessToPay);

  const hasStep2Data =
    ratingUx !== null ||
    ratingUsefulness !== null ||
    ratingAi !== null ||
    taskOutcome !== "" ||
    willingnessToPay !== "" ||
    testerRole !== "" ||
    wouldRecommend !== null ||
    contactConsent;

  async function handleStep2Submit(event: FormEvent) {
    event.preventDefault();
    if (!submittedId || !hasStep2Data) {
      onClose();
      return;
    }

    const patchBody: Record<string, unknown> = {};
    if (ratingUx !== null) patchBody.ratingUx = ratingUx;
    if (ratingUsefulness !== null) patchBody.ratingUsefulness = ratingUsefulness;
    if (ratingAi !== null) patchBody.ratingAi = ratingAi;
    if (taskOutcome) patchBody.taskOutcome = taskOutcome;
    if (willingnessToPay) patchBody.willingnessToPay = willingnessToPay;
    if (showPriceField && suggestedPriceRaw.trim() !== "") {
      const parsedPrice = Number.parseInt(suggestedPriceRaw.trim(), 10);
      if (
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > MAX_PRICE_UAH
      ) {
        setStep2Error(
          `Вкажіть ціле число від 0 до ${MAX_PRICE_UAH.toLocaleString("uk-UA")} грн або залиште поле порожнім.`,
        );
        return;
      }
      patchBody.suggestedPriceUah = parsedPrice;
    }
    if (testerRole) patchBody.testerRole = testerRole;
    if (wouldRecommend !== null) patchBody.wouldRecommend = wouldRecommend;
    if (contactConsent) {
      patchBody.contactConsent = true;
      const cleanedContact = contactInfo.trim();
      if (cleanedContact) {
        patchBody.contactInfo = cleanedContact;
      }
    }

    setStep2Busy(true);
    setStep2Error("");

    try {
      const response = await authenticatedRequest(
        user,
        `/api/feedback/${encodeURIComponent(submittedId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        },
      );

      if (!response.ok) {
        throw new ApiError("http", response.status);
      }

      onClose();
    } catch (error) {
      setStep2Error(
        readableApiError(
          error,
          "Не вдалося зберегти додаткові дані. Основний відгук уже збережено.",
        ),
      );
    } finally {
      setStep2Busy(false);
    }
  }

  const activeRating = hoveredRating || rating;
  const activeRatingInfo = RATINGS.find((item) => item.value === activeRating);
  const availableTags: ReadonlyArray<string> =
    rating === 0 ? [] : rating <= 3 ? LOW_RATING_TAGS : HIGH_RATING_TAGS;
  const ratingAdaptivePrompt = getRatingAdaptivePrompt(rating);
  const taskGuidingPrompt = TASK_GUIDING_PROMPTS[task];

  return createPortal(
    <div
      className="fb-modal-backdrop"
      onMouseDown={(event) => {
        backdropMouseDownRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          backdropMouseDownRef.current &&
          event.target === event.currentTarget &&
          !confirmingRef.current
        ) {
          void requestClose();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className="fb-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="fb-modal-accent" aria-hidden="true" />

        <div className="fb-modal-header">
          <div>
            <p className="fb-modal-eyebrow">
              {step === 1
                ? "Зворотний зв’язок · Крок 1 з 2"
                : "Детальніша оцінка · Крок 2 з 2"}
            </p>
            <h2 id={titleId} className="fb-modal-title">
              {step === 1 ? "Ваша думка про GrantFolio" : "Дякуємо за вашу відповідь!"}
            </h2>
            <p className="fb-modal-subtitle">
              {step === 1
                ? "Оцініть, будь ласка, роботу сайту загалом. Це займе менше хвилини і допоможе нам зробити його простим і зрозумілим для кожного."
                : "Якщо маєте ще пів хвилини, дайте відповіді на кілька простих запитань або просто закрийте це вікно."}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="fb-modal-close"
            onClick={() => void requestClose()}
            disabled={step1Busy || step2Busy}
            aria-label="Закрити форму відгуку"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {step === 1 ? (
          <form className="fb-modal-form-root" onSubmit={handleStep1Submit} noValidate>
            <div className="fb-modal-body">
              <div className="fb-modal-form">
                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">Загальна оцінка сайту</legend>
                  <div className="fb-modal-stars-row">
                    <div
                      className="fb-modal-stars"
                      role="radiogroup"
                      aria-label="Оцінка від 1 до 5 зірок"
                      onMouseLeave={() => setHoveredRating(0)}
                    >
                      {RATINGS.map((item, index) => {
                        const isFilled = item.value <= activeRating;
                        const isSelected = item.value === rating;
                        const tabIndex =
                          rating === 0
                            ? index === 0
                              ? 0
                              : -1
                            : isSelected
                              ? 0
                              : -1;

                        return (
                          <button
                            key={item.value}
                            ref={(el) => {
                              starRefs.current[index] = el;
                            }}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={item.label}
                            title={item.label}
                            tabIndex={tabIndex}
                            disabled={step1Busy}
                            className={`fb-modal-star${isFilled ? " is-filled" : ""}`}
                            onMouseEnter={() => setHoveredRating(item.value)}
                            onFocus={() => setHoveredRating(item.value)}
                            onBlur={() => setHoveredRating(0)}
                            onClick={() => selectRating(item.value)}
                            onKeyDown={(e) => handleStarKeyDown(e, item.value)}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="22"
                              height="22"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
                            </svg>
                          </button>
                        );
                      })}
                    </div>
                    <span
                      className={`fb-modal-star-caption${activeRating > 0 ? " is-active" : ""}`}
                      aria-live="polite"
                    >
                      {activeRatingInfo ? activeRatingInfo.label : "Оберіть оцінку"}
                    </span>
                  </div>
                </fieldset>

                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">Про що саме ваш відгук?</legend>
                  <div className="fb-modal-pills" role="group" aria-label="Про що саме ваш відгук">
                    {TASK_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="fb-modal-pill"
                        aria-pressed={task === option.value}
                        disabled={step1Busy}
                        onClick={() => {
                          resetIdIfModified(rating, option.value, comment, categoryTags);
                          setTask(option.value);
                          setStep1Error("");
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {availableTags.length > 0 && (
                  <fieldset className="fb-modal-fieldset">
                    <legend className="fb-modal-legend">
                      <span>Що саме вплинуло на вашу оцінку?</span>
                      <span className="fb-modal-label-meta">
                        {categoryTags.length} / {MAX_TAGS}
                      </span>
                    </legend>
                    <div className="fb-modal-pills" role="group" aria-label="Швидкі теги">
                      {availableTags.map((tag) => {
                        const selected = categoryTags.includes(tag);
                        const atLimit = !selected && categoryTags.length >= MAX_TAGS;
                        return (
                          <button
                            key={tag}
                            type="button"
                            className="fb-modal-pill fb-modal-pill--tag"
                            aria-pressed={selected}
                            disabled={step1Busy || atLimit}
                            onClick={() => toggleTag(tag)}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                <div className="fb-modal-field">
                  <div className="fb-modal-prompt-guide" aria-live="polite">
                    <p className="fb-modal-prompt-primary">
                      {ratingAdaptivePrompt ?? taskGuidingPrompt}
                    </p>
                    {ratingAdaptivePrompt && (
                      <p className="fb-modal-prompt-secondary">{taskGuidingPrompt}</p>
                    )}
                  </div>

                  <label htmlFor={commentId} className="fb-modal-label">
                    <span>Що вам сподобалося, а що варто покращити?</span>
                    <span className="fb-modal-label-meta">
                      {comment.length} / {MAX_COMMENT_LENGTH}
                    </span>
                  </label>
                  <textarea
                    id={commentId}
                    className="fb-modal-textarea"
                    rows={4}
                    maxLength={MAX_COMMENT_LENGTH}
                    required
                    disabled={step1Busy}
                    value={comment}
                    onChange={(event) => {
                      const nextVal = event.target.value;
                      resetIdIfModified(rating, task, nextVal, categoryTags);
                      setComment(nextVal);
                      setStep1Error("");
                    }}
                    placeholder={
                      ratingAdaptivePrompt ??
                      "Напишіть своїми словами: чи все було зрозуміло, що викликало труднощі, та що варто змінити чи додати на сайті…"
                    }
                    aria-invalid={step1Error ? true : undefined}
                  />
                </div>

                {step1Error && (
                  <p className="fb-modal-error" role="alert">
                    {step1Error}
                  </p>
                )}
              </div>
            </div>

            <div className="fb-modal-footer">
              <button
                type="button"
                className="fb-modal-btn fb-modal-btn--secondary"
                disabled={step1Busy}
                onClick={() => void requestClose()}
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="fb-modal-btn fb-modal-btn--primary"
                disabled={step1Busy || rating < 1 || !comment.trim()}
              >
                {step1Busy ? "Надсилаємо…" : "Надіслати відгук"}
              </button>
            </div>
          </form>
        ) : (
          <form className="fb-modal-form-root" onSubmit={handleStep2Submit} noValidate>
            <div className="fb-modal-body">
              <div className="fb-modal-form">
                <div className="fb-modal-success-banner" role="status">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>
                    Дякуємо! Вашу відповідь збережено та передано розробникам.
                  </span>
                </div>

                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">
                    Оцініть три важливі речі (від 1 до 5, необов’язково)
                  </legend>
                  <div className="fb-modal-criteria-list">
                    {CRITERIA_ITEMS.map((item) => {
                      const currentVal = getCriterionValue(item.key);
                      return (
                        <div key={item.key} className="fb-modal-criterion">
                          <div className="fb-modal-criterion-copy">
                            <p className="fb-modal-criterion-title">{item.title}</p>
                            <p className="fb-modal-criterion-hint">{item.hint}</p>
                          </div>
                          <div
                            className="fb-modal-scale"
                            role="group"
                            aria-label={`${item.title} від 1 до 5`}
                          >
                            {SCALE_VALUES.map((val) => (
                              <button
                                key={val}
                                type="button"
                                className="fb-modal-scale-btn"
                                aria-pressed={currentVal === val}
                                aria-label={`${item.title}: ${val} з 5`}
                                disabled={step2Busy}
                                onClick={() => toggleCriterionValue(item.key, val)}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">
                    Чи вдалося вам виконати те, що планували?
                  </legend>
                  <div
                    className="fb-modal-pills"
                    role="group"
                    aria-label="Результат виконання завдання"
                  >
                    {OUTCOME_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="fb-modal-pill"
                        aria-pressed={taskOutcome === option.value}
                        disabled={step2Busy}
                        onClick={() =>
                          setTaskOutcome((prev) =>
                            prev === option.value ? "" : option.value,
                          )
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">
                    Чи порадили б ви цей сайт знайомим або колегам?
                  </legend>
                  <div
                    className="fb-modal-pills"
                    role="group"
                    aria-label="Рекомендація знайомим або колегам"
                  >
                    <button
                      type="button"
                      className="fb-modal-pill"
                      aria-pressed={wouldRecommend === true}
                      disabled={step2Busy}
                      onClick={() =>
                        setWouldRecommend((prev) => (prev === true ? null : true))
                      }
                    >
                      Так, пораджу
                    </button>
                    <button
                      type="button"
                      className="fb-modal-pill"
                      aria-pressed={wouldRecommend === false}
                      disabled={step2Busy}
                      onClick={() =>
                        setWouldRecommend((prev) => (prev === false ? null : false))
                      }
                    >
                      Скоріше ні
                    </button>
                  </div>
                </fieldset>

                <fieldset className="fb-modal-fieldset">
                  <legend className="fb-modal-legend">
                    Якби сервіс розвивався далі, який варіант підтримки вам ближчий?
                  </legend>
                  <div
                    className="fb-modal-pills"
                    role="group"
                    aria-label="Варіант підтримки сервісу"
                  >
                    {WTP_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="fb-modal-pill"
                        aria-pressed={willingnessToPay === option.value}
                        disabled={step2Busy}
                        onClick={() => {
                          setWillingnessToPay((prev) => {
                            const next = prev === option.value ? "" : option.value;
                            if (!next || !WTP_SUPPORTS_PRICE.has(next)) {
                              setSuggestedPriceRaw("");
                            }
                            return next;
                          });
                          setStep2Error("");
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {showPriceField && (
                    <div className="fb-modal-price-field">
                      <label htmlFor={priceInputId} className="fb-modal-label">
                        <span>Скільки гривень ви вважаєте справедливою ціною за таку допомогу?</span>
                      </label>
                      <input
                        id={priceInputId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_PRICE_UAH}
                        step={1}
                        className="fb-modal-input fb-modal-input--numeric"
                        disabled={step2Busy}
                        value={suggestedPriceRaw}
                        onChange={(event) => {
                          setSuggestedPriceRaw(event.target.value);
                          setStep2Error("");
                        }}
                        placeholder="Наприклад, 200"
                      />
                    </div>
                  )}
                </fieldset>

                <div className="fb-modal-field">
                  <label htmlFor={roleSelectId} className="fb-modal-label">
                    <span>Хто ви (необов’язково)?</span>
                  </label>
                  <CustomSelect
                    id={roleSelectId}
                    value={testerRole}
                    options={ROLE_OPTIONS}
                    placeholder="Не вказувати"
                    disabled={step2Busy}
                    onChange={setTesterRole}
                  />
                </div>

                <div className="fb-modal-field">
                  <label className="fb-modal-check-row">
                    <input
                      type="checkbox"
                      checked={contactConsent}
                      disabled={step2Busy}
                      onChange={(event) => setContactConsent(event.target.checked)}
                    />
                    <span>Дозволяю розробникам зв’язатися зі мною, якщо знадобиться щось уточнити</span>
                  </label>
                  {contactConsent && (
                    <div className="fb-modal-field">
                      <label htmlFor={contactInputId} className="fb-modal-label">
                        <span>Ваша електронна пошта або номер телефону</span>
                      </label>
                      <input
                        id={contactInputId}
                        type="text"
                        className="fb-modal-input"
                        maxLength={254}
                        disabled={step2Busy}
                        value={contactInfo}
                        onChange={(event) => setContactInfo(event.target.value)}
                        placeholder="Наприклад, name@email.com або +380..."
                      />
                    </div>
                  )}
                </div>

                {step2Error && (
                  <p className="fb-modal-error" role="alert">
                    {step2Error}
                  </p>
                )}
              </div>
            </div>

            <div className="fb-modal-footer">
              <button
                type="button"
                className="fb-modal-btn fb-modal-btn--secondary"
                disabled={step2Busy}
                onClick={onClose}
              >
                {hasStep2Data ? "Закрити" : "Пропустити й закрити"}
              </button>
              <button
                type="submit"
                className="fb-modal-btn fb-modal-btn--primary"
                disabled={step2Busy || !hasStep2Data}
              >
                {step2Busy ? "Збереження…" : "Зберегти відповіді"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
