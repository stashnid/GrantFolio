import { useEffect, useState } from "react";
import "./FeedbackPromptBanner.css";

export interface FeedbackPromptBannerProps {
  milestoneKey: string;
  title: string;
  description: string;
  actionLabel?: string;
  onOpenFeedback: () => void;
}

const DISMISS_KEY_PREFIX = "grantfolio:feedback:prompt-dismissed:";
const LAST_SUBMITTED_KEY = "grantfolio:feedback:last-submitted-at";
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const FEEDBACK_SUBMITTED_EVENT = "grantfolio:feedback-submitted";

function getDismissKey(milestoneKey: string): string {
  return `${DISMISS_KEY_PREFIX}${milestoneKey}`;
}

function shouldHidePrompt(milestoneKey: string): boolean {
  try {
    if (window.localStorage.getItem(getDismissKey(milestoneKey))) {
      return true;
    }
    const rawSubmittedAt = window.localStorage.getItem(LAST_SUBMITTED_KEY);
    if (rawSubmittedAt) {
      const submittedAt = Number(rawSubmittedAt);
      if (Number.isFinite(submittedAt) && Date.now() - submittedAt < COOLDOWN_MS) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function persistDismissed(milestoneKey: string): void {
  try {
    window.localStorage.setItem(getDismissKey(milestoneKey), "1");
  } catch {
    // Ignore storage unavailability (private mode / quota restrictions)
  }
}

export function FeedbackPromptBanner({
  milestoneKey,
  title,
  description,
  actionLabel = "Оцінити за 10 с",
  onOpenFeedback,
}: FeedbackPromptBannerProps) {
  const [hidden, setHidden] = useState<boolean>(() => shouldHidePrompt(milestoneKey));

  useEffect(() => {
    setHidden(shouldHidePrompt(milestoneKey));
  }, [milestoneKey]);

  useEffect(() => {
    const syncVisibility = () => {
      if (shouldHidePrompt(milestoneKey)) {
        setHidden(true);
      }
    };
    window.addEventListener(FEEDBACK_SUBMITTED_EVENT, syncVisibility);
    window.addEventListener("storage", syncVisibility);
    return () => {
      window.removeEventListener(FEEDBACK_SUBMITTED_EVENT, syncVisibility);
      window.removeEventListener("storage", syncVisibility);
    };
  }, [milestoneKey]);

  if (hidden) {
    return null;
  }

  function handleDismiss() {
    persistDismissed(milestoneKey);
    setHidden(true);
  }

  function handleOpen() {
    persistDismissed(milestoneKey);
    setHidden(true);
    onOpenFeedback();
  }

  return (
    <aside className="fb-prompt-banner" aria-label="Швидка оцінка досвіду">
      <div className="fb-prompt-main">
        <div className="fb-prompt-icon" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
          </svg>
        </div>
        <div className="fb-prompt-copy">
          <p className="fb-prompt-title">{title}</p>
          <p className="fb-prompt-desc">{description}</p>
        </div>
      </div>

      <div className="fb-prompt-actions">
        <button type="button" className="fb-prompt-cta" onClick={handleOpen}>
          {actionLabel}
        </button>
        <button
          type="button"
          className="fb-prompt-dismiss"
          onClick={handleDismiss}
          aria-label="Сховати підказку"
          title="Сховати підказку"
        >
          <svg
            width="16"
            height="16"
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
    </aside>
  );
}
