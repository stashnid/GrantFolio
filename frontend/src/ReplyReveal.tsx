import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export function ReplyReveal({
  text,
  animate,
  onComplete,
  onProgress,
  children,
}: {
  text: string;
  animate: boolean;
  onComplete: () => void;
  onProgress: () => void;
  children: (visible: string) => ReactNode;
}) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [count, setCount] = useState(() => (animate ? 0 : chars.length));
  const frameRef = useRef(0);
  const doneRef = useRef(!animate);
  const complete = useRef(onComplete);
  const progress = useRef(onProgress);
  complete.current = onComplete;
  progress.current = onProgress;

  const finish = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setCount(chars.length);
    if (!doneRef.current) {
      doneRef.current = true;
      complete.current();
    }
  }, [chars.length]);

  useEffect(() => {
    if (!animate) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      doneRef.current = true;
      setCount(chars.length);
      return;
    }
    doneRef.current = false;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motion?.matches || document.hidden || !chars.length) {
      finish();
      return;
    }
    setCount(0);
    const start = performance.now();
    const duration = Math.min(6000, Math.max(400, chars.length * 12));
    const tick = (now: number) => {
      if (doneRef.current) return;
      if (document.hidden) {
        finish();
        return;
      }
      const next = Math.min(chars.length, Math.ceil((chars.length * (now - start)) / duration));
      setCount(next);
      if (next < chars.length) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };
    const finishOnMotion = (event: MediaQueryListEvent) => {
      if (event.matches) finish();
    };
    const finishOnHidden = () => {
      if (document.hidden) finish();
    };
    document.addEventListener("visibilitychange", finishOnHidden);
    motion?.addEventListener("change", finishOnMotion);
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      motion?.removeEventListener("change", finishOnMotion);
      document.removeEventListener("visibilitychange", finishOnHidden);
    };
  }, [animate, chars, finish]);

  useEffect(() => {
    if (animate) progress.current();
  }, [count, animate]);

  const revealing = animate && count < chars.length;

  return (
    <>
      <div aria-hidden={revealing || undefined} inert={revealing || undefined}>
        {children(revealing ? chars.slice(0, count).join("") : text)}
        {revealing && <span className="reply-reveal-cursor" />}
      </div>
      {revealing && <span className="sr-only">{text}</span>}
      {revealing && (
        <div className="reply-reveal-bar">
          <span className="reply-reveal-status" aria-hidden="true">
            Формую відповідь…
          </span>
          <button type="button" className="reply-reveal-skip" onClick={finish}>
            Показати всю відповідь
          </button>
        </div>
      )}
    </>
  );
}
