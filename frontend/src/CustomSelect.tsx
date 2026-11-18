import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./CustomSelect.css";

export type SelectOption = {
  value: string;
  label: string;
  count?: number;
  icon?: ReactNode;
};

type Props = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
};

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  onBlur,
  placeholder = "Оберіть варіант",
  disabled = false,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
  searchable = false,
  searchPlaceholder = "Пошук...",
  className = "",
}: Props) {
  const autoId = useId();
  const triggerId = id || `gf-select-${autoId}`;
  const listboxId = `${triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function openMenu() {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropUp(spaceBelow < 270 && spaceAbove > spaceBelow);
    }
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setQuery("");
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    setQuery("");
    onBlur?.();
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function pick(option: SelectOption) {
    onChange(option.value);
    closeMenu(true);
  }

  useEffect(() => {
    if (!open) return;
    if (searchable) {
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const clamped = Math.min(activeIndex, Math.max(0, visibleOptions.length - 1));
    if (clamped !== activeIndex) setActiveIndex(clamped);
    optionRefs.current[clamped]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, visibleOptions.length]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
    }
    if (!open) return;
    handleNavigationKey(event);
  }

  function handleNavigationKey(event: KeyboardEvent<HTMLElement>) {
    if (!visibleOptions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % visibleOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + visibleOptions.length) % visibleOptions.length,
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(visibleOptions.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = visibleOptions[activeIndex];
      if (target) pick(target);
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  const activeOptionId =
    open && visibleOptions[activeIndex]
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  return (
    <div
      ref={rootRef}
      className={`gf-select ${open ? "is-open" : ""} ${dropUp ? "is-dropup" : ""} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        className={`gf-select-trigger ${!selected || !selected.value ? "is-placeholder" : ""}`}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="gf-select-trigger-main">
          {selected?.icon && (
            <span className="gf-select-icon" aria-hidden="true">
              {selected.icon}
            </span>
          )}
          <span className="gf-select-value">
            {selected ? selected.label : placeholder}
          </span>
          {selected && typeof selected.count === "number" && (
            <span className="gf-select-badge">{selected.count}</span>
          )}
        </span>
        <svg
          className="gf-select-chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="gf-select-popover"
          onKeyDown={handleNavigationKey}
        >
          {searchable && (
            <div className="gf-select-search-wrap">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                className="gf-select-search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
          )}
          <div
            id={listboxId}
            role="listbox"
            className="gf-select-list"
            tabIndex={-1}
          >
            {visibleOptions.length === 0 ? (
              <div className="gf-select-empty">Нічого не знайдено</div>
            ) : (
              visibleOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    id={`${listboxId}-opt-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`gf-select-option ${isSelected ? "is-selected" : ""} ${isActive ? "is-highlighted" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(option)}
                  >
                    <span className="gf-select-option-main">
                      {option.icon && (
                        <span className="gf-select-option-icon" aria-hidden="true">
                          {option.icon}
                        </span>
                      )}
                      <span className="gf-select-option-label">
                        {option.label}
                      </span>
                    </span>
                    <span className="gf-select-option-end">
                      {typeof option.count === "number" && (
                        <span className="gf-select-option-count">
                          {option.count}
                        </span>
                      )}
                      {isSelected && (
                        <svg
                          className="gf-select-check"
                          width="15"
                          height="15"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M3.5 8.5L6.5 11.5L12.5 4.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
