import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

export type ConfirmTone = "danger" | "warning" | "default";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

type PendingConfirm = {
  id: number;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function ConfirmIcon({ tone }: { tone: ConfirmTone }) {
  if (tone === "danger") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<PendingConfirm | null>(null);
  const activeRef = useRef<PendingConfirm | null>(null);
  const queueRef = useRef<PendingConfirm[]>([]);
  const nextIdRef = useRef(1);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropMouseDownRef = useRef(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const titleId = useId();
  const descId = useId();

  const closeActive = useCallback((id: number, result: boolean) => {
    const current = activeRef.current;
    if (!current || current.id !== id) return;

    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);

    if (!next) {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    }

    current.resolve(result);
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      const isDuplicate = (existing: PendingConfirm | null | undefined) =>
        !!existing &&
        existing.options.title === options.title &&
        existing.options.message === options.message;

      if (isDuplicate(activeRef.current) || queueRef.current.some(isDuplicate)) {
        resolve(false);
        return;
      }

      const item: PendingConfirm = {
        id: nextIdRef.current++,
        options,
        resolve,
      };
      if (!activeRef.current) {
        previousFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        activeRef.current = item;
        setActive(item);
      } else {
        queueRef.current.push(item);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      const current = activeRef.current;
      activeRef.current = null;
      const queued = queueRef.current.splice(0);
      current?.resolve(false);
      for (const item of queued) {
        item.resolve(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const tone = active.options.tone ?? "default";
    const initialTarget = tone === "default" ? confirmBtnRef.current : cancelBtnRef.current;
    (initialTarget ?? dialogRef.current)?.focus();

    const activeId = active.id;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeActive(activeId, false);
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
      const currentFocus = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (
          !currentFocus ||
          currentFocus === first ||
          currentFocus === container ||
          !container.contains(currentFocus)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else if (
        !currentFocus ||
        currentFocus === last ||
        currentFocus === container ||
        !container.contains(currentFocus)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [active, closeActive]);

  const tone: ConfirmTone = active?.options.tone ?? "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {active &&
        createPortal(
          <div
            className="gf-confirm-backdrop"
            onMouseDown={(event) => {
              backdropMouseDownRef.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
              if (backdropMouseDownRef.current && event.target === event.currentTarget) {
                closeActive(active.id, false);
              }
              backdropMouseDownRef.current = false;
            }}
          >
            <div
              ref={dialogRef}
              className={`gf-confirm-dialog gf-confirm-dialog--${tone}`}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              tabIndex={-1}
            >
              <div className="gf-confirm-accent" aria-hidden="true" />
              <button
                type="button"
                className="gf-confirm-close"
                onClick={() => closeActive(active.id, false)}
                aria-label="Закрити вікно підтвердження"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className="gf-confirm-body">
                <div className="gf-confirm-icon">
                  <ConfirmIcon tone={tone} />
                </div>
                <div className="gf-confirm-copy">
                  <h2 id={titleId} className="gf-confirm-title">
                    {active.options.title}
                  </h2>
                  <p id={descId} className="gf-confirm-message">
                    {active.options.message}
                  </p>
                </div>
              </div>
              <div className="gf-confirm-actions">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  className="gf-confirm-btn gf-confirm-btn--cancel"
                  onClick={() => closeActive(active.id, false)}
                >
                  {active.options.cancelLabel ?? "Скасувати"}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  className={`gf-confirm-btn gf-confirm-btn--confirm${tone === "danger" ? " gf-confirm-btn--danger" : ""}`}
                  onClick={() => closeActive(active.id, true)}
                >
                  {active.options.confirmLabel ?? "Підтвердити"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return confirm;
}
