import React, { useEffect, useMemo, useState } from "react";
import kveds from "./data/kved-2010.json";

type Props = { id: string; value: string; onChange: (value: string) => void; onBlur: () => void; disabled: boolean; error: boolean; describedBy: string };
const normalize = (value: string) => value.toLocaleLowerCase("uk").replace(/[’‘`ʼ]/g, "'").replace(/\s+/g, " ").trim();
const options = kveds.map(item => ({ ...item, search: normalize(`${item.value} ${item.label}`) }));
const byCode = new Map(options.map(item => [item.value, item]));

export function KvedPicker({ id, value, onChange, onBlur, disabled, error, describedBy }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const [limitError, setLimitError] = useState("");
  const selected = value.split(/[,;]/).map(code => code.trim()).filter(Boolean);
  const matches = useMemo(() => {
    const terms = normalize(query).split(" ").filter(Boolean);
    return options.filter(item => terms.every(term => item.search.includes(term)));
  }, [query]);
  const visible = matches.slice(0, 40);
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);
  function select(code: string) {
    if (disabled) return;
    if (!selected.includes(code)) {
      const next = value.trim() ? `${value.trim()}${/[,;]\s*$/.test(value) ? " " : ", "}${code}` : code;
      if (next.length > 120) { setLimitError("Максимальна довжина списку кодів — 120 символів. Видаліть код, перш ніж додати інший."); return; }
      onChange(next); setLimitError("");
    }
    setQuery(""); setActive(0); setOpen(false);
  }
  function remove(index: number) { if (disabled) return; onChange(selected.filter((_, i) => i !== index).join(", ")); setLimitError(""); }
  function keyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); setOpen(true);
      setActive(i => e.key === "ArrowDown" ? Math.min(i + (open ? 1 : 0), visible.length - 1) : Math.max(i - 1, 0));
    } else if (e.key === "Enter") { e.preventDefault(); if (open && visible[activeIndex]) select(visible[activeIndex].value); }
    else if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "Tab") { setOpen(false); }
  }
  return <div className="kved-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); onBlur(); } }}>
    {selected.length > 0 && <div className="kved-chips" aria-label="Обрані коди КВЕД">{selected.map((code, i) => <span className="kved-chip" key={`${code}-${i}`}><span>{code}{byCode.has(code) ? ` — ${byCode.get(code)!.label}` : " — не знайдено в класифікаторі"}</span><button type="button" disabled={disabled} aria-label={`Видалити ${code}`} onClick={() => remove(i)}>×</button></span>)}</div>}
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open && visible.length ? `${id}-option-${activeIndex}` : undefined} aria-invalid={error} aria-describedby={describedBy || undefined} value={query} disabled={disabled} placeholder="Пошук за кодом або назвою" autoComplete="off" onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} onKeyDown={keyDown} />
    {open && <div className="kved-results"><div className="kved-result-count" role="status">{matches.length === 0 ? "Нічого не знайдено. Можна ввести коди вручну нижче." : `Знайдено: ${matches.length}`}{matches.length > 40 && ". Уточніть пошук, щоб побачити інші результати."}</div><ul id={`${id}-listbox`} role="listbox" aria-label="Результати пошуку КВЕД">{visible.map((item, i) => <li id={`${id}-option-${i}`} role="option" aria-selected={i === activeIndex} key={item.value} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => select(item.value)}><strong>{item.value}</strong> {item.label}</li>)}</ul></div>}
    <button type="button" className="kved-manual-toggle" disabled={disabled} onClick={() => setManual(v => !v)} aria-expanded={manual}>Коди КВЕД {manual ? "−" : "+"}</button>
    {manual && <div><label htmlFor={`${id}-manual`}>Коди КВЕД через кому або крапку з комою</label><input id={`${id}-manual`} value={value} maxLength={120} disabled={disabled} aria-invalid={error} aria-describedby={describedBy || undefined} onPaste={e => { const input = e.currentTarget; const pasted = e.clipboardData.getData("text"); if (value.length - ((input.selectionEnd ?? 0) - (input.selectionStart ?? 0)) + pasted.length > 120) { e.preventDefault(); setLimitError("Максимальна довжина списку кодів — 120 символів. Скоротіть список перед вставленням."); } }} onChange={e => { setLimitError(""); onChange(e.target.value); }} /><small>Перевірте коди за офіційним класифікатором.</small></div>}
    {limitError && <small className="bp-error" role="alert">{limitError}</small>}
    <small>У класифікаторі: {kveds.length} кодів.</small>
  </div>;
}
