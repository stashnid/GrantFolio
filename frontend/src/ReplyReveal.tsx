import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export function ReplyReveal({ text, animate, onComplete, onProgress, children }: {
  text: string; animate: boolean; onComplete: () => void; onProgress: () => void;
  children: (visible: string) => ReactNode;
}) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [count, setCount] = useState(() => animate ? 0 : chars.length);
  const complete = useRef(onComplete), progress = useRef(onProgress);
  complete.current = onComplete; progress.current = onProgress;
  useEffect(() => {
    if (!animate) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motion?.matches || document.hidden || !chars.length) { setCount(chars.length); complete.current(); return; }
    const start = performance.now(), duration = Math.min(6000, Math.max(400, chars.length * 12));
    let frame = 0;
    const tick = (now: number) => {
      if (document.hidden) { setCount(chars.length); complete.current(); return; }
      const next = Math.min(chars.length, Math.ceil(chars.length * (now - start) / duration));
      setCount(next);
      if (next < chars.length) frame = requestAnimationFrame(tick); else complete.current();
    };
    const finishOnMotion = (event: MediaQueryListEvent) => { if (event.matches) { cancelAnimationFrame(frame); setCount(chars.length); complete.current(); } };
    const finishOnHidden = () => { if (document.hidden) { cancelAnimationFrame(frame); setCount(chars.length); complete.current(); } };
    document.addEventListener("visibilitychange", finishOnHidden);
    motion?.addEventListener("change", finishOnMotion);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); motion?.removeEventListener("change", finishOnMotion); document.removeEventListener("visibilitychange", finishOnHidden); };
  }, [animate, text]);
  useEffect(() => { if (animate) progress.current(); }, [count, animate]);
  const revealing = animate && count < chars.length;
  return <>
    <div aria-hidden={revealing || undefined} inert={revealing || undefined}>{children(revealing ? chars.slice(0, count).join("") : text)}{revealing && <span className="reply-reveal-cursor" />}</div>
    {revealing && <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>{text}</span>}
    {revealing && <button type="button" className="reply-reveal-skip" onClick={() => { setCount(chars.length); complete.current(); }}>Показати всю відповідь</button>}
  </>;
}
